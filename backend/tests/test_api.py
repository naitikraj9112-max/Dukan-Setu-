from __future__ import annotations

import asyncio
from copy import deepcopy
from pathlib import Path

import httpx
import pytest

from backend.app.config import Settings
from backend.app.errors import SupabaseError
from backend.app.main import create_app, get_supabase

USER_ID = "11111111-1111-4111-8111-111111111111"
SHOP_ID = "22222222-2222-4222-8222-222222222222"
OTHER_SHOP_ID = "33333333-3333-4333-8333-333333333333"
CUSTOMER_ID = "44444444-4444-4444-8444-444444444444"
PRODUCT_ID = "55555555-5555-4555-8555-555555555555"
ORDER_ID = "66666666-6666-4666-8666-666666666666"


class FakeSupabase:
    def __init__(self):
        self.inserts = []
        self.updates = []
        self.rpc_calls = []
        self.row_queries = []
        self.rpc_error = None

    async def get_user(self, token):
        if token != "valid-user-token":
            raise SupabaseError(401, "invalid_token")
        return {"id": USER_ID}

    async def rows(self, table, token, params):
        self.row_queries.append((table, deepcopy(params)))
        if table == "shop_members":
            return [{"shop_id": SHOP_ID}] if params.get("shop_id") == f"eq.{SHOP_ID}" else []
        if table == "orders":
            return [{"id": ORDER_ID, "shop_id": SHOP_ID, "status": "pending", "total_amount": "12.00"}]
        if table == "order_items":
            return []
        if table == "customers":
            return [{"id": CUSTOMER_ID, "shop_id": SHOP_ID, "outstanding_credit_balance": "0.00"}]
        if table == "products":
            return [{"id": PRODUCT_ID, "shop_id": SHOP_ID, "stock_quantity": "5.000"}]
        return []

    async def insert(self, table, token, body, *, params=None):
        self.inserts.append((table, deepcopy(body)))
        return {"id": PRODUCT_ID, **body}

    async def update(self, table, token, params, body):
        self.updates.append((table, deepcopy(params), deepcopy(body)))
        return [{"id": ORDER_ID, "shop_id": SHOP_ID, **body}]

    async def rpc(self, name, token, body):
        self.rpc_calls.append((name, deepcopy(body)))
        if self.rpc_error:
            raise self.rpc_error
        if name == "create_order_atomic":
            return {"order_id": ORDER_ID, "replayed": False}
        if name == "record_order_payment":
            return {"payment_id": "77777777-7777-4777-8777-777777777777", "replayed": False}
        if name == "list_low_stock_products":
            return []
        return None


@pytest.fixture
def setup_api():
    fake = FakeSupabase()
    app = create_app(Settings(
        supabase_url="https://project-ref.supabase.co",
        supabase_anon_key="test-anon-key",
        cors_origins=("http://localhost:5173",),
    ), supabase=fake)
    app.dependency_overrides[get_supabase] = lambda: fake
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    yield client, fake
    asyncio.run(client.aclose())


def request(client, method, path, **kwargs):
    return asyncio.run(client.request(method, path, **kwargs))


def auth():
    return {"Authorization": "Bearer valid-user-token"}


def test_requires_valid_bearer(setup_api):
    client, _ = setup_api
    response = request(client, "GET", f"/v1/shops/{SHOP_ID}/customers")
    assert response.status_code == 401


def test_rejects_shop_without_membership(setup_api):
    client, _ = setup_api
    response = request(client, "GET", f"/v1/shops/{OTHER_SHOP_ID}/customers", headers=auth())
    assert response.status_code == 403


def test_customer_search_uses_one_shop_scoped_name_or_phone_query(setup_api):
    client, fake = setup_api
    response = request(client, "GET", f"/v1/shops/{SHOP_ID}/customers?search=milk", headers=auth())
    assert response.status_code == 200
    table, params = fake.row_queries[-1]
    assert table == "customers"
    assert params["shop_id"] == f"eq.{SHOP_ID}"
    assert params["or"].startswith("(name.ilike.")
    assert "phone_number.ilike." in params["or"]


