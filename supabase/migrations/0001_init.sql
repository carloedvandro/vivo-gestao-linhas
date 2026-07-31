-- ============================================================================
-- Vivo Gestão de Linhas — schema inicial
-- ============================================================================
-- Tabelas: profiles, lines, consumption_snapshots, thresholds, alerts,
--          push_subscriptions, scraping_runs
-- RLS: cliente vê só suas linhas; admin (is_admin=true) vê tudo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles: estende auth.users com papel (admin = vendedor, cliente = usuário)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  phone       text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Auto-cria profile no signup (inclui telefone do user_metadata)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'phone', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- lines: uma linha telefônica pertencente a um cliente (user_id)
-- ---------------------------------------------------------------------------
create type public.line_status as enum
  ('ativa', 'reduzida', 'bloqueada_fatura', 'bloqueada_pagamento', 'aguardando');

create table if not exists public.lines (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique,        -- ex: (31) 97115-7584
  user_id       uuid references public.profiles(id) on delete set null,
  plan          text not null default '',    -- ex: SmartVoz 50GB
  total_gb      numeric(10,2) not null default 0,  -- franquia contratada
  used_gb       numeric(10,2) not null default 0,  -- consumo atual (último scrape)
  status        public.line_status not null default 'ativa',
  cycle_closing_day  int not null default 1,   -- dia de fechamento do ciclo
  cycle_renewal_day  int not null default 2,   -- dia de renovação
  vivo_portal_url    text,                     -- link direto p/ bloqueio (semiautomático)
  vivo_line_id       text,                     -- id interno da linha no portal Vivo
  last_scraped_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists lines_user_id_idx on public.lines(user_id);

-- ---------------------------------------------------------------------------
-- consumption_snapshots: histórico de consumo (uma linha por scrape)
-- ---------------------------------------------------------------------------
create table if not exists public.consumption_snapshots (
  id          uuid primary key default gen_random_uuid(),
  line_id     uuid not null references public.lines(id) on delete cascade,
  used_gb     numeric(10,2) not null,
  total_gb    numeric(10,2) not null,
  status      public.line_status,
  scraped_at  timestamptz not null default now()
);

create index if not exists snapshots_line_id_idx on public.consumption_snapshots(line_id, scraped_at desc);

-- ---------------------------------------------------------------------------
-- thresholds: limiar de alerta por linha (ex: 128 de 130 GB => 98.46%)
-- ---------------------------------------------------------------------------
create table if not exists public.thresholds (
  id          uuid primary key default gen_random_uuid(),
  line_id     uuid not null references public.lines(id) on delete cascade,
  warn_pct    numeric(5,2) not null default 98.00,  -- % do total que dispara alerta
  warn_gb     numeric(10,2),                         -- OU valor absoluto (opcional)
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (line_id)
);

-- ---------------------------------------------------------------------------
-- alerts: registro de alertas disparados (evita re-disparar a cada scrape)
-- ---------------------------------------------------------------------------
create table if not exists public.alerts (
  id          uuid primary key default gen_random_uuid(),
  line_id     uuid not null references public.lines(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,
  kind        text not null default 'threshold',  -- threshold | status_change
  message     text not null,
  used_gb     numeric(10,2),
  total_gb    numeric(10,2),
  pct         numeric(5,2),
  notified    boolean not null default false,     -- push enviado?
  read        boolean not null default false,     -- lido no painel?
  created_at  timestamptz not null default now()
);

create index if not exists alerts_line_id_idx on public.alerts(line_id, created_at desc);
create index if not exists alerts_user_id_idx on public.alerts(user_id, read, created_at desc);

-- ---------------------------------------------------------------------------
-- push_subscriptions: inscrições web-push (VAPID) por usuário/dispositivo
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  endpoint      text not null,
  p256dh        text not null,
  auth_key      text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- ---------------------------------------------------------------------------
-- scraping_runs: log de execuções do scraper (debug/auditoria)
-- ---------------------------------------------------------------------------
create table if not exists public.scraping_runs (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running',  -- running | success | error
  lines_ok    int not null default 0,
  lines_err   int not null default 0,
  error       text
);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.profiles            enable row level security;
alter table public.lines               enable row level security;
alter table public.consumption_snapshots enable row level security;
alter table public.thresholds          enable row level security;
alter table public.alerts              enable row level security;
alter table public.push_subscriptions  enable row level security;
alter table public.scraping_runs       enable row level security;

-- helper: é admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- profiles: cada um vê/edita o seu; admin vê todos
create policy "profiles_select" on public.profiles
  for select using (auth.uid() = id or public.is_admin());
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- lines: cliente vê só as suas; admin vê todas
create policy "lines_select" on public.lines
  for select using (auth.uid() = user_id or public.is_admin());
create policy "lines_admin_all" on public.lines
  for all using (public.is_admin()) with check (public.is_admin());

-- snapshots: cliente vê dos seus; admin vê todos
create policy "snapshots_select" on public.consumption_snapshots
  for select using (
    exists (select 1 from public.lines l
            where l.id = consumption_snapshots.line_id
            and (l.user_id = auth.uid() or public.is_admin()))
  );

-- thresholds: cliente vê dos seus; admin edita
create policy "thresholds_select" on public.thresholds
  for select using (
    exists (select 1 from public.lines l
            where l.id = thresholds.line_id
            and (l.user_id = auth.uid() or public.is_admin()))
  );
create policy "thresholds_admin_all" on public.thresholds
  for all using (public.is_admin()) with check (public.is_admin());

-- alerts: cliente vê os seus; admin vê todos
create policy "alerts_select" on public.alerts
  for select using (auth.uid() = user_id or public.is_admin());
create policy "alerts_update_own_read" on public.alerts
  for update using (auth.uid() = user_id);

-- push_subscriptions: só dono
create policy "push_own" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- scraping_runs: só admin
create policy "scraping_runs_admin" on public.scraping_runs
  for select using (public.is_admin());

-- ===========================================================================
-- updated_at trigger para lines
-- ===========================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists lines_touch on public.lines;
create trigger lines_touch before update on public.lines
  for each row execute function public.touch_updated_at();
