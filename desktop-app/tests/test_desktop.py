"""Real desktop process checks using temporary data and loopback HTTP only."""
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
import unittest

import httpx

from storage import snapshot, validate_backup

ROOT = Path(__file__).resolve().parents[1]
KEY = 'a' * 64
CONTROL_KEY = 'b' * 64
PASSWORD = 'DesktopPassword123!'
ACCOUNT = dict(first_name='Local', last_name='Owner', email='owner@example.com', pharmacy_name='Local Pharmacy',
               license_number='LOCAL-1', password=PASSWORD, confirm_password=PASSWORD)


class DesktopTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory(prefix='pharma-desktop-')
        self.addCleanup(self.temporary.cleanup)
        self.data_dir = Path(self.temporary.name) / 'data'
        self.ui = ROOT / 'build/ui'
        self.process = None
        self.addCleanup(self.stop)
        self.start()

    def start(self):
        env = dict(os.environ, DATABASE_URL='postgresql://must-never-connect.invalid/db', REQUIRE_POSTGRES='true')
        self.stderr = (Path(self.temporary.name) / 'backend.log').open('a+')
        self.process = subprocess.Popen([sys.executable, str(ROOT / 'backend/entry.py')], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=self.stderr, text=True, env=env, cwd=self.temporary.name)
        self.process.stdin.write(json.dumps(dict(data_dir=str(self.data_dir), ui_dir=str(self.ui), key=KEY, control_key=CONTROL_KEY)) + '\n')
        self.process.stdin.flush()
        # A thread works with Windows anonymous pipes as well as POSIX pipes.
        import queue
        from threading import Thread
        messages = queue.Queue()
        Thread(target=lambda: messages.put(self.process.stdout.readline()), daemon=True).start()
        try:
            ready = json.loads(messages.get(timeout=30))
        except Exception:
            self.stderr.flush()
            raise AssertionError((Path(self.temporary.name) / 'backend.log').read_text())
        self.origin = f"http://127.0.0.1:{ready['port']}"
        self.headers = {'X-Pharma-Desktop-Key': KEY}
        self.client = httpx.Client(base_url=self.origin, headers=self.headers, trust_env=False)
        for _ in range(50):
            try:
                if self.client.get('/desktop/status').status_code == 200:
                    return
            except httpx.ConnectError:
                time.sleep(.1)
        self.fail('Backend did not start')

    def stop(self):
        if self.process:
            self.client.close()
            self.process.stdin.close()
            self.process.wait(timeout=15)
            self.process.stdout.close()
            self.stderr.close()
            self.process = None

    def configure(self):
        result = self.client.post('/desktop/setup', json=ACCOUNT)
        self.assertEqual(result.status_code, 201, result.text)
        login = self.client.post('/api/v1/auth/login', json=dict(email=ACCOUNT['email'], password=PASSWORD))
        self.assertEqual(login.status_code, 200, login.text)
        self.client.headers['Authorization'] = 'Bearer ' + login.json()['access_token']
        return login.json()

    def control(self, route, body=None):
        return self.client.post('/desktop/control/' + route, headers={'X-Pharma-Desktop-Control': CONTROL_KEY}, json=body)

    def test_first_run_and_access_isolation(self):
        self.assertEqual(self.client.get('/desktop/status').json(), {'initialized': False})
        self.assertEqual(self.client.get('/').status_code, 307)
        self.assertIn('setup', self.client.get('/desktop/setup').text)
        self.assertEqual(httpx.get(self.origin + '/desktop/status', trust_env=False).status_code, 403)
        self.assertEqual(self.client.get('/desktop/status', headers={'Origin': 'https://evil.test'}).status_code, 403)
        self.assertEqual(self.client.get('/desktop/status', headers={'Host': 'evil.test'}).status_code, 403)
        self.assertEqual(self.client.post('/desktop/control/backup').status_code, 403)
        login = self.configure()
        self.assertEqual(login['profile']['role'], 'superadmin')
        self.assertEqual(login['profile']['first_name'], 'Local')
        self.assertIsNone(login['profile']['address_line_1'])
        self.assertEqual(self.client.post('/desktop/setup', json=dict(ACCOUNT, email='replacement@example.com')).status_code, 409)
        self.assertEqual(self.client.get('/login').status_code, 200)
        self.assertEqual(self.client.get('/api/v1/no-such-api').status_code, 404)
        self.assertEqual(self.client.get('/settings/import').status_code, 200)

    def test_checkout_persists_across_restart_and_backup_includes_wal(self):
        self.configure()
        medicine = dict(name='Local Medicine', sku='LOCAL-MED', batch_number='B1', expiry_date='2035-12-31',
                        purchase_price='5.00', selling_price='10.00', stock_quantity=20)
        result = self.client.post('/api/v1/medicines', json=medicine)
        self.assertEqual(result.status_code, 201, result.text)
        payload = dict(request_id='505aa83e-3567-497b-90c2-1f76191c4a81', patient_name='Desktop Patient',
            customer_mobile='9876543210', items=[dict(medicine_id=result.json()['id'], quantity=2)],
            payment=dict(method='cash', tendered='20.00', confirmed=True))
        checkout = self.client.post('/api/v1/sales/checkout', json=payload)
        self.assertEqual(checkout.status_code, 201, checkout.text)
        backup = self.control('backup')
        self.assertEqual(backup.status_code, 200, backup.text)
        with sqlite3.connect(backup.json()['path']) as db:
            self.assertEqual(db.execute('SELECT stock_quantity FROM medicines').fetchone()[0], 18)
            self.assertEqual(db.execute('SELECT total_amount FROM sales').fetchone()[0], 20)
        self.stop()
        self.start()
        self.assertTrue(self.client.get('/desktop/status').json()['initialized'])
        self.client.headers['Authorization'] = 'Bearer ' + self.client.post('/api/v1/auth/login', json=dict(email=ACCOUNT['email'], password=PASSWORD)).json()['access_token']
        self.assertEqual(self.client.get('/api/v1/medicines').json()[0]['stock_quantity'], 18)
        self.assertEqual(len(self.client.get('/api/v1/sales').json()), 1)
        self.assertEqual(self.client.post('/api/v1/sales/checkout', json=payload).status_code, 201)
        self.assertEqual(self.client.get('/api/v1/medicines').json()[0]['stock_quantity'], 18)

    def test_restore_stages_validated_snapshot_and_preserves_safety_backup(self):
        self.configure()
        original = self.control('backup').json()['path']
        result = self.client.post('/api/v1/suppliers', json={'name': 'Added after backup'})
        self.assertEqual(result.status_code, 201)
        prepared = self.control('prepare-restore', {'path': original})
        self.assertEqual(prepared.status_code, 200, prepared.text)
        staged, safety = prepared.json()['staged'], prepared.json()['safety']
        self.assertEqual(self.client.get('/api/v1/suppliers').status_code, 503)
        with sqlite3.connect(safety) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM suppliers').fetchone()[0], 1)
        self.stop()
        for suffix in ['', '-wal', '-shm']:
            (self.data_dir / ('pharma-erp.sqlite3' + suffix)).unlink(missing_ok=True)
        Path(staged).replace(self.data_dir / 'pharma-erp.sqlite3')
        self.start()
        self.client.headers['Authorization'] = 'Bearer ' + self.client.post('/api/v1/auth/login', json=dict(email=ACCOUNT['email'], password=PASSWORD)).json()['access_token']
        self.assertEqual(self.client.get('/api/v1/suppliers').json(), [])

    def test_bad_backup_cannot_enter_maintenance_or_overwrite_live_data(self):
        self.configure()
        bad = Path(self.temporary.name) / 'bad.sqlite3'
        bad.write_text('not a database')
        self.assertEqual(self.control('prepare-restore', {'path': str(bad)}).status_code, 422)
        self.assertEqual(self.client.get('/desktop/status').status_code, 200)
        with self.assertRaises(ValueError):
            validate_backup(bad)
        with self.assertRaises(ValueError):
            snapshot(self.data_dir / 'pharma-erp.sqlite3', self.data_dir / 'pharma-erp.sqlite3')

    def test_setup_password_whitespace_is_preserved(self):
        secret = ' DesktopPassword123! '
        result = self.client.post('/desktop/setup', json=dict(ACCOUNT, password=secret, confirm_password=secret))
        self.assertEqual(result.status_code, 201, result.text)
        result = self.client.post('/api/v1/auth/login', json=dict(email=ACCOUNT['email'], password=secret))
        self.assertEqual(result.status_code, 200, result.text)
