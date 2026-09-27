---
name: code-style
description: TypeScript, naming, component, money, date, error, validation, and async conventions for EHEMS. Use when writing or reviewing any TypeScript, naming a file, handling money or dates, or deciding where validation and error handling belong.
---

# Code Style

## TypeScript

- `strict: true`. No `any`. No `as` casts to silence errors — fix the type.
- Prefer `type` for data shapes, `interface` for extensible contracts.
- Discriminated unions for state machines. Model `Payment.status` as a
  union, not a loose string.
- `unknown` at boundaries, narrowed immediately. Note that
  `await req.json()` is typed `any` — assign it to `unknown` before parsing,
  otherwise the Zod call is narrowing an `any` and the boundary type is a
  fiction:

  ```ts
  const raw: unknown = await req.json();
  const parsed = subscribeSchema.safeParse(raw);
  ```

## Naming

- Files: `kebab-case.ts` for modules, `PascalCase.tsx` for components.
- Functions: `camelCase`, verb-first — `verifyPayment`, `markAttendance`.
- Booleans: `is`/`has`/`can` prefix — `isVerified`, `hasCompletedTier`.
- DB columns: `snake_case`. Prisma models are camelCase and map explicitly —
  **Prisma does not convert for you.** Every field that hits the database
  needs `@map("snake_case_name")` and every model needs
  `@@map("snake_case_table")`. Without it the physical schema is camelCase
  and will not match PRD §16.
- Zod schemas: `thingSchema`, inferred type `Thing`.

## Components

- Server components by default. `"use client"` only for interactivity.
- Keep client components small and leaf-most. Push data fetching upward.
- No business logic in components. Call a `lib/` function or a server action.
- No hardcoded money or hex values in components — take amounts from
  `lib/pricing/`, colours from the token roles.
- Props typed inline for simple cases, named `type` when reused.

## Money

```ts
type Kobo = number & { readonly __brand: "Kobo" };
```

The brand is a compile-time nudge, not a guarantee — it cannot prove a value
is integral. The real enforcement is: integer kobo everywhere, a lint rule
against float money literals, and kobo-integer assertions in tests.

Never do arithmetic on money outside `lib/pricing/`. Never format money
inside a component — use `formatNaira(kobo)` from `lib/format/`.

## Dates

- Store UTC. Render WAT (UTC+1). `formatDate(d, 'wat')`.
- Never construct dates from strings without a timezone.

## Errors

- Throw typed errors from `lib/`. Route handlers map them to HTTP codes.
- Never leak internal messages to the client. Log the detail, return a
  generic message plus a correlation ID.
- **There is no balance, wallet, or stored value in Phase 1** — payment is a
  manual bank transfer verified by an admin. Do not write
  "insufficient balance" branches, payment-capture methods, or retry logic;
  they are Phase 2 gateway concepts and they rot.
- Expected failures (validation, a state conflict the caller must branch on)
  return values where a return is natural, and throw typed domain errors
  where it is not. Be consistent per module: pick one and hold it. A
  `ConflictError` thrown from `lib/` maps to 409 in `lib/http/`.

## Validation

Every route handler and server action starts with a Zod parse — after
authorisation, not before:

```ts
const session = await requireSession();
const raw: unknown = await req.json();
const parsed = subscribeSchema.safeParse(raw);
if (!parsed.success) return badRequest(parsed.error);
```

Schemas live in `lib/validation/`, shared between client and server.
Client-side validation is UX. Server-side is truth. Do both.

**Shape, not business rules.** A schema validates structure — is this a
string, is this a positive integer, does the email parse. A schema must not
encode a business rule (minimum rejection-reason length, minimum attendance
threshold). Those belong in `lib/`, because a schema that ships to the client
discloses the rule and can be bypassed — and because a schema is not the
place a rule is enforced anyway.

**Never accept a money amount from the client.** The amount is fixed at
creation from `lib/pricing/`. If a route receives an amount, that is a bug.
Any money schema in `lib/validation/` is therefore suspect: if one is truly
needed, it takes an integer kobo amount, is `.positive()` (not
`.nonnegative()` — a ₦0 payment is not a valid `Payment`), and has an upper
bound.

**One definition.** The Nigerian phone regex lives once, in
`lib/validation/`. It is duplicated nowhere, it normalises spaced input before
validating, and the normalised form is what gets stored (SEC-019).

## Async

- `async/await` only. No raw `.then()` chains.
- Parallel independent work with `Promise.all`.
- Never `await` inside a loop when the iterations are independent.
- Never `await` external I/O inside a database transaction — see
  [email-notification/SKILL.md](../skills/email-notification/SKILL.md) for
  the after-commit pattern.

## Comments

Explain _why_, not _what_. The one place comments are mandatory:

```ts
// BR-005: Advanced discount is not combinable with upgrade difference.
```

Tag non-obvious business logic with its PRD rule ID. The next reader
needs to know whether it's safe to change.

