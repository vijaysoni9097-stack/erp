"""Invoice-specific credit and repayment APIs, protected by the existing login."""
from datetime import datetime, timezone
from decimal import Decimal
from hashlib import sha256
from uuid import UUID, uuid5
from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.api.base import BaseAPI, RouteDefinition
from app.database import get_db, lock_inventory
from app.models import Sale, SaleStatus
from app.models.credit import SaleCredit, CreditCollection, CreditNotification
from app.schemas import PaymentCreate, SaleImportRead, SaleRead
from app.services.auth import get_current_profile
from app.services.customer_mobile import normalize_mobile

class CollectionCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    request_id: UUID
    payment: PaymentCreate


class DueAllocation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    sale_id: int = Field(gt=0)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class BulkCollectionCreate(CollectionCreate):
    allocations: list[DueAllocation] = Field(min_length=1)


def access(actor):
    if actor.role not in ('admin', 'superadmin', 'pharmacist'):
        raise HTTPException(403, 'Pharmacist or administrator access required')


def row(credit):
    return dict(sale_id=credit.sale_id, customer_name=credit.customer_name, phone=credit.phone,
                principal=credit.principal, outstanding=credit.outstanding, created_at=credit.created_at,
                import_details=SaleImportRead.model_validate(credit.sale.import_record) if credit.sale.import_record else None,
                whatsapp_status=credit.notification.status if credit.notification else None)

