import { describe, expect, it } from 'vitest';
import { roleHex } from '@/lib/theme';
import tokens from '@/tokens.json';

/** Walks a dotted path through the token source, following `{a.b.c}` references. */
function rawToken(path: string): string {
  let node: unknown = tokens;
  for (const key of path.split('.')) {
    node = (node as Record<string, unknown>)[key];
  }
  if (typeof node !== 'string') throw new Error(`${path} is not a leaf`);
  const reference = node.match(/^\{([^}]+)\}$/);
  return reference ? rawToken(reference[1]) : node;
}

describe('roleHex', () => {
  /**
   * Pinned conversions. The HSL -> RGB reduction has to take both its sector
   * index and its second component from `h * 6`; deriving them from `h * 12`
   * rotates every colour without raising an error, which is how navy.900 came
   * out as an olive. These four sit in four different sectors of the wheel, and
   * each expected value has the channel ordering its hue demands — blue with
   * the highest blue channel, amber with the highest red — so a rotation
   * cannot satisfy them all by accident.
   */
  it.each([
    ['color.role.light.primary-color', '#0a1f43', 'hsl(218, 74%, 15%)'],
    ['color.role.light.secondary-color', '#7a5800', 'hsl(43, 100%, 24%)'],
    ['color.role.light.tertiary-color', '#7d4a8c', 'hsl(286, 31%, 42%)'],
    ['color.role.light.on-surface-color', '#1f1e19', 'hsl(48, 11%, 11%)'],
  ])('resolves %s to %s', (path, hex, hsl) => {
    // Guard the premise first: the expectation is only meaningful if the token
    // still holds the colour being pinned.
    expect(rawToken(path)).toBe(hsl);
    expect(roleHex(path)).toBe(hex);
  });

  it('throws rather than guessing when a role is missing', () => {
    expect(() => roleHex('color.role.light.no-such-role')).toThrow(/no token at/i);
  });

  it('follows the reference chain from role to palette primitive', () => {
    // A role pointing at a primitive must agree with that primitive directly,
    // otherwise the two resolution paths have drifted apart.
    expect(roleHex('color.role.light.primary-color')).toBe(roleHex('color.palette.navy.900'));
  });
});
