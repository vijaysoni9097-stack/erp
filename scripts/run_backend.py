"""Start the monorepo API with its own working directory and environment file."""
import os
from pathlib import Path
import subprocess
import sys


backend = Path(__file__).resolve().parents[1] / 'backend'
venv_python = backend / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
python = os.environ.get('ERP_BACKEND_PYTHON') or (str(venv_python) if venv_python.exists() else sys.executable)
# The online-only application must not silently fall back to a new SQLite DB.
if not os.environ.get('DATABASE_URL'):
    env_file = backend / '.env'
    values = {}
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                values[key.strip()] = value.strip().strip('\"').strip("'")
    if not values.get('DATABASE_URL'):
        raise SystemExit('Set DATABASE_URL in backend/.env to your hosted PostgreSQL connection string, then run ERP: Run backend again. No database was opened.')
os.environ.setdefault('REQUIRE_POSTGRES', 'true')
# Some IDE/shell environments use DEBUG=release for unrelated tooling.
if os.environ.get('DEBUG', '').lower() not in {'', 'true', 'false', '1', '0', 'yes', 'no', 'on', 'off', 't', 'f', 'y', 'n'}:
    os.environ['DEBUG'] = 'false'
raise SystemExit(subprocess.call([python, '-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000', *sys.argv[1:]], cwd=backend))
