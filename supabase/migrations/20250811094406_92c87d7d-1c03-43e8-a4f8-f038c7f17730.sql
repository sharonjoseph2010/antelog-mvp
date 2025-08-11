begin;

-- Colleges table
create table if not exists public.colleges (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  domain text not null unique,
  created_at timestamptz not null default now()
);

alter table public.colleges enable row level security;

-- Anyone can read colleges (public info)
create policy if not exists "Colleges are readable by everyone"
on public.colleges
for select
using (true);

-- Profiles table linked to auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  handle text not null unique,
  batch text,
  college_id uuid references public.colleges(id),
  is_verified boolean not null default false,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_profiles_handle_format check (handle ~ '^[a-z0-9_]{3,20}$')
);

alter table public.profiles enable row level security;

-- Normalize handle to lowercase automatically
create or replace function public.normalize_profile_handle()
returns trigger
language plpgsql
as $$
begin
  if new.handle is not null then
    new.handle := lower(new.handle);
  end if;
  return new;
end;
$$;

-- Ensure updated_at is maintained
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Triggers
drop trigger if exists trg_profiles_normalize_handle on public.profiles;
create trigger trg_profiles_normalize_handle
before insert or update on public.profiles
for each row execute function public.normalize_profile_handle();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.update_updated_at_column();

-- RLS policies for profiles (self-only access)
create policy if not exists "Users can view their own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy if not exists "Users can insert their own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy if not exists "Users can update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id);

create policy if not exists "Users can delete their own profile"
on public.profiles
for delete
to authenticated
using (auth.uid() = id);

-- Seed SRFTI entry
insert into public.colleges (name, domain)
values ('Satyajit Ray Film & Television Institute', 'srfti.ac.in')
on conflict (domain) do nothing;

commit;