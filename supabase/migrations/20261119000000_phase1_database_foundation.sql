-- Phase 1: multi-tenant shop, ordering, credit, and inventory foundation.
-- Intended for a fresh Supabase project. All timestamps are stored as timestamptz.

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shop_members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  unique (shop_id, user_id)
);
create index shop_members_user_id_idx on public.shop_members(user_id);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  phone_number text not null check (length(btrim(phone_number)) > 0),
  outstanding_credit_balance numeric(12,2) not null default 0 check (outstanding_credit_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id),
  unique (shop_id, phone_number)
);
create index customers_shop_name_idx on public.customers(shop_id, name);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  price numeric(12,2) not null check (price >= 0),
  stock_quantity numeric(12,3) not null default 0 check (stock_quantity >= 0),
  unit text not null check (length(btrim(unit)) > 0),
  low_stock_threshold numeric(12,3) not null default 0 check (low_stock_threshold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id),
  unique (shop_id, name)
);
create index products_shop_low_stock_idx on public.products(shop_id, stock_quantity)
  where stock_quantity <= low_stock_threshold;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid,
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partially_paid', 'paid', 'refunded')),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id),
  constraint orders_customer_same_shop_fk foreign key (shop_id, customer_id)
    references public.customers(shop_id, id) on delete restrict
);
create index orders_shop_created_at_idx on public.orders(shop_id, created_at desc);
create index orders_shop_customer_idx on public.orders(shop_id, customer_id);
create index orders_shop_status_idx on public.orders(shop_id, status);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_id uuid not null,
  product_id uuid,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  subtotal numeric(15,2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now(),
  constraint order_items_order_same_shop_fk foreign key (shop_id, order_id)
    references public.orders(shop_id, id) on delete cascade,
  constraint order_items_product_same_shop_fk foreign key (shop_id, product_id)
    references public.products(shop_id, id) on delete restrict
);
create index order_items_shop_order_idx on public.order_items(shop_id, order_id);
create index order_items_shop_product_idx on public.order_items(shop_id, product_id);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_id uuid not null,
  status text not null
    check (status in ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  constraint order_status_history_order_same_shop_fk foreign key (shop_id, order_id)
    references public.orders(shop_id, id) on delete cascade
);
create index order_status_history_order_time_idx on public.order_status_history(shop_id, order_id, changed_at desc);

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null,
  transaction_type text not null check (transaction_type in ('addition', 'deduction', 'adjustment')),
  quantity_delta numeric(12,3) not null check (quantity_delta <> 0),
  reason text,
  reference_order_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint inventory_quantity_direction_ck check (
    (transaction_type = 'addition' and quantity_delta > 0) or
    (transaction_type = 'deduction' and quantity_delta < 0) or
    transaction_type = 'adjustment'
  ),
  constraint inventory_product_same_shop_fk foreign key (shop_id, product_id)
    references public.products(shop_id, id) on delete restrict,
  constraint inventory_order_same_shop_fk foreign key (shop_id, reference_order_id)
    references public.orders(shop_id, id) on delete set null (reference_order_id)
);
create index inventory_transactions_product_time_idx on public.inventory_transactions(shop_id, product_id, created_at desc);

-- Shared updated_at trigger.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger shops_set_updated_at before update on public.shops
  for each row execute function public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- These SECURITY DEFINER helpers query shop_members without triggering RLS recursion.
create function public.is_shop_member(target_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.shop_members sm
    where sm.shop_id = target_shop_id and sm.user_id = auth.uid()
  );
$$;

