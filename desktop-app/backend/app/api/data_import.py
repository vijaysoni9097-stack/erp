"""Superadmin-only CSV migration endpoints."""
from fastapi import Depends, HTTPException, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.base import BaseAPI, RouteDefinition
from app.database import get_db, lock_inventory
from app.models import Customer, DataImport, Medicine, StockMovement, StockMovementType, Supplier
from app.services.auth import get_current_profile
from app.services.data_import import ImportKind, ImportRequest, SPECS, fingerprint, prepare_import
from app.services.financial_import import FINANCIAL_SPECS, save_financial


def migration_admin(profile=Depends(get_current_profile)):
    if profile.role != 'superadmin':
        raise HTTPException(403, 'Superadmin access is required to import migration data')
    return profile


class DataImportAPI(BaseAPI):
    methods = ['GET', 'POST']
    routes = [
        RouteDefinition('/api/v1/data-import/templates/{kind}', 'template', 'GET', tags=['Data import']),
        RouteDefinition('/api/v1/data-import/preview', 'preview', 'POST', tags=['Data import']),
        RouteDefinition('/api/v1/data-import', 'commit', 'POST', tags=['Data import']),
    ]

    @staticmethod
    def template(kind: ImportKind, actor=Depends(migration_admin)):
        return Response(','.join(SPECS[kind][1]) + '\r\n', media_type='text/csv', headers={
            'Content-Disposition': f'attachment; filename="{kind}-import-template.csv"',
            'Cache-Control': 'no-store',
        })

    @staticmethod
    def preview(payload: ImportRequest, response: Response, actor=Depends(migration_admin), db: Session = Depends(get_db)):
        response.headers['Cache-Control'] = 'no-store'
        result, _ = prepare_import(db, payload)
        return result

    @staticmethod
    def commit(payload: ImportRequest, response: Response, actor=Depends(migration_admin), db: Session = Depends(get_db)):
        response.headers['Cache-Control'] = 'no-store'
        try:
            if db.bind.dialect.name == 'sqlite':
                from sqlalchemy import text
                db.rollback()
                db.execute(text('BEGIN IMMEDIATE'))
            lock_inventory(db)
            result, rows = prepare_import(db, payload)
            if result['already_imported']:
                return dict(import_id=result['import_id'], imported=result['row_count'], already_imported=True)
            if not result['valid']:
                raise HTTPException(422, result)
            if payload.kind in FINANCIAL_SPECS:
                save_financial(db, payload.kind, rows, actor)
            else:
                model = {'suppliers': Supplier, 'medicines': Medicine, 'customers': Customer}[payload.kind]
                for data in rows:
                    record = model(**data)
                    db.add(record)
                    if payload.kind == 'medicines' and record.stock_quantity:
                        db.flush()
                        db.add(StockMovement(medicine_id=record.id, movement_type=StockMovementType.received,
                                             quantity_change=record.stock_quantity, note='Migration opening stock'))
            receipt = DataImport(fingerprint=fingerprint(payload), kind=payload.kind, filename=payload.filename,
                                 row_count=len(rows), actor_id=actor.id, actor_email=actor.email)
            db.add(receipt)
            db.commit()
            return dict(import_id=receipt.id, imported=receipt.row_count, already_imported=False)
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, 'Data changed during import. Preview the file again; no rows from this request were saved.') from None
        except Exception:
            db.rollback()
            raise
