# A3 — SECURITY DEFINER function audit

> Patch: [`SECURITY_REMEDIATION.md` §A3](../SECURITY_REMEDIATION.md#a3-security-definer-function-audit)

## Why this matters

`SECURITY DEFINER` functions run with the *owner's* privileges, not the caller's. In Supabase that owner is typically `postgres` — a near-superuser. The function bypasses RLS by design.

This is necessary for many legitimate operations: counting votes (caller can't read the table), checking admin role (caller can't read role rows), generating share tokens (caller needs to insert into a table they can't directly access). The pattern is fine — the danger is in the *body*. A poorly-written SECURITY DEFINER function is a privilege escalation primitive.

The review identified at least 10 SECURITY DEFINER functions in migrations:

- `20251119201711_*.sql` (returns JSON)
- `20251120045327_*.sql` (returns JSON)
- `20251204082753_*.sql` (trigger)
- `20250921191854_*.sql` (trigger)
- `20250917185651_*.sql` (trigger)
- `20251210101220_*.sql` (`update_recommendation_vote_count`)
- Multiple `20250814*` and `20250824*` trigger functions
- Several others surfaced during the migrations audit

The audit asks one question per function: *is there a way for a caller to abuse this function's elevated privileges?*

## Audit checklist per function

For each function, verify:

1. **Caller identity check.** Does the function call `auth.uid()` and verify the caller is who they claim to be? If the function takes a `p_user_id` parameter, does it check `p_user_id = auth.uid()`?
2. **Operation scope.** Does the function operate only on rows where the caller has a legitimate relationship (owns, is a friend of, is in the same group as, etc.)?
3. **Input validation.** Are parameters sanity-checked (length, type, format) before use? Especially relevant for functions that build dynamic SQL (`EXECUTE`).
4. **`search_path` set explicitly.** `SECURITY DEFINER` functions are vulnerable to `search_path` hijacking — a caller can prepend a schema with a malicious version of `auth.uid()`. Mitigation: `SET search_path = public, pg_temp` at function definition.
5. **`REVOKE FROM PUBLIC` + targeted `GRANT EXECUTE`.** By default new functions are executable by `PUBLIC`. If only authenticated users should call it, `GRANT EXECUTE ... TO authenticated` only.
6. **No dynamic SQL with user input.** `EXECUTE 'SELECT * FROM ' || table_name` with caller-controlled `table_name` is SQL injection. Use parameter binding (`USING`) and identifier quoting (`format(%I)`).
7. **Idempotency.** If the function can be called twice in quick succession (vote twice, accept friend request twice), does the second call do the wrong thing? Add idempotency keys or `ON CONFLICT` clauses.

## What might break

- **Functions that were trusted to "just work" but actually depend on `search_path` defaults.** Fixing the search_path may surface bugs where the function referenced `auth.users` without schema qualification and used to resolve via search order. Schema-qualify everything: `public.profiles`, `auth.users`, `pg_temp.tmp`.
- **Functions overly liberal on inputs.** Tightening validation may reject legitimate calls that happened to work. Test each function's call sites before tightening.
- **Functions calling other SECURITY DEFINER functions.** The chain inherits the outermost owner's privileges. Audit the chain, not just the leaf.

## Gotchas

- **`auth.uid()` inside SECURITY DEFINER returns the *caller's* user**, not the function owner's. This is the one thing PostgreSQL gets right: `current_user` switches, but `auth.uid()` reads the request JWT, which doesn't change. Verify by writing a test function that returns `auth.uid()` and calling it as different users.
- **Triggers as SECURITY DEFINER.** Triggers are usually SECURITY INVOKER (run as the calling user). If a trigger is SECURITY DEFINER, it gains powers the caller doesn't have. Sometimes necessary (e.g., to bypass RLS on a side-effect table); always intentional.
- **`SET ROLE` inside a function.** Some advanced functions use `SET ROLE` to switch identities mid-body. Verify this is intentional and the role chain ends back where it started.
- **`pg_dump` of SECURITY DEFINER functions includes the owner.** Restoring on a different database changes the owner to whoever runs the restore — usually fine, but worth knowing.
- **Granting EXECUTE to `anon`.** Some functions in this codebase do (`generate_share_token`, `can_reveal_identity`). For each:
  - Does it leak data on probe? (e.g., `can_reveal_identity(target_uuid)` returns true/false — that's an oracle: an attacker can iterate UUIDs to find existing users.)
  - Is it rate-limited?
- **Volatile vs stable vs immutable.** A `STABLE` function can be optimized by Postgres differently than `VOLATILE`. Don't mislabel. For functions with side effects (writes), `VOLATILE` is required.

## Common pitfalls

### Pitfall: Trusting the function name.

`generate_share_token()` might sound innocent. The audit question: who can call it, how often, and what does it write? If it inserts into `share_links`, an attacker with EXECUTE can flood the table.

### Pitfall: Function bodies that look safe but reference user-supplied identifiers.

```sql
CREATE FUNCTION update_user(p_user_id uuid, p_col text, p_val text) RETURNS void AS $$
BEGIN
  EXECUTE format('UPDATE profiles SET %I = %L WHERE id = %L', p_col, p_val, p_user_id);
END $$;
```

`format` with `%I` and `%L` is safe against most SQL injection, but the *column choice* itself is the attack: a caller passes `p_col = 'role'`, and now profile updates set arbitrary roles. Whitelist columns explicitly.

### Pitfall: SECURITY DEFINER without `search_path`.

```sql
CREATE FUNCTION sensitive() RETURNS void SECURITY DEFINER AS $$
BEGIN
  PERFORM auth.uid();
END $$;
```

If a malicious user creates a function `auth.uid()` in their own schema (assuming they have CREATE privilege there) and the function's search_path includes their schema first, they hijack `auth.uid()`. Fix with `SET search_path = public, pg_temp`.

### Pitfall: Functions returning sensitive columns by default.

`get_user_profile(p_user_id uuid)` that returns the full `profiles` row leaks phone numbers even if the policy on `profiles` would hide them. Return a struct of only the public-safe fields, or filter inside the function based on the caller's relationship to the target.

### Pitfall: Functions that "trust" the caller because they're inside a SECURITY DEFINER context.

```sql
CREATE FUNCTION add_to_group(p_group_id uuid, p_user_id uuid) RETURNS void SECURITY DEFINER AS $$
BEGIN
  INSERT INTO group_members (group_id, user_id) VALUES (p_group_id, p_user_id);
END $$;
```

Caller passes `p_user_id = someone-else`, and now they're added to the group. Add `IF p_user_id <> auth.uid() AND NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;`.

### Pitfall: Audit logs missing.

A SECURITY DEFINER function that mutates rows should write an audit log: who called it, what they passed, what changed. Without this, after a breach you can't tell which calls were legitimate.

### Pitfall: Forgetting that triggers can be SECURITY DEFINER too.

The audit list should include triggers, not just regular functions. Find them:

```sql
SELECT tgname, tgrelid::regclass AS table_name, proname AS function_name, prosecdef AS is_security_definer
FROM pg_trigger t JOIN pg_proc p ON t.tgfoid = p.oid
WHERE prosecdef = true;
```

### Pitfall: Functions chained across schemas.

`public.foo()` calls `private.bar()` which is SECURITY DEFINER on a third schema. The privilege chain is non-obvious; trace each call.

### Pitfall: Audit becomes a one-time event.

The list grows over time. Either repeat the audit quarterly, or — better — add a CI check that flags new `SECURITY DEFINER` in migrations and requires a security-reviewer ack.

## Product behavior changes

- Functions tightened in the audit may reject calls that previously succeeded. Test each call site.
- Some functions become slower if the audit adds per-call ownership checks. Usually negligible.

## Verification checklist

- [ ] Inventory of all SECURITY DEFINER functions exported (run the query above).
- [ ] Each function has documented: who can call, what it does, why it's SECURITY DEFINER.
- [ ] Each function sets `search_path` explicitly.
- [ ] Each function does `REVOKE ALL FROM PUBLIC` + targeted `GRANT EXECUTE`.
- [ ] Each function validates caller identity where applicable.
- [ ] No function uses `EXECUTE` with un-validated user input.
- [ ] Each mutating function writes an audit log.
