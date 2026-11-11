"""Frozen backend entry point. Configuration arrives on a private stdin pipe."""
import json
from pathlib import Path
import socket
import sys
from threading import Thread

import uvicorn

from desktop_runtime import configure_environment, create_desktop_app


def main():
    configuration = json.loads(sys.stdin.readline(65536))
    data_dir = configure_environment(configuration['data_dir'])
    ui_dir = Path(configuration['ui_dir']).resolve(strict=True)
    if not (ui_dir / 'index.html').is_file():
        raise RuntimeError('Desktop interface assets are missing. Reinstall PHARMA ERP.')
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.bind(('127.0.0.1', 0))
    listener.listen(128)
    port = listener.getsockname()[1]
    app = create_desktop_app(data_dir, ui_dir, configuration['key'], configuration['control_key'], port,
                             ready=lambda payload: print(json.dumps(payload), flush=True))
    server = uvicorn.Server(uvicorn.Config(app, log_level='warning', access_log=False,
        loop='asyncio', http='h11', ws='none', lifespan='on', timeout_graceful_shutdown=8))

    def parent_closed():
        # EOF also arrives if Electron crashes, preventing an orphan backend.
        sys.stdin.read()
        server.should_exit = True

    Thread(target=parent_closed, daemon=True).start()
    try:
        server.run(sockets=[listener])
    finally:
        listener.close()


if __name__ == '__main__':
    main()
