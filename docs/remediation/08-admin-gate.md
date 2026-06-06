# 08 — Admin gate via `user_roles`

> Patch: [`SECURITY_REMEDIATION.md` §8](../SECURITY_REMEDIATION.md#8-admin-gate-replace-hard-coded-e-mail-with-user_roles-lookup)

## Why this matters

The current admin check is `user?.email === "sharonjoseph2010@gmail.com"` at `src/App.tsx:310`. Three things wrong with that:

1. **Identity baked in source.** Every developer with repo access knows the admin's email. If that account is ever compromised, the attacker has admin on the *deployed app* in addition to the email itself.
2. **No multi-admin path.** Adding a second admin requires a code change, code review, and a deployment. In a startup phase that's painful; for incident response (e.g., promoting an on-call to admin temporarily) it's untenable.
3. **Client-side gate is decorative.** The check at `App.tsx:310` only decides whether the *navigation* shows the admin link. Anyone can navigate directly to `/admin` and the protection becomes whatever `<AdminRoute>` does, which is *also* checking the same client variable. The real protection is `Admin.tsx`'s `get_current_user_role()` RPC — but if a future page forgets to call it, the page renders.

The right model is "the database is the source of truth for who's an admin; the client just asks." That's what `user_roles` (already present in the schema) is for.

## What might break

- **Until `user_roles` has the seed row for the existing admin, that user loses admin access.** Run the `INSERT ... ON CONFLICT DO NOTHING` seed in the same migration as the code change, before the deploy goes live.
- **The duplicate check in `Admin.tsx`** (calls `get_current_user_role` on mount) is fine to keep — defense in depth — but the *route guard* in `App.tsx` should now also rely on the RPC result, not the email.
- **Loading state.** The RPC is async. The first render of `App.tsx` won't yet have the `isAdmin` value. Either show a loading state or default to `isAdmin = false` (safer). Make sure the redirect for non-admins doesn't fire *during* loading, only after `isAdmin === false` is confirmed.

## Gotchas

- **`get_current_user_role()` semantics.** Check whether this RPC returns a single role or an array. If a user can have multiple roles (`admin`, `moderator`), the RPC should return an array; the client checks `roles.includes('admin')`.
- **RLS on `user_roles` itself.** Per [#01](./01-reenable-rls.md), `user_roles` needs RLS with a deny-by-default write policy. Otherwise *self-promotion* is trivial (`update user_roles set role='admin' where user_id = me`). The SELECT policy should let users read their own role; only admins can write.
- **SECURITY DEFINER on the role-check RPC.** `get_current_user_role()` needs to be SECURITY DEFINER so it can read `user_roles` even when the policy doesn't let the user read other rows. Make sure it filters by `auth.uid()` *inside* the function body — common bug.
- **Token reuse after role revocation.** A user demoted from admin still has a valid JWT until it expires (typically 1 hour). They keep admin until refresh. For sensitive actions, re-check via RPC on each action; don't trust the SPA-cached `isAdmin` for more than a few seconds.
- **First admin bootstrap.** Once `user_roles` requires admin to write, you can't promote the first admin via the SPA. Bootstrap via a one-time SQL migration that uses the migration-runner's superuser privileges to insert the seed row.

## Common pitfalls

### Pitfall: Leaving the email string in source as a "fallback."

```ts
const isAdmin = adminFromRpc || user?.email === "sharonjoseph2010@gmail.com";
```

This re-introduces every problem. Delete the email check entirely. If you're worried the RPC will fail and lock you out, build a one-time "break glass" migration path that re-seeds your `user_roles` row.

### Pitfall: Race between session load and role load.

```ts
useEffect(() => {
  setIsAdmin(false);                           // safe default
  if (!user?.id) return;
  supabase.rpc('get_current_user_role').then(({ data }) => {
    setIsAdmin(data === 'admin');
  });
}, [user?.id]);
```

If `<AdminRoute>` renders during the brief window where `user` is set but `isAdmin` is `false` (waiting on RPC), the user gets bounced from the admin page even though they should be allowed. Add an `isAdminLoading` state and gate the redirect on `!isAdminLoading && !isAdmin`.

### Pitfall: Caching the role across sessions.

Don't store `isAdmin` in `localStorage`. If an admin signs out and a non-admin signs in on the same device, a cached `isAdmin = true` is briefly true for the wrong user. Always derive from the live session.

### Pitfall: Promoting/demoting via the admin UI without auditing.

If admins can promote others, log it: who promoted whom, when, why. Without an audit trail, "we don't know how the attacker became admin" is a non-answerable question after a breach.

### Pitfall: Single point of failure.

If only one admin exists and they lose their account (lost phone, compromised email), you have no way to administer the system. Always have at least two admins, ideally with different auth methods (one with SMS, one with TOTP, etc.).

### Pitfall: RLS policy on `user_roles` referencing `user_roles`.

```sql
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'))
```

Postgres handles the recursion correctly *if* the inner SELECT is on the same table being policy-checked — RLS doesn't re-apply within a SECURITY DEFINER context for the same statement. But to be safe, wrap the admin check in a SECURITY DEFINER helper:

```sql
CREATE OR REPLACE FUNCTION public.is_admin(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user AND role = 'admin');
$$;
```

Then policies use `is_admin(auth.uid())`, avoiding recursive policy evaluation.

### Pitfall: `get_current_user_role` returning NULL for non-admin users.

Some RPCs return NULL when there's no row, others throw. Make the contract explicit: NULL means "no role assigned" (treat as non-admin). The client should treat NULL identically to a non-admin string.

## Product behavior changes

- The admin link in navigation appears for any user with `role = 'admin'` in `user_roles`, not just the hard-coded email.
- Demoting an admin in the DB causes them to lose admin access within ~1 hour (next JWT refresh) or immediately on next page load (if the client re-checks via RPC).
- Adding new admins is now a DB operation, not a code deploy.

## Verification checklist

- [ ] `user_roles` has a row for the current admin (`SELECT * FROM user_roles WHERE role = 'admin'`).
- [ ] The string `"sharonjoseph2010@gmail.com"` no longer appears in `src/`.
- [ ] Logging in as the seeded admin shows the admin nav link.
- [ ] Logging in as a non-admin and navigating to `/admin` shows "Access denied" without rendering the page chrome.
- [ ] As a non-admin, `UPDATE user_roles SET role = 'admin'` returns permission denied (post-RLS-fix, see [#01](./01-reenable-rls.md)).
- [ ] `get_current_user_role()` is SECURITY DEFINER and filters by `auth.uid()` internally.
