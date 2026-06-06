# 01 — Re-enable Row-Level Security on all 23 tables

> Patch: [`SECURITY_REMEDIATION.md` §1](../SECURITY_REMEDIATION.md#1-re-enable-rls-on-all-23-tables)

## Why this matters

RLS is the *only* layer between the SPA's hard-coded anon JWT and the entire database. The anon key (`src/integrations/supabase/client.ts:6-7`) is shipped to every browser; it is not a secret. The deal with PostgREST / Supabase is: "anyone can talk to your DB, but RLS decides what they see." When RLS is off, the deal collapses.

Concretely, with RLS off today:

- A logged-in user can `update user_roles set role = 'admin' where user_id = me` and escalate immediately.
- A logged-in user can `select * from contact_imports` and exfiltrate every user's phone book.
- A logged-in user can `delete from requests` and nuke the app.

None of these require finding a bug. They are first-class Supabase API calls that any browser can issue with the JWT already in `localStorage`.

This is the single highest-leverage fix. Everything else in this directory is sandcastle work until RLS is on.

## What might break

Re-enabling RLS will surface every place the app was unknowingly relying on it being off. Expect:

- **Empty result sets on pages that used to load.** A `select` that previously returned rows now returns `[]` because no policy matches. Most often the user is reading a record they don't own (a request, a list, a profile).
- **Inserts failing with PGRST116 / `new row violates row-level security policy`.** This is almost always a missing `WITH CHECK` predicate or a write where `auth.uid()` doesn't match the row's `owner_id`/`creator_id` column.
- **Realtime subscriptions going silent.** Realtime respects RLS; if the policy doesn't cover the row, the client never gets the event.
- **Edge functions that were doing user-side reads via the anon key.** They will now need either to switch to a JWT-scoped client or to escalate to the service role (with caller verification first — see §3, §4, §5).
- **SECURITY DEFINER functions that internally call `auth.uid()`**. These functions inherit the *function owner's* identity, not the caller's. If any policy or function logic was relying on `auth.uid()` returning the caller, double-check; SECURITY DEFINER usually returns the owner. (See [A3](./A3-security-definer-audit.md).)

## Gotchas

- **Policy order on `requests`.** The pre-disable policy for SELECT is friendship-graph-aware (`friends OR extended_network OR specific_group members`). Re-applying it verbatim works only if the helper functions it depends on (`is_friend_of`, `is_in_extended_network`, etc.) still exist and still have correct bodies. Read each function before trusting the policy.
- **`USING` vs `WITH CHECK`.** `USING` filters rows the user can *see* on SELECT/UPDATE/DELETE; `WITH CHECK` validates rows on INSERT/UPDATE. Forgetting `WITH CHECK` on UPDATE lets a user mutate a row they own *into* a row pointing at someone else. Always specify both for write policies.
- **`FOR ALL` is a trap.** A policy with `FOR ALL` applies USING to SELECT/UPDATE/DELETE and WITH CHECK to INSERT/UPDATE. If you only meant "owner can read," `FOR ALL USING (auth.uid() = owner_id)` silently allows owners to INSERT new rows with arbitrary other-column values. Split into `FOR SELECT`, `FOR INSERT WITH CHECK`, `FOR UPDATE USING ... WITH CHECK`, `FOR DELETE USING`.
- **`anon` vs `authenticated`.** Policies default to `TO public`, which includes the anonymous role. Specify `TO authenticated` on anything that should require a logged-in user, otherwise leaked share-links could still hit your tables.
- **The service role bypasses RLS.** That is by design and it's why §3, §4, §5 matter so much — edge functions running as service role can read/write anything, so they must enforce their own ownership checks before mutating.
- **Migrations are append-only.** Once the disable migration is in version control, you cannot edit it; you must add a *new* migration that re-enables. A common pitfall is editing `20251126112541_*.sql` in place — this will desync against any environment that has already applied it.
- **`pg_dump` of a staging snapshot will carry the RLS-off state forward.** If you restore from staging into prod, the restore overwrites the catalog and re-disables RLS. Apply the re-enable migration after every restore, or use schema-only dumps.

## Common pitfalls

### Pitfall: "I'll just turn it on and see what fails."

You can, but only on staging. On prod this strategy means user-visible outages until each failure is fixed. Mitigation: apply on a staging Supabase project first, run the full app smoke-suite (login, create request, respond, view lists, accept friend, admin actions), capture every `PGRST` error, and fix all of them *before* the prod migration.

### Pitfall: Policies referencing `auth.email()` or `auth.role()` without `auth.uid()`.

Some legacy policies in this codebase may exist; verify they still do what they claim. A policy like `USING (auth.email() = 'admin@example.com')` is the same anti-pattern as the hard-coded admin string in `App.tsx` — fix both together (see [#08](./08-admin-gate.md)).

### Pitfall: Forgetting tables created *after* the disable migration.

The review noted `recommendation_votes`, `share_links`, `guest_contributions`, `recommendation_clusters`, and a few others have RLS already enabled but with either no policies or unsafe ones. Don't conflate "enable RLS" with "has correct policies." Audit every table in `pg_tables` for both `rowsecurity = true` AND at least one policy.

### Pitfall: `lists.visibility = 'public'` semantics.

Pre-disable, public lists were viewable by everyone. After re-enable, the SELECT policy needs `OR visibility = 'public'`. If you only restore `auth.uid() = owner_id`, you'll silently break the public discovery feature.

### Pitfall: `EXISTS (SELECT … FROM other_table …)` policies and infinite recursion.

A policy on `request_responses` that does `EXISTS (SELECT 1 FROM requests WHERE …)` triggers RLS on `requests` recursively. Postgres handles this, but the predicate has to be satisfiable in the *current* user's view of `requests`. Test both the owner and a non-owner caller.

### Pitfall: Realtime triggers firing for users who can't see the row.

If you have `supabase.channel(...).on('postgres_changes', ...)` subscriptions, after RLS is back on some subscribers will silently stop receiving events. Add explicit error handling in the subscription to log when no rows match.

## Rollback

The re-enable migration is the inverse of `20251126112541_*.sql`. To roll back in an emergency:

```sql
BEGIN;
ALTER TABLE public.<offending_table> DISABLE ROW LEVEL SECURITY;
COMMIT;
```

…for the *specific* table that broke, not globally. If the whole app breaks, that's a sign you're missing the canonical policies, not that RLS itself is wrong; restore policies rather than re-disabling.

## Verification checklist

- [ ] `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'` → all 23 tables show `t`.
- [ ] As user A, `select * from contact_imports where user_id != '<A>'` returns 0 rows.
- [ ] As user A, `update user_roles set role='admin' where user_id='<A>'` fails (`new row violates row-level security policy`).
- [ ] The full smoke-test (login → create list → publish → respond → admin view) passes for both an owner and a non-owner caller, with the non-owner correctly seeing only what they're entitled to.
- [ ] Realtime subscriptions for at least one cross-user flow (notifications) still deliver events.
