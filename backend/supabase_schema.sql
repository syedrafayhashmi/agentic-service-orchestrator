create table if not exists public.chat_sessions (
  id text primary key,
  user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.chat_messages (
  id bigserial primary key,
  session_id text not null references public.chat_sessions(id) on delete cascade,
  user_id text,
  user_message text not null,
  assistant_message text,
  raw_response jsonb not null default '{}'::jsonb,
  request_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.retell_call_events (
  id bigserial primary key,
  session_id text references public.chat_sessions(id) on delete cascade,
  call_id text,
  event_type text not null,
  event_summary text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.execution_events (
  id bigserial primary key,
  session_id text not null references public.chat_sessions(id) on delete cascade,
  user_id text,
  request_message text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_id_idx on public.chat_messages(session_id, created_at desc);
create index if not exists retell_call_events_session_id_idx on public.retell_call_events(session_id, created_at desc);
create index if not exists execution_events_session_id_idx on public.execution_events(session_id, created_at desc);

alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.retell_call_events enable row level security;
alter table public.execution_events enable row level security;

create policy "service role full access sessions"
on public.chat_sessions
for all
using (true)
with check (true);

create policy "service role full access messages"
on public.chat_messages
for all
using (true)
with check (true);

create policy "service role full access call events"
on public.retell_call_events
for all
using (true)
with check (true);

create policy "service role full access execution events"
on public.execution_events
for all
using (true)
with check (true);
