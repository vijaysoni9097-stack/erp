"""Real HTTP checkout/repayment tests on an isolated database, never hosted data."""
import json
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch, MagicMock
from uuid import uuid4
from sqlalchemy import select, func
import test_auth as auth
from test_auth import SessionLocal
import test_checkout as checkout
from app.models import Medicine, Sale, PharmacistProfile
from app.models.credit import SaleCredit, CreditCollection, CreditNotification
from app.services.whatsapp import process_one

class CreditTests(auth.unittest.TestCase):
    setUp=auth.AuthTests.setUp
    login=auth.AuthTests.login
    headers=auth.AuthTests.headers
    seed=checkout.CheckoutTests.seed
    payload=checkout.CheckoutTests.payload

    def credit(self, received='0', consent=False, phone='9876543210'):
        p=self.payload(self.seed(stock=20))
        p.update(customer_mobile=phone,credit_acknowledged=True,whatsapp_consent=consent)
        p['payment']=dict(method='cash',tendered=received,confirmed=received!='0')
        response=self.client.post('/api/v1/sales/checkout',headers=self.headers(),json=p)
        self.assertEqual(response.status_code,201,response.text)
        return response.json(),p

    def payment(self, amount, confirmed=True):
        return dict(request_id=str(uuid4()),payment=dict(method='cash',tendered=amount,confirmed=confirmed))

    def test_full_credit_requires_phone_and_ack_and_deducts_stock_once(self):
        p=self.payload(self.seed())
        p['payment']=dict(method='cash',tendered='0',confirmed=False)
        h=self.headers()
        for changes in [{},{'credit_acknowledged':True},{'customer_mobile':'9876543210','credit_acknowledged':False}]:
            self.assertEqual(self.client.post('/api/v1/sales/checkout',headers=h,json={**p,**changes}).status_code,422)
        with SessionLocal() as db:self.assertEqual(db.scalar(select(func.count()).select_from(Sale)),0)
        p.update(customer_mobile='9876543210',credit_acknowledged=True)
        sale=self.client.post('/api/v1/sales/checkout',headers=h,json=p).json()
        self.assertEqual(float(sale['outstanding_amount']),6.5)
        self.assertEqual(float(sale['payment']['amount']),0)
        self.assertEqual(sale['whatsapp_status'],'no_consent')
        replay=self.client.post('/api/v1/sales/checkout',headers=h,json=p).json()
        self.assertEqual(replay['id'],sale['id'])
        with SessionLocal() as db:
            self.assertEqual(db.get(Medicine,p['items'][0]['medicine_id']).stock_quantity,3)
            self.assertEqual(db.scalar(select(func.count()).select_from(SaleCredit)),1)

    def test_partial_then_repayment_retry_and_settlement(self):
        sale,_=self.credit('2.00',True)
        self.assertEqual(float(sale['outstanding_amount']),4.5)
        self.assertEqual(sale['whatsapp_status'],'not_configured')
        h=self.headers();p=self.payment('1.50');url=f"/api/v1/credits/{sale['id']}/collections"
        self.assertEqual(self.client.post(url,headers=h,json=p).status_code,200)
        self.assertTrue(self.client.post(url,headers=h,json=p).json()['replayed'])
        changed={**p,'payment':{**p['payment'],'tendered':'1'}}
        self.assertEqual(self.client.post(url,headers=h,json=changed).status_code,409)
        detail=self.client.get(f"/api/v1/credits/{sale['id']}",headers=h).json()
        self.assertEqual(float(detail['invoice']['paid_amount']),3.5)
        self.assertEqual(float(detail['credit']['outstanding']),3)
        self.assertEqual(len(detail['collections']),1)
        self.assertEqual(self.client.post(url,headers=h,json=self.payment('3.01')).status_code,422)
        self.assertEqual(self.client.post(url,headers=h,json=self.payment('0')).status_code,422)
        self.assertEqual(self.client.post(url,headers=h,json=self.payment('1',False)).status_code,422)
        self.assertEqual(self.client.post(url,headers=h,json=self.payment('3')).status_code,200)
        self.assertEqual(float(self.client.get('/api/v1/credits/summary',headers=h).json()['total_outstanding']),0)
        self.assertEqual(self.client.get('/api/v1/credits',headers=h).json()['items'],[])
        with SessionLocal() as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(CreditCollection)),2)
            self.assertEqual(db.get(Sale,sale['id']).payment.amount,2)

    def test_phone_lookup_shared_names_pagination_and_collection_dates(self):
        first,_=self.credit('1')
        second,p=self.credit('2')
        # Same canonical phone may belong to multiple named family members.
        with SessionLocal() as db:
            db.get(SaleCredit,second['id']).customer_name='Other family member';db.commit()
        self.credit(phone='9999999999')
        h=self.headers()
        result=self.client.get('/api/v1/credits',params={'phone':'+919876543210','limit':1},headers=h).json()
        self.assertEqual(result['count'],2)
        self.assertEqual(float(result['total_outstanding']),10)
        self.assertEqual(len(result['items']),1)
        other=self.client.get('/api/v1/credits',params={'phone':'9876543210','offset':1},headers=h).json()
        self.assertEqual(other['items'][0]['customer_name'],'Other family member')
        self.assertEqual(self.client.get('/api/v1/credits',params={'phone':'abc'},headers=h).status_code,422)
        self.client.post(f"/api/v1/credits/{first['id']}/collections",headers=h,json=self.payment('1'))
        now=datetime.utcnow();start=(now-timedelta(minutes=1)).isoformat()+'Z';end=(now+timedelta(minutes=1)).isoformat()+'Z'
        today=self.client.get('/api/v1/credits/summary',headers=h,params={'from_at':start,'to_at':end}).json()
        self.assertEqual(float(today['collections']['cash']),1)
        empty=self.client.get('/api/v1/credits/summary',headers=h,params={'from_at':end}).json()
        self.assertEqual(empty['collections'],{})

    def test_collection_write_access_and_paid_sale_backward_compatibility(self):
        sale,_=self.credit()
        with SessionLocal() as db:db.get(PharmacistProfile,1).role='doctor';db.commit()
        self.assertEqual(self.client.post(f"/api/v1/credits/{sale['id']}/collections",headers=self.headers(),json=self.payment('1')).status_code,403)
        with SessionLocal() as db:db.get(PharmacistProfile,1).role='pharmacist';db.commit()
        p=self.payload(self.seed());paid=self.client.post('/api/v1/sales/checkout',headers=self.headers(),json=p).json()
        self.assertEqual(float(paid['outstanding_amount']),0)
        self.assertEqual(float(paid['paid_amount']),6.5)
        self.assertIsNone(paid['whatsapp_status'])

    def bulk_payment(self, sales, amounts):
        from decimal import Decimal
        return {**self.payment(str(sum(Decimal(amount) for amount in amounts))),
                'allocations':[dict(sale_id=sale['id'], amount=amount) for sale, amount in zip(sales, amounts)]}

    def test_bulk_settlement_is_atomic_and_retry_safe(self):
        first,_=self.credit('1');second,_=self.credit('2')
        h=self.headers();p=self.bulk_payment([first,second],['5.50','4.50']);url='/api/v1/credits/collections'
        result=self.client.post(url,headers=h,json=p)
        self.assertEqual(result.status_code,200,result.text)
        self.assertFalse(result.json()['replayed'])
        self.assertTrue(self.client.post(url,headers=h,json=p).json()['replayed'])
        changed=self.bulk_payment([first],['5.50']);changed['request_id']=p['request_id']
        self.assertEqual(self.client.post(url,headers=h,json=changed).status_code,409)
        with SessionLocal() as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(CreditCollection)),2)
            self.assertEqual(db.get(SaleCredit,first['id']).outstanding,0)
            self.assertEqual(db.get(SaleCredit,second['id']).outstanding,0)
        for sale in [first,second]:
            detail=self.client.get(f"/api/v1/credits/{sale['id']}",headers=h).json()
            self.assertEqual(float(detail['invoice']['paid_amount']),6.5)
            self.assertEqual(len(detail['collections']),1)

    def test_bulk_rejects_changed_balances_without_collecting_other_dues(self):
        first,_=self.credit();second,_=self.credit()
        h=self.headers();p=self.bulk_payment([first,second],['6.50','6.50'])
        self.client.post(f"/api/v1/credits/{second['id']}/collections",headers=h,json=self.payment('1'))
        result=self.client.post('/api/v1/credits/collections',headers=h,json=p)
        self.assertEqual(result.status_code,422,result.text)
        with SessionLocal() as db:
            self.assertEqual(float(db.get(SaleCredit,first['id']).outstanding),6.5)
            self.assertEqual(float(db.get(SaleCredit,second['id']).outstanding),5.5)
            self.assertEqual(db.scalar(select(func.count()).select_from(CreditCollection)),1)

    def test_bulk_rejects_shared_number_names_and_other_mobiles(self):
        first,_=self.credit();second,_=self.credit();other,_=self.credit(phone='9999999999')
        with SessionLocal() as db:
            db.get(SaleCredit,second['id']).customer_name='Other family member';db.commit()
        h=self.headers()
        for sale in [second,other]:
            result=self.client.post('/api/v1/credits/collections',headers=h,json=self.bulk_payment([first,sale],['6.50','6.50']))
            self.assertEqual(result.status_code,422,result.text)
        with SessionLocal() as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(CreditCollection)),0)

    def test_bulk_validation_and_access(self):
        first,_=self.credit();second,_=self.credit();h=self.headers();url='/api/v1/credits/collections'
        valid=self.bulk_payment([first,second],['6.50','6.50'])
        for changes in [{'allocations':[]},
                        {'allocations':[valid['allocations'][0]]*2},
                        {'payment':dict(method='cash',tendered='12',confirmed=True)},
                        {'payment':dict(method='cash',tendered='13',confirmed=False)},
                        {'payment':dict(method='upi',tendered='13',confirmed=True)},
                        {'allocations':[dict(sale_id=first['id'],amount='-1')]},
                        {'allocations':[dict(sale_id=first['id'],amount='6.501')]}]:
            result=self.client.post(url,headers=h,json={**valid,**changes})
            self.assertEqual(result.status_code,422,result.text)
        missing=self.bulk_payment([first,{'id':999999}],['6.50','6.50'])
        self.assertEqual(self.client.post(url,headers=h,json=missing).status_code,404)
        with SessionLocal() as db:
            db.get(PharmacistProfile,1).role='doctor';db.commit()
        self.assertEqual(self.client.post(url,headers=h,json=valid).status_code,403)
        with SessionLocal() as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(CreditCollection)),0)

    def test_bulk_and_single_concurrent_collection_cannot_double_charge(self):
        from concurrent.futures import ThreadPoolExecutor
        first,_=self.credit();second,_=self.credit();h=self.headers()
        requests=[('/api/v1/credits/collections',self.bulk_payment([first,second],['6.50','6.50'])),
                  (f"/api/v1/credits/{second['id']}/collections",self.payment('6.50'))]
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(lambda request:self.client.post(request[0],headers=h,json=request[1]).status_code,requests))
        self.assertEqual(sorted(results),[200,422])
        with SessionLocal() as db:
            self.assertEqual(db.get(SaleCredit,second['id']).outstanding,0)
            collected=float(db.scalar(select(func.sum(CreditCollection.amount))))
            remaining=float(db.scalar(select(func.sum(SaleCredit.outstanding))))
            self.assertEqual(collected+remaining,13)

    def test_notification_outbox_acceptance_and_no_duplicates(self):
        sale,_=self.credit(consent=True)
        settings=SimpleNamespace(whatsapp_api_version='v99.0',whatsapp_phone_number_id='123',whatsapp_access_token='test-only',whatsapp_template_name='credit_notice',whatsapp_template_language='en')
        response=MagicMock();response.__enter__.return_value.read.return_value=b'{"messages":[{"id":"test-message"}]}'
        with patch('app.services.whatsapp.configured',return_value=True),patch('app.services.whatsapp.get_settings',return_value=settings),patch('app.services.whatsapp.urlopen',return_value=response) as send:
            self.assertTrue(process_one());self.assertFalse(process_one())
            self.assertEqual(send.call_count,1)
            body=json.loads(send.call_args.args[0].data)
            self.assertEqual(body['to'],'919876543210')
            self.assertEqual(len(body['template']['components'][0]['parameters']),4)
        with SessionLocal() as db:
            note=db.get(CreditNotification,sale['id'])
            self.assertEqual(note.status,'accepted');self.assertEqual(note.provider_id,'test-message')

    def test_notification_timeout_never_retries_ambiguous_send(self):
        sale,_=self.credit(consent=True)
        settings=SimpleNamespace(whatsapp_api_version='v99.0',whatsapp_phone_number_id='123',whatsapp_access_token='test-only',whatsapp_template_name='credit_notice',whatsapp_template_language='en')
        with patch('app.services.whatsapp.configured',return_value=True),patch('app.services.whatsapp.get_settings',return_value=settings),patch('app.services.whatsapp.urlopen',side_effect=TimeoutError) as send:
            self.assertTrue(process_one());self.assertFalse(process_one());self.assertEqual(send.call_count,1)
        with SessionLocal() as db:self.assertEqual(db.get(CreditNotification,sale['id']).status,'unknown')

    def test_concurrent_collections_cannot_exceed_balance(self):
        from concurrent.futures import ThreadPoolExecutor
        sale,_=self.credit()
        h=self.headers();url=f"/api/v1/credits/{sale['id']}/collections"
        payments=[self.payment('4'),self.payment('4')]
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(lambda p:self.client.post(url,headers=h,json=p).status_code,payments))
        self.assertEqual(sorted(results),[200,422])
        detail=self.client.get(f"/api/v1/credits/{sale['id']}",headers=h).json()
        self.assertEqual(float(detail['credit']['outstanding']),2.5)
        self.assertEqual(len(detail['collections']),1)

    def test_notification_retry_requires_configuration_and_consent(self):
        from app.config import Settings
        settings=Settings(_env_file=None,whatsapp_phone_number_id='',whatsapp_api_version='')
        self.assertIsNone(settings.whatsapp_phone_number_id)
        self.assertIsNone(settings.whatsapp_api_version)
        sale,_=self.credit(consent=True)
        url=f"/api/v1/credits/{sale['id']}/notification/retry";h=self.headers()
        self.assertEqual(self.client.post(url,headers=h).status_code,503)
        with patch('app.services.whatsapp.configured',return_value=True):
            self.assertEqual(self.client.post(url,headers=h).status_code,200)
            self.assertEqual(self.client.post(url,headers=h).status_code,409)
        with SessionLocal() as db:
            note=db.get(CreditNotification,sale['id']);note.status='unknown';db.commit()
        with patch('app.services.whatsapp.configured',return_value=True):
            self.assertEqual(self.client.post(url,headers=h).status_code,409)
