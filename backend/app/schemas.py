from __future__ import annotations

from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CustomerCreate(InputModel):
    name: str = Field(min_length=1, max_length=160)
    phone_number: str = Field(min_length=5, max_length=32)


class CustomerUpdate(InputModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    phone_number: str | None = Field(default=None, min_length=5, max_length=32)


class ProductCreate(InputModel):
    name: str = Field(min_length=1, max_length=160)
    price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    unit: str = Field(min_length=1, max_length=32)
    low_stock_threshold: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=3)


class ProductUpdate(InputModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    unit: str | None = Field(default=None, min_length=1, max_length=32)
    low_stock_threshold: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=3)


class OrderItemInput(InputModel):
    product_id: UUID
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)


class OrderCreate(InputModel):
    customer_id: UUID | None = None
    payment_mode: Literal["cash", "credit"]
    items: list[OrderItemInput] = Field(min_length=1, max_length=100)

    @field_validator("items")
    @classmethod
    def unique_products(cls, items: list[OrderItemInput]) -> list[OrderItemInput]:
        if len({item.product_id for item in items}) != len(items):
            raise ValueError("Each product may appear only once per order")
        return items


class OrderStatusUpdate(InputModel):
    status: Literal["confirmed", "preparing", "ready", "completed", "cancelled"]


class PaymentCreate(InputModel):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    payment_method: Literal["cash", "upi", "card", "other"] = "cash"


class InventoryAddition(InputModel):
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)
    reason: str | None = Field(default=None, max_length=300)


class InventoryAdjustment(InputModel):
    quantity_delta: Decimal = Field(max_digits=12, decimal_places=3)
    reason: str = Field(min_length=1, max_length=300)

    @field_validator("quantity_delta")
    @classmethod
    def nonzero_delta(cls, value: Decimal) -> Decimal:
        if value == 0:
            raise ValueError("Quantity adjustment must be nonzero")
        return value


class AuthenticatedIdentity(BaseModel):
    user_id: UUID
    access_token: str


class ShopContext(BaseModel):
    shop_id: UUID
    identity: AuthenticatedIdentity
