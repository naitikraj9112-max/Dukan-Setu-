-- Phase 2 backend support. Apply only after reviewing; this migration is not
-- applied automatically by the API and is never run against production here.

alter table public.orders
  add column idempotency_key uuid,
  add column request_fingerprint text,
  add constraint orders_shop_idempotency_key_unique unique (shop_id, idempotency_key);

create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'upi', 'card', 'other')),
  idempotency_key uuid not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint order_payments_order_same_shop_fk foreign key (shop_id, order_id)
    references public.orders(shop_id, id) on delete restrict,
  unique (shop_id, idempotency_key)
);
create index order_payments_shop_order_idx on public.order_payments(shop_id, order_id, created_at desc);

alter table public.order_payments enable row level security;
create policy order_payments_member_select on public.order_payments for select to authenticated
  using (public.is_shop_member(shop_id));

-- Balances are changed only by the transactional order/payment RPCs.
revoke insert, update on public.customers from authenticated;
grant insert (shop_id, name, phone_number) on public.customers to authenticated;
grant update (name, phone_number) on public.customers to authenticated;

-- Orders and items are written atomically through create_order_atomic. Clients
-- may change only status directly; the Phase 1 trigger records its history.
revoke insert, update on public.orders from authenticated;
grant update (status) on public.orders to authenticated;
revoke insert, update, delete on public.order_items from authenticated;
grant select on public.order_items to authenticated;

revoke all privileges on table public.order_payments from anon, authenticated, public;
grant select on public.order_payments to authenticated;

create function public.set_order_payment_actor()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;
create trigger order_payments_set_actor before insert on public.order_payments
  for each row execute function public.set_order_payment_actor();

create function public.reject_order_payment_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'order_payments is append-only' using errcode = '55000';
end;
$$;
create trigger order_payments_append_only before update or delete on public.order_payments
  for each row execute function public.reject_order_payment_mutation();
create trigger order_payments_no_truncate before truncate on public.order_payments
  for each statement execute function public.reject_order_payment_mutation();

create function public.create_order_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_payment_mode text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_fingerprint text;
  v_order public.orders%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_unit_price numeric(12,2);
  v_total numeric(12,2) := 0;
  v_item_count integer;
  v_distinct_products integer;
