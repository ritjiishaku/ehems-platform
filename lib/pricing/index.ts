/**
 * Tier and upgrade money maths, as pure functions with no framework imports.
 *
 * Everything here is importable without a database, a session, or a request. The
 * caller supplies the member facts as a plain `PricingMember` value object and
 * owns loading them.
 *
 * Governing: `AGENTS.md` §3, `.agents/rules/architecture.md`.
 */

export * from './types';
export * from './tiers';
export * from './discount';
export * from './upgrade';
