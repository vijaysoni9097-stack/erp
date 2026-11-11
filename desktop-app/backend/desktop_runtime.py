"""Desktop-only hosting, first-run setup and native backup controls.

The business API is the unchanged web backend. This adapter configures an
installation-local database before importing it and never loads the web .env.
"""
import asyncio
from contextlib import asynccontextmanager
from email.message import EmailMessage
from pathlib import Path
import json
import os
from secrets import compare_digest
import smtplib
import ssl
from typing import Annotated
from urllib.parse import urlencode

from dotenv import dotenv_values
import certifi
from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from sqlalchemy import update

from storage import make_backup, snapshot, startup_backup, validate_backup

INTEGRATIONS = {
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL',
    'SMTP_STARTTLS', 'SMTP_CC_EMAIL', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_TEMPLATE_NAME', 'WHATSAPP_TEMPLATE_LANGUAGE', 'WHATSAPP_API_VERSION',
}


def configure_environment(directory):
    data_dir = Path(directory).expanduser().resolve()
    data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chdir(data_dir)
    settings = dotenv_values(data_dir / 'integrations.env')
    for name in INTEGRATIONS:
        os.environ.pop(name, None)
        if settings.get(name):
            os.environ[name] = settings[name]
    # These values always win, including over a developer's shell environment.
    os.environ.update(DATABASE_URL='sqlite:///' + (data_dir / 'pharma-erp.sqlite3').as_posix(),
                      REQUIRE_POSTGRES='false', DEBUG='false', CORS_ORIGINS='[]',
                      PASSWORD_RESET_URL='http://127.0.0.1/reset-password', USER_LOGIN_URL='',
                      SSL_CERT_FILE=certifi.where())
    # Pydantic's relative .env must not pick up another application's configuration.
    if (data_dir / '.env').exists():
        raise ValueError('Use integrations.env in the desktop data folder; .env is not supported there')
    startup_backup(data_dir)
    return data_dir


class InitialAccount(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=150)
    pharmacy_name: str = Field(min_length=1, max_length=150)
    license_number: str = Field(min_length=1, max_length=100)
    password: Annotated[str, StringConstraints(min_length=12, max_length=128, strip_whitespace=False)]
    confirm_password: Annotated[str, StringConstraints(min_length=12, max_length=128, strip_whitespace=False)]

    @model_validator(mode='after')
    def credentials(self):
        if self.email.count('@') != 1 or not all(self.email.split('@')) or any(c.isspace() for c in self.email):
            raise ValueError('Enter a valid email address')
        if self.password != self.confirm_password:
            raise ValueError('Passwords do not match')
        return self


def send_desktop_reset_email(email, token):
    from app.config import get_settings
    settings = get_settings()
    message = EmailMessage()
    message['Subject'] = 'Reset your pharmacy account password'
    message['From'] = settings.smtp_from_email
    message['To'] = email
    link = 'pharma-erp://reset-password?' + urlencode({'token': token})
    message.set_content(f'Open this link on the computer where PHARMA ERP is installed within 15 minutes:\n\n{link}\n\n'
                        'If you did not request this, you can ignore this email.')
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        if settings.smtp_starttls:
            smtp.starttls(context=ssl.create_default_context())
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password or '')
        smtp.send_message(message)


