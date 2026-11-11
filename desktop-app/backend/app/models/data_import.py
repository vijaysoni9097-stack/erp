"""Committed migration receipts provide an audit trail and safe retries."""
from datetime import datetime

from decimal import Decimal
from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DataImport(Base):
    __tablename__ = 'data_imports'

    id: Mapped[int] = mapped_column(primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True)
    kind: Mapped[str] = mapped_column(String(20))
    filename: Mapped[str] = mapped_column(String(255))
    row_count: Mapped[int] = mapped_column()
    actor_id: Mapped[int] = mapped_column()
    actor_email: Mapped[str] = mapped_column(String(150))
    created_at: Mapped[datetime] = mapped_column(DateTime(), server_default=func.now())


class ImportedSale(Base):
    """Original invoice identity and the balance snapshot at migration cutover."""
    __tablename__ = 'imported_sales'

    sale_id: Mapped[int] = mapped_column(ForeignKey('sales.id'), primary_key=True)
    source_reference: Mapped[str] = mapped_column(String(100))
    source_key: Mapped[str] = mapped_column(String(200), unique=True)
    kind: Mapped[str] = mapped_column(String(20))
    balance_as_of: Mapped[datetime] = mapped_column(DateTime())
    paid_before_import: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    notes: Mapped[str | None] = mapped_column(String(2000))
