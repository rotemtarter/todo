-- Shared task list (ARCHITECTURE 2.3). Written to be safely re-runnable.
-- Requires the app_backend role to exist first (ADR-2):
--   create user app_backend with password '...';

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title varchar(100) null,
  description varchar(2000) null,
  due_date date null,
  completed boolean not null default false,
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_position_non_negative check (position >= 0),
  -- At least one of title/description must contain a non-whitespace character.
  constraint tasks_title_or_description check (
    coalesce(title, '') ~ '\S' or coalesce(description, '') ~ '\S'
  )
);

create index if not exists tasks_position_id_idx on public.tasks (position, id);

-- Block public Data API roles; only the dedicated backend role can access the table (ADR-2).
alter table public.tasks enable row level security;
revoke all on table public.tasks from anon, authenticated;

grant usage on schema public to app_backend;
grant select, insert, update, delete on table public.tasks to app_backend;

drop policy if exists tasks_app_backend_all on public.tasks;
create policy tasks_app_backend_all on public.tasks
  for all to app_backend
  using (true)
  with check (true);