def create_desktop_app(data_dir, ui_dir, key, control_key, port, ready=None):
    if len(key) < 32 or len(control_key) < 32:
        raise ValueError('Desktop access keys must be random secrets of at least 32 characters')
    from app.config import get_settings
    get_settings.cache_clear()
    from app.main import create_app
    from app.database import SessionLocal
    from app.models import PharmacistProfile
    from app.models.settings import EmployeeRole
    from app.services.security import hash_secret
    from app.services import password_reset
    password_reset.send_reset_email = send_desktop_reset_email
    app = create_app()
    ui_dir = Path(ui_dir).resolve(strict=True)
    origin = f'http://127.0.0.1:{port}'
    state = {'maintenance': False, 'active': 0}

    def initialized():
        with SessionLocal() as db:
            profile = db.get(PharmacistProfile, 1)
            return bool(profile and profile.password_hash)

    original_lifespan = app.router.lifespan_context

    @asynccontextmanager
    async def lifespan(application):
        async with original_lifespan(application):
            os.chmod(Path(data_dir) / 'pharma-erp.sqlite3', 0o600)
            if ready:
                ready(dict(event='ready', port=port, setup_required=not initialized()))
            yield

    app.router.lifespan_context = lifespan

    @app.middleware('http')
    async def desktop_guard(request: Request, call_next):
        provided = request.headers.get('x-pharma-desktop-key', '')
        request_origin = request.headers.get('origin')
        if not compare_digest(provided.encode(), key.encode()) or (request_origin and request_origin != origin):
            return JSONResponse({'detail': 'This service is available only inside PHARMA ERP Desktop'}, status_code=403)
        if request.headers.get('host') != f'127.0.0.1:{port}':
            return JSONResponse({'detail': 'Invalid desktop host'}, status_code=403)
        control = request.url.path.startswith('/desktop/control/')
        if control and not compare_digest(request.headers.get('x-pharma-desktop-control', '').encode(), control_key.encode()):
            return JSONResponse({'detail': 'Native desktop action required'}, status_code=403)
        if state['maintenance'] and not control:
            return JSONResponse({'detail': 'Database maintenance is in progress'}, status_code=503)
        if not control:
            state['active'] += 1
        try:
            response = await call_next(request)
            response.headers['Cache-Control'] = 'no-store'
            response.headers['X-Content-Type-Options'] = 'nosniff'
            response.headers['Referrer-Policy'] = 'no-referrer'
            response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' about:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"
            return response
        finally:
            if not control:
                state['active'] -= 1

    @app.get('/desktop/status')
    def status():
        return dict(initialized=initialized())

    @app.get('/desktop/setup')
    def setup_page():
        return RedirectResponse('/login') if initialized() else FileResponse(ui_dir / 'setup.html')

    @app.post('/desktop/setup', status_code=201)
    def setup(payload: InitialAccount):
        with SessionLocal() as db:
            values = payload.model_dump(exclude={'password', 'confirm_password'})
            values.update(email=payload.email.lower(), role=EmployeeRole.superadmin, password_hash=hash_secret(payload.password),
                          phone=None, qualification=None, years_experience=None, shift_timing=None,
                          address_line_1=None, address_line_2=None, country='India', state=None, city=None, postal_code=None)
            result = db.execute(update(PharmacistProfile).where(PharmacistProfile.id == 1,
                PharmacistProfile.password_hash.is_(None)).values(**values))
            if result.rowcount != 1:
                db.rollback()
                raise HTTPException(409, 'This installation already has an account. Sign in to manage users.')
            db.commit()
        return dict(created=True)

    @app.post('/desktop/control/backup')
    def backup():
        return dict(path=str(make_backup(data_dir)))

    @app.post('/desktop/control/prepare-restore')
    async def prepare_restore(request: Request):
        if state['maintenance']:
            raise HTTPException(409, 'Database maintenance is already running')
        try:
            body = await request.json()
            source = validate_backup(body['path'])
            staged = snapshot(source, Path(data_dir) / 'restore-staging.sqlite3')
        except (ValueError, OSError, KeyError) as error:
            raise HTTPException(422, str(error)) from None
        state['maintenance'] = True
        for _ in range(300):
            if not state['active']:
                break
            await asyncio.sleep(.1)
        else:
            state['maintenance'] = False
            raise HTTPException(409, 'An operation is still running; finish it before restoring')
        safety = make_backup(data_dir, 'before-restore')
        return dict(staged=str(staged), safety=str(safety))

    @app.post('/desktop/control/cancel-restore')
    def cancel_restore():
        state['maintenance'] = False
        return dict(cancelled=True)

    app.mount('/assets', StaticFiles(directory=ui_dir / 'assets'), name='desktop-assets')

    @app.get('/{requested_path:path}')
    def frontend(requested_path: str):
        if requested_path.startswith(('api/', 'desktop/')):
            raise HTTPException(404, 'Not found')
        candidate = (ui_dir / requested_path).resolve()
        if not candidate.is_relative_to(ui_dir):
            raise HTTPException(404, 'Not found')
        if requested_path and candidate.is_file():
            return FileResponse(candidate)
        if not initialized():
            return RedirectResponse('/desktop/setup')
        return FileResponse(ui_dir / 'index.html')

    return app
