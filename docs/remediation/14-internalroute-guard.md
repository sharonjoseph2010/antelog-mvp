# 14 — Drop `InternalRoute` state guard

> Patch: [`SECURITY_REMEDIATION.md` §14](../SECURITY_REMEDIATION.md#14-internalroute--drop-the-state-based-guard)

## Why this matters

`RouteGuards.tsx:117-128` gates `/profile-setup` and `/verify` on `location?.state?.internal === true`. The intent: only allow access mid-flow, not via a direct URL.

The problem: React Router state is fully writable from the client. Any of these bypasses the check:

- `navigate('/profile-setup', { state: { internal: true } })` from the browser console
- `window.history.pushState({ internal: true }, '', '/profile-setup')`
- A malicious bookmarklet
- A link with a custom JS-injected redirect

This isn't a privilege escalation — both pages handle onboarding for the *current logged-in user* anyway, so "bypassing" the guard just lets them access pages they were going to access during normal onboarding. But:

- The guard creates a false sense of security. A reader assumes "this is gated."
- It causes legitimate UX bugs: users who refresh the page mid-onboarding lose `location.state` and get kicked out of their own onboarding flow.
- Server-side derivable state (is the user's profile complete?) is the correct signal.

So the fix is dual: remove the spoofable guard, and add a server-derived `needsSetup` flag that genuinely controls access.

## What might break

- **Onboarding deep-links.** If anywhere in the app uses `navigate('/profile-setup', { state: { internal: true } })`, those calls keep working — they just stop being meaningful. The destination route no longer checks the flag.
- **Auth callback flow.** `AuthCallback.tsx` probably redirects to `/profile-setup` for new users. With the server-derived check, the new logic is: if `profiles.handle` is null, route to setup; else route to dashboard. Same end-state, different mechanism.
- **Refresh during onboarding.** Currently a refresh on `/profile-setup` may kick the user out due to lost state. After the fix, refresh works correctly — the server-derived flag is recomputed.
- **Users who deliberately revisit `/profile-setup` later.** Maybe they want to update their handle. With a server-derived gate that only allows access when profile is incomplete, they're redirected to a generic settings page. If "edit profile later" is a feature, it should be a different route (`/settings/profile`), not `/profile-setup`.

## Gotchas

- **`profiles` row may not exist yet for a brand-new user.** The check `!profile?.handle || !profile?.full_name` returns true if `profile` is null — that's correct (needs setup). Make sure the query handles the null row gracefully (`maybeSingle()` not `single()`).
- **Realtime updates to the profile.** If the user completes their profile in another tab, the original tab might still think they need setup. Subscribe to `profiles` changes or refresh on focus.
- **Server-side derivation depends on RLS.** Querying `profiles` from the SPA depends on RLS letting the user read their own profile. With [#01](./01-reenable-rls.md) re-enabled, ensure the SELECT policy on `profiles` covers `auth.uid() = id`.
- **`needsSetup` cached too long.** If you stash `needsSetup` in React Query for, say, 5 minutes, the user who *just* completed setup will be told they still need to. Invalidate the cache on profile mutation.
- **The check needs to differentiate "loading" from "needs setup".** A null result from React Query during the first paint is *not* the same as "profile incomplete." Treat loading as a third state, not a falsy boolean.

## Common pitfalls

### Pitfall: Removing the guard but not the redirect logic that pushes users to setup.

The guard's purpose was to keep stray clicks out of `/profile-setup`. The redirect that puts new users *into* `/profile-setup` still needs to fire. Make sure the auth callback / dashboard load path correctly redirects on `needsSetup === true`.

### Pitfall: Server-derived check based on stale data.

If `profiles.full_name` is updated in another tab, the original tab still has stale state. Either re-fetch on route change, or use Supabase Realtime to listen for own-profile updates.

### Pitfall: Infinite redirect loop.

```
/dashboard → needsSetup === true → /profile-setup → needsSetup === true → /profile-setup ...
```

Make sure `/profile-setup` itself does not redirect-on-needsSetup. The guard logic belongs at the route level for *other* routes; on `/profile-setup` itself, it just renders.

Alternatively: make sure `needsSetup` is recomputed after profile save, and is false before the navigate-away happens.

### Pitfall: Treating profile completeness as binary when it's actually multi-stage.

If onboarding has phone verification, handle selection, profile picture, etc., "needs setup" is a chain. The simplest model: define `needsSetup = !profile?.handle || !profile?.full_name` (or whatever the schema says). Don't try to be clever about which step they're on; the page itself handles steps.

### Pitfall: Phone verification disconnected from profile state.

`/verify` is gated by the same `InternalRoute` flag. If verification is a separate phase (e.g., during signup OTP), it might not be derivable from `profiles` alone. Check whether there's a `is_phone_verified` column or similar; the gate on `/verify` is `auth.user.phone_confirmed_at is null`, not `profiles.handle is null`.

### Pitfall: Old links emailed to users.

If onboarding emails contain `https://app.com/profile-setup?state=...`, those links assumed the `internal` state would be set. After removal, the link just goes to the page, which is fine — but verify the email flow still routes correctly.

### Pitfall: Server-derived flag in a hook with the wrong dependencies.

```ts
const { data: profile } = useQuery({
  queryKey: ['profile', user?.id],
  queryFn: () => supabase.from('profiles').select().eq('id', user.id).maybeSingle()
});
const needsSetup = profile && (!profile.handle || !profile.full_name);
```

If you don't pass `user?.id` in the query key, the hook caches the *first* user's profile across login/logout. Always include user.id in cache keys.

### Pitfall: Removing the guard but not the file.

`RouteGuards.tsx` may export multiple guards; removing only `InternalRoute` is the right move. Don't delete the whole file. Also remove unused imports.

## Product behavior changes

- Users who refresh during onboarding stay on the page.
- Direct navigation to `/profile-setup` works if profile is incomplete; redirects if complete.
- The `state.internal` mechanism is gone; any code passing it can be cleaned up.

## Verification checklist

- [ ] `InternalRoute` component is removed from `RouteGuards.tsx` (or its usage is removed).
- [ ] Direct navigation to `/profile-setup` while logged in with an incomplete profile loads the page.
- [ ] Direct navigation to `/profile-setup` with a complete profile redirects to `/dashboard` (or wherever).
- [ ] Refresh during onboarding does not kick the user out.
- [ ] Completing onboarding navigates away cleanly with no loop.
- [ ] No remaining usages of `state: { internal: true }` in the codebase.
