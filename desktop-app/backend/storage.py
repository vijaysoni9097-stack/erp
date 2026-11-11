"""SQLite snapshots include committed WAL data; never copy a live database file."""
from datetime import datetime, timezone
from pathlib import Path
import os
import sqlite3
from uuid import uuid4


def validate_backup(source):
    source = Path(source).resolve(strict=True)
    if not source.is_file():
        raise ValueError('Choose a PHARMA ERP SQLite backup file')
    try:
        with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as db:
            if db.execute('PRAGMA quick_check').fetchall() != [('ok',)]:
                raise ValueError('The selected database did not pass its integrity check')
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not {'employee_table', 'medicines', 'sales', 'customers'}.issubset(tables):
                raise ValueError('The selected file is not a compatible PHARMA ERP database')
            if db.execute('PRAGMA foreign_key_check').fetchone():
                raise ValueError('The selected database has broken record links')
    except sqlite3.DatabaseError as error:
        raise ValueError('The selected file is not a readable SQLite database') from error
    return source


def snapshot(source, destination):
    source = Path(source).resolve(strict=True)
    destination = Path(destination).resolve()
    if source == destination:
        raise ValueError('Backup destination must differ from the live database')
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = destination.with_name(destination.name + '.' + uuid4().hex + '.tmp')
    try:
        with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as original:
            with sqlite3.connect(temporary) as target:
                original.backup(target)
        os.chmod(temporary, 0o600)
        validate_backup(temporary)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return destination


def make_backup(data_dir, prefix='manual'):
    data_dir = Path(data_dir)
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    return snapshot(data_dir / 'pharma-erp.sqlite3', data_dir / 'backups' / f'{prefix}-{timestamp}.sqlite3')


def startup_backup(data_dir):
    data_dir = Path(data_dir)
    if not (data_dir / 'pharma-erp.sqlite3').exists():
        return
    # Run before migrations; retain seven daily automatic snapshots.
    today = datetime.now(timezone.utc).strftime('%Y%m%d')
    folder = data_dir / 'backups'
    if not list(folder.glob(f'auto-{today}T*.sqlite3')):
        make_backup(data_dir, 'auto')
    for old in sorted(folder.glob('auto-*.sqlite3'), reverse=True)[7:]:
        old.unlink()