begin
  if auth.uid() is null or not public.is_shop_member(p_shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'Idempotency-Key is required' using errcode = '22023';
  end if;
  if p_payment_mode is null or p_payment_mode not in ('cash', 'credit') then
    raise exception 'Payment mode must be cash or credit' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Order items must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'Order must contain between 1 and 100 items' using errcode = '22023';
  end if;

  v_fingerprint := md5(coalesce(p_customer_id::text, '') || '|' || p_payment_mode || '|' || p_items::text);
  select * into v_order from public.orders
   where shop_id = p_shop_id and idempotency_key = p_idempotency_key;
  if found then
    if v_order.request_fingerprint is distinct from v_fingerprint then
      raise exception 'Idempotency key was already used for a different order' using errcode = '23505';
    end if;
    return jsonb_build_object('order_id', v_order.id, 'replayed', true);
  end if;

  select count(*), count(distinct (entry.value ->> 'product_id')::uuid)
    into v_item_count, v_distinct_products
    from jsonb_array_elements(p_items) as entry(value);
  if v_item_count <> v_distinct_products then
    raise exception 'Each product may appear only once per order' using errcode = '22023';
  end if;

  if p_payment_mode = 'credit' and p_customer_id is null then
    raise exception 'A customer is required for a credit order' using errcode = '22023';
  end if;
  if p_customer_id is not null then
    perform 1 from public.customers
     where shop_id = p_shop_id and id = p_customer_id for update;
    if not found then
      raise exception 'Customer not found in this shop' using errcode = '23503';
    end if;
  end if;

  -- Lock products in stable order while snapshotting prices, preventing a price
  -- edit from racing the order and reducing deadlock risk for overlapping carts.
  for v_item in
    select entry.value from jsonb_array_elements(p_items) as entry(value)
     order by (entry.value ->> 'product_id')::uuid
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 999999999.999 or scale(v_quantity) > 3 then
      raise exception 'Item quantity is outside the supported range' using errcode = '22023';
    end if;
    select price into v_unit_price from public.products
     where shop_id = p_shop_id and id = v_product_id for update;
    if not found then
      raise exception 'Product not found in this shop' using errcode = '23503';
    end if;
    v_total := v_total + round(v_unit_price * v_quantity, 2);
  end loop;
  if v_total <= 0 then
    raise exception 'Order total must be greater than zero' using errcode = '22023';
  end if;

  insert into public.orders
    (shop_id, customer_id, total_amount, payment_status, idempotency_key, request_fingerprint)
  values
    (p_shop_id, p_customer_id, v_total,
     case when p_payment_mode = 'cash' then 'paid' else 'unpaid' end,
     p_idempotency_key, v_fingerprint)
  on conflict (shop_id, idempotency_key) do nothing
  returning * into v_order;
  if not found then
    select * into v_order from public.orders
     where shop_id = p_shop_id and idempotency_key = p_idempotency_key;
    if v_order.request_fingerprint is distinct from v_fingerprint then
      raise exception 'Idempotency key was already used for a different order' using errcode = '23505';
    end if;
    return jsonb_build_object('order_id', v_order.id, 'replayed', true);
  end if;

  for v_item in select entry.value from jsonb_array_elements(p_items) as entry(value)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    select price into v_unit_price from public.products
     where shop_id = p_shop_id and id = v_product_id;
    insert into public.order_items (shop_id, order_id, product_id, quantity, unit_price)
    values (p_shop_id, v_order.id, v_product_id, v_quantity, v_unit_price);
    insert into public.inventory_transactions
      (shop_id, product_id, transaction_type, quantity_delta, reason, reference_order_id)
    values
      (p_shop_id, v_product_id, 'deduction', -v_quantity, 'Order fulfillment', v_order.id);
  end loop;

  if p_payment_mode = 'credit' then
    update public.customers
       set outstanding_credit_balance = outstanding_credit_balance + v_total
     where shop_id = p_shop_id and id = p_customer_id;
  else
    insert into public.order_payments (shop_id, order_id, amount, payment_method, idempotency_key)
    values (p_shop_id, v_order.id, v_total, 'cash', p_idempotency_key);
  end if;

  return jsonb_build_object('order_id', v_order.id, 'replayed', false);
end;
$$;

create function public.record_order_payment(
  p_shop_id uuid,
  p_order_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
  v_existing public.order_payments%rowtype;
  v_payment public.order_payments%rowtype;
  v_paid numeric(12,2);
begin
  if auth.uid() is null or not public.is_shop_member(p_shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_amount is null or p_amount <= 0
     or scale(p_amount) > 2
     or p_amount > 9999999999.99 then
    raise exception 'Valid positive amount and Idempotency-Key are required' using errcode = '22023';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'upi', 'card', 'other') then
    raise exception 'Unsupported payment method' using errcode = '22023';
  end if;

  select * into v_existing from public.order_payments
   where shop_id = p_shop_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.order_id <> p_order_id or v_existing.amount <> p_amount
       or v_existing.payment_method <> p_payment_method then
      raise exception 'Idempotency key was already used for a different payment' using errcode = '23505';
    end if;
    return jsonb_build_object('payment_id', v_existing.id, 'order_id', p_order_id, 'replayed', true);
  end if;

  select * into v_order from public.orders
   where shop_id = p_shop_id and id = p_order_id for update;
  if not found then
    raise exception 'Order not found in this shop' using errcode = '23503';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'Cannot record payment for a cancelled order' using errcode = '22023';
  end if;
  if v_order.idempotency_key is null then
    raise exception 'Payments can only be recorded for orders created after the payment ledger was enabled'
      using errcode = '55000';
  end if;

  -- Recheck after acquiring the order lock so simultaneous retries cannot debit twice.
  select * into v_existing from public.order_payments
   where shop_id = p_shop_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.order_id <> p_order_id or v_existing.amount <> p_amount
       or v_existing.payment_method <> p_payment_method then
      raise exception 'Idempotency key was already used for a different payment' using errcode = '23505';
    end if;
    return jsonb_build_object('payment_id', v_existing.id, 'order_id', p_order_id, 'replayed', true);
  end if;

  select coalesce(sum(amount), 0) into v_paid from public.order_payments
   where shop_id = p_shop_id and order_id = p_order_id;
  if p_amount > v_order.total_amount - v_paid then
    raise exception 'Payment exceeds the remaining order balance' using errcode = '22023';
  end if;
  if v_order.customer_id is null then
    raise exception 'A customer is required to settle an outstanding balance' using errcode = '22023';
  end if;

  update public.customers
     set outstanding_credit_balance = outstanding_credit_balance - p_amount
   where shop_id = p_shop_id and id = v_order.customer_id
     and outstanding_credit_balance >= p_amount;
  if not found then
    raise exception 'Customer credit balance is insufficient for this payment' using errcode = '23514';
  end if;

  insert into public.order_payments (shop_id, order_id, amount, payment_method, idempotency_key)
  values (p_shop_id, p_order_id, p_amount, p_payment_method, p_idempotency_key)
  on conflict (shop_id, idempotency_key) do nothing
  returning * into v_payment;
  if not found then
    raise exception 'Idempotency key was concurrently used' using errcode = '23505';
  end if;

  v_paid := v_paid + p_amount;
  update public.orders set payment_status =
    case when v_paid >= total_amount then 'paid'
         when v_paid > 0 then 'partially_paid'
         else 'unpaid' end
   where shop_id = p_shop_id and id = p_order_id;

  return jsonb_build_object('payment_id', v_payment.id, 'order_id', p_order_id, 'replayed', false);
end;
$$;

create function public.list_low_stock_products(p_shop_id uuid)
returns setof public.products
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.* from public.products p
   where p.shop_id = p_shop_id
     and p.stock_quantity <= p.low_stock_threshold
     and public.is_shop_member(p_shop_id)
   order by p.name;
$$;

revoke all on function public.create_order_atomic(uuid, uuid, jsonb, text, uuid) from public;
revoke all on function public.record_order_payment(uuid, uuid, numeric, text, uuid) from public;
revoke all on function public.list_low_stock_products(uuid) from public;
grant execute on function public.create_order_atomic(uuid, uuid, jsonb, text, uuid) to authenticated;
grant execute on function public.record_order_payment(uuid, uuid, numeric, text, uuid) to authenticated;
grant execute on function public.list_low_stock_products(uuid) to authenticated;
