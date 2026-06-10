# Deployment Runbook — 2026-06-10 Security Remediation

**Audience:** Sharon (has Supabase project + dashboard access).
**Companion runbook:** `docs/DEPLOYMENT.md` (the 2026-06-06 round). Same tools,
same prod ref — read its §0 once for CLI setup if you haven't.
**Plan this implements:** `docs/SECURITY_REMEDIATION_PLAN_2026-06-10.md`.

> ## ⚠️ READ THIS FIRST — merging is NOT enough
> Merging a PR only redeploys the **front-end** (via Lovable/host). The SQL
> migrations and any dashboard secrets in each phase must be applied **by you**
> with the Supabase CLI. If you merge and walk away, the database does not
> change — and for several phases the front-end and back-end are **co-dependent**,
> so a half-applied phase **breaks the app**.
>
> For every phase below: **apply on STAGING first, run its checklist, then prod.**
> Freeze Lovable UI edits to this project while deploying.
>
> **Prod ref:** `bzeomaxcafiqwxlskwvz` · **Staging ref:** `__________`

---

## Phase map & merge order

Each phase is a separate PR. **Merge in this order** — later phases depend on
objects created by earlier ones.

| Order | PR / branch | Findings | Migrations | Front-end change? | Must deploy together? |
|------|-------------|----------|-----------|-------------------|----------------------|
| 1 | `security/phase0-anon-pii-revoke-akp-20260610` | D1, D7 | `20260610120000` | No | DB only |
| 2 | `security/phase1-rls-quickwins-akp-20260610` | F1, F2, F4, D5 | `20260610120100`, `20260610120300` | **Yes** (`GuestResponse.tsx`) | **YES — migration + front-end together** |
| 3+ | (Phase 2 onward — added as built) | … | `20260610120400`+ | varies | varies |

> **Why order matters:** Phase 2's anon-grant lockdown (a later phase) re-grants
> `increment_share_link_open`, which **Phase 1 creates**. Apply Phase 1 first.

---

## How to apply any phase (the pattern)

```bash
git fetch origin
git checkout <the phase branch>

# 1) STAGING first
supabase link --project-ref <STAGING_REF>
supabase db push          # applies that branch's new 20260610* migrations only

# 2) Run the phase's STAGING checklist (below). Only if all pass:

# 3) PROD
supabase link --project-ref bzeomaxcafiqwxlskwvz
supabase db push
```

`supabase db push` applies every *pending* migration in `supabase/migrations/`.
Because migrations are timestamp-ordered, pushing a later branch also applies any
earlier-phase migrations not yet on that project — which is why merge/apply order
must be respected.

---

## Phase 0 — revoke anon PII / debug RPCs (D1, D7)

**PR:** `security/phase0-anon-pii-revoke-akp-20260610`
**What it does:** revokes `anon`/`authenticated` EXECUTE on
`find_profile_by_normalized_phone` (the P0 unauthenticated phone→identity
lookup) and the two `debug_*` functions. `service_role` keeps its grant.
**Front-end:** none. **This is DB-only — apply it even before merging if you
want the P0 closed today.**

### Apply
```bash
git checkout security/phase0-anon-pii-revoke-akp-20260610
supabase link --project-ref <STAGING_REF> && supabase db push   # then prod
```

### Verify on STAGING (all must pass)
- [ ] In a logged-out browser console (anon key), this now **fails** with
      `permission denied for function`:
      ```js
      supabase.rpc('find_profile_by_normalized_phone',
        { input_phone: '+15551234567', exclude_user_id: '00000000-0000-0000-0000-000000000000' })
      ```
- [ ] In-app **contact matching still works** (import contacts / a new signup is
      matched to existing contacts) — it runs server-side under `service_role`,
      which is unaffected.
- [ ] No app screen errors that previously worked (these RPCs had no client
      callers, so nothing should regress).

