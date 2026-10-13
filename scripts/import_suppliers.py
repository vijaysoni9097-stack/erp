"""Import a DBeaver vendorProfile JSON export into an offline SQLite ERP.

Dry-run by default. Keeps source IDs and original records in a provenance table;
never overwrites existing suppliers. Use only while cloud sync is disabled.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3

SOURCE = 'Surya_Pharmacy.dbo.vendorProfile'
FIELDS = ('vendorId', 'vendorName', 'contactPerson', 'address', 'city', 'state',
          'contactNo1', 'contactNo2', 'contactNo3', 'emailId')


def clean(value):
    value = str(value or '').strip()
    return value if any(c.isalnum() for c in value) else None


def prepare(path):
    document = json.loads(path.read_text(encoding='utf-8-sig'))
    if isinstance(document, dict):
        if len(document) != 1:
            raise ValueError('Expected exactly one exported result set')
        document = next(iter(document.values()))
    if not isinstance(document, list) or not document:
        raise ValueError('Expected a nonempty list of suppliers')
    counts = Counter((clean(r['vendorName']) or '').casefold() for r in document)
    seen = set()
    records = []
    for raw in document:
        if set(raw) != set(FIELDS):
            raise ValueError('Unexpected export columns')
        source_id, name = clean(raw['vendorId']), clean(raw['vendorName'])
        if not source_id or not name or source_id in seen:
            raise ValueError('Missing name/ID or duplicate source ID')
        seen.add(source_id)
        if counts[name.casefold()] > 1:
            name += f' [{source_id}]'
        phones = list(dict.fromkeys(v for k in ('contactNo1','contactNo2','contactNo3') if (v := clean(raw[k]))))
        address = list(dict.fromkeys(v for k in ('address','city','state') if (v := clean(raw[k]))))
        if len(phones) > 1:
            address.append('Additional phones: ' + ', '.join(phones[1:]))
        values = (name, clean(raw['contactPerson']), phones[0] if phones else None,
                  clean(raw['emailId']), '\n'.join(address) or None)
        for value, limit in zip(values, (150,100,30,150)):
            if value and len(value) > limit:
                raise ValueError(f'{source_id}: field exceeds target length')
        records.append((source_id, values, json.dumps(raw, sort_keys=True, ensure_ascii=False)))
    return records


def run(source, database, apply=False):
    records = prepare(source)
    db = sqlite3.connect(database.resolve().as_uri() + ('?mode=rw' if apply else '?mode=ro'), uri=True)
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA busy_timeout=5000')
    backup = None
    try:
        db.execute('BEGIN IMMEDIATE' if apply else 'BEGIN')
        before = db.execute('SELECT COUNT(*) FROM suppliers').fetchone()[0]
        provenance = db.execute("SELECT 1 FROM sqlite_master WHERE name='supplier_import_sources'").fetchone()
        old = {r[0]: r[1:] for r in db.execute('SELECT source_id,supplier_id,raw_json FROM supplier_import_sources WHERE source=?',(SOURCE,))} if provenance else {}
        existing = {name.strip().casefold() for (name,) in db.execute('SELECT name FROM suppliers')}
        pending = []
        for source_id, values, raw in records:
            if source_id in old:
                supplier_id, previous = old[source_id]
                if previous != raw or not db.execute('SELECT 1 FROM suppliers WHERE id=?',(supplier_id,)).fetchone():
                    raise ValueError(f'{source_id}: previously imported record changed or missing; review required')
                continue
            if values[0].casefold() in existing:
                raise ValueError(f'{source_id}: existing supplier name collision; review required')
            existing.add(values[0].casefold())
            pending.append((source_id,values,raw))
        if apply and pending:
            folder = database.parent / 'backups'
            folder.mkdir(exist_ok=True, mode=0o700)
            stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
            backup = folder / f'before-supplier-import-{stamp}.sqlite3'
            # Separate read connection snapshots the committed DB while write lock
            # prevents other writers from changing the import baseline.
            with sqlite3.connect(database.resolve().as_uri()+'?mode=ro',uri=True) as reader:
                with sqlite3.connect(backup) as target:
                    reader.backup(target)
            backup.chmod(0o600)
            db.execute('''CREATE TABLE IF NOT EXISTS supplier_import_sources (
                source TEXT NOT NULL, source_id TEXT NOT NULL,
                supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
                raw_json TEXT NOT NULL, import_sha256 TEXT NOT NULL,
                imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(source,source_id))''')
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            for source_id, values, raw in pending:
                cursor = db.execute('INSERT INTO suppliers(name,contact_person,phone,email,address) VALUES(?,?,?,?,?)',values)
                db.execute('INSERT INTO supplier_import_sources(source,source_id,supplier_id,raw_json,import_sha256) VALUES(?,?,?,?,?)',(SOURCE,source_id,cursor.lastrowid,raw,digest))
            if db.execute('SELECT COUNT(*) FROM suppliers').fetchone()[0] != before+len(pending):
                raise RuntimeError('Supplier count verification failed')
            if db.execute('PRAGMA foreign_key_check').fetchall():
                raise RuntimeError('Foreign-key validation failed')
            if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                raise RuntimeError('Database integrity validation failed')
            db.commit()
        else:
            db.rollback()
        return {'source_records':len(records),'existing_suppliers':before,'inserted' if apply else 'would_insert':len(pending),'already_imported':len(records)-len(pending),'backup':str(backup) if backup else None}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',required=True,type=Path)
    parser.add_argument('--database',required=True,type=Path)
    parser.add_argument('--apply',action='store_true')
    args = parser.parse_args()
    print(json.dumps(run(args.source,args.database,args.apply),indent=2))
