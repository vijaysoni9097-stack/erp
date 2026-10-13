"""Validate/apply versioned ERP migrations via the backend's admin connection.
Default is a transactionally rolled-back validation. Use --apply to commit.
Run with the backend .venv Python; DATABASE_URL is never read or changed.
"""
import argparse
import hashlib
import os
from pathlib import Path
import sys

import psycopg
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]


def connect(backend):
    config = {**dotenv_values(backend / '.env'), **os.environ}
    cert = Path(config['SUPABASE_ADMIN_DB_SSLROOTCERT'])
    if not cert.is_absolute():
        cert = backend / cert
    return psycopg.connect(host=config['SUPABASE_ADMIN_DB_HOST'],
                          port=int(config.get('SUPABASE_ADMIN_DB_PORT', '5432')),
                          dbname=config.get('SUPABASE_ADMIN_DB_NAME', 'postgres'),
                          user=config.get('SUPABASE_ADMIN_DB_USER', 'postgres'),
                          password=config['SUPABASE_ADMIN_DB_PASSWORD'],
                          sslmode='verify-full', sslrootcert=str(cert), connect_timeout=10,
                          options='-c statement_timeout=30000 -c lock_timeout=10000')


def verify(connection):
    insecure = connection.execute("""SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='erp' AND c.relkind='r' AND NOT c.relrowsecurity""").fetchall()
    if insecure:
        raise RuntimeError('RLS missing on application tables')
    for role in ('anon', 'authenticated'):
        exposed = connection.execute("""SELECT tablename FROM pg_tables WHERE schemaname='erp'
            AND (has_table_privilege(%s, format('erp.%%I',tablename),'SELECT')
            OR has_table_privilege(%s, format('erp.%%I',tablename),'INSERT')
            OR has_table_privilege(%s, format('erp.%%I',tablename),'UPDATE')
            OR has_table_privilege(%s, format('erp.%%I',tablename),'DELETE'))""", (role,)*4).fetchall()
        if exposed:
            raise RuntimeError('Unexpected direct client table grants')
    print('Verified: RLS enabled; no direct anon/authenticated table grants.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backend', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        with connect(args.backend) as connection:
            connection.execute("SELECT pg_advisory_xact_lock(hashtext('erp_schema_migrations'))")
            connection.execute('CREATE SCHEMA IF NOT EXISTS erp_migrations')
            connection.execute('REVOKE ALL ON SCHEMA erp_migrations FROM PUBLIC, anon, authenticated')
            connection.execute('CREATE TABLE IF NOT EXISTS erp_migrations.applied (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())')
            for file in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
                sql = file.read_text()
                digest = hashlib.sha256(sql.encode()).hexdigest()
                old = connection.execute('SELECT sha256 FROM erp_migrations.applied WHERE name=%s', (file.name,)).fetchone()
                if old:
                    if old[0] != digest:
                        raise RuntimeError('Previously applied migration was modified')
                    print('Already applied:', file.name)
                    continue
                connection.execute(sql)
                connection.execute('INSERT INTO erp_migrations.applied(name,sha256) VALUES (%s,%s)', (file.name,digest))
                print('Validated:', file.name)
            verify(connection)
            print('Application tables:', connection.execute("SELECT count(*) FROM pg_tables WHERE schemaname='erp'").fetchone()[0])
            if args.apply:
                connection.commit()
                print('Migrations committed.')
            else:
                connection.rollback()
                print('Validation rolled back; no schema changes persisted.')
    except Exception as error:
        # Avoid dumping credentials or patient/business data from SQL exceptions.
        print('Migration failed:', type(error).__name__, getattr(error, 'sqlstate', '') or '')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