def test_product_create_cannot_set_stock_directly(setup_api):
    client, fake = setup_api
    response = request(client, "POST",
        f"/v1/shops/{SHOP_ID}/products", headers=auth(),
        json={"name": "Rice", "price": "60.00", "unit": "kg", "stock_quantity": 50},
    )
    assert response.status_code == 422
    assert fake.inserts == []


def test_credit_order_uses_atomic_rpc_and_idempotency_key(setup_api):
    client, fake = setup_api
    key = "88888888-8888-4888-8888-888888888888"
    response = request(client, "POST",
        f"/v1/shops/{SHOP_ID}/orders", headers={**auth(), "Idempotency-Key": key},
        json={
            "customer_id": CUSTOMER_ID,
            "payment_mode": "credit",
            "items": [{"product_id": PRODUCT_ID, "quantity": "2.000"}],
        },
    )
    assert response.status_code == 201
    function, body = fake.rpc_calls[0]
    assert function == "create_order_atomic"
    assert body["p_shop_id"] == SHOP_ID
    assert body["p_payment_mode"] == "credit"
    assert body["p_idempotency_key"] == key
    assert body["p_items"] == [{"product_id": PRODUCT_ID, "quantity": "2.000"}]


def test_payment_uses_atomic_idempotent_rpc(setup_api):
    client, fake = setup_api
    key = "99999999-9999-4999-8999-999999999999"
    response = request(client, "POST",
        f"/v1/shops/{SHOP_ID}/orders/{ORDER_ID}/payments",
        headers={**auth(), "Idempotency-Key": key},
        json={"amount": "5.00", "payment_method": "cash"},
    )
    assert response.status_code == 201
    function, body = fake.rpc_calls[0]
    assert function == "record_order_payment"
    assert body["p_amount"] == "5.00"
    assert body["p_idempotency_key"] == key


def test_invalid_payment_amount_is_rejected(setup_api):
    client, fake = setup_api
    response = request(client, "POST",
        f"/v1/shops/{SHOP_ID}/orders/{ORDER_ID}/payments",
        headers={**auth(), "Idempotency-Key": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},
        json={"amount": "-1.00"},
    )
    assert response.status_code == 422
    assert fake.rpc_calls == []


def test_insufficient_stock_database_error_becomes_conflict(setup_api):
    client, fake = setup_api
    fake.rpc_error = SupabaseError(400, "23514", "Inventory transaction would make stock negative")
    response = request(client, "POST",
        f"/v1/shops/{SHOP_ID}/orders",
        headers={**auth(), "Idempotency-Key": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},
        json={"payment_mode": "cash", "items": [{"product_id": PRODUCT_ID, "quantity": "999.000"}]},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "database_request_failed"


def test_customer_credit_balance_cannot_be_manually_edited(setup_api):
    client, fake = setup_api
    response = request(client, "PATCH",
        f"/v1/shops/{SHOP_ID}/customers/{CUSTOMER_ID}", headers=auth(),
        json={"outstanding_credit_balance": "0.00"},
    )
    assert response.status_code == 422
    assert fake.updates == []


def test_credit_balance_sql_uses_guarded_atomic_deltas():
    migration = Path(__file__).parents[2] / "supabase/migrations/20261119010000_phase2_core_backend.sql"
    sql = migration.read_text(encoding="utf-8")
    assert "outstanding_credit_balance = outstanding_credit_balance + v_total" in sql
    assert "outstanding_credit_balance = outstanding_credit_balance - p_amount" in sql
    assert "and outstanding_credit_balance >= p_amount" in sql
    assert "unique (shop_id, idempotency_key)" in sql


def test_stock_adjustment_uses_inventory_ledger(setup_api):
    client, fake = setup_api
    response = request(client, "POST",
        f"/v1/shops/{SHOP_ID}/inventory/products/{PRODUCT_ID}/adjustments",
        headers=auth(), json={"quantity_delta": "-1.000", "reason": "Damaged"},
    )
    assert response.status_code == 201
    table, body = fake.inserts[0]
    assert table == "inventory_transactions"
    assert body["quantity_delta"] == "-1.000"
    assert body["transaction_type"] == "adjustment"
    assert "stock_quantity" not in body
