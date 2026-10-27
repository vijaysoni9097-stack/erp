"""Additive receivables ledger; existing paid invoices are unchanged."""
from datetime import datetime
from decimal import Decimal
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class SaleCredit(Base):
    __tablename__ = 'sale_credits'
    __table_args__ = (CheckConstraint('principal > 0 AND outstanding >= 0 AND outstanding <= principal'),)
    sale_id: Mapped[int] = mapped_column(ForeignKey('sales.id'), primary_key=True)
    phone: Mapped[str] = mapped_column(String(40), index=True)
    customer_name: Mapped[str] = mapped_column(String(150))
    principal: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    outstanding: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    actor_id: Mapped[int] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    notification: Mapped['CreditNotification | None'] = relationship(uselist=False)

class CreditCollection(Base):
    __tablename__ = 'credit_collections'
    __table_args__ = (CheckConstraint('amount > 0'),)
    request_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey('sale_credits.sale_id'), index=True)
    actor_id: Mapped[int] = mapped_column()
    payload_hash: Mapped[str] = mapped_column(String(64))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    method: Mapped[str] = mapped_column(String(20))
    reference: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)

class CreditNotification(Base):
    __tablename__ = 'credit_notifications'
    sale_id: Mapped[int] = mapped_column(ForeignKey('sale_credits.sale_id'), primary_key=True)
    status: Mapped[str] = mapped_column(String(30), default='queued', index=True)
    # Immutable message parameters preserve the balance when credit was granted.
    parameters: Mapped[str] = mapped_column(Text)
    provider_id: Mapped[str | None] = mapped_column(String(255))
    error: Mapped[str | None] = mapped_column(String(150))
    attempts: Mapped[int] = mapped_column(default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
