"""One-time supplier bootstrap; dry-run unless --apply. Retry-safe UUIDs.
Uploads only supplier_import_sources records, never credentials or other data.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import uuid
from psycopg.types.json import Jsonb
from cloud_migrate import connect, verify

PROJECT = 'nosqyzumgkripfqnqknw'
SOURCE = 'Surya_Pharmacy.dbo.vendorProfile'
TENANT = uuid.uuid5(uuid.NAMESPACE_URL, f'https://{PROJECT}.supabase.co/pharmacy/Surya_Pharmacy')
FIELDS = ('name','contact_person','phone','email','address')


def run(backend, apply=False):
    from dotenv import dotenv_values
    cfg = dotenv_values(backend/'.env')
    if str(cfg.get('SYNC_ENABLED','false')).lower() not in ('false','0',''):
        raise RuntimeError('Requires offline local mode')
    if cfg.get('DATABASE_URL','sqlite:///./temp.db') != 'sqlite:///./temp.db':
        raise RuntimeError('Unexpected local database configuration')
    database = backend/'temp.db'
    local = sqlite3.connect(database.as_uri()+('?mode=rw' if apply else '?mode=ro'),uri=True)
    try:
        local.execute('PRAGMA busy_timeout=5000')
        local.execute('BEGIN IMMEDIATE' if apply else 'BEGIN')
        rows = local.execute('''SELECT i.source_id,s.id,s.name,s.contact_person,s.phone,s.email,s.address
            FROM supplier_import_sources i JOIN suppliers s ON s.id=i.supplier_id
            WHERE i.source=? ORDER BY i.source_id''',(SOURCE,)).fetchall()
        if len(rows)!=564:
            raise RuntimeError('Expected 564 imported suppliers; review changed source')
        if local.execute("SELECT count(*) FROM sync_outbox WHERE entity='suppliers'").fetchone()[0]:
            raise RuntimeError('Supplier outbox requires reconciliation first')
        if apply:
            folder=backend/'backups';folder.mkdir(exist_ok=True,mode=0o700)
            backup=folder/('before-supplier-cloud-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.sqlite3')
            with sqlite3.connect(database.as_uri()+'?mode=ro',uri=True) as reader,sqlite3.connect(backup) as target:
                reader.backup(target)
            backup.chmod(0o600)
        inserted=0
        with connect(backend) as cloud:
            cloud.execute("SELECT pg_advisory_xact_lock(hashtext('supplier_bootstrap_surya'))")
            tenants=cloud.execute('SELECT id FROM erp.pharmacies').fetchall()
            if any(t[0]!=TENANT for t in tenants):
                raise RuntimeError('Unexpected tenant; explicit mapping required')
            cloud.execute('INSERT INTO erp.pharmacies(id,name) VALUES(%s,%s) ON CONFLICT(id) DO NOTHING',(TENANT,'Surya Pharmacy'))
            cloud.execute('INSERT INTO erp.sync_heads(pharmacy_id,cursor) VALUES(%s,0) ON CONFLICT DO NOTHING',(TENANT,))
            cloud.execute('SELECT cursor FROM erp.sync_heads WHERE pharmacy_id=%s FOR UPDATE',(TENANT,))
            for source_id,local_id,*values in rows:
                record=uuid.uuid5(TENANT,SOURCE+'/'+source_id)
                mapped=local.execute("SELECT cloud_id,version,deleted FROM sync_identities WHERE entity='suppliers' AND local_id=?",(local_id,)).fetchone()
                if mapped and mapped!=(str(record),1,0):
                    raise RuntimeError('Existing local mapping differs')
                current=cloud.execute('SELECT name,contact_person,phone,email,address,version,deleted_at FROM erp.suppliers WHERE pharmacy_id=%s AND id=%s',(TENANT,record)).fetchone()
                if current:
                    if tuple(values)+(1,None)!=current:
                        raise RuntimeError('Cloud supplier changed; refusing overwrite')
                else:
                    cloud.execute('INSERT INTO erp.suppliers(pharmacy_id,id,name,contact_person,phone,email,address) VALUES(%s,%s,%s,%s,%s,%s,%s)',(TENANT,record,*values))
                    saved=cloud.execute('SELECT to_jsonb(s) FROM erp.suppliers s WHERE pharmacy_id=%s AND id=%s',(TENANT,record)).fetchone()[0]
                    cloud.execute('SELECT erp.log_change(%s,%s,%s,1,%s,%s,false)',(TENANT,'suppliers',record,uuid.uuid5(record,'bootstrap-v1'),Jsonb(saved)))
                    inserted+=1
                if apply and not mapped:
                    local.execute("INSERT INTO sync_identities(entity,local_id,cloud_id,version,deleted) VALUES('suppliers',?,?,1,0)",(local_id,str(record)))
            count=cloud.execute('SELECT count(*) FROM erp.suppliers WHERE pharmacy_id=%s',(TENANT,)).fetchone()[0]
            logged=cloud.execute("SELECT count(*) FROM erp.change_log WHERE pharmacy_id=%s AND entity='suppliers'",(TENANT,)).fetchone()[0]
            if count!=564 or logged!=564:
                raise RuntimeError('Cloud count/change-log verification failed')
            verify(cloud)
            if apply:
                # Cloud first: deterministic IDs allow retry to repair local mappings
                # if this process stops between the two commits.
                cloud.commit()
                local.commit()
            else:
                cloud.rollback()
                local.rollback()
            print(json.dumps({'applied':apply,'inserted' if apply else 'would_insert':inserted,'verified_suppliers':count,'change_log_entries':logged,'pharmacy_id':str(TENANT)}))
    finally:
        local.close()

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--backend',type=Path,required=True)
    p.add_argument('--apply',action='store_true')
    a=p.parse_args()
    try: run(a.backend.resolve(),a.apply)
    except Exception as e:
        print('Upload failed:',type(e).__name__,getattr(e,'sqlstate','') or '')
        raise SystemExit(1)
