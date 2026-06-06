# 04 — `rematch-contacts` — scope to caller or restrict to admin

> Patch: [`SECURITY_REMEDIATION.md` §4](../SECURITY_REMEDIATION.md#4-rematch-contacts--scope-to-caller-or-restrict-to-admin)

## Why this matters

The function as written ([`supabase/functions/rematch-contacts/index.ts:29-44`](../../supabase/functions/rematch-contacts/index.ts)) loads `contact_imports` globally:

```ts
const { data: contacts } = await supabaseClient
  .from('contact_imports')
  .select('id, user_id, contact_phone, ...')
  .not('contact_phone', 'is', null);
```

It then iterates and re-links every contact in the system to its best-matched `profiles.id`. Any authenticated user can trigger this. The risks are layered:

1. **Resource exhaustion** — a malicious user can hit it repeatedly and pin a worker, run up phone-normalization RPC costs, and pollute logs.
2. **Data corruption surface** — if the matching logic has any bias toward newer profiles or specific phone formats, an attacker who controls when the rematch runs controls *which* attacker-controlled profile gets linked to other users' contacts. This is subtle but real: imagine creating a profile with a phone number you know matches a target's contact list, then triggering rematch to associate yourself with their social graph.
3. **PII exposure** — even without writing, the function reads every contact's phone number into memory. If logs capture this (they do, via `console.log('Found N contacts...')`), an exfiltration vector exists.

The decision is a product question: is this a *user* action ("rematch my contacts") or a *system* job ("nightly housekeeping")? The fix differs.

## Decision matrix

| Use case | Fix | Why |
|----------|-----|-----|
| User clicks "Rematch my imported contacts" in Settings | Per-user scope: `.eq('user_id', auth.uid())` | Bounded blast radius; no admin needed |
| Cleanup after a profile is created/updated | `pg_cron` calling the function with no JWT, with `verify_jwt = false`, and the function only operates on the recently-touched rows | Cron is the right primitive for scheduled work; user can't trigger |
| Manual admin operation post-migration | Keep as global, gate on `user_roles.role = 'admin'`, *don't* expose in the SPA | Rare, high-impact, audited |

If the answer is "all three", split into three functions. Don't try to overload one.

## What might break

- **The triggering UI.** If a Settings page button calls this function expecting it to rematch everything, scoping to caller will change the result count. Likely fine, but worth checking copy ("Rematching all contacts in the system…" → "Rematching your contacts…").
- **Background jobs.** If `pg_cron` already calls this function with a service-role token, scoping by JWT will break — `auth.uid()` is null for service-role calls. The cron path should explicitly target rows by recency (`updated_at > now() - interval '1 day'`) rather than relying on a user identity.
- **Initial backfill.** When you first deploy the matching logic, you genuinely need a one-time global pass. Do that as a one-off SQL migration or a manually-run admin function, not a user-callable endpoint.

## Gotchas

- **`contact_imports.user_id` is the *importer*, not the contact.** Scoping to `auth.uid() = user_id` rematches the caller's address book against the global profiles table. That's almost certainly what you want, but be explicit. A future maintainer might expect `user_id` to mean "the matched profile."
- **`phone_normalize` RPC cost.** The function calls a normalization RPC per contact. With 10k contacts, that's 10k RPC calls. Per-user scoping bounds this to the caller's import size, typically << 10k.
- **Batching.** Even per-user, a 5k-contact user can cause function timeout (Supabase edge functions have a wall clock, typically 60s for invoke-style calls, longer for background). Batch in chunks of, say, 200, with explicit pagination, and return a `{ remaining: N }` field so the client can resume.
- **Idempotency.** Rematch should be safe to run twice in a row with no net change. Test this — if your matching logic increments a counter or appends to a log table, two runs will look like two events.
- **Conflict with realtime UI.** If contacts are visible in the UI in realtime, large rematches will fire many `postgres_changes` events. Either throttle the realtime channel or do the rematch in a transaction so events fire on commit.

## Common pitfalls

### Pitfall: Adding the JWT check at the entry point but leaving global queries below.

Easy mistake: you guard the function with `auth.getUser()` and then *still* run `.from('contact_imports').select()` without a `.eq()` filter. The JWT check is meaningless if the query body is unchanged. Pair every `auth` check with a *data* scope.

### Pitfall: Picking "admin-only" because it's easier, when the UX wanted per-user.

If the Settings page button exists and was working before, switching to admin-only silently breaks the feature with no error message — the button just produces 403 toasts. Confirm the product intent before choosing admin-only.

### Pitfall: Phone normalisation differences across runs.

`libphonenumber` and country-code defaults can produce different normalized forms for the same input across versions. A rematch that re-canonicalises numbers can flip `is_matched` from true to false (or vice versa) without any user-facing change. Pin the normalisation library version, or run rematch only when normalisation logic itself changed.

### Pitfall: Letting the function run with the service-role key for *everything* after auth.

The function only needs service-role for cross-user reads/writes during matching. The initial auth check and the caller's own row reads should use the JWT-scoped client. Mixing is dangerous: a future maintainer might add a `.from('user_roles').update()` somewhere in the function body, and with the service-role client it'll succeed regardless of who's calling.

### Pitfall: Audit logs that include phone numbers.

The current function logs `Found ${contacts?.length || 0} contacts with phone numbers`. If you add `console.log(contact.contact_phone)` for debugging, you've created a PII log. Mask phone numbers in logs (`***-***-1234`) and never log the unmasked value.

### Pitfall: Re-using the function name after a contract change.

If you previously deployed the global rematch and clients have it cached, switching to per-user with `auth.getUser()` will make existing clients' service-role-style calls fail. There are no known clients of that form here, but if you have a Postgres trigger or webhook calling the function, update those too.

## Product behavior changes

- "Rematch contacts" UI now finishes faster and acts only on the user's data.
- Cross-user matching that previously fired implicitly when *any* user triggered rematch no longer happens. If profile creation depended on this for, say, populating reciprocal contact relationships, replace it with a `pg_cron` job or a per-insert trigger.

## Verification checklist

- [ ] As user A, invoking the function updates only `contact_imports` rows where `user_id = A`.
- [ ] As user A, invoking the function does not change `contact_imports` for user B.
- [ ] Function logs no longer mention "Found N contacts" with N > A's actual count.
- [ ] If the cron path exists, it bypasses JWT and operates only on recently-touched rows.
- [ ] Phone numbers are masked in any function log output.
- [ ] No `console.log(contact.contact_phone)` or equivalent in the function body.
