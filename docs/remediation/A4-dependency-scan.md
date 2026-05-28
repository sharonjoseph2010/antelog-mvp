# A4 — Dependency CVE scan

> Patch: [`SECURITY_REMEDIATION.md` §A4](../SECURITY_REMEDIATION.md#a4-dependency-scan)

## Why this matters

The review explicitly excluded supply-chain. That doesn't mean there isn't risk — only that the desk audit didn't cover it. `package.json` has 60+ direct dependencies; transitive count likely north of 1000. Any of them can carry a CVE, a malicious update, or a typo-squat.

Recent ecosystem events (event-stream, ua-parser-js, colors.js, the various `node-ipc` incidents) demonstrate that **trusted-looking packages can be hijacked**. Token-grabber payloads target browser localStorage — which, per [#13](./13-session-csp.md), is where your auth tokens live. Supply chain is a credible threat vector even if you write perfect application code.

The remediation is two-fold:

1. **One-time scan** to find existing CVEs and decide which to patch.
2. **Ongoing process** so new CVEs and dependency drift get caught.

## What's in scope

| Surface | Tool | Cadence |
|---------|------|---------|
| Direct + transitive npm deps | `npm audit`, `snyk test`, Dependabot | Per PR + weekly |
| Container base images | Trivy, Grype | Per build |
| Supabase edge function Deno deps | `deno info --json`, manual review | Per change |
| GitHub Actions workflows | Pin to commit SHAs, not floating tags | Per change |
| Lockfile integrity | `npm ci` (not `npm install`) in CI | Per build |

## What might break

- **Upgrading a major version of a major dep can be invasive.** A Radix UI major bump may break component APIs. Don't auto-update major versions; review them. Use Dependabot with `versioning-strategy: lockfile-only` to flag without merging.
- **Some CVEs are unfixable without dropping the dep.** A library may have an unpatched CVE that affects you only in a specific code path. Decide: live with it (annotated), or replace the lib.
- **False positives.** Many CVEs in transitive deps don't apply to browser code (e.g., a server-side template injection in a build tool). `npm audit --omit=dev` reduces noise; further suppression via `.snyk` file or audit overrides.
- **`overrides` in `package.json` can break peer deps.** Forcing a sub-dep to a newer version may violate peer ranges and cause runtime weirdness. Test thoroughly.

## Gotchas

- **`bun.lockb` vs `package-lock.json`.** This repo has both. They can drift if developers use different package managers. Pick one as canonical, gitignore the other.
- **`@supabase/supabase-js` version drift.** The Supabase team ships breaking changes occasionally. Pin to a known-good major version and review each upgrade.
- **`react-helmet-async` and other deprecated-ish packages.** Some deps in this codebase are nominally maintained but rarely updated. They're not CVEs today but they will be tomorrow. Plan replacements.
- **Lockfile injection.** A malicious PR can rewrite `package-lock.json` to point to a different tarball with the same version. CI should run `npm ci` against the lockfile and `npm audit signatures` (when available) to verify package integrity.
- **GitHub Actions deps.** `uses: actions/checkout@v4` is a floating tag. A compromised action can run arbitrary code in CI with secrets access. Pin to a commit SHA: `uses: actions/checkout@a5ac7e51b41094c92402da3b24376905380afc29  # v4.1.7`.
- **Edge function Deno imports.** `https://esm.sh/@supabase/supabase-js@2` is also a floating tag. Pin to a specific version: `@supabase/supabase-js@2.54.0`. Floating means a future release could be malicious and you'd auto-pick it up.

## Common pitfalls

### Pitfall: Running `npm audit fix --force`.

`--force` runs major version upgrades, breaking your app silently. Always review the changes. Better: `npm audit fix` (non-breaking only), then evaluate the remaining vulns case-by-case.

### Pitfall: Ignoring "low" severity findings indefinitely.

Low-severity vulns aggregate over time. The annual "review the audit log" review finds 47 low items and gives up. Triage immediately: fix, suppress with annotation, or accept-with-rationale. Don't let the queue grow.

### Pitfall: Suppressions without expiry.

`"ignore": { "*": { "reason": "not exploitable in our usage" } }` — fine, but with no expiry, you'll forget. Use Snyk's `expires` field or a manual review calendar.

### Pitfall: Treating `npm audit` as the whole answer.

`npm audit` covers known CVEs in the npm registry. It doesn't cover:

- Typo-squatted packages (`reaqt`, `lodassh`).
- Backdoored maintainer accounts.
- Malicious-but-undisclosed packages.

Add `socket.dev` or similar that surface broader supply-chain signals.

### Pitfall: Dependabot PRs piling up.

Without review discipline, 200 open Dependabot PRs become noise that hides important ones. Auto-merge patch versions of trusted packages (Dependabot supports this). Review minors and majors manually.

### Pitfall: Pinning so tight that security patches don't come in.

`^1.2.3` allows patches; `~1.2.3` allows the same; `1.2.3` (exact) does not. Exact pins block automatic patch uptake. Use `^` in `package.json`; lockfile pins specifics.

### Pitfall: `lovable-tagger` and other Lovable-specific deps.

This repo includes `lovable-tagger` and is connected to the Lovable platform. Audit Lovable's deps the same way; Lovable controls some of the build pipeline. Confirm Lovable's security disclosure process and SLA.

### Pitfall: `bun.lockb` binary diffs are unreviewable.

Code review can't visually verify a binary lockfile. If you keep bun.lockb, also generate `bun.lock` (text) and gitignore the binary. Or commit to one package manager and remove the other lockfile.

### Pitfall: CI failing on every CVE.

If CI fails the build on any audit finding, releases stop the day a high-severity CVE drops in a transitive dep that doesn't affect you. Configure the threshold (e.g., fail on critical, warn on high) and have an escalation path.

### Pitfall: SCA tool noise around dev-only deps.

Dev tools (eslint plugins, build tools) have CVEs too, but they don't ship to users. `--omit=dev` filters; or run a separate scan for runtime vs build-time and treat them differently.

## Process

1. **One-time:**
   - Run `npm audit --omit=dev --json > audit-baseline.json`. Triage every finding.
   - Run `snyk test` and `socket.dev scan` for broader coverage.
   - Audit GitHub Actions workflows; pin to SHAs.
   - Audit Deno imports in edge functions; pin to exact versions.
2. **Ongoing:**
   - Dependabot enabled, weekly cadence, auto-merge for `dependencies` of trusted scopes.
   - CI runs `npm audit --audit-level=high` on every PR.
   - Quarterly review of accepted suppressions; revisit each.

## Verification checklist

- [ ] `npm audit --omit=dev` shows zero high/critical findings (or each has a documented suppression).
- [ ] `bun.lockb` and `package-lock.json` reconciled to one canonical lockfile.
- [ ] GitHub Actions all pinned to commit SHAs.
- [ ] Edge function Deno imports all pinned to exact version tags.
- [ ] Dependabot configured with auto-merge for patch updates.
- [ ] Quarterly suppression review on the calendar.
