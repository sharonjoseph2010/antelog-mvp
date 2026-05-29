---
name: Semantic colour system
description: Global four-colour semantic system (trust/info/attention/danger). Defines when each colour may and may not be used.
type: design
---
Four semantic colours, each with exactly one job. Defined as CSS vars in src/index.css and Tailwind tokens (`trust`, `info`, `attention`, `danger`) in tailwind.config.ts. Use the utility classes `.trust-surface`, `.info-surface`, `.attention-surface`, `.danger-surface` (each sets bg + 0.5px border + text in one go).

- **Trust (green #EAF3DE/#C0DD97/#27500A, avatar #97C459/#173404)** — ONLY when the system has surfaced a relevant person from the user's network: expert nudge pills, matching expertise/city tags, connection-degree badges, verified indicators. Never for success, confirmations, or CTAs.
- **Info (blue #E6F1FB/#B5D4F4/#0C447C)** — system messages, tips, notification dot, unread indicators. Never for trust or success.
- **Attention (amber #FAEEDA/#FAC775/#633806)** — pending verification, expiring requests, actions not yet completed. Never for errors or trust.
- **Danger (red #FCEBEB/#F7C1C1/#791F1F)** — destructive/error only (delete, remove, close request, error toasts). Sparingly. Never for notifications or trust.

Opacity rule: surfaces always use the lightest stop. Colour lives in border + text, never as a saturated fill.

Everything else is black + white: primary CTAs = black filled / white text, secondary CTAs = neutral outlined. No colour on labels, headers, body text, or decorative elements.

Master Directory: no colour signals at all — contributions are anonymous.

When auditing or adding components, never reach for raw Tailwind palette classes (`bg-green-*`, `text-amber-*`, `border-blue-*`, `bg-orange-*`, `text-yellow-*`, etc.) for these meanings — use the semantic tokens/utilities.
