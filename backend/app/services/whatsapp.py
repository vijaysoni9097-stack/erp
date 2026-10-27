"""Durable WhatsApp template outbox. Never holds checkout open for network I/O.

Accepted means Meta accepted the message, not proof of customer delivery.
Ambiguous sends are not automatically retried, to avoid duplicate notifications.
"""
import asyncio
import json
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from sqlalchemy import select, update
from app.config import get_settings
from app.database import SessionLocal
from app.models.credit import CreditNotification, SaleCredit


def configured():
    s = get_settings()
    return all((s.whatsapp_access_token, s.whatsapp_phone_number_id, s.whatsapp_template_name, s.whatsapp_api_version))


def process_one():
    if not configured(): return False
    s = get_settings()
    with SessionLocal() as db:
        # A process dying during a send is ambiguous, never silently send it twice.
        db.execute(update(CreditNotification).where(CreditNotification.status == 'sending',
            CreditNotification.updated_at < datetime.utcnow() - timedelta(minutes=5)).values(status='unknown', error='Send interrupted; verify with provider before resending'))
        notification = db.scalar(select(CreditNotification).where(CreditNotification.status.in_(['queued', 'not_configured'])).order_by(CreditNotification.sale_id).limit(1))
        if not notification:
            db.commit(); return False
        sale_id = notification.sale_id
        phone = db.get(SaleCredit, sale_id).phone
        parameters = json.loads(notification.parameters)
        claimed = db.execute(update(CreditNotification).where(CreditNotification.sale_id == sale_id,
            CreditNotification.status.in_(['queued', 'not_configured'])).values(status='sending', updated_at=datetime.utcnow(), attempts=CreditNotification.attempts+1)).rowcount
        db.commit()
        if not claimed: return True
    payload = dict(messaging_product='whatsapp', to=phone.lstrip('+'), type='template',
        template=dict(name=s.whatsapp_template_name, language=dict(code=s.whatsapp_template_language),
            components=[dict(type='body', parameters=[dict(type='text', text=p) for p in parameters])]))
    request = Request(f'https://graph.facebook.com/{s.whatsapp_api_version}/{s.whatsapp_phone_number_id}/messages',
        data=json.dumps(payload).encode(), headers={'Authorization': f'Bearer {s.whatsapp_access_token}', 'Content-Type':'application/json'})
    provider_id = None
    try:
        with urlopen(request, timeout=20) as response:
            provider_id = json.load(response)['messages'][0]['id']
        state, error = 'accepted', None
    except HTTPError as exc:
        # Do not persist provider payloads, credentials or customer data in errors.
        state, error = ('unknown' if exc.code >= 500 else 'failed'), f'WhatsApp provider HTTP {exc.code}'
    except Exception:
        state, error = 'unknown', 'Provider response uncertain; verify before resending'
    with SessionLocal() as db:
        db.execute(update(CreditNotification).where(CreditNotification.sale_id == sale_id).values(
            status=state, provider_id=provider_id, error=error, updated_at=datetime.utcnow()))
        db.commit()
    return True


async def worker():
    while True:
        try:
            processed = await asyncio.to_thread(process_one)
        except Exception:
            processed = False  # Persistence remains queued; next poll retries database availability.
        await asyncio.sleep(1 if processed else 15)
