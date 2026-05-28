# 06 — `guest_contributions` — explicit policies + RPC

> Patch: [`SECURITY_REMEDIATION.md` §6](../SECURITY_REMEDIATION.md#6-guest_contributions--explicit-policies-drop-unsafe-grants)

## Why this matters

Migration `20260304084514_*.sql` runs:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_contributions TO authenticated;
GRANT SELECT ON public.guest_contributions TO anon;
```

The table has RLS enabled but **no policies defined**. With RLS enabled and no policies, the default behavior in Postgres is to deny — but only for queries *evaluated against RLS*. The explicit GRANT at the table level is dangerous for two reasons:

1. **If anyone ever adds a permissive policy** (e.g., a developer thinks "guests need to write so let's `USING (true)`"), the GRANT immediately turns into full table access for `anon`. The two layers compound; either one being loose is catastrophic.
2. **GRANT is what `psql` and direct DB clients see**, not RLS. Anyone with a database connection (a leaked dev DB URL, a backup file, a misconfigured pooler) gets the full table.

Guest contributions are the most sensitive write path in the product: an *unauthenticated* visitor submits data via a share link, and the system has to trust the share link as the only credential. The right model is "share token gates a single SECURITY DEFINER RPC; the table itself is locked down."

## What might break

- **`GuestResponse.tsx` currently inserts into `guest_contributions` directly via the Supabase client.** After this change, direct inserts fail. The page must switch to `supabase.rpc('submit_guest_contribution', ...)`.
- **Any admin tooling that reads `guest_contributions` directly via `anon` role.** Unlikely, but check.
- **Existing share links keep working** — the RPC validates them server-side. There's no breaking change to the token format.

## Gotchas

- **`REVOKE` order matters.** Revoke from `authenticated` and `anon` *before* defining the RPC, otherwise there's a window where direct writes still work. Better: do everything in one migration transaction.
- **`REVOKE ALL` removes future grants you might want.** If admin tools need SELECT on this table, grant it back explicitly to a service role or via an admin-only RPC.
- **The SECURITY DEFINER RPC runs as the function owner.** That owner must have the underlying table privileges. Usually the function owner is `postgres` (the migration-runner), which has implicit superuser-ish access. Don't change function ownership without re-granting.
- **`SECURITY DEFINER` bypasses RLS.** The whole point of the RPC is to perform a write the caller can't perform directly. This is fine, but it means the *function body* is now the security boundary. Review it like you'd review a privileged operation: input validation, length caps, audit log.
- **Token validation must check expiry AND capacity.** A share link with `expires_at < now()` is dead; a share link with a `max_contributions` cap that's been hit should also reject. Both checks belong in the RPC, not the client.
- **CORS and `anon` calls.** Anonymous RPC calls must include the project's anon JWT (Supabase requires *some* auth context). The supabase-js client handles this automatically, but if you're testing with curl you need the `apikey:` header.

## Common pitfalls

### Pitfall: Granting EXECUTE on the RPC to PUBLIC.

`GRANT EXECUTE ... TO PUBLIC` includes the `pg_monitor` role and other internal roles. Be explicit: `GRANT EXECUTE ... TO anon, authenticated`.

### Pitfall: Returning sensitive data from the RPC.

The RPC takes a token, validates it, inserts, returns the new ID. *Don't* also return the link's `owner_id` or anything about the share — that's information the guest doesn't need. Return only what the UI uses for confirmation.

### Pitfall: Validating tokens with a SELECT and a separate INSERT (race condition).

```sql
-- BAD
SELECT * FROM share_links WHERE token = p_token AND expires_at > now();  -- check
INSERT INTO guest_contributions ...;                                       -- use
```

Between the SELECT and the INSERT, another caller can exhaust the link's quota. Wrap in a single statement using a CTE or row-level locks:

```sql
WITH valid_link AS (
  SELECT id, owner_id FROM share_links
  WHERE token = p_token AND (expires_at IS NULL OR expires_at > now())
  FOR UPDATE
)
INSERT INTO guest_contributions (share_link_id, owner_id, ...)
SELECT id, owner_id, ... FROM valid_link
RETURNING id;
```

### Pitfall: Forgetting to rate-limit guest submissions.

The whole point of share links is to invite untrusted contributors. The RPC must rate-limit per-token (e.g., 5 submissions per token per hour) and per-IP if you have access to the IP. See [#10](./10-rate-limiting.md).

### Pitfall: Logging the contributor's contact info.

If the RPC writes to a log table on every call, you're collecting PII from non-users who never consented. Log only `share_link_id`, `submitted_at`, and `client_fingerprint_hash`; don't log raw name/contact.

### Pitfall: Soft-deleting share links instead of disabling them.

Setting `expires_at = now()` immediately is fine. Deleting the row leaves orphan `guest_contributions` rows pointing at nothing. Always soft-disable.

### Pitfall: Tokens predictable or short.

The RPC's safety rests entirely on token unguessability. Verify `generate_share_token()` uses `gen_random_bytes()` or `uuid_generate_v4()`, not a sequence. Minimum 128 bits of entropy (32 hex chars). If anything looks short or sequential, fix the generator first.

### Pitfall: Token leaks via referer headers.

Share link URLs typically include the token. When a guest clicks an external link from the response page, the browser sends the share URL as `Referer:` to the third-party site. Leaked tokens = unauthorized submissions. Set `<meta name="referrer" content="no-referrer">` on the GuestResponse page, or use `URL fragments` (`#token=…`) which browsers don't send as referer.

## Product behavior changes

- Guests submitting via share links continues to work, but now goes through a server-validated RPC.
- Token expiry and capacity are enforced server-side, not in the client (the client may show optimistic UI, but the server is the truth).
- The `anon` role can no longer read `guest_contributions`, even with a direct `psql` connection.

## Verification checklist

- [ ] As `anon`, `SELECT * FROM guest_contributions` returns permission denied.
- [ ] As `anon`, `INSERT INTO guest_contributions ...` returns permission denied.
- [ ] `SELECT public.submit_guest_contribution('valid-token', 'Name', 'contact', '{}'::jsonb)` returns a new UUID.
- [ ] Same call with an expired token raises an exception with a clear error.
- [ ] `GuestResponse.tsx` correctly handles both the success and "invalid token" paths via the RPC.
- [ ] Rate limit fires after N submissions per token per window.
