# Schema Baseline & Migration Drift

**TL;DR:** `supabase/schema_baseline.sql` is an authoritative snapshot of the
**live production schema** (taken 2026-06-06, after the security remediation).
It exists because the incremental migration history can't rebuild the database
on its own. Use it to stand up a fresh DB or for disaster recovery.

## The problem this addresses

The intended model is "git is the source of truth — replay `supabase/migrations/`
on an empty DB to recreate prod." For this repo that's broken two ways:

1. **Drift.** Prod's database has **~194 migrations recorded**; the repo had
   **~126 files** (latest in repo `2026-05-19`, latest on prod `2026-06-01`).
   ~68 schema changes that are live on prod were never written back to git —
   Lovable applies changes straight to the prod DB. So git described a schema
   ~2 weeks behind reality.
2. **Non-replayable history.** The older migration files contain SQL Postgres
   rejects on a clean run (`CREATE POLICY IF NOT EXISTS`, plus the same
   policies/triggers created in multiple files). Replaying them top-to-bottom
   on an empty database fails partway.

Combined: **you could not rebuild this database from git.** That's a
disaster-recovery and new-environment risk. (We hit it directly: standing up
the preprod test env required cloning prod's live schema, not replaying
migrations.)

## What this baseline gives you

`supabase/schema_baseline.sql` is a `pg_dump --schema-only --schema=public
--no-owner` of current prod. It **does** replay cleanly. Git now contains an
accurate description of the production schema (incl. the security remediation:
RLS enabled, the corrected `recommendation_votes`/`guest_contributions`
policies, and the `get_request_for_guest` / rate-limit functions).

### Rebuild a fresh database from it
```bash
# in a new/empty Supabase project
psql "<connection-string>" -v ON_ERROR_STOP=1 -f supabase/schema_baseline.sql
# then apply any migrations dated AFTER 2026-06-06, if any
```
It lives **outside** `supabase/migrations/` deliberately, so it is **not**
auto-applied as a migration by `supabase db push` / Lovable.

## What is intentionally NOT done here (and why)

This branch is the **low-risk half**: an additive snapshot. It does **not**:
- delete or rewrite the historical migration files, or
- modify the `supabase_migrations.schema_migrations` tracking table.

That keeps it from conflicting with **Lovable**, which manages migrations
itself. A full **squash** (replace the ~126 messy files with one clean baseline
migration + repair the tracking table) is the complete fix, but it must be
coordinated with how Lovable tracks migrations so it doesn't re-introduce drift.
Treat that as a separate, deliberate task.

## Maintenance

Regenerate the baseline whenever prod schema changes meaningfully:
```bash
pg_dump -h db.<project-ref>.supabase.co -U postgres -d postgres \
  --schema-only --schema=public --no-owner -f supabase/schema_baseline.sql
```
(Use a PG17 client — prod runs Postgres 17.)
