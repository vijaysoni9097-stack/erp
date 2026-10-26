"""Run backend verification without reading a developer's private .env or DB."""
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

backend = Path(__file__).resolve().parents[1] / 'backend'
venv_python = backend / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
python = os.environ.get('ERP_BACKEND_PYTHON') or (str(venv_python) if venv_python.exists() else sys.executable)
env = dict(os.environ, DEBUG='false', REQUIRE_POSTGRES='false', PYTHONDONTWRITEBYTECODE='1')
env['PYTHONPATH'] = os.pathsep.join([str(backend), str(backend/'tests')])
with TemporaryDirectory(prefix='erp-api-tests-') as directory:
    env['DATABASE_URL'] = f"sqlite:///{Path(directory) / 'tests.db'}"
    raise SystemExit(subprocess.call([python, '-m', 'unittest', 'discover', '-s', str(backend/'tests'), *sys.argv[1:]], cwd=directory, env=env))
