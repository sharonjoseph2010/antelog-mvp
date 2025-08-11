begin;

-- Fix linter: set a fixed search_path on functions
create or replace function public.normalize_profile_handle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.handle is not null then
    new.handle := lower(new.handle);
  end if;
  return new;
end;
$$;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

commit;