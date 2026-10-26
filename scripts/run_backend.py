"""Start the monorepo API with its own working directory and environment file."""
import os
from pathlib import Path
import subprocess
import sys

backend = Path(__file__).resolve().parents[1] / 'backend'
venv_python = backend / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
python = os.environ.get('ERP_BACKEND_PYTHON') or (str(venv_python) if venv_python.exists() else sys.executable)
raise SystemExit(subprocess.call([python, '-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000', *sys.argv[1:]], cwd=backend))