### Rollback
Re-grant (only if it breaks something unexpected):
```sql
GRANT EXECUTE ON FUNCTION public.find_profile_by_normalized_phone(text, uuid) TO authenticated;
```
Do **not** re-grant to `anon` — that re-opens the P0.

---

## Phase 1 — share_links lockdown + definer search_path (F1, F2, F4, D5)

**PR:** `security/phase1-rls-quickwins-akp-20260610`
**Migrations:** `20260610120100_sec_share_links_rls.sql`,
`20260610120300_sec_definer_search_path.sql`
**Front-end:** `src/pages/GuestResponse.tsx` (rewritten to use new RPCs).

> ### 🔴 CO-DEPENDENT — deploy DB and front-end in the SAME window
> This phase **removes anon direct access to `share_links`**. The old
> `GuestResponse.tsx` reads/writes that table directly, so:
> - **Migration applied but old front-end still live** → the guest page breaks
>   ("Invalid Link") and guests can't respond.
> - **New front-end live but migration not applied** → the new RPCs don't exist
>   yet → guest page breaks.
>
> So: merge the PR (front-end redeploys) **and** run `supabase db push` close
> together. On staging, do the migration first then point staging front-end at
> it; on prod, merge + `db push` back-to-back and verify immediately.

### What changes in the DB
- Drops anon policies "Anyone can read share links" and "Anyone can update share
  link counters".
- Adds SECURITY DEFINER RPCs (granted to `anon`, `authenticated`):
  `resolve_share_link`, `increment_share_link_open`,
  `increment_share_link_response`, `create_guest_share_link`.
- Pins `search_path = public` on `update_directory_item_vote_count`,
  `get_extended_network`, `find_network_experts`, `get_safe_profile_view`.

### Apply
```bash
git checkout security/phase1-rls-quickwins-akp-20260610
supabase link --project-ref <STAGING_REF> && supabase db push
# point staging front-end at staging, OR merge to deploy front-end, then verify
```

### Verify on STAGING (all must pass)
- [ ] **Guest page loads:** open `/r/<id>/<token>` logged out → request details,
      preview, and (if forwarded) the sharing path render.
- [ ] **Submit a recommendation** as a guest → succeeds; the owner sees it.
- [ ] **Open counter** increments (DB: `times_opened` goes up on each visit).
- [ ] **Response counter** increments on submit (`current_responses` up by 1).
- [ ] **Guest forwarding ("Pass it along"):** generates a working child link;
      opening it shows the extended chain ("X thought of you"). *(This was
      broken before this phase — confirm it now works.)*
- [ ] **Token secrecy:** in a logged-out console, this returns **no rows /
      denied** (no longer dumps tokens):
      ```js
      supabase.from('share_links').select('*')
      ```
- [ ] Owner's own share links still list/work in `RequestRespond` (unchanged).
- [ ] Supabase **Advisor → Linter**: `function_search_path_mutable` is clear for
      the four altered functions.

### Rollback
Revert the front-end (re-merge previous `GuestResponse.tsx`) **and** restore the
dropped policies in the same window:
```sql
CREATE POLICY "Anyone can read share links" ON public.share_links FOR SELECT TO anon USING (true);
CREATE POLICY "Anyone can update share link counters" ON public.share_links FOR UPDATE TO anon USING (true);
```
(Only as an emergency — this reopens F1/F2. Prefer fixing forward.)

### CI note
This phase also rewrites `.github/workflows/security-guard.yml`. The previous
guard was failing **every** run (it grepped the whole tree and matched the
historical RLS-disable migration). It now checks only files changed in a PR. No
action needed from you — just know that a red `security-guard` on older PRs was
this bug, now fixed.

---

## Phases 2+ (placeholder)

Sections will be appended here as each phase PR is opened, in the same format:
what changes in the DB, co-dependency callout, apply commands, staging
checklist, rollback. Always follow the **merge order** table at the top.

---

## If anything is unclear

Ping akp **before** touching prod. A broken guest flow or a half-applied RLS
change is worse than a delayed deploy.
