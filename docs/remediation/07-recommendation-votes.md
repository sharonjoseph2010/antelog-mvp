# 07 — `recommendation_votes` — remove `USING (true)` SELECT

> Patch: [`SECURITY_REMEDIATION.md` §7](../SECURITY_REMEDIATION.md#7-recommendation_votes--remove-using-true-select)

## Why this matters

The SELECT policy is currently `USING (true)`, which means any authenticated user can read every row in `recommendation_votes`. That table presumably contains:

- `voter_id` — which user voted
- `recommendation_id` — which recommendation
- `vote` — up/down or value
- `created_at` — when

Reading the full table reveals **the voting graph**. Patterns visible to anyone:

- Who voted on what, when. A user's voting history is a behavioural fingerprint — preferences, opinions, possibly political/religious signals depending on what gets recommended.
- The "anonymity" of recommendations in a system that markets them as anonymous is broken. If `recommendations` are anonymous to readers but `recommendation_votes.voter_id` is public, you can correlate: A always votes on B's recommendations within seconds of B posting — A and B probably know each other.
- Vote-rigging detection becomes adversarial — bad actors can see exactly what votes have been cast and time their attacks accordingly.

`USING (true)` is the SQL equivalent of "this column is public." Treat it as such: it's only acceptable for genuinely public data (e.g., a global hit counter), never for per-user records.

## What might break

- **Vote count UIs.** If the SPA was doing `SELECT count(*) FROM recommendation_votes WHERE recommendation_id = X` from the browser, that query now returns either 1 (the caller's own vote) or 0. Aggregates must move to a server-side function (RPC).
- **Vote display UIs.** Any UI that shows "you voted up" or "X people voted" needs to be rewritten. The "you voted" check works because the caller can see their own vote; the "X people voted" aggregate needs an RPC.
- **Cached aggregate counters.** If you have a `recommendations.vote_count` column maintained by a trigger, that column is unaffected by the policy change. Aggregates can read it directly. Just make sure the trigger is correct (it usually is — that's the standard pattern).

## Gotchas

- **`recommendation_clusters` and `master_directory_votes`** may have similar permissive policies. Audit any table whose name ends in `_votes` for the same anti-pattern.
- **A SECURITY DEFINER aggregate function leaks data through its return shape.** If you write `recommendation_vote_count(p_id)` that returns just an integer, you're safe. If it returns the full row list, you've reproduced the leak.
- **Stable vs. immutable functions.** Mark the aggregate function `STABLE` (or `IMMUTABLE` if cacheable) so Postgres can plan around it.
- **Performance.** Reading the full table to count was already O(n) but un-indexed scans might have been hiding behind small data. After the policy change, the aggregate RPC needs an index on `(recommendation_id)` to stay fast.
- **Edge cases on "did the caller vote?"** With the new owner-only SELECT, `SELECT * FROM recommendation_votes WHERE recommendation_id = X` returns at most one row (the caller's). That's intentional. UI logic should not iterate; it should `maybeSingle()`.
- **Anonymous vote toggles.** If a user can flip their vote, the policy needs UPDATE/DELETE clauses that match `auth.uid() = voter_id` and `WITH CHECK (auth.uid() = voter_id)`. Forgetting either lets a user vote-as-someone-else by spoofing `voter_id`.

## Common pitfalls

### Pitfall: Moving the aggregate to a SECURITY DEFINER RPC and forgetting access control on the RPC.

`GRANT EXECUTE ON FUNCTION recommendation_vote_count(uuid) TO PUBLIC` gives everyone, including unauthenticated users, the ability to query vote counts for arbitrary recommendation IDs. That's almost certainly fine, but think about whether you want to gate this — e.g., only friends of the recommendation owner can see counts. If yes, the RPC must check the relationship before returning.

### Pitfall: Returning vote *direction* breakdown in the RPC.

`{ up: 5, down: 2 }` is fine. `{ up_voters: [...], down_voters: [...] }` reintroduces the original leak. Resist scope creep.

### Pitfall: Client caching showing wrong counts.

React Query / SWR will cache RPC results. When a user votes, manually invalidate the count cache, or accept stale counts for a refresh interval.

### Pitfall: Tests against `USING (true)` semantics.

Any test that asserted "user A can read user B's vote" was testing the *bug*. Update the tests to assert the new owner-only semantics; don't preserve the old behavior.

### Pitfall: Materialised views referencing the table.

If a materialised view reads `recommendation_votes` for analytics, it does so as the view owner. RLS does not apply to view owners in the standard case. That's fine for analytics — but make sure the view itself isn't readable by `anon` if it contains voter-level data.

### Pitfall: Forgetting to add an index for the aggregate.

```sql
CREATE INDEX IF NOT EXISTS recommendation_votes_recommendation_id_idx
  ON public.recommendation_votes (recommendation_id);
```

Without this, the count RPC table-scans every call. Easy to miss because the bug was hiding the slowness behind a permissive policy (the same scan was already happening).

## Product behavior changes

- Vote counts in the UI continue to display, but via an RPC call rather than a table read.
- A user no longer sees *which* other users voted on a recommendation — only how many.
- Analytics dashboards that did "who voted on what" queries via the SPA now require a backend job or a privileged role.

## Verification checklist

- [ ] As user A, `SELECT * FROM recommendation_votes WHERE recommendation_id = '<X>'` returns at most A's own row.
- [ ] `SELECT public.recommendation_vote_count('<X>')` returns the correct total.
- [ ] Voting and un-voting works for the caller; the caller cannot change another user's vote.
- [ ] The `recommendation_votes_recommendation_id_idx` index exists.
- [ ] No other `*_votes` table has a `USING (true)` SELECT policy.
