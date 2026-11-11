"""Check PostgreSQL pool limits without connecting to any database."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

class DatabasePoolTests(unittest.TestCase):
    def test_postgres_connections_are_bounded_without_overflow(self):
        backend=Path(__file__).resolve().parents[1]
        env=dict(os.environ,DATABASE_URL='postgresql+psycopg://test:test@127.0.0.1:1/test',
                 PYTHONPATH=str(backend),DEBUG='false',REQUIRE_POSTGRES='true',DB_POOL_SIZE='2',DB_POOL_TIMEOUT='30')
        code='from app.database import engine; assert engine.pool.size()==2; assert engine.pool._max_overflow==0; assert engine.pool.timeout()==30; engine.dispose()'
        with tempfile.TemporaryDirectory() as directory:
            result=subprocess.run([sys.executable,'-c',code],env=env,cwd=directory,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
