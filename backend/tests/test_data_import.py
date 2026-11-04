"""Migration permissions, validation, atomic writes and safe retry checks."""
import unittest
from sqlalchemy import event, func, select
from sqlalchemy.exc import IntegrityError

import test_auth as auth
from app.database import engine
from app.models import Customer, DataImport, Medicine, PharmacistProfile, StockMovement, Supplier
from app.models.settings import EmployeeRole
from test_auth import SessionLocal

MEDICINES = 'name,sku,batch_number,expiry_date,purchase_price,selling_price,stock_quantity,supplier_name\n'


class DataImportTests(unittest.TestCase):
    setUp = auth.AuthTests.setUp
    login = auth.AuthTests.login
    headers = auth.AuthTests.headers

    def admin_headers(self):
        with SessionLocal() as db:
            db.get(PharmacistProfile, 1).role = EmployeeRole.superadmin
            db.commit()
        return self.headers()

    def request(self, content, kind='suppliers', preview=False, headers=None):
        return self.client.post('/api/v1/data-import' + ('/preview' if preview else ''),
                                headers=headers or self.admin_headers(),
                                json=dict(kind=kind, filename='legacy.csv', content=content))

    def count(self, model):
        with SessionLocal() as db:
            return db.scalar(select(func.count()).select_from(model))

    def test_all_endpoints_enforce_superadmin(self):
        for role in ['doctor', 'admin', 'pharmacist', 'nurse', 'receptionist']:
            with SessionLocal() as db:
                db.get(PharmacistProfile, 1).role = EmployeeRole(role)
                db.commit()
            headers = self.headers()
            for path, method in [('/templates/suppliers', 'GET'), ('/preview', 'POST'), ('', 'POST')]:
                url = '/api/v1/data-import' + path
                self.assertEqual(self.client.request(method, url, headers=headers, json={}).status_code, 403)
                self.assertEqual(self.client.request(method, url, json={}).status_code, 401)
        headers = self.admin_headers()
        for kind in ['suppliers', 'medicines', 'customers', 'sales', 'opening_balances']:
            template = self.client.get('/api/v1/data-import/templates/' + kind, headers=headers)
            self.assertEqual(template.status_code, 200)
            self.assertIn('text/csv', template.headers['content-type'])
        self.assertEqual(self.count(DataImport), 0)

    def test_preview_import_and_retry_with_stock_and_supplier_link(self):
        supplier = '\ufeffname,contact_person,phone,email,address\r\nLegacy Supplier,Asha,12345,office@example.com,"Road 1, City"\r\n'
        result = self.request(supplier, preview=True)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertTrue(result.json()['valid'])
        self.assertEqual(self.count(Supplier), 0)
        self.assertEqual(self.count(DataImport), 0)
        self.assertEqual(self.request(supplier).json()['imported'], 1)
        medicine = MEDICINES + 'Pain Relief,OLD-01,B001,2030-12-31,10.50,15.25,25,legacy supplier\n'
        preview = self.request(medicine, kind='medicines', preview=True)
        self.assertTrue(preview.json()['valid'], preview.text)
        self.assertEqual(self.count(Medicine), 0)
        response = self.request(medicine, kind='medicines')
        self.assertEqual(response.status_code, 200, response.text)
        with SessionLocal() as db:
            record = db.scalar(select(Medicine))
            movement = db.scalar(select(StockMovement))
            self.assertEqual(record.stock_quantity, 25)
            self.assertEqual(record.supplier.name, 'Legacy Supplier')
            self.assertEqual(movement.quantity_change, 25)
            self.assertEqual(movement.note, 'Migration opening stock')
            self.assertEqual(str(record.purchase_price), '10.50')
            receipt = db.scalar(select(DataImport).where(DataImport.kind == 'medicines'))
            self.assertEqual(receipt.actor_id, 1)
            self.assertEqual(receipt.actor_email, 'pharmacist@example.com')
        retry = self.request(medicine.replace('\n', '\r\n'), kind='medicines')
        self.assertTrue(retry.json()['already_imported'])
        self.assertEqual(retry.json()['import_id'], response.json()['import_id'])
        self.assertEqual(self.count(Medicine), 1)
        self.assertEqual(self.count(StockMovement), 1)

    def test_validation_rejects_entire_file_and_duplicate_keys(self):
        content = MEDICINES + 'Valid Item,SKU1,B1,2030-12-31,10,20,5,\nInvalid Item,SKU2,B2,31/12/2030,NaN,20,-1,\n'
        preview = self.request(content, kind='medicines', preview=True)
        self.assertFalse(preview.json()['valid'])
        self.assertEqual(preview.json()['errors'][0]['row'], 3)
        response = self.request(content, kind='medicines')
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.count(Medicine), 0)
        self.assertEqual(self.count(StockMovement), 0)
        self.assertEqual(self.count(DataImport), 0)
        duplicate = self.request('name\nSupplier One\nsupplier one\n', preview=True)
        self.assertFalse(duplicate.json()['valid'])
        self.request('name\nSupplier One\n')
        self.assertEqual(self.request('name\nsupplier one\n').status_code, 422)

    def test_commit_revalidates_after_preview(self):
        first = 'name,address\nOne Supplier,Original address\n'
        self.assertTrue(self.request(first, preview=True).json()['valid'])
        self.request('name,address\nOne Supplier,Other address\n')
        self.assertEqual(self.request(first).status_code, 422)
        with SessionLocal() as db:
            self.assertEqual(db.scalar(select(Supplier)).address, 'Other address')

    def test_database_failure_rolls_back_stock_and_receipt(self):
        headers = self.admin_headers()
        content = MEDICINES + 'First Item,SKU1,B1,2030-12-31,10,20,5,\nSecond Item,SKU2,B2,2030-12-31,10,20,5,\n'
        insert_count = 0

        def fail_second_insert(conn, cursor, statement, parameters, context, executemany):
            nonlocal insert_count
            if statement.startswith('INSERT INTO medicines '):
                insert_count += 1
                if insert_count == 2:
                    raise IntegrityError(statement, parameters, Exception('simulated concurrent insert'))

        event.listen(engine, 'before_cursor_execute', fail_second_insert)
        try:
            result = self.request(content, kind='medicines', headers=headers)
        finally:
            event.remove(engine, 'before_cursor_execute', fail_second_insert)
        self.assertEqual(result.status_code, 409, result.text)
        self.assertEqual(self.count(Medicine), 0)
        self.assertEqual(self.count(StockMovement), 0)
        self.assertEqual(self.count(DataImport), 0)

    def test_customers_normalize_phone_and_allow_shared_family_number(self):
        content = 'full_name,phone,email,date_of_birth\nFirst Person,98765 43210,first@example.com,2000-01-02\nSecond Person,+91 (98765) 43210,,\n'
        response = self.request(content, kind='customers')
        self.assertEqual(response.status_code, 200, response.text)
        with SessionLocal() as db:
            self.assertEqual([row.phone for row in db.scalars(select(Customer))], ['+919876543210'] * 2)
        duplicate = self.request('full_name,phone,email,date_of_birth\nFirst Person,+919876543210,first@example.com,2000-01-02\n', kind='customers')
        self.assertEqual(duplicate.status_code, 422)
        self.assertEqual(self.count(Customer), 2)

    def test_bad_csv_and_limits_and_missing_supplier(self):
        for content in ['name,name\nOne,Two', 'name,unknown\nOne,Two', 'phone\n12345', 'name\n', 'name\n"unclosed', 'name\nOne,Two']:
            result = self.request(content)
            self.assertEqual(result.status_code, 422, content)
        missing = self.request(MEDICINES + 'An Item,SKU1,B1,2030-12-31,10,20,5,Missing Supplier\n', kind='medicines')
        self.assertEqual(missing.status_code, 422)
        self.assertIn('Import suppliers first', missing.json()['detail']['errors'][0]['message'])
        self.assertEqual(self.request('name\n' + 'One\n' * 5001).status_code, 422)
        self.assertEqual(self.request('name\n' + 'é' * (1024 * 1024)).status_code, 422)
        self.assertEqual(self.count(Supplier), 0)
        self.assertEqual(self.count(Medicine), 0)
