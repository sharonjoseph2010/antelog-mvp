# 15 — Sanitise edge function error messages

> Patch: [`SECURITY_REMEDIATION.md` §15](../SECURITY_REMEDIATION.md#15-edge-function-error-messages)

## Why this matters

Most edge functions catch errors and return:

```ts
return new Response(JSON.stringify({ error: error.message }), { status: 500 });
```

That returns the raw exception text. For DB errors, that text includes:

- Table names
- Column names
- Constraint names (`users_email_unique`)
- Foreign-key relationships
- RLS policy names (`new row violates row-level security policy "owner_can_update"`)
- Query syntax (sometimes Postgres echoes the offending SQL)

For LLM errors:

- API endpoint URLs
- Sometimes API key fragments in retry error messages
- Internal model names

This is **information disclosure**: it gives an attacker a free schema and policy enumeration. Combined with RLS policy names, it tells them *which policies exist and what they're called*, which dramatically speeds up writing the SQL injection or RLS-bypass payload that probes the policy in detail.

Sanitising error messages doesn't fix the underlying bug; it removes the attacker's free recon.

## What might break

- **Debugging gets harder.** "Internal error" tells a developer nothing. Compensate by improving server-side logging — the error went somewhere, just not to the client.
- **Bug reports lose detail.** Users can no longer paste the error text and have it be actionable. Provide a correlation ID:

  ```ts
  const errorId = crypto.randomUUID();
  console.error(`[${errorId}] error in function-x:`, err);
  return new Response(JSON.stringify({ error: 'Internal error', errorId }), { status: 500 });
  ```

  Then a user reporting "I got error abc-123-def-456" gives the developer a grep target.
- **Frontend error handling.** If the SPA shows `error.message` in toast notifications, generic strings degrade UX. Map known error categories (auth, network, validation) to specific messages on the client; only show the generic one as a fallback.

## Gotchas

- **`throw new Error('userId is required')` vs `throw error` from supabase-js.** Your own validation errors are safe to surface (you wrote the string, you know what's in it). Library/DB errors aren't. Differentiate:

  ```ts
  try { ... } catch (err) {
    if (err instanceof ValidationError) {
      return new Response(JSON.stringify({ error: err.message }), { status: 400 });
    }
    console.error('[fn] unexpected:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
  ```

- **HTTP status code leakage.** A 401 vs 403 vs 404 distinction can be an enumeration oracle. For "this thing doesn't exist OR you can't access it," prefer 404 across both cases; for auth-required endpoints, 401 is fine.
- **Stack traces in logs vs response.** Always log the stack trace server-side (`console.error(err)` includes it for `Error` instances). Never return the stack in the response.
- **`error.cause` chain.** Modern JS errors can carry a `cause`. Recursively unwrapping for logging is fine; serializing for response is dangerous.
- **Edge function platform error pages.** When a function crashes outside your try/catch (timeout, OOM), Supabase returns its own error format. Generally generic, but worth verifying.

## Common pitfalls

### Pitfall: Returning sanitised but leaky messages.

```ts
return new Response(JSON.stringify({
  error: 'Failed to update user',
  user_id: requestedUserId,    // leaks the target ID
  table: 'profiles',           // leaks the table
}), { status: 500 });
```

Be paranoid about the entire response shape, not just `message`.

### Pitfall: Logging client-controlled fields without escaping.

If you `console.log('user provided:', body.input)` and `body.input` contains shell escape sequences or ANSI codes, the log file can be poisoned. Use structured logging:

```ts
console.error('error in function', { errorId, fn: 'ai-smart-suggestions', input_len: body.input?.length });
```

Avoid logging full input — log a hash or length instead, unless you have a specific debug session active.

### Pitfall: `Sentry.captureException(err)` exposing user data.

Error trackers ingest the full error including any user-supplied content embedded in the message. Configure Sentry's `beforeSend` to strip likely-PII fields, and don't include user content in error messages on the throw side.

### Pitfall: Different functions, different error envelopes.

`{ error: '...' }` vs `{ message: '...' }` vs `{ error: { message: '...' } }`. Clients have to handle all three. Standardise in `_shared/response.ts`:

```ts
export function errorResponse(status: number, error: string, details?: object) {
  return new Response(JSON.stringify({ error, ...details }), { status, headers: {...} });
}
```

### Pitfall: Errors that *are* the response in success paths.

If `merge-recommendations` returns `{ success: true, merged: 5 }` on success but `{ error: 'merged 0 because of conflicts' }` on partial failure, the same shape is ambiguous. Use explicit `status: 200 | 4xx | 5xx` semantics and standardise the partial-success case.

### Pitfall: Localised error messages.

If you ever localise, don't translate the server's generic "Internal error" string; it's an opaque marker that bug-report-pasting users will use. The user-facing toast can be localised; the server response stays English.

### Pitfall: Differentiable timing under errors.

If a "user not found" error returns in 5ms and an "auth failure" returns in 200ms (because of a bcrypt comparison), the timing leaks which one happened. Generally not exploitable here, but worth being aware of for auth flows.

### Pitfall: CORS headers missing on error responses.

A 500 response without `Access-Control-Allow-Origin` triggers a CORS error in the browser, masking the actual 500. Always include CORS headers in error responses, even when the function failed partway.

## Product behavior changes

- Users see generic error messages with a correlation ID; bugs are still debuggable via the ID.
- API consumers no longer get schema details from probe-style requests.
- Debugging in dev relies on Supabase function logs rather than client-side error toasts.

## Verification checklist

- [ ] Every `catch` block in `supabase/functions/*/index.ts` returns a generic message + errorId.
- [ ] Server-side logs (Supabase Functions dashboard) show the full error including stack.
- [ ] No table names, column names, or policy names appear in any HTTP response body for a 500.
- [ ] Validation errors (4xx) preserve the developer-written message; library/DB errors (5xx) do not.
- [ ] Frontend error toasts gracefully handle "Internal error" as a fallback.
- [ ] All error responses include CORS headers.
