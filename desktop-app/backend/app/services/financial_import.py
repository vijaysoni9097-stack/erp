"""Historical invoice and opening receivable migration, without stock effects."""
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select

from app.models import Customer, ImportedSale, Medicine, Prescription, PrescriptionStatus, Sale, SaleItem, SaleStatus
from app.models.company import SaleCompany, SaleLineDiscount
from app.models.credit import SaleCredit
from app.models.sales import SalePayment
from app.models.sync import SyncIdentity
from app.services.customer_mobile import normalize_mobile

Money = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
MAX_MONEY = Decimal('9999999999.99')


def dated(value):
    if not isinstance(value, str) or ('T' not in value and 't' not in value):
        raise ValueError('Use an ISO timestamp with a timezone, e.g. 2025-03-31T12:00:00+05:30')
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00').replace('z', '+00:00'))
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError('Include a timezone offset or Z in the timestamp')
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    except OverflowError:
        raise ValueError('Timestamp is outside the supported range') from None
    if parsed > datetime.now(timezone.utc).replace(tzinfo=None):
        raise ValueError('Historical timestamps cannot be in the future')
    return parsed


class FinancialRow(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    customer_name: str | None = Field(default=None, min_length=2, max_length=150)
    customer_phone: str | None = Field(default=None, max_length=30)

    @field_validator('customer_phone', mode='before')
    @classmethod
    def mobile(cls, value):
        return normalize_mobile(value)


class HistoricalSaleRow(FinancialRow):
    invoice_ref: str = Field(min_length=1, max_length=100)
    line_ref: str = Field(min_length=1, max_length=80)
    sold_at: datetime
    balance_as_of: datetime
    sku: str = Field(min_length=2, max_length=50)
    quantity: int = Field(gt=0, le=2147483647)
    unit_price: Money
    discount_percent: Decimal = Field(default=Decimal('0'), ge=0, le=100, max_digits=5, decimal_places=2)
    line_total: Money | None = None
    tax_amount: Money = Decimal('0')
    invoice_total: Money
    outstanding_amount: Money
    initial_paid_amount: Money | None = None
    payment_method: Literal['cash', 'upi', 'card', 'bank_transfer'] | None = None
    payment_reference: str | None = Field(default=None, max_length=100)
    status: Literal['completed', 'voided'] = 'completed'
    prescribed_by: str | None = Field(default=None, min_length=2, max_length=150)
    company_name: str | None = Field(default=None, max_length=150)
    company_address: str | None = Field(default=None, max_length=2000)
    company_gstin: str | None = Field(default=None, pattern=r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator('sold_at', 'balance_as_of', mode='before')
    @classmethod
    def timestamp(cls, value):
        return dated(value)

    @model_validator(mode='after')
    def reconcile(self):
        if self.balance_as_of < self.sold_at:
            raise ValueError('balance_as_of must be on or after sold_at')
        if self.outstanding_amount > self.invoice_total:
            raise ValueError('Outstanding amount cannot exceed the invoice total')
        initial = self.initial_paid_amount or Decimal('0')
        if initial > self.invoice_total - self.outstanding_amount:
            raise ValueError('Initial payment plus outstanding cannot exceed the invoice total')
        if self.initial_paid_amount is not None and not self.payment_method:
            raise ValueError('Specify payment_method when initial_paid_amount is provided')
        if self.initial_paid_amount is None and (self.payment_method or self.payment_reference):
            raise ValueError('Provide initial_paid_amount with payment details')
        if self.status == 'voided' and (self.outstanding_amount or initial):
            raise ValueError('Voided invoices must have zero outstanding and no payment')
        if self.customer_phone and not self.customer_name:
            raise ValueError('Provide customer_name with customer_phone')
        if (self.outstanding_amount or self.prescribed_by) and not self.customer_name:
            raise ValueError('A customer is required for unpaid invoices and prescriber details')
        if self.outstanding_amount and not self.customer_phone:
            raise ValueError('Unpaid invoices need a customer mobile for Credit Accounts')
        computed = (self.unit_price * self.quantity * (1 - self.discount_percent / 100)).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
        if computed > MAX_MONEY:
            raise ValueError('Line total exceeds the supported amount')
        if self.line_total is not None and self.line_total != computed:
            raise ValueError('line_total must equal quantity × unit_price after discount, rounded to two decimals')
        self.line_total = computed
        return self


class OpeningBalanceRow(FinancialRow):
    balance_ref: str = Field(min_length=1, max_length=100)
    as_of: datetime
    customer_name: str = Field(min_length=2, max_length=150)
    customer_phone: str = Field(min_length=1, max_length=30)
    amount: Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator('as_of', mode='before')
    @classmethod
    def timestamp(cls, value):
        return dated(value)


FINANCIAL_SPECS = {
    'sales': (HistoricalSaleRow, list(HistoricalSaleRow.model_fields)),
    'opening_balances': (OpeningBalanceRow, list(OpeningBalanceRow.model_fields)),
}
LINE_FIELDS = {'line_ref', 'sku', 'quantity', 'unit_price', 'discount_percent', 'line_total'}


def prepare_financial(db, kind, validated, error):
    """Resolve links and reconcile whole invoices before any business write."""
    deleted = {(entity, local_id) for entity, local_id in db.execute(
        select(SyncIdentity.entity, SyncIdentity.local_id).where(SyncIdentity.deleted == True))}
    customers = {}
    for customer in db.scalars(select(Customer)):
        if ('customers', customer.id) in deleted:
            continue
        try:
            phone = normalize_mobile(customer.phone)
        except ValueError:
            phone = customer.phone
        customers.setdefault(customer.full_name.strip().casefold(), []).append((customer, phone))
    medicines = {}
    if kind == 'sales':
        for medicine in db.scalars(select(Medicine)):
            if ('medicines', medicine.id) not in deleted:
                medicines.setdefault(medicine.sku.strip().casefold(), []).append(medicine)
    existing = set(db.scalars(select(ImportedSale.source_key)))
    opening_customers = set(db.scalars(select(Sale.customer_id).join(ImportedSale).where(ImportedSale.kind == 'opening_balances')))
    credit_customers = set(db.scalars(select(Sale.customer_id).join(SaleCredit).where(SaleCredit.outstanding > 0)))
    groups, seen_balances = {}, set()

    for line, row in validated:
        ref = row.invoice_ref if kind == 'sales' else row.balance_ref
        key = ref.casefold()
        if key in existing:
            error(line, f'Reference "{ref}" is already imported; existing records are never overwritten')
            continue
        customer_id = None
        if row.customer_name:
            matches = [c for c, phone in customers.get(row.customer_name.casefold(), [])
                       if row.customer_phone is None or row.customer_phone == phone]
            if len(matches) != 1:
                error(line, 'Customer must match exactly one active name/mobile. Import customers first; supply a mobile to resolve shared names.')
                continue
            customer_id = matches[0].id
        if kind == 'opening_balances':
            if customer_id in opening_customers or customer_id in credit_customers or customer_id in seen_balances:
                error(line, 'This customer already has credit or an imported opening balance. Use unpaid historical invoices OR one opening balance per customer to avoid counting debt twice.')
                continue
            if key in groups:
                error(line, 'Duplicate balance reference in this file')
                continue
            seen_balances.add(customer_id)
            groups[key] = dict(row=row, customer_id=customer_id, line=line)
            continue
        if row.outstanding_amount and customer_id in opening_customers:
            error(line, 'An opening balance was already imported for this customer. Do not add the same debt again as an unpaid historical invoice.')
            continue
        matches = medicines.get(row.sku.casefold(), [])
        if len(matches) != 1:
            error(line, f'SKU "{row.sku}" must match exactly one active medicine. Import medicines first.')
            continue
        metadata = row.model_dump(exclude=LINE_FIELDS)
        group = groups.setdefault(key, dict(row=row, customer_id=customer_id, line=line,
                                            metadata=metadata, items=[], line_refs=set()))
        if group['metadata'] != metadata:
            error(line, 'All rows of an invoice must repeat the same invoice, customer, date, tax and payment fields')
            continue
        if row.line_ref.casefold() in group['line_refs']:
            error(line, 'Duplicate line_ref within this invoice')
            continue
        group['line_refs'].add(row.line_ref.casefold())
        group['items'].append(dict(medicine_id=matches[0].id, row=row))

    for group in groups.values():
        if kind == 'sales':
            subtotal = sum((item['row'].line_total for item in group['items']), Decimal('0'))
            if subtotal + group['row'].tax_amount != group['row'].invoice_total:
                error(group['line'], 'Invoice total must equal the sum of all discounted lines plus tax. Keep every line of an invoice in the same file.')
            group['subtotal'] = subtotal
    return list(groups.values())


def financial_preview(kind, groups):
    preview = []
    for group in groups[:10]:
        row = group['row']
        if kind == 'sales':
            preview.append(dict(invoice_ref=row.invoice_ref, sold_at=row.sold_at.isoformat() + 'Z',
                                customer_name=row.customer_name, lines=len(group['items']), invoice_total=str(row.invoice_total),
                                outstanding_amount=str(row.outstanding_amount), status=row.status))
        else:
            preview.append(row.model_dump(mode='json'))
    return preview


def save_financial(db, kind, groups, actor):
    for group in groups:
        row = group['row']
        opening = kind == 'opening_balances'
        total = row.amount if opening else row.invoice_total
        due = row.amount if opening else row.outstanding_amount
        initial = Decimal('0') if opening else (row.initial_paid_amount or Decimal('0'))
        when = row.as_of if opening else row.sold_at
        sale = Sale(customer_id=group['customer_id'], subtotal=total if opening else group['subtotal'],
                    tax_amount=0 if opening else row.tax_amount, total_amount=total,
                    status=SaleStatus.completed if opening else SaleStatus(row.status), created_at=when)
        sale.import_record = ImportedSale(source_reference=row.balance_ref if opening else row.invoice_ref,
            source_key=(row.balance_ref if opening else row.invoice_ref).casefold(), kind=kind,
            balance_as_of=row.as_of if opening else row.balance_as_of,
            paid_before_import=0 if opening or row.status == 'voided' else total - due - initial, notes=row.notes)
        if not opening:
            sale.items = [SaleItem(medicine_id=item['medicine_id'], quantity=item['row'].quantity,
                unit_price=item['row'].unit_price, line_total=item['row'].line_total,
                discount_record=SaleLineDiscount(original_unit_price=item['row'].unit_price,
                                                 discount_percent=item['row'].discount_percent)) for item in group['items']]
            if row.company_name or row.company_address or row.company_gstin:
                sale.company_record = SaleCompany(company_name=row.company_name, address=row.company_address, gstin=row.company_gstin)
            if row.prescribed_by:
                sale.prescription = Prescription(customer_id=group['customer_id'], doctor_name=row.prescribed_by,
                    prescribed_on=row.sold_at.date(), status=PrescriptionStatus.dispensed)
            if row.initial_paid_amount is not None and row.status != 'voided':
                sale.payment = SalePayment(method=row.payment_method, amount=initial, tendered=initial, change=0,
                                           reference=row.payment_reference)
        if due:
            sale.credit = SaleCredit(phone=row.customer_phone, customer_name=row.customer_name,
                principal=total - initial, outstanding=due, actor_id=actor.id, created_at=when)
        db.add(sale)
