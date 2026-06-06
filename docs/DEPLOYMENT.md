# Deployment Runbook — Security Remediation

**Audience:** Sharon (has Supabase project + dashboard access).
**Branch being deployed:** `security-remediation/akp-20260606`
**What this covers:** applying the database + edge-function + dashboard changes
that a git merge does **not** do automatically.

> ## Read this first
> Merging the PR only redeploys the **front-end**. The 3 SQL migrations, the 7
> edge functions, and 2 dashboard settings must be applied by you. Front-end and
> backend are **co-dependent** — if they go live out of sync the app breaks. So:
> **do the whole thing on a staging project first, verify, then repeat on prod.**
>
> **Freeze Lovable UI edits** to this project until deploy is done — editing in
> Lovable mid-deploy can regenerate/conflict with these migrations and functions.

---

## 0. One-time setup (≈5 min)

Install and authenticate the Supabase CLI:

```bash
# macOS
brew install supabase/tap/supabase

supabase login        # opens browser; use your Supabase account
```

You'll need each project's **ref** (Dashboard → Project Settings → General →
"Reference ID"):

- **Prod ref:** `bzeomaxcafiqwxlskwvz`
- **Staging ref:** `__________` (see step 1 if you don't have one yet)

Get the branch locally:

```bash
git fetch origin
git checkout security-remediation/akp-20260606
```

---

## 1. Get a staging project (do NOT test on prod)

RLS (finding #1) changes the entire data-access model. Test it somewhere
disposable first. Pick one:

- **Best:** create a new free Supabase project ("antelog-staging"), or
- Use Supabase **branching** if enabled (Dashboard → Branches), or
- If you truly have no staging option, tell akp before touching prod.

Whichever you pick, note its ref for the commands below.

---

## 2. Deploy to STAGING

Run these from the repo root, on the branch:

```bash
# Point the CLI at staging
supabase link --project-ref <STAGING_REF>

# 1) Apply the 3 security migrations (RLS, rate-limit table, admin seed)
supabase db push

# 2) Deploy all edge functions (the 7 functions + _shared helpers)
supabase functions deploy

# 3) Set the CORS allowlist (finding #11). Comma-separated, no spaces.
#    Include your staging front-end origin(s).
supabase secrets set ALLOWED_ORIGINS="https://<your-staging-url>,http://localhost:8080"
```

Notes:
- `supabase db push` applies every pending migration in `supabase/migrations/`.
- `supabase functions deploy` deploys all functions; `verify_jwt` settings come
  from `supabase/config.toml` automatically.
- The **admin seed** migration (`..._security_admin_seed.sql`) grants admin to
  `sharonjoseph2010@gmail.com` **if that user exists in this project**. On a
  fresh staging project that user may not exist yet — sign up first, then
  re-run `supabase db push`, or insert your own row:
  ```sql
  insert into public.user_roles (user_id, role)
  select id, 'admin' from auth.users where email = 'YOUR_STAGING_EMAIL'
  on conflict do nothing;
  ```

Then point the **staging front-end** at this staging project (its own
`VITE_SUPABASE_*` values) and run the verification checklist below.

---

## 3. Verify on STAGING (this is the merge gate)

Walk through each — all must pass:

- [ ] Sign up / log in / onboarding (`/profile-setup`, `/verify`).
- [ ] Send a friend request → the **recipient gets a notification**
      (notifications now go through a DB function, not a direct insert).
- [ ] Accept a friend request → requester gets the "accepted" notification.
- [ ] Create a request; another account can see/respond per audience.
- [ ] **Guest flow:** open a share link `/r/<id>/<token>` in a logged-out
      browser — the request loads and you can submit a recommendation.
- [ ] Lists: create / edit / delete your own; you **cannot** open
      `/lists/<someone-elses-id>/edit`.
- [ ] Directory search + voting works.
- [ ] Admin: the seeded admin sees `/admin`; a normal user is redirected.
- [ ] As a normal user, this fails (good):
      ```sql
      update public.user_roles set role='admin' where user_id = auth.uid();
      ```

### Expected behavior changes (NOT bugs — confirm they're acceptable)
- Searching/suggestions may no longer show **strangers'** full profiles (only
  you, your friends, and admins can read profiles now). Known follow-up.
- There is no public "all open requests" feed — people see requests addressed
  to their audience only.
- The "anonymous handle" shown on some request screens may differ until a small
  follow-up rewire lands.

If something breaks, capture the error and send it to akp — do **not** proceed
to prod.

---

## 4. Deploy to PROD (only after staging passes)

```bash
supabase link --project-ref bzeomaxcafiqwxlskwvz
supabase db push
supabase functions deploy
supabase secrets set ALLOWED_ORIGINS="https://<your-prod-domain>"
```

Then merge the PR (front-end redeploys via Lovable). Aim to do the `db push` /
`functions deploy` and the merge **close together** so front-end and backend
are in sync.

---

## 5. Dashboard steps (manual, prod)

Do these in the Supabase Dashboard after the prod deploy:

1. **Rotate the anon key** (finding #2). Project Settings → API → roll the
   `anon` key. Update `VITE_SUPABASE_PUBLISHABLE_KEY` wherever the front-end
   reads it (Lovable env / `.env`) and redeploy.
2. **Enable Auth protection** (finding #10). Authentication → enable CAPTCHA
   (hCaptcha/Turnstile) and any rate-limit/lockout settings available.

---

## 6. Emergency rollback

If prod breaks after the migrations and you need users working **now**:

- **Edge functions:** redeploy the previous version, or revert the function
  files on a branch and `supabase functions deploy`.
- **RLS (last resort):** in Dashboard → SQL Editor you can temporarily
  re-disable RLS on a specific table to unblock, e.g.
  ```sql
  alter table public.<table> disable row level security;
  ```
  ⚠️ This re-opens the security hole — do it only as a stopgap, tell akp, and
  re-enable as soon as the real issue is fixed. (The CI guard blocks committing
  a `DISABLE ROW LEVEL SECURITY` migration, so this stays a manual emergency
  action, not something that lands in the repo.)

---

## 7. Quick reference — what each piece needs

| Change | Command / action | Auto on merge? |
|--------|------------------|----------------|
| Front-end (React) | merge PR → Lovable rebuild | ✅ |
| 3 SQL migrations | `supabase db push` | ❌ |
| 7 edge functions | `supabase functions deploy` | ❌ |
| CORS allowlist | `supabase secrets set ALLOWED_ORIGINS=…` | ❌ |
| Anon key rotation | Dashboard → API | ❌ |
| Auth captcha/lockout | Dashboard → Authentication | ❌ |

Full per-finding detail: [`SECURITY_REMEDIATION_CHANGES.md`](./SECURITY_REMEDIATION_CHANGES.md).
