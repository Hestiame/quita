-- ============================================================
--  Quita — schema do Supabase
--  Rode no Supabase → SQL Editor → New query → Run
-- ============================================================

create table if not exists customers (
  id            uuid primary key default gen_random_uuid(),
  name          text,
  email         text,
  username      text unique,
  password      text,           -- exibida ao cliente 1x e no painel admin (ver nota de segurança no README)
  recovery_code text,
  status        text default 'active',   -- active | refunded | pending
  amount        numeric,
  txid          text,
  created_at    timestamptz default now(),
  last_access   timestamptz
);

create table if not exists orders (
  id                 uuid primary key default gen_random_uuid(),
  external_reference text unique,
  claim_token        text,        -- token aleatório devolvido ao navegador p/ resgatar credenciais
  charge_id          text,        -- id da cobrança na GoatPay
  name               text,
  email              text,
  amount             numeric,
  status             text default 'pending',  -- pending | paid
  customer_id        uuid references customers(id),
  created_at         timestamptz default now(),
  paid_at            timestamptz
);
create index if not exists orders_charge_id_idx on orders(charge_id);

create table if not exists tickets (
  id          uuid primary key default gen_random_uuid(),
  protocol    text,
  name        text,
  email       text,
  topic       text,
  message     text,
  proof       jsonb,             -- { name, data(base64) } ou null
  status      text default 'open',   -- open | answered | closed
  reply       text,
  reply_seen  boolean default false,
  created_at  timestamptz default now(),
  replied_at  timestamptz
);
create index if not exists tickets_email_idx on tickets(email);

create table if not exists webhook_deliveries (
  id         text primary key,   -- id da entrega do webhook (idempotência)
  created_at timestamptz default now()
);

-- Mantenha o RLS LIGADO. O backend usa a SERVICE ROLE key, que ignora o RLS.
-- O navegador NUNCA acessa estas tabelas diretamente, então não criamos policies públicas.
alter table customers          enable row level security;
alter table orders             enable row level security;
alter table tickets            enable row level security;
alter table webhook_deliveries enable row level security;
