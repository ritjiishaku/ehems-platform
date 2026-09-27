import tokens from '../tokens.json';

/**
 * Resolves a colour role to a literal, for the few places CSS cannot be used.
 *
 * A `<meta name="theme-color">` needs a literal string, so it cannot reference
 * `var(--color-primary)`. Hardcoding the hex there is exactly the drift this
 * repo's token pipeline exists to prevent: the meta colour would silently stop
 * matching the brand, and nothing would fail. So the value is derived from
 * tokens.json at build time, which makes the hex impossible to get wrong and
 * impossible to leave behind when the brand pack arrives (ASM-001, D-15).
 *
 * Follows the same `{color.palette.*}` reference chain that
 * scripts/build-tokens.js resolves, so both read one source of truth.
 *
 * Server-only: importing this pulls tokens.json into the server bundle. It must
 * not be imported from a client component.
 */

/** HSL as the token palette writes it: `hsl(218, 74%, 15%)`. */
function hslToHex(value: string): string | null {
  const match = value.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i);
  if (!match) return null;

  const h = parseFloat(match[1]) / 360;
  const s = parseFloat(match[2]) / 100;
  const l = parseFloat(match[3]) / 100;

  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const secondary = chroma * (1 - Math.abs(((h * 12) % 2) - 1));
  const offset = l - chroma / 2;

  const sector = Math.floor(h * 12) % 6;
  const rgb = [
    [chroma, secondary, 0],
    [secondary, chroma, 0],
    [0, chroma, secondary],
    [0, secondary, chroma],
    [secondary, 0, chroma],
    [chroma, 0, secondary],
  ][sector];

  return `#${rgb
    .map((channel) =>
      Math.round((channel + offset) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function resolve(path: string, node: unknown): string | null {
  let current: unknown = node;
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null) return null;
    current = (current as Record<string, unknown>)[key];
  }
  if (typeof current !== 'string') return null;

  const reference = current.match(/^\{([^}]+)\}$/);
  return reference ? resolve(reference[1], tokens) : current;
}

/** The hex value of a colour role, e.g. `roleHex('color.role.light.primary-color')`. */
export function roleHex(path: string): string {
  const value = resolve(path, tokens);
  if (value === null) {
    throw new Error(`roleHex: no token at "${path}"`);
  }
  const hex = hslToHex(value);
  if (hex === null) {
    throw new Error(`roleHex: "${path}" resolved to "${value}", which is not an hsl() colour`);
  }
  return hex;
}
