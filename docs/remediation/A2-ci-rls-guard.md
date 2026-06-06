# A2 — CI guard against `DISABLE ROW LEVEL SECURITY`

> Patch: [`SECURITY_REMEDIATION.md` §A2](../SECURITY_REMEDIATION.md#a2-ci-guard-against-future-rls-disable)

## Why this matters

The root cause of the P0 in [#01](./01-reenable-rls.md) was a single migration that disabled RLS globally for "MVP testing." It landed in the main branch with a self-labelled "MUST be re-enabled before production" warning that nobody acted on. The migration was reviewed (presumably), merged, and forgotten.

This is a process failure that no amount of one-off remediation can prevent recurring. The fix is a CI gate that *blocks* new migrations containing `DISABLE ROW LEVEL SECURITY`. If someone has a legitimate reason (rare), they can override with an explicit commit-message marker or label, and that override becomes visible in PR review.

The principle: **prevent the class of bug, not the instance.**

## What might break

- **A legitimate need to disable RLS, e.g., during a complex policy migration.** This is rare enough that going through an override is acceptable. Worth documenting the override mechanism in the PR template.
- **Migrations that contain "DISABLE ROW LEVEL SECURITY" in a comment** (e.g., quoting the previous bad migration in a fix-up). The regex will fire on the comment. Fix: require the literal SQL statement, not the substring. Use a Postgres-aware parser for true accuracy, or accept the false positive and use an inline override on the PR.
- **PRs from forks.** Some CI configurations don't run on fork PRs. Confirm the guard runs on every PR including forks (read-only, no secrets needed).

## How the guard works

```yaml
- name: Reject DISABLE ROW LEVEL SECURITY
  run: |
    if git diff origin/${{ github.base_ref }}...HEAD -- supabase/migrations/ \
         | grep -E '^\+[[:space:]]*ALTER[[:space:]]+TABLE.*DISABLE[[:space:]]+ROW[[:space:]]+LEVEL[[:space:]]+SECURITY'; then
      echo "::error::Migration disables RLS."
      exit 1
    fi
```

The `^\+` ensures only added lines match. The pattern is loose enough to catch typo variants (`disable row level security`, mixed case, whitespace).

## Gotchas

- **`git diff origin/main...HEAD`** vs `origin/main..HEAD`. Three dots gives merge-base diff (what's in HEAD that's not in main's history); two dots gives raw diff. Three dots is correct for "what does this PR add."
- **Shallow checkouts.** Default GitHub Actions checkouts are shallow (depth 1). `git diff` against `origin/main` may fail. Use `actions/checkout@v4` with `fetch-depth: 0`.
- **The regex matches uppercase only by default.** SQL is case-insensitive but our diff is text. Use `grep -iE` or include both cases.
- **The guard is bypassable with `--no-verify` on the merge commit.** GitHub Actions runs on the PR head ref, so a maintainer can technically force-merge anyway. CODEOWNERS + required-status-checks closes that loophole — make the guard a required check.
- **False positives from documentation/migration comments.** If a migration includes a SQL comment like `-- previously we did DISABLE ROW LEVEL SECURITY`, the loose regex fires. Tighten to only match outside SQL comments, or accept and document the override path.
- **The guard runs once per push, not per commit in the PR.** A bad migration mid-PR-history that's later reverted still trips the guard if it's still in the diff between main and head. That's actually desired: even reverted, the bad state shouldn't appear in the diff range.

## Common pitfalls

### Pitfall: Making the override mechanism too easy.

A label `allow-rls-disable` that anyone can add defeats the guard. Make the override require a SecOps reviewer's approval, or a commit footer that's explicitly checked:

```yaml
- name: Check override
  if: failure()
  run: |
    if git log origin/${{ github.base_ref }}..HEAD --format=%B | grep -q '^Override-RLS-Guard: '; then
      echo "Override present; allowing."
      exit 0
    fi
    exit 1
```

The footer is hard to add by accident. The reviewer sees it in the commit message.

### Pitfall: Not adding the guard until after the fix.

Adding the guard first means the [#01](./01-reenable-rls.md) re-enable migration must not trip the guard. It shouldn't — it's `ENABLE`, not `DISABLE` — but the order matters if the regex is too broad.

### Pitfall: Treating CI guards as security boundaries.

The guard is a *process* check, not a security control. Someone with merge access can bypass. It catches accidents, not motivated insiders. Don't argue against more substantive controls (RLS itself) because "the guard will catch it."

### Pitfall: One-off migrations needing to run with RLS off temporarily.

```sql
-- backfill a column for all users
ALTER TABLE x DISABLE ROW LEVEL SECURITY;
UPDATE x SET new_col = old_col;
ALTER TABLE x ENABLE ROW LEVEL SECURITY;
```

The guard fires because of the literal `DISABLE` line. Two options:

1. Don't disable RLS at all — use a SECURITY DEFINER function that the migration runner has explicit grants on, which can update across rows.
2. Use the override mechanism for this one migration, and have the reviewer confirm the re-enable is in the same file.

Prefer (1) — temporary disable + re-enable is a footgun even when both halves are present.

### Pitfall: Reviewer fatigue.

If the guard fires often (e.g., due to false positives), reviewers start rubber-stamping overrides. Tighten the regex over time as you observe false positive patterns.

### Pitfall: Not extending the pattern to sibling foot-guns.

`DROP POLICY` without a replacement, `GRANT ... TO anon` without a corresponding RLS policy, `SECURITY DEFINER` functions without explicit `REVOKE FROM PUBLIC` — all in the same family. Extend the guard incrementally. Start with the highest-impact (RLS disable) and add others as patterns emerge.

### Pitfall: Migrations in non-standard locations.

If anyone puts SQL outside `supabase/migrations/`, the guard misses it. Either restrict the guard to that directory and enforce it as the only SQL location, or extend the path glob.

### Pitfall: Branch protection not enforcing the check.

Adding the workflow doesn't make it required. Go to repo settings → Branches → Branch protection rules → Require status checks → add the guard's job name. Without this, the guard fires but doesn't block merge.

## Product behavior changes

- None at the application layer.
- PR workflow gains a check; bad migrations get caught at PR time instead of in prod.

## Verification checklist

- [ ] CI workflow file exists at `.github/workflows/security-guard.yml`.
- [ ] Test PR with `ALTER TABLE x DISABLE ROW LEVEL SECURITY` → check fails with clear error.
- [ ] Test PR with valid migrations → check passes.
- [ ] Test PR with `Override-RLS-Guard:` footer → check passes (if override mechanism implemented).
- [ ] The check is marked required in branch protection settings.
- [ ] CODEOWNERS includes a security reviewer for `supabase/migrations/`.
