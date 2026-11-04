"""Validate migration CSV files without changing existing business records."""
import csv
import io
from datetime import date
from decimal import Decimal
from hashlib import sha256
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy import select

from app.models import Customer, DataImport, Medicine, Supplier
from app.models.sync import SyncIdentity
from app.schemas import CustomerCreate, MedicineCreate, SupplierCreate
from app.services.customer_mobile import normalize_mobile
from app.services.financial_import import FINANCIAL_SPECS, financial_preview, prepare_financial

MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 5000
ImportKind = Literal['suppliers', 'medicines', 'customers', 'sales', 'opening_balances']


class ImportRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: ImportKind
    filename: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1, max_length=MAX_BYTES)


class SupplierRow(SupplierCreate):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    contact_person: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=150)
    address: str | None = Field(default=None, max_length=2000)


class MedicineRow(MedicineCreate):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    generic_name: str | None = Field(default=None, max_length=150)
    purchase_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    selling_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    stock_quantity: int = Field(default=0, ge=0, le=2147483647)
    reorder_level: int = Field(default=10, ge=0, le=2147483647)

    @field_validator('expiry_date', mode='before')
    @classmethod
    def iso_date(cls, value):
        return csv_date(value)


class CustomerRow(CustomerCreate):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=150)

    @field_validator('phone', mode='before')
    @classmethod
    def mobile(cls, value):
        return normalize_mobile(value)

    @field_validator('date_of_birth', mode='before')
    @classmethod
    def birth_date(cls, value):
        return csv_date(value) if value else None


def csv_date(value):
    if not isinstance(value, str) or len(value) != 10 or value[4] != '-' or value[7] != '-':
        raise ValueError('Use YYYY-MM-DD for dates')
    return date.fromisoformat(value)


SPECS = {
    'suppliers': (SupplierRow, ['name', 'contact_person', 'phone', 'email', 'address']),
    'medicines': (MedicineRow, ['name', 'generic_name', 'sku', 'batch_number', 'expiry_date',
                              'purchase_price', 'selling_price', 'stock_quantity', 'reorder_level',
                              'unit', 'supplier_name']),
    'customers': (CustomerRow, ['full_name', 'phone', 'email', 'date_of_birth']),
    **FINANCIAL_SPECS,
}


def fingerprint(payload):
    return sha256((payload.kind + '\n' + payload.content.lstrip('\ufeff').replace('\r\n', '\n')).encode()).hexdigest()


def customer_key(row):
    # Shared family mobile numbers remain valid when names differ.
    try:
        phone = normalize_mobile(row.phone)
    except ValueError:
        phone = (row.phone or '').strip()
    return (row.full_name.strip().casefold(), phone or '',
            (row.email or '').strip().casefold(), row.date_of_birth)


def parse_csv(payload, error):
    schema, columns = SPECS[payload.kind]
    reader = csv.reader(io.StringIO(payload.content.lstrip('\ufeff'), newline=''), strict=True)
    try:
        header = [cell.strip().lower() for cell in next(reader)]
    except (StopIteration, csv.Error):
        raise HTTPException(422, 'CSV header is missing or invalid') from None
    required = {name for name, field in schema.model_fields.items() if field.is_required()}
    unknown = set(header) - set(columns)
    if len(header) != len(set(header)) or unknown or required - set(header):
        raise HTTPException(422, 'Invalid CSV columns. Required: ' + ', '.join(sorted(required))
                            + '. Allowed: ' + ', '.join(columns))

    validated, count = [], 0
    try:
        for values in reader:
            if not any(value.strip() for value in values):
                continue
            count += 1
            if count > MAX_ROWS:
                raise HTTPException(422, 'Import at most 5,000 rows per file')
            line = reader.line_num
            if len(values) != len(header):
                error(line, 'Column count does not match the header')
                continue
            raw = {key: value.strip() for key, value in zip(header, values) if value.strip()}
            supplier_name = raw.pop('supplier_name', None) if payload.kind == 'medicines' else None
            try:
                row = schema.model_validate(raw)
            except ValidationError as exc:
                error(line, '; '.join('.'.join(map(str, item['loc'])) + ': ' + item['msg'] for item in exc.errors()))
                continue
            validated.append((line, row, supplier_name))
    except csv.Error:
        error(reader.line_num, 'Malformed CSV; check quotes and delimiters')
    if not count:
        error(1, 'Add at least one data row below the header')
    return validated, count


def prepare_import(db, payload):
    if len(payload.content.encode('utf-8')) > MAX_BYTES:
        raise HTTPException(422, 'CSV files must be 2 MB or smaller')
    previous = db.scalar(select(DataImport).where(DataImport.fingerprint == fingerprint(payload)))
    if previous:
        return dict(valid=True, already_imported=True, import_id=previous.id,
                    row_count=previous.row_count, record_count=previous.row_count, errors=[], error_count=0, preview=[]), []

    errors, error_count = [], 0

    def error(line, message):
        nonlocal error_count
        error_count += 1
        if len(errors) < 100:
            errors.append(dict(row=line, message=message))

    validated, count = parse_csv(payload, error)
    if payload.kind in FINANCIAL_SPECS:
        rows = prepare_financial(db, payload.kind, [(line, row) for line, row, _ in validated], error)
        return dict(valid=error_count == 0, already_imported=False, row_count=count, record_count=len(rows),
                    errors=errors, error_count=error_count, preview=financial_preview(payload.kind, rows)), rows

    suppliers = {}
    deleted_suppliers = set(db.scalars(select(SyncIdentity.local_id).where(
        SyncIdentity.entity == 'suppliers', SyncIdentity.deleted == True)))
    for supplier in db.scalars(select(Supplier)):
        suppliers.setdefault(supplier.name.strip().casefold(), []).append(supplier)
    if payload.kind == 'suppliers':
        existing = set(suppliers)
    elif payload.kind == 'medicines':
        existing = {sku.strip().casefold() for sku in db.scalars(select(Medicine.sku))}
    else:
        existing = {customer_key(row) for row in db.scalars(select(Customer))}

    rows, preview, seen = [], [], set()
    for line, row, supplier_name in validated:
        data = row.model_dump()
        if payload.kind == 'medicines':
            key = row.sku.casefold()
            if supplier_name:
                matches = suppliers.get(supplier_name.casefold(), [])
                if len(matches) != 1 or matches[0].id in deleted_suppliers:
                    error(line, f'Supplier "{supplier_name}" must match one active supplier. Import suppliers first.')
                    continue
                data['supplier_id'] = matches[0].id
        elif payload.kind == 'suppliers':
            key = row.name.casefold()
        else:
            key = customer_key(row)
        if key in existing or key in seen:
            error(line, 'Record already exists or is duplicated in this file; existing records are never overwritten')
            continue
        seen.add(key)
        rows.append(data)
        if len(preview) < 10:
            display = row.model_dump(mode='json')
            display.pop('supplier_id', None)
            if payload.kind == 'medicines':
                display['supplier_name'] = supplier_name
            preview.append(display)
    return dict(valid=error_count == 0, already_imported=False, row_count=count, record_count=len(rows),
                errors=errors, error_count=error_count, preview=preview), rows
