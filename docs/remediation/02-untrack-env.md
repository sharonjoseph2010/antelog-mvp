# 02 — Untrack `.env` and rotate keys

> Patch: [`SECURITY_REMEDIATION.md` §2](../SECURITY_REMEDIATION.md#2-remove-env-from-git-rotate-keys)

## Why this matters

Two distinct problems hide behind "`.env` is committed."

1. **Today's contents** — the Supabase anon key and project URL — are not catastrophic on their own. The anon key is designed to be public; the SPA bundle ships it at `src/integrations/supabase/client.ts:6-7` to anyone who loads the page. The damage is bounded by RLS (see [#01](./01-reenable-rls.md)).
2. **Tomorrow's contents** are the real risk. The dangerous moment is when a teammate adds `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, or a Stripe secret to the same file and pushes. Once that commit lands, even if you remove it later, the key is in the immutable git history. GitHub indexes commits aggressively; secret-scanning bots will find it before you do.

Untracking and gitignoring `.env` is cheap. The real value is policy: it never gets committed *again*.

## What might break

- **Local dev environments without an `.env` after the change.** Anyone pulling the repo for the first time will see "VITE_SUPABASE_URL is undefined" runtime errors. The fix is the `.env.example` that ships in its place, plus a README note.
- **CI pipelines that read `.env` from the repo.** If any GitHub Actions workflow loads variables from a committed `.env`, switch them to GitHub Actions secrets and reference via `${{ secrets.VITE_SUPABASE_URL }}`.
- **Lovable build pipeline.** This repo is connected to Lovable; check whether Lovable was reading the committed `.env` to set its build vars. If yes, configure them in Lovable's env settings instead.
- **Vite default behavior.** Vite reads `.env`, `.env.local`, `.env.production` etc. automatically. Untracking `.env` does not stop Vite from reading it locally — it just stops it from being in git. Devs keep their local `.env`; new devs copy from `.env.example`.

## Gotchas

- **`git rm --cached .env` removes it from the index, not from history.** The file still exists in every prior commit. For *current* exposed values, the only true remediation is rotation. For *future* exposed values, gitignore prevents further commits.
- **`.env.local` vs `.env` precedence.** Vite loads `.env.local` last and it wins. Some devs use `.env` for shared defaults and `.env.local` for personal overrides. Gitignore both `.env` and `.env.*`, then allowlist `.env.example` (`!.env.example`).
- **`VITE_*`-prefixed vars are public by design.** Vite inlines them into the client bundle. If you put a secret behind `VITE_SECRET_KEY=...`, it ships to the browser. Edge function secrets must *not* have the `VITE_` prefix and must live in Supabase's edge function env (`supabase secrets set`).
- **Rotating the anon key invalidates every active session.** All users will be logged out simultaneously. Communicate before you rotate, or do it during a maintenance window.
- **Rotating the service role key requires updating every edge function deployment.** Use `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=…` and redeploy. If you forget one, that function will start 500-ing.
- **Pre-commit hooks catch this before history pollution.** Add `gitleaks` or `pre-commit/talisman` as a pre-commit hook so a future `git commit` containing high-entropy strings is blocked.

## Common pitfalls

### Pitfall: "I'll just delete the file and gitignore it."

`rm .env && git commit` does not remove the file from prior commits — it adds a new commit that deletes it. The file remains in history forever. The decision tree is:

- **Was a real secret ever in this file?** If yes, *rotate the secret*, then optionally rewrite history.
- **Was only the public anon key in there?** Rotation is still good hygiene; history rewrite is unnecessary.

This repo is the second case today. Rotate the anon key; don't bother rewriting history.

### Pitfall: History rewrite breaks every open PR and clone.

`git filter-repo` or `git filter-branch` to scrub `.env` from history forces every collaborator to re-clone. Open PRs from forks become unmergeable. Only do this if a high-value secret was leaked, and coordinate with the team first.

### Pitfall: `.env.example` drifts.

Once `.env.example` exists, the next person who adds a new env var will update `.env` and forget the example. Result: new devs hit cryptic runtime errors. Mitigation: pre-commit hook that diffs key names between `.env.example` and a developer's `.env` and warns on drift; or, a CI job that loads `.env.example`, replaces values with `''`, and runs `vite build` to ensure no var is missing.

### Pitfall: GitHub secret scanning fires *after* the push.

GitHub will scan every push and email you about leaked credentials, but only after the push has succeeded — by which point the secret is publicly visible for the seconds-to-minutes before you notice. Pre-commit scanning catches it *before* the push:

```bash
brew install gitleaks
echo 'gitleaks protect --staged' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Or use the `pre-commit` framework with a `.pre-commit-config.yaml` so it's reproducible across the team.

### Pitfall: Rotating the anon key without rotating the JWT secret.

The anon key is a JWT signed with the project's JWT secret. Rotating the anon key (which the Supabase dashboard supports) does not rotate the underlying signing key. If you suspect the signing key itself is compromised, that requires a Supabase support ticket and a coordinated migration. For "we shipped the anon key in source," rotating just the anon key is sufficient.

### Pitfall: Lovable re-commits `.env`.

This repo is connected to Lovable, which auto-commits changes from the visual editor. If Lovable was configured to re-write `.env` on each change, untracking it client-side won't help — the next Lovable commit will re-add it. Check Lovable's project settings; either tell it not to manage `.env`, or accept that you'll have to enforce gitignore on its commits via a server-side hook.

## Rollback

Restore `.env` from a backup or from prior git history. Local dev continues to work either way; this change is primarily about policy, not execution.

## Verification checklist

- [ ] `git ls-files | grep -E '^\.env$'` returns nothing.
- [ ] `git check-ignore .env` returns `.env` (proves gitignore matches).
- [ ] `.env.example` exists, lists all keys with empty/placeholder values.
- [ ] Fresh clone + `cp .env.example .env` + filling values → `npm run dev` works.
- [ ] Pre-commit hook (gitleaks or equivalent) installed in the repo.
- [ ] CI passes with no committed `.env`.
- [ ] Supabase anon key rotated in dashboard; all clients reload with new key.
