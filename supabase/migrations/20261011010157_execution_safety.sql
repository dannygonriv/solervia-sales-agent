alter table ssa.meetings add column if not exists confirmation_started_at timestamptz;
create index if not exists sessions_expiry on ssa.sessions(expires_at);
create index if not exists consent_contact_history on ssa.consent_history(contact_id,created_at desc);