class CreditAPI(BaseAPI):
    methods = ['GET', 'POST']
    routes = [
        RouteDefinition('/api/v1/credits/summary', 'summary', 'GET', tags=['Credit']),
        RouteDefinition('/api/v1/credits', 'get', 'GET', tags=['Credit']),
        RouteDefinition('/api/v1/credits/collections', 'collect_all', 'POST', tags=['Credit']),
        RouteDefinition('/api/v1/credits/{id}', 'detail', 'GET', tags=['Credit']),
        RouteDefinition('/api/v1/credits/{id}/notification/retry', 'retry_notification', 'POST', tags=['Credit']),
        RouteDefinition('/api/v1/credits/{id}/collections', 'collect', 'POST', tags=['Credit']),
    ]

    @staticmethod
    def summary(from_at: datetime | None = None, to_at: datetime | None = None,
                actor=Depends(get_current_profile), db: Session = Depends(get_db)):
        from app.services.whatsapp import configured
        total, count = db.execute(select(func.coalesce(func.sum(SaleCredit.outstanding), 0), func.count()).where(SaleCredit.outstanding > 0)).one()
        statement = select(CreditCollection.method, func.sum(CreditCollection.amount)).group_by(CreditCollection.method)
        def utc(value):
            return value.astimezone(timezone.utc).replace(tzinfo=None) if value and value.tzinfo else value
        if from_at and to_at and utc(from_at)>=utc(to_at):
            raise HTTPException(422, 'The collection date range must end after it starts')
        if from_at: statement = statement.where(CreditCollection.created_at >= utc(from_at))
        if to_at: statement = statement.where(CreditCollection.created_at < utc(to_at))
        return dict(total_outstanding=total, invoice_count=count, collections=dict(db.execute(statement).all()), whatsapp_configured=configured())

    @staticmethod
    def get(phone: str | None = None, offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100),
            actor=Depends(get_current_profile), db: Session = Depends(get_db)):
        from sqlalchemy.orm import joinedload
        query = select(SaleCredit).where(SaleCredit.outstanding > 0)
        if phone is not None:
            try: normalized = normalize_mobile(phone)
            except ValueError: raise HTTPException(422, 'Enter a valid customer mobile')
            if not normalized: raise HTTPException(422, 'Enter a valid customer mobile')
            query = query.where(SaleCredit.phone == normalized)
        filtered = query.subquery()
        total, count = db.execute(select(func.coalesce(func.sum(filtered.c.outstanding), 0), func.count()).select_from(filtered)).one()
        rows = db.scalars(query.options(joinedload(SaleCredit.notification), joinedload(SaleCredit.sale).joinedload(Sale.import_record)).order_by(SaleCredit.created_at, SaleCredit.sale_id).offset(offset).limit(limit)).all()
        return dict(items=[row(c) for c in rows], total_outstanding=total, count=count, offset=offset, limit=limit)

    @staticmethod
    def detail(id: int, actor=Depends(get_current_profile), db: Session = Depends(get_db)):
        from app.api.sales.sales import invoice_load_options
        credit = db.get(SaleCredit, id)
        if not credit: raise HTTPException(404, 'Credit invoice not found')
        sale = db.scalar(select(Sale).options(*invoice_load_options()).where(Sale.id == id))
        collections = db.scalars(select(CreditCollection).where(CreditCollection.sale_id == id).order_by(CreditCollection.created_at, CreditCollection.request_id)).all()
        return dict(invoice=SaleRead.model_validate(sale), credit=row(credit), collections=[dict(request_id=c.request_id,amount=c.amount,method=c.method,reference=c.reference,created_at=c.created_at) for c in collections])

    @staticmethod
    def collect(id: int, payload: CollectionCreate, actor=Depends(get_current_profile), db: Session = Depends(get_db)):
        access(actor)
        if payload.payment.tendered <= 0: raise HTTPException(422, 'Collection amount must be greater than zero')
        if db.bind.dialect.name == 'sqlite':
            from sqlalchemy import text
            db.rollback(); db.execute(text('BEGIN IMMEDIATE'))
        lock_inventory(db)
        digest = sha256(f'{id}:{payload.model_dump_json()}'.encode()).hexdigest()
        previous = db.get(CreditCollection, str(payload.request_id))
        if previous:
            if previous.actor_id != actor.id or previous.payload_hash != digest:
                raise HTTPException(409, 'Collection reference already used for another payment')
            return dict(request_id=previous.request_id, amount=previous.amount, sale_id=previous.sale_id, replayed=True)
        credit = db.scalar(select(SaleCredit).where(SaleCredit.sale_id == id).with_for_update())
        if not credit: raise HTTPException(404, 'Credit invoice not found')
        sale = db.get(Sale, id)
        if sale.status != SaleStatus.completed: raise HTTPException(409, 'Cannot collect a voided invoice')
        if payload.payment.tendered > credit.outstanding: raise HTTPException(422, 'Payment exceeds this invoice’s outstanding balance; refresh and try again')
        credit.outstanding -= payload.payment.tendered
        entry = CreditCollection(request_id=str(payload.request_id), sale_id=id, actor_id=actor.id, payload_hash=digest,
            amount=payload.payment.tendered, method=payload.payment.method, reference=payload.payment.reference)
        db.add(entry); db.commit()
        return dict(request_id=str(payload.request_id), sale_id=id, amount=payload.payment.tendered, replayed=False)

    @staticmethod
    def collect_all(payload: BulkCollectionCreate, actor=Depends(get_current_profile), db: Session = Depends(get_db)):
        """Settle the selected customer's dues atomically with an immutable retry key."""
        access(actor)
        ids = [item.sale_id for item in payload.allocations]
        if len(set(ids)) != len(ids):
            raise HTTPException(422, 'Select each invoice only once')
        if sum(item.amount for item in payload.allocations) != payload.payment.tendered:
            raise HTTPException(422, 'Payment must equal the total selected dues')
        if db.bind.dialect.name == 'sqlite':
            from sqlalchemy import text
            db.rollback(); db.execute(text('BEGIN IMMEDIATE'))
        lock_inventory(db)
        digest = sha256(f'bulk:{payload.model_dump_json()}'.encode()).hexdigest()
        keys = [str(payload.request_id)] + [str(uuid5(payload.request_id, str(id))) for id in ids[1:]]
        previous = [db.get(CreditCollection, key) for key in keys]
        if any(previous):
            if not all(entry and entry.actor_id == actor.id and entry.payload_hash == digest for entry in previous):
                raise HTTPException(409, 'Collection reference already used for another payment')
            return dict(request_id=str(payload.request_id), amount=payload.payment.tendered, sale_ids=ids, replayed=True)
        credits = db.scalars(select(SaleCredit).where(SaleCredit.sale_id.in_(ids)).order_by(SaleCredit.sale_id).with_for_update()).all()
        if len(credits) != len(ids):
            raise HTTPException(404, 'A selected credit invoice was not found')
        if len({(c.phone, c.customer_name.strip().lower()) for c in credits}) != 1:
            raise HTTPException(422, 'Select dues belonging to the same customer and mobile')
        by_id = {credit.sale_id: credit for credit in credits}
        for item in payload.allocations:
            if db.get(Sale, item.sale_id).status != SaleStatus.completed:
                raise HTTPException(409, 'Cannot collect a voided invoice')
            if by_id[item.sale_id].outstanding != item.amount:
                raise HTTPException(422, 'A selected balance changed; close the payment and select the dues again')
        for item, key in zip(payload.allocations, keys):
            by_id[item.sale_id].outstanding = 0
            db.add(CreditCollection(request_id=key, sale_id=item.sale_id, actor_id=actor.id, payload_hash=digest,
                amount=item.amount, method=payload.payment.method, reference=payload.payment.reference))
        db.commit()
        return dict(request_id=str(payload.request_id), amount=payload.payment.tendered, sale_ids=ids, replayed=False)

    @staticmethod
    def retry_notification(id: int, actor=Depends(get_current_profile), db: Session = Depends(get_db)):
        access(actor)
        from app.services.whatsapp import configured
        if not configured(): raise HTTPException(503, 'WhatsApp is not configured. Add the Business API settings first.')
        from sqlalchemy import update
        count=db.execute(update(CreditNotification).where(CreditNotification.sale_id==id,
            CreditNotification.status.in_(['failed','not_configured'])).values(status='queued', error=None, updated_at=datetime.utcnow())).rowcount
        if not count:
            raise HTTPException(409, 'This notification cannot be retried. It may already be queued, accepted, uncertain, or missing customer consent.')
        db.commit()
        return dict(status='queued')
