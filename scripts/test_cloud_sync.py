"""Integration checks against Supabase, entirely rolled back (including fixtures)."""
import argparse
import uuid
from secrets import token_urlsafe
from hashlib import sha256
from pathlib import Path
import psycopg
from psycopg.types.json import Jsonb
from cloud_migrate import connect, verify, ROOT


def uid(): return str(uuid.uuid4())


def run(connection):
    # Use the migration runner's advisory lock and an isolated transaction.
    connection.execute("SELECT pg_advisory_xact_lock(hashtext('erp_schema_migrations'))")
    for file in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
        applied = connection.execute("SELECT to_regclass('erp_migrations.applied')").fetchone()[0]
        if applied and connection.execute('SELECT 1 FROM erp_migrations.applied WHERE name=%s',(file.name,)).fetchone():
            continue
        connection.execute(file.read_text())
    verify(connection)
    tenant, other_tenant, actor, auth_id, device, device2 = [uid() for _ in range(6)]
    connection.execute('INSERT INTO auth.users(id) VALUES(%s)',(auth_id,))
    connection.execute("INSERT INTO erp.pharmacies(id,name) VALUES(%s,'Sync test'),(%s,'Other tenant')",(tenant,other_tenant))
    connection.execute("INSERT INTO erp.employee_profiles(pharmacy_id,id,auth_user_id,first_name,last_name,email,role,license_number,pharmacy_name) VALUES(%s,%s,%s,'Test','Admin','sync-test@example.invalid','superadmin','TEST','Test')",(tenant,actor,auth_id))
    secrets={device:token_urlsafe(32),device2:token_urlsafe(32)}
    for d in (device,device2):
        connection.execute("INSERT INTO erp.registered_devices(pharmacy_id,id,name,enrolled_by,credential_hash) VALUES(%s,%s,'Test device',%s,%s)",(tenant,d,actor,sha256(secrets[d].encode()).hexdigest()))
    connection.execute("SELECT set_config('request.jwt.claim.sub',%s,true)",(auth_id,))
    def rpc(name,*args):
        args=(args[0],secrets[args[0]],*args[1:])
        placeholders=','.join(['%s']*len(args))
        with connection.transaction():
            connection.execute('SET LOCAL ROLE authenticated')
            result=connection.execute(f'SELECT public.{name}({placeholders})',args).fetchone()[0]
            connection.execute('RESET ROLE')
            return result
    def denied(fn):
        try:
            with connection.transaction(): fn()
        except psycopg.Error:
            return
        raise AssertionError('Expected operation rejection')
    with connection.transaction():
        connection.execute('SET LOCAL ROLE authenticated')
        denied(lambda: connection.execute('SELECT public.erp_sync_pull(%s,%s,0)',(device,'wrong-key'*8)))
        connection.execute('RESET ROLE')
    supplier, operation = uid(),uid()
    args=(device,operation,'suppliers',supplier,0,Jsonb({'name':'Supplier'}),False)
    one=rpc('erp_sync_push',*args)
    assert one['status']=='applied'
    assert rpc('erp_sync_push',*args)==one
    denied(lambda: rpc('erp_sync_push',device,operation,'suppliers',supplier,0,Jsonb({'name':'Altered'}),False))
    assert rpc('erp_sync_push',device2,uid(),'suppliers',supplier,1,Jsonb({'name':'Device 2 edit'}),False)['status']=='applied'
    assert rpc('erp_sync_push',device,uid(),'suppliers',supplier,1,Jsonb({'name':'Stale edit'}),False)['status']=='conflict'
    denied(lambda: rpc('erp_sync_push',device,uid(),'employee_profiles',uid(),0,Jsonb({'role':'superadmin'}),False))
    denied(lambda: rpc('erp_sync_push',device,uid(),'suppliers',uid(),0,Jsonb({'name':'Bad','pharmacy_id':other_tenant}),False))
    medicine=uid()
    assert rpc('erp_sync_push',device,uid(),'medicines',medicine,0,Jsonb({'name':'Medicine','sku':'TEST','batch_number':'B','expiry_date':'2030-01-01','purchase_price':'2.00','selling_price':'3.00','reorder_level':10,'supplier_id':supplier}),False)['status']=='applied'
    rpc('erp_stock_command',device,uid(),'receive',Jsonb({'medicine_id':medicine,'quantity':10}))
    rpc('erp_stock_command',device,uid(),'allocate',Jsonb({'medicine_id':medicine,'device_id':device,'quantity':6}))
    rpc('erp_stock_command',device,uid(),'allocate',Jsonb({'medicine_id':medicine,'device_id':device2,'quantity':4}))
    denied(lambda: rpc('erp_stock_command',device,uid(),'allocate',Jsonb({'medicine_id':medicine,'device_id':device2,'quantity':1})))
    def sale(n): return {'id':uid(),'tax_amount':0,'occurred_at':'2026-10-11T12:00:00Z','items':[{'medicine_id':medicine,'quantity':n,'unit_price':'3.00'}]}
    sale_op=uid(); payload=sale(6)
    payload['items'][0].update(unit_price='3.00',original_unit_price='3.00',discount_percent='10.00')
    payload['company']={'company_name':'Test Registered Company','address':'Test address','gstin':'27ABCDE1234F1Z5'}
    payload['payment']={'method':'cash','amount':'16.20','tendered':'20.00','change':'3.80','reference':None}
    denied(lambda: rpc('erp_stock_command',device,uid(),'sale',Jsonb({**payload,'items':[{**payload['items'][0],'discount_percent':'101'}]})))
    denied(lambda: rpc('erp_stock_command',device,uid(),'sale',Jsonb({**payload,'payment':{**payload['payment'],'tendered':'1.00'}})))
    first=rpc('erp_stock_command',device,sale_op,'sale',Jsonb(payload))
    assert first['sale']['payment']==payload['payment']
    assert first['sale']['company']==payload['company']
    assert float(first['sale']['items'][0]['discount_percent'])==10
    assert float(first['sale']['items'][0]['original_unit_price'])==3
    assert float(first['sale']['total_amount'])==16.20
    denied(lambda: rpc('erp_stock_command',device,sale_op,'sale',Jsonb({**payload,'payment':{**payload['payment'],'tendered':'30.00','change':'12.00'}})))
    assert rpc('erp_stock_command',device,sale_op,'sale',Jsonb(payload))==first
    denied(lambda: rpc('erp_stock_command',device,uid(),'sale',Jsonb(sale(1))))
    rpc('erp_stock_command',device2,uid(),'sale',Jsonb(sale(4)))
    balance=connection.execute('SELECT sum(quantity_change) FROM erp.stock_movements WHERE pharmacy_id=%s AND medicine_id=%s',(tenant,medicine)).fetchone()[0]
    assert balance==0, balance
    assert connection.execute('SELECT count(*) FROM erp.sales WHERE pharmacy_id=%s',(tenant,)).fetchone()[0]==2
    pull=rpc('erp_sync_pull',device,0)
    assert len(pull['changes'])==6, pull
    assert pull['role']=='superadmin'
    assert connection.execute('SELECT bool_and(expires_at<=issued_at+interval \'24 hours\') FROM erp.offline_leases WHERE pharmacy_id=%s',(tenant,)).fetchone()[0]
    assert rpc('erp_sync_pull',device,pull['cursor'])['changes']==[]
    from time import perf_counter
    batch=[{'p_operation':uid(),'p_entity':'suppliers','p_record':uid(),
            'p_base_version':0,'p_payload':{'name':f'Bulk {i}'},'p_deleted':False} for i in range(200)]
    started=perf_counter()
    receipt=rpc('erp_sync_push_batch',device,Jsonb(batch))
    elapsed=perf_counter()-started
    assert len(receipt['receipts'])==200
    assert all(r['result']['status']=='applied' for r in receipt['receipts'])
    assert rpc('erp_sync_push_batch',device,Jsonb(batch))==receipt
    denied(lambda: rpc('erp_sync_push_batch',device,Jsonb(batch+[batch[0]])))
    denied(lambda: rpc('erp_sync_push_batch',device,Jsonb([])))
    stale={**batch[0],'p_operation':uid()}
    trailing={**batch[1],'p_operation':uid(),'p_record':uid(),'p_payload':{'name':'Trailing'}}
    conflict=rpc('erp_sync_push_batch',device,Jsonb([stale,trailing]))
    assert len(conflict['receipts'])==1 and conflict['receipts'][0]['result']['status']=='conflict'
    assert rpc('erp_sync_push_batch',device,Jsonb([trailing]))['receipts'][0]['result']['record']['version']==1
    good={**batch[2],'p_operation':uid(),'p_record':uid(),'p_payload':{'name':'Rollback'}}
    bad={**good,'p_operation':uid(),'p_record':uid(),'p_entity':'employee_profiles'}
    denied(lambda: rpc('erp_sync_push_batch',device,Jsonb([good,bad])))
    assert rpc('erp_sync_push_batch',device,Jsonb([good]))['receipts'][0]['result']['record']['version']==1
    with connection.transaction():
        connection.execute('SET LOCAL ROLE authenticated')
        denied(lambda: connection.execute('SELECT public.erp_sync_push_batch(%s,%s,%s)',(device,'wrong-key'*8,Jsonb(batch))))
        connection.execute('RESET ROLE')
    print(f'Bulk checks passed: 200 records in {elapsed:.2f}s (database RPC), replay, limits, conflict prefix, rollback, device credential.')
    # Purchase orders preserve UUID parents and snapshots without changing stock.
    po_id, po_operation = uid(), uid()
    po_payload = {'request_id':uid(),'request_hash':'a'*64,'supplier_id':supplier,'supplier_name':'Supplier snapshot',
        'currency':'INR','status':'pending_approval','expected_delivery':None,'notes':'Sync fixture','created_at':'2026-10-19T00:00:00Z',
        'total_amount':'999.00','items':[{'medicine_id':medicine,'medicine_name':'Medicine snapshot','sku':'TEST','batch_number':'B',
                                       'quantity':2,'unit_price':'3.00','line_total':'999.00'}]}
    po_args=(device,po_operation,'purchase_orders',po_id,0,Jsonb(po_payload),False)
    po=rpc('erp_sync_push',*po_args)
    assert po['record']['total_amount']==6
    assert po['record']['items'][0]['line_total']==6
    assert rpc('erp_sync_push',*po_args)==po
    assert rpc('erp_sync_push',device2,uid(),'purchase_orders',po_id,0,Jsonb(po_payload),False)['status']=='conflict'
    denied(lambda: rpc('erp_sync_push',device,uid(),'purchase_orders',uid(),0,Jsonb({**po_payload,'request_id':uid(),'items':[{**po_payload['items'][0],'medicine_id':uid()}]}),False))
    denied(lambda: rpc('erp_sync_push',device,uid(),'purchase_orders',uid(),0,Jsonb({**po_payload,'request_id':uid(),'created_by':actor}),False))
    assert connection.execute('SELECT sum(quantity_change) FROM erp.stock_movements WHERE pharmacy_id=%s AND medicine_id=%s',(tenant,medicine)).fetchone()[0]==0
    settings_id=str(uuid.UUID(__import__('hashlib').md5((tenant+':pharmacy_settings').encode()).hexdigest()))
    settings={'default_prescription_duration_days':7,'auto_refill_reminders':True,'refill_reminder_lead_days':3,
              'allow_generic_substitution':True,'default_pharmacy_notes':'Fixture','low_stock_threshold':10,
              'low_stock_alerts_enabled':True,'expiry_alert_lead_days':7,'expiry_alerts_enabled':True,
              'auto_reorder_enabled':False,'default_supplier_id':supplier}
    assert rpc('erp_sync_push',device,uid(),'pharmacy_settings',settings_id,0,Jsonb(settings),False)['status']=='applied'
    assert rpc('erp_sync_push',device2,uid(),'pharmacy_settings',settings_id,1,Jsonb({**settings,'low_stock_threshold':20}),False)['record']['version']==2
    assert rpc('erp_sync_push',device,uid(),'pharmacy_settings',settings_id,1,Jsonb(settings),False)['status']=='conflict'
    denied(lambda: rpc('erp_sync_push',device,uid(),'pharmacy_settings',uid(),0,Jsonb(settings),False))
    notification_id=str(uuid.UUID(__import__('hashlib').md5((tenant+':notification_preferences:low_stock').encode()).hexdigest()))
    notification={'event_type':'low_stock','email_enabled':False,'sms_enabled':True,'in_app_enabled':True}
    assert rpc('erp_sync_push',device,uid(),'notification_preferences',notification_id,0,Jsonb(notification),False)['status']=='applied'
    # Atomic mixed upload batches can include the new entity through the old RPC.
    second_po={**po_payload,'request_id':uid()}
    mixed=[{'p_operation':uid(),'p_entity':'purchase_orders','p_record':uid(),'p_base_version':0,'p_payload':second_po,'p_deleted':False}]
    assert rpc('erp_sync_push_batch',device,Jsonb(mixed))['receipts'][0]['result']['status']=='applied'
    incoming=rpc('erp_sync_pull',device2,0)
    # Several pages may be needed after the bulk fixtures above.
    seen=[]
    while True:
        seen.extend(incoming['changes'])
        if not incoming['has_more']: break
        incoming=rpc('erp_sync_pull',device2,incoming['cursor'])
    assert any(c['entity']=='purchase_orders' and c['record_id']==po_id for c in seen)
    assert any(c['entity']=='pharmacy_settings' for c in seen)
    assert any(c['entity']=='notification_preferences' for c in seen)
    print('Business sync checks passed: purchase receipts, computed totals, snapshots, tenant parents, unchanged stock, shared preferences, two-device pull and mixed batches.')
    connection.execute("UPDATE erp.employee_profiles SET role='nurse' WHERE id=%s",(actor,))
    denied(lambda: rpc('erp_stock_command',device,uid(),'receive',Jsonb({'medicine_id':medicine,'quantity':1})))
    denied(lambda: rpc('erp_sync_push',device,uid(),'purchase_orders',uid(),0,Jsonb({**po_payload,'request_id':uid()}),False))
    with connection.transaction():
        connection.execute('SET LOCAL ROLE anon')
        denied(lambda: connection.execute('SELECT public.erp_sync_pull(%s,%s,0)',(device,secrets[device])))
        connection.execute('RESET ROLE')
    with connection.transaction():
        connection.execute('SET LOCAL ROLE authenticated')
        denied(lambda: connection.execute('SELECT * FROM erp.employee_profiles'))
        connection.execute('RESET ROLE')
    connection.execute('UPDATE erp.registered_devices SET revoked_at=now() WHERE id=%s',(device,))
    denied(lambda: rpc('erp_sync_pull',device,0))
    connection.execute('UPDATE erp.employee_profiles SET disabled_at=now() WHERE id=%s',(actor,))
    denied(lambda: rpc('erp_sync_pull',device2,0))
    print('Passed: duplicate retries, CAS conflicts, field/role protection, RLS, allocations, overselling rejection, sales conservation, cursor replay, 24h lease, and device/user revocation.')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backend',type=Path,required=True)
    args=parser.parse_args()
    with connect(args.backend) as connection:
        try:
            run(connection)
        finally:
            connection.rollback()
            print('All test changes rolled back.')


if __name__=='__main__': main()
