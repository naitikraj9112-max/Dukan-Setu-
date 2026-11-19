from __future__ import annotations

import json
import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import JSONResponse

from .config import Settings
from .errors import AuthenticationError, ShopAccessError, SupabaseError
from .schemas import (
    AuthenticatedIdentity,
    CustomerCreate,
    CustomerUpdate,
    InventoryAddition,
    InventoryAdjustment,
    OrderCreate,
    OrderStatusUpdate,
    PaymentCreate,
    ProductCreate,
    ProductUpdate,
    ShopContext,
)
from .supabase_client import SupabaseREST

logger = logging.getLogger("dukan_setu.api")
security = HTTPBearer(auto_error=False)
ORDER_PUBLIC_COLUMNS = "id,shop_id,customer_id,total_amount,payment_status,status,created_at,updated_at"


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps({
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "event": getattr(record, "event", record.getMessage()),
            "request_id": getattr(record, "request_id", None),
            "method": getattr(record, "method", None),
            "path": getattr(record, "path", None),
            "status_code": getattr(record, "status_code", None),
            "duration_ms": getattr(record, "duration_ms", None),
            "error_code": getattr(record, "error_code", None),
        }, separators=(",", ":"))


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)


def get_supabase(request: Request) -> SupabaseREST:
    return request.app.state.supabase


async def get_identity(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: SupabaseREST = Depends(get_supabase),
) -> AuthenticatedIdentity:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthenticationError
    try:
        user = await db.get_user(credentials.credentials)
        user_id = UUID(str(user["id"]))
    except SupabaseError as exc:
        if exc.status_code not in {401, 403}:
            raise
        raise AuthenticationError from exc
    except (KeyError, ValueError, TypeError) as exc:
        raise AuthenticationError from exc
    return AuthenticatedIdentity(user_id=user_id, access_token=credentials.credentials)


async def require_shop_member(
    shop_id: UUID,
    identity: AuthenticatedIdentity = Depends(get_identity),
    db: SupabaseREST = Depends(get_supabase),
) -> ShopContext:
    members = await db.rows("shop_members", identity.access_token, {
        "select": "shop_id",
        "shop_id": f"eq.{shop_id}",
        "user_id": f"eq.{identity.user_id}",
        "limit": "1",
    })
    if not members:
        raise ShopAccessError
    return ShopContext(shop_id=shop_id, identity=identity)


def _params(ctx: ShopContext, *, select: str = "*") -> dict[str, str]:
    return {"select": select, "shop_id": f"eq.{ctx.shop_id}"}


def _id_params(ctx: ShopContext, row_id: UUID, *, select: str = "*") -> dict[str, str]:
    return {**_params(ctx, select=select), "id": f"eq.{row_id}", "limit": "1"}


def _single(rows: list[dict[str, Any]], noun: str) -> dict[str, Any]:
    if not rows:
        raise HTTPException(status_code=404, detail=f"{noun} not found")
    return rows[0]


def _search_filter(value: str) -> str:
    # PostgREST quoted filter value; escape SQL LIKE metacharacters and parser quotes.
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    escaped = escaped.replace("%", "\\%").replace("_", "\\_").replace("*", "\\*")
    return f'ilike."*{escaped}*"'


async def _get_row(
    db: SupabaseREST,
    table: str,
    ctx: ShopContext,
    row_id: UUID,
    *,
    select: str = "*",
) -> dict[str, Any]:
    rows = await db.rows(table, ctx.identity.access_token, _id_params(ctx, row_id, select=select))
    return _single(rows, table.rstrip("s").replace("_", " "))


