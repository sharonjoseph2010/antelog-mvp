# 09 — `ListEdit` — explicit owner check

> Patch: [`SECURITY_REMEDIATION.md` §9](../SECURITY_REMEDIATION.md#9-listedittsx--explicit-owner-check)

## Why this matters

`ListEdit.tsx:93-104` fetches a list by `id` only:

```ts
supabase.from("lists")
  .select("id,title,description,...")
  .eq("id", id)
  .maybeSingle()
```

There is no `.eq("owner_id", user.id)` filter. With RLS off (current state), this query returns *any* list to anyone who knows or guesses the ID. The Edit page then loads it and saves changes back. That's IDOR — Insecure Direct Object Reference — in its purest form.

`RequestEdit.tsx` has it right: it fetches and then explicitly verifies `data.creator_id === user.id`, redirecting if not. `ListEdit.tsx` should mirror this.

Belt-and-suspenders argument: even *after* RLS is re-enabled (see [#01](./01-reenable-rls.md)), keeping client-side ownership checks is good practice. RLS is the security boundary; the client check is the *correctness* boundary that catches misconfigured policies, race conditions during policy migrations, and developer mistakes where a SECURITY DEFINER RPC accidentally widens visibility. Both layers should exist.

## What might break

- **Nothing for legitimate users.** Owners continue to see their own lists. Non-owners who somehow navigate to `/lists/<id>/edit` now get a "Not found" toast and redirect, which is the correct behavior.
- **Admin override.** If admins were expected to edit any user's list via this page, the owner check blocks them. Either (a) admins should use a different page with an explicit admin-edit flow, or (b) the check becomes `owner_id = user.id OR is_admin`. Preference: (a) — admin editing of arbitrary user data deserves its own audited path.
- **Shared/collaborative lists.** If two users can co-own a list (no evidence of this in the schema, but worth confirming), the check needs to consult a `list_collaborators` table. With current schema, single-owner is the only model.

## Gotchas

- **`user` must be in scope when the query runs.** Pull from the existing session context or auth hook. Don't lazy-load it via another async call after the query — race condition material.
- **`.eq("owner_id", user.id)` after `.eq("id", id)` is order-independent for Postgres, but for readability, put the ID first.**
- **`.maybeSingle()` returns null for both "doesn't exist" and "you don't own it."** That's fine; both should show the same toast and redirect. The user shouldn't be able to distinguish "this list exists but isn't yours" from "this list doesn't exist" — that distinction is an enumeration oracle.
- **Editing items (`list_items`) needs its own check.** The item write paths (`update list_items set content = …`) operate on `list_id`. The page already loaded the parent list scoped to the owner, so the items are implicitly owned — but a future refactor that loads items independently of the list will reintroduce the bug. Document the invariant: items inherit ownership from the parent list, and any path that mutates items must verify the parent.
- **Published lists.** `directory_list_id` being non-null marks a list as published. The owner can edit metadata; the schema may forbid edits to certain fields after publishing. The owner check doesn't replace those business rules.

## Common pitfalls

### Pitfall: Adding the check on the *load* path but not the *save* path.

Easy to add `.eq("owner_id", user.id)` to the SELECT and forget that the UPDATE later (line 192, 216) also needs scoping. With RLS off, the UPDATE will succeed regardless of owner. Audit every Supabase write call in the file:

```bash
grep -n "supabase.from\|supabase\\.from" src/pages/ListEdit.tsx
```

Each `.update()` and `.delete()` needs an `.eq("owner_id", user.id)` filter or RLS coverage. Don't trust one layer.

### Pitfall: Different column name than expected.

The review noted `lists.owner_id`. Confirm by checking the types file:

```bash
grep -A 20 "lists:" src/integrations/supabase/types.ts | head -30
```

Some tables use `creator_id`, others `owner_id`, some both. Using the wrong column gives a query that always returns nothing, which looks like "access denied" but is actually broken — silently. Test with the actual owner to confirm the page works.

### Pitfall: The "Not found" toast for a real user who *should* see the list.

If `auth.uid()` is briefly null during page mount (session loading), the query becomes `.eq("owner_id", null)` which returns no rows. The user sees "Not found" on a list they own. Fix: don't run the query until `user?.id` is truthy:

```ts
if (!user?.id || !id) return;
// then query
```

### Pitfall: Tests with hardcoded UUIDs.

Any test that loads a list via `loader({ params: { id: 'fixed-uuid' } })` needs to also set the authenticated user to the owner. Otherwise the test starts failing post-patch.

### Pitfall: Generalising the pattern incorrectly.

If you add the owner check to *every* page, including read-only views like `PublicProfile`, you'll lock owners out of features that were meant to be public. The right rule: any edit/mutation page must scope by owner. Read-only views scope by visibility (`public`, `friends`, etc.), which usually means an RPC or a view-side policy.

### Pitfall: Treating the `Not found` toast as the only feedback.

If a user follows a shared link to an edit page they no longer own (e.g., ownership transferred), they get a generic toast and a redirect. Consider a more informative copy: "This list is no longer available to you" — actionable, less mysterious.

## Audit the rest of the app for the same shape

```bash
grep -rln "useParams" src/pages/ | xargs grep -l "\.from(" | sort -u
```

For each file, verify the pattern. Likely candidates:

- `GroupDetail.tsx` — group ownership
- `RequestEdit.tsx` — already correct ([reference implementation](../../src/pages/RequestEdit.tsx))
- `ListDetail.tsx` — should scope by `visibility OR owner_id = me`
- `RequestRespond.tsx`, `RequestReview.tsx` — should verify the caller is a valid responder (creator, friend, group member, etc.)

This is a sweep, not a one-line change.

## Product behavior changes

- Editing another user's list URL no longer works.
- Users see a generic "not found" message rather than the list contents.
- Save operations from a non-owner's session (e.g., via an attacker tab) fail.

## Verification checklist

- [ ] As owner, `/lists/<my-list>/edit` loads and saves work.
- [ ] As non-owner, `/lists/<other-list>/edit` redirects to `/lists` with a toast.
- [ ] As non-owner, manually issuing a `supabase.from('lists').update().eq('id', '<other>')` from the browser console fails (post-RLS-fix).
- [ ] The same pattern is applied to `GroupDetail.tsx`, `ListDetail.tsx`, and any other `*Edit.tsx` / `*Detail.tsx` that mutates.
- [ ] `list_items` mutations are also scoped (transitively, via the parent list).
