-- Allow discovering registered store names without requiring email login.
-- Membership still controls access to each shop's customers, products, and orders.
grant select (id, name) on public.shops to anon, authenticated;

drop policy if exists shops_directory_select_authenticated on public.shops;
drop policy if exists shops_directory_select_anon on public.shops;

create policy shops_directory_select_anon
  on public.shops for select to anon, authenticated
  using (true);
