# 05 — `ai-normalize-entries` — verify ownership before mutating

> Patch: [`SECURITY_REMEDIATION.md` §5](../SECURITY_REMEDIATION.md#5-ai-normalize-entries--verify-ownership-before-mutating-master_directory_entries)

## Why this matters

This function consolidates near-duplicate entries in `master_directory_entries`. The decision of which entry "wins" is driven by user-supplied `display_content` plus an LLM call to Gemini. Any authenticated user can trigger consolidation today.

Two failure modes:

1. **Vandalism / data quality** — a user submits crafted `display_content` that causes the LLM to fold legitimate distinct entries into a single canonical one. Even without malice, two different users disagreeing about canonical form will fight over the same row.
2. **Prompt injection → controlled rewrite** — combined with [#12](./12-prompt-injection.md), an attacker who controls a list item's title can engineer the Gemini prompt to return an arbitrary canonical form. Now they're shaping the shared directory.

The directory is shared infrastructure. Mutations to it should not be a per-user privilege.

## Strongly preferred: admin-only

Unlike `rematch-contacts`, this function has no plausible per-user version. "Normalize *my* entries in the shared master directory" is incoherent — the master directory is, by definition, shared. The fix is admin-only.

Alternative: leave the function callable only by `pg_cron` (set `verify_jwt = false` and have no SPA call site) plus a one-off admin button in `AdminDeduplication.tsx` that calls it via a separate admin-only RPC.

## What might break

- **`AdminDeduplication.tsx` invokes `ai-normalize-entries`.** Confirm this is the only call site (grep for it). The admin gate fix in [#08](./08-admin-gate.md) needs to land first or simultaneously — otherwise the page exists but the function it calls 403s.
- **Any "auto-consolidate on insert" trigger.** If there's a trigger or hook that calls this function whenever a new `master_directory_entries` row is created, that path doesn't have a JWT — it'll fail the admin check. Convert to a `pg_cron` schedule, not a sync hook.
- **Gemini latency budget.** Consolidation calls Gemini per batch. Restricting to admin doesn't change the latency, but does change the *frequency*. The "1s delay between batches" rate limit becomes redundant if only admins run it; reduce or remove.
- **Idempotency of consolidation.** Running it twice should produce the same canonical form. If Gemini gives non-deterministic outputs (it can), consider caching the LLM decision keyed by input hash. Otherwise admins running consolidation twice will see drift.

## Gotchas

- **`master_directory_entries` may be referenced by foreign keys.** Consolidating row A into row B means anything that pointed at A must repoint at B. Verify all FK relationships:

  ```sql
  SELECT conname, confrelid::regclass AS references_table
  FROM pg_constraint
  WHERE confrelid = 'public.master_directory_entries'::regclass;
  ```

  Each referrer needs an UPDATE in the same transaction as the delete-of-A. Otherwise the FK either blocks the consolidation or, worse, you cascade-delete the referrer.
- **Service-role usage is unavoidable here.** Admin-only enforcement happens at the function entry; the actual writes still use the service-role key because consolidation crosses user boundaries. Make the entry check the only gate, and make the gate atomic (don't let an admin "session" persist past a single function call).
- **The LLM is not deterministic.** Even with temperature 0, Gemini's outputs can vary slightly across versions. Consolidation logic should normalise the *output* (lowercase, trim, strip punctuation) before using it as a key.
- **Soft delete vs hard delete.** If your consolidation deletes the duplicate row, that's destructive. Prefer a soft-merge pattern: keep both rows but mark the loser with `merged_into = <winner_id>` and have read queries follow the pointer. Easier to audit and reverse.
- **Audit trail.** Every consolidation should write a row to a `directory_merge_log` with `actor_id`, `winner_id`, `loser_id`, `reason`, `at`. Without this, you can't answer "who consolidated entry X and when?" when a user complains their entry vanished.

## Common pitfalls

### Pitfall: Gating with "is admin" client-side only.

Hiding the button on the Admin page does not stop a non-admin from calling the function directly via `supabase.functions.invoke`. The check must be inside the function, querying `user_roles` (see [#08](./08-admin-gate.md)).

### Pitfall: Trusting the LLM's claimed canonical form.

The function uses Gemini to *suggest* which form should win. If you also use the LLM to decide which IDs to merge, prompt injection can target *both* the form and the target. Keep the LLM's role minimal: it suggests text canonicalisation; humans (or a deterministic algorithm) pick which IDs to merge.

### Pitfall: Long-running merges and lock contention.

Consolidating a batch of 100 entries in a single transaction holds row locks for seconds. Other writes to `master_directory_entries` will block. Either batch into separate transactions or run during off-hours.

### Pitfall: Test data drift.

If a prod-data-restored staging environment has stale `master_directory_entries`, admins running consolidation in staging produces a different result than in prod. Snapshot the table before running, document the diff, and don't expect staging to converge.

### Pitfall: Concurrent admin operations.

Two admins running consolidation simultaneously can race. Add a Postgres advisory lock at function entry:

```sql
SELECT pg_try_advisory_lock(<some-int-key>);
```

Return 409 if the lock isn't acquired, so the second admin sees "another consolidation is in progress."

### Pitfall: The directory is read by `ai-smart-suggestions`.

That function does a wildcard search against `master_directory_entries` and returns matches. While consolidation runs, suggestions may show stale results or duplicate winners. Either pause suggestions during admin operations or use a versioned read (`SELECT … FROM master_directory_entries AS OF <ts>`), if your Postgres tier supports temporal queries.

## Product behavior changes

- The "AI normalize entries" admin button now works only for admins; non-admins see 403.
- The directory should drift toward more consistent canonical forms over time, but only when admins act. There's no longer organic consolidation as a side effect of user activity.

## Verification checklist

- [ ] Invoking the function with a non-admin JWT returns 403 with no DB writes.
- [ ] Invoking with an admin JWT executes consolidation, writes an audit row in `directory_merge_log` (or equivalent).
- [ ] Concurrent admin calls — one succeeds, the other returns 409.
- [ ] After a consolidation, no orphan FK references exist (`SELECT 1 FROM other_table WHERE master_directory_id NOT IN (SELECT id FROM master_directory_entries)` returns 0).
- [ ] `ai-smart-suggestions` continues to return sensible results after consolidation.
- [ ] LLM output is validated and rejected on parse failure rather than crashing the function.
