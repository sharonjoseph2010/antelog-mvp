# 17 — `GuestResponse` Zod validation

> Patch: [`SECURITY_REMEDIATION.md` §17](../SECURITY_REMEDIATION.md#17-guestresponse-form--zod-validation)

## Why this matters

`GuestResponse.tsx` is the only user-facing form without Zod validation. It collects:

- `contributor_name` — free text
- `contributor_contact` — free text (phone or email)
- `recommendation` — free text, the actual contribution

The current validation is `if (contributorName.trim() === '')` at the submission site. That allows:

- Names of any length, including 10MB strings that DOS the renderer.
- Names containing arbitrary characters, including null bytes, control sequences, or HTML.
- Recommendations of any length, which become rows in `guest_contributions` that the owner views later.
- Contact fields with no format validation, leading to garbage data that's worthless when the owner tries to follow up.

This is the riskiest input surface in the app because:

1. The form is reachable by *anyone with the share link* — no auth required.
2. The data lands in a table viewed by the owner, who is an authenticated user. So untrusted input crosses an authentication boundary.
3. There's no existing layer doing this validation. Other forms have Zod; this one doesn't.

## What might break

- **Submissions with unusually long content.** Users who were typing long recommendations may hit the new max-length. Set the cap generously (e.g., 2000 chars) and surface it as a character counter.
- **Submissions with no contact info.** The current form may have accepted blank contact; the schema makes that optional. Confirm the product intent.
- **Phone/email format strictness.** Zod's `.email()` is fairly strict (rejects some legitimate addresses). A laxer regex may be better for international addresses.
- **Existing submitters mid-session.** A user with a half-typed form will keep typing after deploy; the validation runs at submit time, so they'll see new errors. Mostly fine.

## Gotchas

- **Names with non-Latin characters.** `^[a-zA-Z\s]+$` rejects every non-Latin script. Use a Unicode-aware regex (`\p{L}` with the `u` flag) or simply allow most characters with a length cap.
- **Emoji in names.** Some users legitimately use emoji. Accepting them is fine; storing them requires UTF-8 columns (Supabase defaults are UTF-8). Length caps in chars vs codepoints vs bytes differ.
- **Contact field ambiguity.** If `contributor_contact` accepts phone OR email, validation logic is "match one of these patterns." Use a union:

  ```ts
  z.union([
    z.string().email(),
    z.string().regex(/^\+?[0-9\s\-()]{7,20}$/),
  ])
  ```

  Or normalise: detect intent, transform, validate the normalized form.
- **Server-side validation must mirror client-side.** Zod in the SPA prevents bad UX; the SECURITY DEFINER RPC (see [#06](./06-guest-contributions.md)) must also validate, since clients can be bypassed. Don't trust the client even when you wrote it.
- **HTML in recommendation text.** Users may paste rich content (line breaks, URLs). The schema should accept newlines but cap length. Rendering — separate concern — should escape via React JSX (which it does).
- **Profanity / abuse filter.** Out of scope here, but the open-to-anyone form is a vector for spam. Consider rate-limiting per share link (see [#10](./10-rate-limiting.md)) and adding a basic moderation queue.

## Common pitfalls

### Pitfall: Adding Zod on the client but not the server RPC.

Bypass: a determined attacker calls the RPC directly without the SPA. If the RPC doesn't validate, bad data lands. Both layers must validate the same thing. Express the schema once in TypeScript (Zod) for the client, and once in SQL (`CHECK` constraints + RPC body) for the server.

### Pitfall: `z.string().min(2)` rejecting "Al" or "Bo".

People have short legitimate names. `.min(1)` is usually right for human names; reserve longer minimums for fields where 1 character is implausible (e.g., recommendations).

### Pitfall: Trimming after validation instead of before.

```ts
z.object({ name: z.string().min(1) }).parse({ name: '   ' });  // passes — 3 chars
```

The whitespace passes, then `.trim()` makes it empty. Either trim in a Zod `.transform()` or trim before validating:

```ts
z.string().min(1).transform(s => s.trim()).refine(s => s.length > 0, 'name required')
```

### Pitfall: Email regex from Stack Overflow.

Don't write your own. `z.string().email()` uses an RFC-compatible regex that's good enough for 99% of cases. Custom regex inevitably rejects something valid or accepts something invalid.

### Pitfall: Localized error messages embedding the input.

```ts
.min(1, { message: `Name "${value}" is too short` })   // can't reference value in Zod messages
.min(1, { message: 'Name is required' })               // safe
```

If you build custom messages with template strings around user input, you may be embedding XSS-relevant content in the error toast. React's auto-escaping covers this, but it's a bad habit.

### Pitfall: Schema rejecting clipboard pastes.

Users often paste a phone number with formatting (`(555) 123-4567`). Stripping non-digits before validating is friendlier than rejecting:

```ts
.transform(s => s.replace(/\D/g, ''))
.refine(s => s.length >= 7 && s.length <= 15, 'invalid phone')
```

### Pitfall: Sync between client schema and database column types.

If the client allows 2000-char recommendations and the column is `varchar(500)`, server errors on insert. Either set the schema to match the column or widen the column. Prefer widening — char limits in DBs are usually arbitrary.

### Pitfall: Error display swallowed by react-hook-form integration.

`useForm` with `zodResolver` populates `formState.errors`. If the JSX doesn't render those errors, validation runs silently and submission fails with no user feedback. Always render `errors.fieldName?.message` next to each input.

### Pitfall: Token rate-limit incentivising guess-and-submit.

After tightening, a bad actor can still spam *bad* submissions. The rate limiter on the RPC ([#10](./10-rate-limiting.md)) covers this. Validation alone doesn't stop abuse.

## Product behavior changes

- Submitting a 100k-character recommendation fails fast with a character-count error.
- Empty or whitespace-only names are rejected with a clear message.
- Contact field with garbage is rejected; with a valid phone or email, accepted.
- Owners see cleaner, more useful guest contributions.

## Verification checklist

- [ ] Submitting a blank `contributorName` shows an inline error.
- [ ] Submitting a 10,000-character `recommendation` shows a max-length error.
- [ ] Submitting whitespace-only fields fails.
- [ ] Valid submission produces a `guest_contributions` row with trimmed, validated content.
- [ ] Same validation runs server-side in the RPC (test by calling RPC directly with bad input).
- [ ] Character counters or hints visible next to fields with limits.