def create_app(settings: Settings | None = None, supabase: SupabaseREST | None = None) -> FastAPI:
    config = settings or Settings.from_env()
    configure_logging(config.log_level)
    rest = supabase or SupabaseREST(config)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        if supabase is None:
            await rest.close()

    app = FastAPI(title="Dukan-Setu API", version="2.0.0", lifespan=lifespan)
    app.state.supabase = rest
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(config.cors_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )

    @app.middleware("http")
    async def request_logging(request: Request, call_next):
        request_id = request.headers.get("x-request-id", "")[:100] or str(uuid.uuid4())
        request.state.request_id = request_id
        started = time.perf_counter()
        response = None
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            logger.info("http_request", extra={
                "event": "http_request", "request_id": request_id,
                "method": request.method, "path": request.url.path,
                "status_code": response.status_code if response else 500,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
            })

    @app.exception_handler(AuthenticationError)
    async def authentication_error(request: Request, exc: AuthenticationError):
        return JSONResponse(status_code=401, content={"error": {"code": "unauthorized", "message": "Valid bearer authentication is required"}})

    @app.exception_handler(ShopAccessError)
    async def shop_access_error(request: Request, exc: ShopAccessError):
        return JSONResponse(status_code=403, content={"error": {"code": "shop_access_denied", "message": "You are not a member of this shop"}})

    @app.exception_handler(SupabaseError)
    async def supabase_error(request: Request, exc: SupabaseError):
        code = exc.code or "database_error"
        if code in {"23505", "23514", "55000"}:
            status = 409
        elif code in {"23503", "22023", "22P02"}:
            status = 422
        elif code == "42501":
            status = 403
        elif code in {"timeout", "unavailable"}:
            status = exc.status_code
        elif exc.status_code in {401, 403, 404, 409, 422}:
            status = exc.status_code
        else:
            status = 502
        logger.warning("supabase_error", extra={
            "event": "supabase_error", "request_id": getattr(request.state, "request_id", None),
            "error_code": code,
        })
        return JSONResponse(status_code=status, content={"error": {"code": "database_request_failed", "message": "The database request could not be completed"}})

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        code = {404: "not_found", 409: "conflict", 422: "invalid_request"}.get(exc.status_code, "request_error")
        return JSONResponse(status_code=exc.status_code, content={"error": {"code": code, "message": str(exc.detail)}})

    @app.exception_handler(RequestValidationError)
    async def request_validation_error(request: Request, exc: RequestValidationError):
        errors = [{"loc": list(item["loc"]), "msg": item["msg"], "type": item["type"]} for item in exc.errors()]
        return JSONResponse(status_code=422, content={"error": {"code": "validation_error", "message": "Request validation failed", "details": errors}})

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        logger.error("unhandled_error", extra={
            "event": "unhandled_error", "request_id": getattr(request.state, "request_id", None),
            "error_code": type(exc).__name__,
        })
        return JSONResponse(status_code=500, content={"error": {"code": "internal_error", "message": "An unexpected error occurred"}})

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    # Customer APIs
    @app.post("/v1/shops/{shop_id}/customers", status_code=201)
    async def create_customer(body: CustomerCreate, ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase)):
        row = await db.insert("customers", ctx.identity.access_token, {"shop_id": str(ctx.shop_id), **body.model_dump()})
        return {"data": row}

    @app.get("/v1/shops/{shop_id}/customers")
    async def list_customers(
        search: str | None = Query(default=None, min_length=1, max_length=100),
        limit: int = Query(default=100, ge=1, le=500), offset: int = Query(default=0, ge=0),
        ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase),
    ):
        base = {**_params(ctx), "order": "name.asc", "limit": str(limit), "offset": str(offset)}
        if not search:
            rows = await db.rows("customers", ctx.identity.access_token, base)
        else:
            filter_value = _search_filter(search)
            rows = await db.rows("customers", ctx.identity.access_token, {
                **base,
                "or": f"(name.{filter_value},phone_number.{filter_value})",
            })
        return {"data": rows, "limit": limit, "offset": offset}

    @app.get("/v1/shops/{shop_id}/customers/credit-summary")
    async def credit_summary(ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase)):
        rows = await db.rows("customers", ctx.identity.access_token, {
            **_params(ctx, select="id,name,phone_number,outstanding_credit_balance"),
            "outstanding_credit_balance": "gt.0", "order": "name.asc", "limit": "1000",
        })
        return {"data": rows}

    @app.get("/v1/shops/{shop_id}/customers/{customer_id}/credit")
    async def get_customer_credit(customer_id: UUID, ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase)):
        row = await _get_row(db, "customers", ctx, customer_id, select="id,shop_id,name,phone_number,outstanding_credit_balance")
        return {"data": row}

    @app.get("/v1/shops/{shop_id}/customers/{customer_id}")
    async def get_customer(customer_id: UUID, ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase)):
        return {"data": await _get_row(db, "customers", ctx, customer_id)}

    @app.patch("/v1/shops/{shop_id}/customers/{customer_id}")
    async def update_customer(customer_id: UUID, body: CustomerUpdate, ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase)):
        updates = body.model_dump(exclude_unset=True, exclude_none=True)
        if not updates:
            raise HTTPException(422, "At least one customer field is required")
        rows = await db.update("customers", ctx.identity.access_token, _id_params(ctx, customer_id), updates)
        return {"data": _single(rows, "Customer")}

    # Product APIs
    @app.post("/v1/shops/{shop_id}/products", status_code=201)
    async def create_product(body: ProductCreate, ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase)):
        row = await db.insert("products", ctx.identity.access_token, {"shop_id": str(ctx.shop_id), **body.model_dump(mode="json")})
        return {"data": row}

    @app.get("/v1/shops/{shop_id}/products")
    async def list_products(
        search: str | None = Query(default=None, min_length=1, max_length=100),
        limit: int = Query(default=100, ge=1, le=500), offset: int = Query(default=0, ge=0),
        ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase),
    ):
        params = {**_params(ctx), "order": "name.asc", "limit": str(limit), "offset": str(offset)}
        if search:
            params["name"] = _search_filter(search)
        rows = await db.rows("products", ctx.identity.access_token, params)
        return {"data": rows, "limit": limit, "offset": offset}

    @app.get("/v1/shops/{shop_id}/products/low-stock")
    async def low_stock_products(ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase)):
        rows = await db.rpc("list_low_stock_products", ctx.identity.access_token, {"p_shop_id": str(ctx.shop_id)})
        return {"data": rows if isinstance(rows, list) else []}

    @app.get("/v1/shops/{shop_id}/products/{product_id}")
    async def get_product(product_id: UUID, ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase)):
        return {"data": await _get_row(db, "products", ctx, product_id)}

    @app.patch("/v1/shops/{shop_id}/products/{product_id}")
    async def update_product(product_id: UUID, body: ProductUpdate, ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase)):
        updates = body.model_dump(mode="json", exclude_unset=True, exclude_none=True)
        if not updates:
            raise HTTPException(422, "At least one product field is required")
        rows = await db.update("products", ctx.identity.access_token, _id_params(ctx, product_id), updates)
        return {"data": _single(rows, "Product")}

    # Order APIs. Order creation and payments use database RPCs for atomicity.
    @app.post("/v1/shops/{shop_id}/orders", status_code=201)
    async def create_order(
        body: OrderCreate,
        idempotency_key: UUID = Header(alias="Idempotency-Key"),
        ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase),
    ):
        result = await db.rpc("create_order_atomic", ctx.identity.access_token, {
            "p_shop_id": str(ctx.shop_id), "p_customer_id": str(body.customer_id) if body.customer_id else None,
            "p_items": [item.model_dump(mode="json") for item in body.items],
            "p_payment_mode": body.payment_mode, "p_idempotency_key": str(idempotency_key),
        })
        order_id = UUID(str(result["order_id"]))
        order = await _get_row(db, "orders", ctx, order_id, select=ORDER_PUBLIC_COLUMNS)
        items = await db.rows("order_items", ctx.identity.access_token, {
            **_params(ctx), "order_id": f"eq.{order_id}", "order": "created_at.asc",
        })
        return {"data": {"order": order, "items": items, "replayed": bool(result.get("replayed", False))}}

    @app.get("/v1/shops/{shop_id}/orders")
    async def list_orders(
        status: str | None = Query(default=None, pattern="^(pending|confirmed|preparing|ready|completed|cancelled)$"),
        limit: int = Query(default=100, ge=1, le=500), offset: int = Query(default=0, ge=0),
        ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase),
    ):
        params = {**_params(ctx, select=ORDER_PUBLIC_COLUMNS), "order": "created_at.desc", "limit": str(limit), "offset": str(offset)}
        if status:
            params["status"] = f"eq.{status}"
        rows = await db.rows("orders", ctx.identity.access_token, params)
        return {"data": rows, "limit": limit, "offset": offset}

    @app.get("/v1/shops/{shop_id}/orders/{order_id}")
    async def get_order(order_id: UUID, ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase)):
        order = await _get_row(db, "orders", ctx, order_id, select=ORDER_PUBLIC_COLUMNS)
        items = await db.rows("order_items", ctx.identity.access_token, {
            **_params(ctx), "order_id": f"eq.{order_id}", "order": "created_at.asc",
        })
        return {"data": {"order": order, "items": items}}

    @app.patch("/v1/shops/{shop_id}/orders/{order_id}/status")
    async def update_order_status(order_id: UUID, body: OrderStatusUpdate, ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase)):
        order = await _get_row(db, "orders", ctx, order_id, select="id,shop_id,status")
        transitions = {
            "pending": {"confirmed", "cancelled"}, "confirmed": {"preparing", "cancelled"},
            "preparing": {"ready", "cancelled"}, "ready": {"completed", "cancelled"},
            "completed": set(), "cancelled": set(),
        }
        if body.status not in transitions[order["status"]]:
            raise HTTPException(409, "Order status transition is not allowed")
        params = {**_id_params(ctx, order_id), "status": f"eq.{order['status']}"}
        rows = await db.update("orders", ctx.identity.access_token, params, {"status": body.status})
        if not rows:
            raise HTTPException(409, "Order status changed concurrently; reload and retry")
        return {"data": rows[0]}

    @app.get("/v1/shops/{shop_id}/orders/{order_id}/history")
    async def order_history(order_id: UUID, ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase)):
        await _get_row(db, "orders", ctx, order_id, select="id")
        rows = await db.rows("order_status_history", ctx.identity.access_token, {
            **_params(ctx), "order_id": f"eq.{order_id}", "order": "changed_at.asc",
        })
        return {"data": rows}

    @app.post("/v1/shops/{shop_id}/orders/{order_id}/payments", status_code=201)
    async def record_payment(
        order_id: UUID, body: PaymentCreate,
        idempotency_key: UUID = Header(alias="Idempotency-Key"),
        ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase),
    ):
        result = await db.rpc("record_order_payment", ctx.identity.access_token, {
            "p_shop_id": str(ctx.shop_id), "p_order_id": str(order_id),
            "p_amount": str(body.amount), "p_payment_method": body.payment_method,
            "p_idempotency_key": str(idempotency_key),
        })
        return {"data": result}

    @app.get("/v1/shops/{shop_id}/orders/{order_id}/payments")
    async def order_payments(order_id: UUID, ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase)):
        await _get_row(db, "orders", ctx, order_id, select="id")
        rows = await db.rows("order_payments", ctx.identity.access_token, {
            **_params(ctx), "order_id": f"eq.{order_id}", "order": "created_at.asc",
        })
        return {"data": rows}

    # Inventory APIs
    @app.get("/v1/shops/{shop_id}/inventory/low-stock")
    async def inventory_low_stock(ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase)):
        rows = await db.rpc("list_low_stock_products", ctx.identity.access_token, {"p_shop_id": str(ctx.shop_id)})
        return {"data": rows if isinstance(rows, list) else []}

    @app.get("/v1/shops/{shop_id}/inventory/products/{product_id}/stock")
    async def current_stock(product_id: UUID, ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase)):
        row = await _get_row(db, "products", ctx, product_id, select="id,shop_id,name,stock_quantity,unit,low_stock_threshold")
        return {"data": row}

    @app.get("/v1/shops/{shop_id}/inventory/transactions")
    async def inventory_history(
        product_id: UUID | None = None, limit: int = Query(default=100, ge=1, le=500), offset: int = Query(default=0, ge=0),
        ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase),
    ):
        params = {**_params(ctx), "order": "created_at.desc", "limit": str(limit), "offset": str(offset)}
        if product_id:
            params["product_id"] = f"eq.{product_id}"
        rows = await db.rows("inventory_transactions", ctx.identity.access_token, params)
        return {"data": rows, "limit": limit, "offset": offset}

    @app.get("/v1/shops/{shop_id}/inventory/products/{product_id}/transactions")
    async def product_inventory_history(
        product_id: UUID, limit: int = Query(default=100, ge=1, le=500), offset: int = Query(default=0, ge=0),
        ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase),
    ):
        await _get_row(db, "products", ctx, product_id, select="id")
        rows = await db.rows("inventory_transactions", ctx.identity.access_token, {
            **_params(ctx), "product_id": f"eq.{product_id}", "order": "created_at.desc",
            "limit": str(limit), "offset": str(offset),
        })
        return {"data": rows, "limit": limit, "offset": offset}

    @app.post("/v1/shops/{shop_id}/inventory/products/{product_id}/stock-additions", status_code=201)
    async def add_stock(product_id: UUID, body: InventoryAddition, ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase)):
        await _get_row(db, "products", ctx, product_id, select="id")
        row = await db.insert("inventory_transactions", ctx.identity.access_token, {
            "shop_id": str(ctx.shop_id), "product_id": str(product_id), "transaction_type": "addition",
            "quantity_delta": str(body.quantity), "reason": body.reason,
        })
        return {"data": row}

    @app.post("/v1/shops/{shop_id}/inventory/products/{product_id}/adjustments", status_code=201)
    async def adjust_stock(product_id: UUID, body: InventoryAdjustment, ctx: ShopContext = Depends(require_shop_member), db: SupabaseREST = Depends(get_supabase)):
        await _get_row(db, "products", ctx, product_id, select="id")
        row = await db.insert("inventory_transactions", ctx.identity.access_token, {
            "shop_id": str(ctx.shop_id), "product_id": str(product_id), "transaction_type": "adjustment",
            "quantity_delta": str(body.quantity_delta), "reason": body.reason,
        })
        return {"data": row}

    return app


app = create_app()
