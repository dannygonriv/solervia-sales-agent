create schema if not exists ssa;
revoke all on schema ssa from public;
create table if not exists ssa.schema_migrations (name text primary key, created_at timestamptz not null default now());
create table ssa.users (id uuid primary key default gen_random_uuid(), email text not null unique, password_hash text not null, created_at timestamptz not null default now());
create table ssa.sessions (token_hash text primary key, user_id uuid not null references ssa.users(id) on delete cascade, expires_at timestamptz not null, created_at timestamptz not null default now());
create table ssa.rate_limits (key text primary key, count integer not null, resets_at timestamptz not null);
create table ssa.settings (id integer primary key check(id=1), data jsonb not null, updated_at timestamptz not null default now());
create table ssa.companies (
 id uuid primary key default gen_random_uuid(), name text not null, legal_name text, sector text, activity text, size text,
 address text, city text, state text, website text, linkedin text, source text not null, source_id text,
 consulted_at timestamptz not null default now(), fingerprint text not null unique, demo boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(source,source_id)
);
create table ssa.contacts (id uuid primary key default gen_random_uuid(), company_id uuid not null unique references ssa.companies(id), name text, email text, phone text, email_allowed boolean not null default false, call_allowed boolean not null default false, legal_basis text, evidence text, consent_at timestamptz, expires_at timestamptz, updated_at timestamptz not null default now());
create table ssa.products (id uuid primary key default gen_random_uuid(), name text not null, line text not null check(line in ('Products','Custom')), description text not null, price text, active boolean not null default true, created_at timestamptz not null default now());
create table ssa.scripts (id uuid primary key default gen_random_uuid(), product_id uuid references ssa.products(id), name text not null, audience text not null, opening text not null, value_proposition text not null, questions text not null, objections text not null, allowed_answers text not null, goal text not null, max_seconds integer not null check(max_seconds between 30 and 600), end_conditions text not null, updated_at timestamptz not null default now());
create table ssa.prospects (id uuid primary key default gen_random_uuid(), company_id uuid not null unique references ssa.companies(id), status text not null default 'Nuevo' check(status in ('Nuevo','Investigando','Pendiente de revisión','Aprobado para contacto','Contactado','Sin respuesta','Interesado','Reunión propuesta','Reunión confirmada','No interesado','Cliente','No contactar')), score integer check(score between 0 and 100), analysis jsonb, product_id uuid references ssa.products(id), notes text not null default '', next_action text, followup_at timestamptz, reviewed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table ssa.campaigns (id uuid primary key default gen_random_uuid(), name text not null, product_id uuid not null references ssa.products(id), script_id uuid references ssa.scripts(id), channel text not null check(channel in ('email','call')), status text not null default 'draft' check(status in ('draft','running','paused','cancelled','completed')), max_contacts integer not null check(max_contacts between 1 and 500), budget numeric not null check(budget>0), starts_at timestamptz not null, start_hour integer not null check(start_hour between 0 and 23), end_hour integer not null check(end_hour between 1 and 24), demo boolean not null, approved_at timestamptz, created_at timestamptz not null default now(), check(start_hour<end_hour));
create table ssa.campaign_prospects (campaign_id uuid references ssa.campaigns(id), prospect_id uuid references ssa.prospects(id), primary key(campaign_id,prospect_id));
create table ssa.emails (id uuid primary key default gen_random_uuid(), prospect_id uuid not null references ssa.prospects(id), campaign_id uuid references ssa.campaigns(id), subject text not null, body text not null, status text not null default 'draft', approved_at timestamptz, provider_id text unique, reply text, cost numeric not null default 0, demo boolean not null, created_at timestamptz not null default now(), sent_at timestamptz);
create unique index email_campaign_prospect on ssa.emails(campaign_id,prospect_id) where campaign_id is not null;
create table ssa.calls (id uuid primary key default gen_random_uuid(), prospect_id uuid not null references ssa.prospects(id), campaign_id uuid references ssa.campaigns(id), provider_id text unique, status text not null, duration_seconds integer, transcript text, summary text, interest text, objections text, next_action text, cost numeric not null default 0, demo boolean not null, created_at timestamptz not null default now());
create table ssa.meetings (id uuid primary key default gen_random_uuid(), prospect_id uuid not null references ssa.prospects(id), product_id uuid references ssa.products(id), starts_at timestamptz not null, ends_at timestamptz not null, summary text, status text not null default 'proposed', provider_id text unique, demo boolean not null, created_at timestamptz not null default now(), check(ends_at>starts_at));
create table ssa.activities (id uuid primary key default gen_random_uuid(), prospect_id uuid references ssa.prospects(id), kind text not null, description text not null, demo boolean not null, created_at timestamptz not null default now());
create table ssa.audit_logs (id uuid primary key default gen_random_uuid(), action text not null, entity_id text, detail jsonb not null default '{}', created_at timestamptz not null default now());
create table ssa.consent_history (id uuid primary key default gen_random_uuid(), contact_id uuid references ssa.contacts(id), snapshot jsonb not null, created_at timestamptz not null default now());
create table ssa.suppression_list (id uuid primary key default gen_random_uuid(), value text not null unique, reason text not null, created_at timestamptz not null default now());
create table ssa.integrations (provider text primary key, encrypted_token text, updated_at timestamptz not null default now());
create table ssa.notifications (id uuid primary key default gen_random_uuid(), kind text not null, message text not null, prospect_id uuid references ssa.prospects(id), status text not null default 'queued', demo boolean not null, created_at timestamptz not null default now());
create table ssa.automation_jobs (id uuid primary key default gen_random_uuid(), kind text not null, payload jsonb not null, unique_key text not null unique, status text not null default 'queued' check(status in ('queued','running','done','failed','uncertain','cancelled')), run_at timestamptz not null default now(), locked_at timestamptz, attempts integer not null default 0, error text, demo boolean not null, created_at timestamptz not null default now());
create table ssa.operations (id uuid primary key default gen_random_uuid(), unique_key text not null unique, prospect_id uuid references ssa.prospects(id), campaign_id uuid references ssa.campaigns(id), channel text not null, destination text, status text not null, reserved_cost numeric not null check(reserved_cost>=0), actual_cost numeric, provider_id text, demo boolean not null, created_at timestamptz not null default now());
create table ssa.webhook_events (event_key text primary key, provider text not null, created_at timestamptz not null default now());
create table ssa.scheduled_searches (id uuid primary key default gen_random_uuid(), name text not null, filters jsonb not null, interval_hours integer not null check(interval_hours between 1 and 720), next_run timestamptz not null default now(), active boolean not null default true, demo boolean not null, created_at timestamptz not null default now());
create index jobs_due on ssa.automation_jobs(status,run_at);
create index operations_budget on ssa.operations(demo,created_at,campaign_id);
create index operations_destination on ssa.operations(destination,created_at);
create index prospects_status on ssa.prospects(status,score desc);
create index activities_prospect on ssa.activities(prospect_id,created_at desc);
create index calls_prospect on ssa.calls(prospect_id,created_at desc);
create index emails_prospect on ssa.emails(prospect_id,created_at desc);
create index meetings_dates on ssa.meetings(starts_at,ends_at);
create index contacts_email on ssa.contacts(email);
create index contacts_phone on ssa.contacts(phone);
-- Private schema, server-only SQL. No Data API access or browser grants.
-- The server DB role owns these tables. No policies grant anon/authenticated access.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='ssa' loop
 execute format('alter table ssa.%I enable row level security',t.tablename);
 execute format('revoke all on ssa.%I from public',t.tablename);
 end loop;
end $$;