create function public.is_shop_admin(target_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.shop_members sm
    where sm.shop_id = target_shop_id and sm.user_id = auth.uid()
      and sm.role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_shop_member(uuid) from public;
revoke all on function public.is_shop_admin(uuid) from public;
grant execute on function public.is_shop_member(uuid), public.is_shop_admin(uuid) to authenticated;

-- Automatically enroll the creator of a shop as its owner. SECURITY DEFINER is
-- limited to this trusted insertion path and uses a fixed search_path.
create function public.add_shop_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.shop_members (shop_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;
create trigger shops_add_creator_as_owner after insert on public.shops
  for each row execute function public.add_shop_creator_as_owner();

-- Record each initial or changed order status. History is append-only to clients.
create function public.record_order_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_history(shop_id, order_id, status, changed_by)
    values (new.shop_id, new.id, new.status, auth.uid());
  end if;
  return new;
end;
$$;
create trigger orders_record_initial_status after insert on public.orders
  for each row execute function public.record_order_status();
create trigger orders_record_status_change after update of status on public.orders
  for each row execute function public.record_order_status();

-- The stock balance can only change as a consequence of an immutable ledger entry.
create function public.apply_inventory_transaction()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.products
     set stock_quantity = stock_quantity + new.quantity_delta
   where shop_id = new.shop_id
     and id = new.product_id
     and stock_quantity + new.quantity_delta >= 0;
  if not found then
    raise exception 'Inventory transaction would make stock negative or product does not exist'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger inventory_transactions_apply_stock after insert on public.inventory_transactions
  for each row execute function public.apply_inventory_transaction();

-- The authenticated actor comes from the JWT context, never from caller input.
create function public.set_inventory_transaction_actor()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;
create trigger inventory_transactions_set_actor before insert on public.inventory_transactions
  for each row execute function public.set_inventory_transaction_actor();

create function public.reject_ledger_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '55000';
end;
$$;
create trigger inventory_transactions_append_only before update or delete on public.inventory_transactions
  for each row execute function public.reject_ledger_mutation();
create trigger order_status_history_append_only before update or delete on public.order_status_history
  for each row execute function public.reject_ledger_mutation();
create trigger inventory_transactions_no_truncate before truncate on public.inventory_transactions
  for each statement execute function public.reject_ledger_mutation();
create trigger order_status_history_no_truncate before truncate on public.order_status_history
  for each statement execute function public.reject_ledger_mutation();

alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.inventory_transactions enable row level security;

create policy shops_select_member on public.shops for select to authenticated
  using (public.is_shop_member(id));
create policy shops_insert_creator on public.shops for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy shops_update_admin on public.shops for update to authenticated
  using (public.is_shop_admin(id)) with check (public.is_shop_admin(id));

create policy shop_members_select_member on public.shop_members for select to authenticated
  using (public.is_shop_member(shop_id));

create policy customers_member_access on public.customers for all to authenticated
  using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));
create policy products_member_access on public.products for all to authenticated
  using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));
create policy orders_member_access on public.orders for all to authenticated
  using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));
create policy order_items_member_access on public.order_items for all to authenticated
  using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));
create policy order_status_history_member_select on public.order_status_history for select to authenticated
  using (public.is_shop_member(shop_id));
create policy inventory_transactions_member_select on public.inventory_transactions for select to authenticated
  using (public.is_shop_member(shop_id));
create policy inventory_transactions_member_insert on public.inventory_transactions for insert to authenticated
  with check (public.is_shop_member(shop_id));

-- No browser role can mutate membership. Membership provisioning/invitations are
-- intentionally left to a future trusted backend/service-role flow.
-- Revoke first because grants are additive and Supabase projects can configure
-- default privileges for anon/authenticated on public tables.
revoke all privileges on table
  public.shops,
  public.shop_members,
  public.customers,
  public.products,
  public.orders,
  public.order_items,
  public.order_status_history,
  public.inventory_transactions
from anon, authenticated, public;

grant select, insert, update on public.shops to authenticated;
grant select on public.shop_members to authenticated;
grant select, insert, update, delete on public.customers, public.order_items to authenticated;
-- Column grants keep stock_quantity ledger-controlled (inserts use its zero default).
grant select, delete on public.products to authenticated;
grant insert (shop_id, name, price, unit, low_stock_threshold) on public.products to authenticated;
grant update (name, price, unit, low_stock_threshold) on public.products to authenticated;
grant select, insert, update on public.orders to authenticated;
grant select, insert on public.inventory_transactions to authenticated;
grant select on public.order_status_history to authenticated;
