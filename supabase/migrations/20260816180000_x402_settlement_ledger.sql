-- Server-only x402 settlement ledger. Request bodies and customer source text are never stored here.
create table if not exists public.x402_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  method text,
  route text not null,
  phase text not null check (phase in ('before-handler', 'after-handler', 'cancel')),
  network text not null,
  scheme text not null,
  asset text not null,
  amount_atomic numeric(78, 0) not null check (amount_atomic >= 0),
  payer text,
  transaction_hash text,
  status text not null check (status in ('SETTLED'))
);

comment on table public.x402_events is
  'Server-only audit ledger for successful x402 settlements; contains no paid request payloads.';

create unique index if not exists x402_events_transaction_phase_unique
  on public.x402_events (transaction_hash, phase)
  where transaction_hash is not null;

create index if not exists x402_events_created_at_idx
  on public.x402_events (created_at desc);

create index if not exists x402_events_route_created_at_idx
  on public.x402_events (route, created_at desc);

alter table public.x402_events enable row level security;

revoke all on table public.x402_events from anon, authenticated;
grant select, insert on table public.x402_events to service_role;
