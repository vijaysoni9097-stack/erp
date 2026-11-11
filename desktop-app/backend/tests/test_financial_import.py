"""Verify migration preserves financial history without dispensing twice."""
import csv
import io
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import event, select
from sqlalchemy.exc import IntegrityError

import test_auth as auth
import test_data_import as migration
from app.database import engine
from app.models import Customer, DataImport, ImportedSale, Medicine, Sale, StockMovement
from app.models.credit import CreditCollection, CreditNotification, SaleCredit
from test_auth import SessionLocal


def csv_text(*rows):
    fields = list(dict.fromkeys(key for row in rows for key in row))
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue()


class FinancialImportTests(unittest.TestCase):
    setUp = auth.AuthTests.setUp
    login = auth.AuthTests.login
    headers = auth.AuthTests.headers
    admin_headers = migration.DataImportTests.admin_headers
    request = migration.DataImportTests.request
    count = migration.DataImportTests.count

    def seed(self):
        self.assertEqual(self.request('full_name,phone\nTest Patient,9876543210\n', kind='customers').status_code, 200)
        self.assertEqual(self.request(migration.MEDICINES + 'Test Medicine,SKU1,B1,2030-12-31,5,10,30,\n', kind='medicines').status_code, 200)

    def invoice(self, **changes):
        row = dict(invoice_ref='OLD-2020-001', line_ref='1', sold_at='2020-01-01T12:00:00+05:30',
                   balance_as_of='2025-03-31T23:59:59+05:30', customer_name='Test Patient', customer_phone='9876543210',
                   sku='SKU1', quantity=2, unit_price='10', invoice_total='20', outstanding_amount='5',
                   initial_paid_amount='10', payment_method='cash')
        row.update(changes)
        return row

    def balance(self, **changes):
        row = dict(balance_ref='OPEN-001', as_of='2025-03-31T23:59:59+05:30',
                   customer_name='Test Patient', customer_phone='9876543210', amount='100.50')
        row.update(changes)
        return row

    def test_multiline_history_preserves_original_amounts_dates_and_stock(self):
        self.seed()
        row = self.invoice(invoice_total='42', tax_amount='2', outstanding_amount='12', initial_paid_amount='20',
                           company_name='Original Pharmacy', company_address='Old address', prescribed_by='Dr Original')
        content = csv_text(row, dict(row, line_ref='2'))
        result = self.request(content, kind='sales', preview=True)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertTrue(result.json()['valid'], result.text)
        self.assertEqual(result.json()['row_count'], 2)
        self.assertEqual(result.json()['record_count'], 1)
        self.assertEqual(self.count(Sale), 0)
        response = self.request(content, kind='sales')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['imported'], 1)
        with SessionLocal() as db:
            sale = db.scalar(select(Sale))
            self.assertEqual(sale.created_at, datetime(2020, 1, 1, 6, 30))
            self.assertEqual(sale.subtotal, 40)
            self.assertEqual(sale.total_amount, 42)
            self.assertEqual(sale.payment.amount, 20)
            self.assertEqual(sale.credit.principal, 22)
            self.assertEqual(sale.credit.outstanding, 12)
            self.assertEqual(sale.paid_amount, 30)
            self.assertEqual(sale.import_record.paid_before_import, 10)
            self.assertEqual(sale.company_record.company_name, 'Original Pharmacy')
            self.assertEqual(sale.prescription.doctor_name, 'Dr Original')
            self.assertEqual(db.scalar(select(Medicine)).stock_quantity, 30)
        self.assertEqual(self.count(StockMovement), 1)
        self.assertEqual(self.count(CreditCollection), 0)
        self.assertEqual(self.count(CreditNotification), 0)
        h = self.admin_headers()
        sales = self.client.get('/api/v1/sales', headers=h).json()
        self.assertEqual(sales[0]['import_details']['source_reference'], 'OLD-2020-001')
        self.assertEqual(sales[0]['company']['company_name'], 'Original Pharmacy')
        self.assertTrue(self.request(content, kind='sales').json()['already_imported'])
        changed = self.request(csv_text(dict(row, line_ref='2'), row), kind='sales')
        self.assertEqual(changed.status_code, 422)
        self.assertEqual(self.count(Sale), 1)

    def test_opening_balances_are_collectible_and_excluded_from_sales(self):
        self.seed()
        when = (datetime.now(timezone.utc) - timedelta(seconds=2)).isoformat()
        response = self.request(csv_text(self.balance(as_of=when)), kind='opening_balances')
        self.assertEqual(response.status_code, 200, response.text)
        h = self.admin_headers()
        accounts = self.client.get('/api/v1/credits', headers=h).json()
        credit = accounts['items'][0]
        self.assertEqual(credit['import_details']['kind'], 'opening_balances')
        self.assertEqual(credit['import_details']['source_reference'], 'OPEN-001')
        self.assertEqual(Decimal(str(accounts['total_outstanding'])), Decimal('100.50'))
        sale_id = credit['sale_id']
        self.assertEqual(self.client.get('/api/v1/sales', headers=h).json(), [])
        self.assertEqual(Decimal(self.client.get('/api/v1/dashboard', headers=h).json()['today_sales_total']), 0)
        payment = dict(request_id=str(uuid4()), payment=dict(method='cash', tendered='20.50', confirmed=True))
        result = self.client.post(f'/api/v1/credits/{sale_id}/collections', headers=h, json=payment)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertTrue(self.client.post(f'/api/v1/credits/{sale_id}/collections', headers=h, json=payment).json()['replayed'])
        detail = self.client.get(f'/api/v1/credits/{sale_id}', headers=h).json()
        self.assertEqual(Decimal(detail['invoice']['outstanding_amount']), 80)
        self.assertEqual(Decimal(detail['invoice']['paid_amount']), Decimal('20.50'))
        self.assertEqual(len(detail['collections']), 1)
        self.assertEqual(detail['invoice']['items'], [])
        self.assertEqual(self.count(CreditNotification), 0)
        self.assertEqual(self.count(StockMovement), 1)
        summary = self.client.get('/api/v1/credits/summary', headers=h).json()
        self.assertEqual(Decimal(str(summary['collections']['cash'])), Decimal('20.50'))

    def test_debt_cannot_be_imported_twice_as_opening_and_unpaid_invoices(self):
        self.seed()
        content = csv_text(self.balance())
        self.assertEqual(self.request(content, kind='opening_balances').status_code, 200)
        self.assertTrue(self.request(content, kind='opening_balances').json()['already_imported'])
        self.assertEqual(self.request(csv_text(self.balance(balance_ref='OTHER')), kind='opening_balances').status_code, 422)
        self.assertEqual(self.request(csv_text(self.invoice()), kind='sales').status_code, 422)
        # Paid historical sales carry no additional debt and can coexist with a balance.
        self.assertEqual(self.request(csv_text(self.invoice(outstanding_amount='0')), kind='sales').status_code, 200)
        self.assertEqual(self.count(Sale), 2)

    def test_unpaid_invoices_block_opening_balances(self):
        self.seed()
        self.assertEqual(self.request(csv_text(self.invoice()), kind='sales').status_code, 200)
        self.assertEqual(self.request(csv_text(self.balance()), kind='opening_balances').status_code, 422)
        self.assertEqual(self.count(Sale), 1)

    def test_historical_revenue_uses_sale_date_and_balances_remain_separate(self):
        self.seed()
        when = (datetime.now(timezone.utc) - timedelta(seconds=2)).isoformat()
        self.assertEqual(self.request(csv_text(self.balance(as_of=when)), kind='opening_balances').status_code, 200)
        paid = self.invoice(sold_at=when, balance_as_of=when, outstanding_amount='0', initial_paid_amount='20')
        self.assertEqual(self.request(csv_text(paid), kind='sales').status_code, 200)
        h = self.admin_headers()
        sales = self.client.get('/api/v1/sales', headers=h).json()
        self.assertEqual(len(sales), 1)
        self.assertEqual(sales[0]['import_details']['kind'], 'sales')
        self.assertEqual(Decimal(self.client.get('/api/v1/dashboard', headers=h).json()['today_sales_total']), 20)
        self.assertEqual(self.count(StockMovement), 1)

    def test_concurrent_retries_create_only_one_financial_import(self):
        from concurrent.futures import ThreadPoolExecutor
        self.seed()
        h = self.admin_headers()
        content = csv_text(self.invoice())
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: self.request(content, kind='sales', headers=h), range(2)))
        self.assertEqual([response.status_code for response in responses], [200, 200])
        self.assertEqual(sorted(response.json()['already_imported'] for response in responses), [False, True])
        self.assertEqual(self.count(Sale), 1)
        self.assertEqual(self.count(SaleCredit), 1)

    def test_reconciliation_rejects_inconsistent_incomplete_and_duplicate_lines(self):
        self.seed()
        cases = [
            [self.invoice(invoice_total='21')],
            [self.invoice(invoice_total='40'), self.invoice(invoice_total='40')],
            [self.invoice(invoice_total='40'), self.invoice(invoice_total='40', line_ref='2', outstanding_amount='4')],
            [self.invoice(outstanding_amount='21')], [self.invoice(outstanding_amount='')],
            [self.invoice(outstanding_amount='15', initial_paid_amount='10')],
            [self.invoice(quantity=-1)], [self.invoice(unit_price='10.001')],
            [self.invoice(line_total='19.99')], [self.invoice(discount_percent='101')],
            [self.invoice(sku='MISSING')], [self.invoice(customer_name='Missing Patient')],
            [self.invoice(customer_phone='')], [self.invoice(customer_name='')],
            [self.invoice(sold_at='2020-01-01')], [self.invoice(sold_at='2020-01-01T12:00:00')],
            [self.invoice(balance_as_of='2019-01-01T00:00:00Z')], [self.invoice(sold_at='9999-01-01T00:00:00Z')],
            [self.invoice(status='voided')],
            [self.invoice(initial_paid_amount='', payment_method='cash')],
        ]
        for rows in cases:
            response = self.request(csv_text(*rows), kind='sales')
            self.assertEqual(response.status_code, 422, (rows, response.text))
        self.assertEqual(self.count(Sale), 0)
        self.assertEqual(self.count(ImportedSale), 0)

    def test_discounts_fully_paid_unknown_initial_payment_and_voids(self):
        self.seed()
        rows = [self.invoice(discount_percent='10', invoice_total='18', outstanding_amount='0',
                             initial_paid_amount='', payment_method=''),
                self.invoice(invoice_ref='VOIDED-1', status='voided', outstanding_amount='0',
                             initial_paid_amount='', payment_method='')]
        response = self.request(csv_text(*rows), kind='sales')
        self.assertEqual(response.status_code, 200, response.text)
        sales = self.client.get('/api/v1/sales', headers=self.admin_headers()).json()
        paid = next(sale for sale in sales if sale['status'] == 'completed')
        void = next(sale for sale in sales if sale['status'] == 'voided')
        self.assertEqual(Decimal(paid['paid_amount']), 18)
        self.assertEqual(Decimal(paid['items'][0]['discount_amount']), 2)
        self.assertIsNone(paid['payment'])
        self.assertEqual(Decimal(void['paid_amount']), 0)
        self.assertEqual(self.count(SaleCredit), 0)

    def test_financial_database_failure_rolls_back_all_invoices_and_receipt(self):
        self.seed()
        h = self.admin_headers()
        baseline = self.count(DataImport)

        def fail_metadata(conn, cursor, statement, parameters, context, many):
            if statement.startswith('INSERT INTO imported_sales '):
                raise IntegrityError(statement, parameters, Exception('simulated failure'))

        event.listen(engine, 'before_cursor_execute', fail_metadata)
        try:
            result = self.request(csv_text(self.invoice(), self.invoice(invoice_ref='SECOND')), kind='sales', headers=h)
        finally:
            event.remove(engine, 'before_cursor_execute', fail_metadata)
        self.assertEqual(result.status_code, 409, result.text)
        self.assertEqual(self.count(Sale), 0)
        self.assertEqual(self.count(SaleCredit), 0)
        self.assertEqual(self.count(ImportedSale), 0)
        self.assertEqual(self.count(DataImport), baseline)

    def test_customer_ambiguity_duplicate_balance_and_reference_collision(self):
        self.seed()
        with SessionLocal() as db:
            db.add(Customer(full_name='Test Patient', phone='+919876543210', email='second@example.com'))
            db.commit()
        self.assertEqual(self.request(csv_text(self.balance()), kind='opening_balances').status_code, 422)
        with SessionLocal() as db:
            second = db.scalar(select(Customer).where(Customer.email == 'second@example.com'))
            db.delete(second)
            db.commit()
        duplicate = csv_text(self.balance(), self.balance(balance_ref='SECOND'))
        self.assertEqual(self.request(duplicate, kind='opening_balances').status_code, 422)
        self.assertEqual(self.count(Sale), 0)
        self.assertEqual(self.request(csv_text(self.invoice(outstanding_amount='0')), kind='sales').status_code, 200)
        collision = self.balance(balance_ref='old-2020-001')
        self.assertEqual(self.request(csv_text(collision), kind='opening_balances').status_code, 422)
