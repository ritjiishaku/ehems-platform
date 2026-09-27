#!/usr/bin/env node
'use strict';

/**
 * Design token build step.
 *
 *   node scripts/build-tokens.js [input.json] [output.css] [--check] [--font-import]
 *
 *   --check         verify the generated CSS matches the token source, exit 1 if stale
 *   --font-import   emit the Google Fonts @import rule (off by default; prefer next/font)
 *
 * Colour handling
 * ---------------
 * The colour system has two layers:
 *   - primitives - raw palette tones (color.palette.navy.700, ...)
 *   - roles      - semantic slots the UI is allowed to reference
 *                  (primary, on-primary, surface-container-high, ...)
 *
 * Roles may point at primitives with a {color.palette.navy.700} reference. Those are
 * resolved here, at build time, and the primitives themselves are never written to
 * CSS: the UI depends on roles only.
 *
 * Any other group (typography, spacing, radius, shadows) is emitted one custom
 * property per leaf. A group may declare `light`/`dark` sub-objects to vary by
 * theme, in which case the dark values land in the dark blocks only.
 *
 * Keys beginning with `$` are metadata (DTCG `$value`, `$description`, ...) and are
 * never emitted. A `$value` key is read as the leaf value.
 *
 * Every build runs a WCAG 2.1 AA contrast audit over the role pairs; violations
 * fail the build so an inaccessible palette cannot ship (PRD UX-002).
 *
 * Failure modes
 * -------------
 * A missing custom property is worse than a stale stylesheet, because a stale
 * stylesheet is detectable and a missing property is not. So the build stops,
 * without writing output, when it cannot produce what the token source asks for:
 *
 *   - a reference that resolves to nothing, or resolves in a circle
 *   - two groups that derive the same custom property name
 *   - a contrast audit that checked no pairs at all (nothing verified is not
 *     the same as nothing wrong)
 *
 * Contrast violations still write the file, so the failing pair can be read in
 * context, and then exit non-zero.
 *
 * Anything recoverable - a tone with no exact match, an unrecognised grouping key
 * - is a warning.
 */

const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
const positional = argv.filter((arg) => !arg.startsWith('--'));

const CHECK = flags.has('--check');
const FONT_IMPORT = flags.has('--font-import');

const INPUT = path.resolve(positional[0] || path.join(__dirname, '..', 'tokens.json'));
const OUTPUT = path.resolve(positional[1] || path.join(__dirname, '..', 'styles', 'tokens.css'));

/** Container names that hold primitives rather than roles. */
const PRIMITIVE_KEYS = new Set([
  'primitive', 'primitives', 'palette', 'palettes', 'swatch', 'swatches',
  'raw', 'rawvalue', 'rawvalues', 'base', 'core', 'key', 'scale', 'scales',
  'ramp', 'ramps', 'reference', 'references', 'source', 'values',
]);

/** Container names that hold a theme variant. */
const THEME_KEYS = new Set(['light', 'dark', 'default', 'base', 'high-contrast', 'highcontrast']);
const DARK_KEYS = ['dark', 'high-contrast', 'highcontrast'];
/** Containers that only group roles or themes; they never appear in a variable name. */
const TRANSPARENT_KEYS = new Set(['theme', 'themes', 'role', 'roles']);

/** Roles that carry body text and therefore must hold up on every surface. */
const GLOBAL_TEXT_ROLES = ['--color-on-surface', '--color-on-background', '--color-on-surface-variant'];
/** Roles that must be distinguishable from every surface. */
const UI_SURFACE_ROLES = ['--color-outline'];

const TEXT_MIN = 4.5;
const UI_MIN = 3;
const DISTINCT_MIN = 1.25;

const REFERENCE = /^\{([^}]+)\}$/;
const warnings = [];
const errors = [];

/** Parsed token source, plus a dot-path lookup used to resolve references. */
let tokens = {};
let flat = {};

function warn(message) {
  warnings.push(message);
}

/**
 * A structural fault: the build cannot produce a correct stylesheet. These stop
 * the build, because the alternative is a custom property silently going missing
 * and every `var(--that-property)` resolving to nothing at runtime.
 */
function fail(message) {
  errors.push(message);
}

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isMeta = (key) => key.startsWith('$');

/** Entries excluding `$`-prefixed metadata. */
function entries(node) {
  return Object.entries(node).filter(([key]) => !isMeta(key));
}

/** DTCG style objects carry their value in `$value`. */
function leafOf(value) {
  return isPlainObject(value) && '$value' in value ? value.$value : value;
}

function die(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

/* ------------------------------------------------------------------ naming */

function kebab(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_.]+/g, '-')
    .replace(/[^A-Za-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** "primary-container-color" -> "primary-container" */
function roleSegment(key) {
  const name = kebab(key).replace(/-(colors?)$/, '');
  return name || kebab(key);
}

/* -------------------------------------------------------------- references */

function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of entries(node)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(leafOf(value))) flatten(leafOf(value), next, out);
    else out[next] = leafOf(value);
  }
  return out;
}

function nearestTone(key) {
  const parts = key.split('.');
  const requested = Number(parts[parts.length - 1]);
  if (!Number.isFinite(requested)) return undefined;

  let node = tokens;
  for (const part of parts.slice(0, -1)) {
    if (!isPlainObject(node) || !(part in node)) return undefined;
    node = leafOf(node[part]);
  }
  if (!isPlainObject(node)) return undefined;

  const tones = entries(node)
    .map(([key]) => Number(key))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!tones.length) return undefined;

  const best = tones.reduce((prev, curr) =>
    Math.abs(curr - requested) < Math.abs(prev - requested) ? curr : prev
  );
  if (best === requested) return undefined;
  return `${parts.slice(0, -1).join('.')}.${best}`;
}

/** Follow {a.b.c} references until a literal value is reached. */
function resolve(value, seen = [], label = '') {
  const literal = leafOf(value);
  if (typeof literal !== 'string') return literal;
  const match = literal.match(REFERENCE);
  if (!match) return literal;

  const where = label ? `${label} references ` : '';
  const key = match[1];
  if (seen.includes(key)) {
    fail(`circular reference in ${where || 'the token source'}: ${[...seen, key].join(' -> ')}`);
    return null;
  }
  if (key in flat) return resolve(flat[key], [...seen, key], label);

  // A tone number with no exact match is a near miss worth reporting, but the
  // closest tone is a defensible interpretation, so it stays a warning.
  const tone = nearestTone(key);
  if (tone) {
    warn(`reference {${key}} in ${where || 'the token source'} has no exact tone, using {${tone}}`);
    return resolve(flat[tone], [...seen, tone], label);
  }

  fail(`unresolved reference {${key}} in ${where || 'the token source'}`);
  return null;
}

/* -------------------------------------------------------------- formatting */

/**
 * Quotes a single family name and appends the matching generic fallback. The
 * generic is chosen from the token's own name, so name it `font-family-mono` for
 * a monospace stack. A value that already lists fallbacks is passed through.
 */
function formatValue(name, value) {
  if (/font-family-/.test(name)) {
    const generic = /mono/.test(name) ? 'monospace' : /serif/.test(name) ? 'serif' : 'sans-serif';
    return String(value).includes(',') ? String(value) : `'${value}', ${generic}`;
  }
  return String(value);
}

function setVar(target, name, value) {
  if (name in target && target[name] !== value) {
    warn(`duplicate variable ${name} (${target[name]} wins over ${value})`);
    return;
  }
  target[name] = value;
}

/* ------------------------------------------------------------------ colour */

function isToneMap(node) {
  const keys = entries(node).map(([key]) => key);
  return keys.length > 0 && keys.every((key) => /^\d+$/.test(key));
}

function isLeafMap(node) {
  const list = entries(node);
  return list.length > 0 && list.every(([, value]) => !isPlainObject(leafOf(value)));
}

function collectColour(node, themes, primitives, trail = []) {
  for (const [key, rawValue] of entries(node)) {
    const lower = key.toLowerCase();
    const value = leafOf(rawValue);
    const at = [...trail, key];

    if (!isPlainObject(value)) {
      if (!themes.default) themes.default = {};
      collectRoles({ [key]: rawValue }, themes.default, trail);
      continue;
    }
    if (PRIMITIVE_KEYS.has(lower) || isToneMap(value)) {
      countPrimitives(value, primitives);
      continue;
    }
    if (TRANSPARENT_KEYS.has(lower)) {
      collectColour(value, themes, primitives, trail);
      continue;
    }
    if (THEME_KEYS.has(lower) && isLeafMap(value)) {
      if (!themes[lower]) themes[lower] = {};
      collectRoles(value, themes[lower], trail);
      continue;
    }
    // A map of plain values that is not a theme, primitive or grouping is almost
    // always a misspelled theme key. Its roles would be emitted under a path
    // segment (`--color-day-primary`) and quietly override each other in one
    // theme, so name it rather than letting it pass unnoticed.
    if (isLeafMap(value) && !isToneMap(value)) {
      warn(
        `unrecognised key "${key}" under colour tokens is not a theme ` +
          `(${[...THEME_KEYS].join(', ')}), a primitive container, or a grouping ` +
          `(${[...TRANSPARENT_KEYS].join(', ')}) - its values are emitted as ` +
          `--color-${[...trail, key].map(roleSegment).join('-')}-* and share one theme`,
      );
    }
    collectColour(value, themes, primitives, at);
  }
}

function countPrimitives(node, primitives) {
  for (const [, value] of entries(node)) {
    const leaf = leafOf(value);
    if (isPlainObject(leaf)) countPrimitives(leaf, primitives);
    else primitives.count += 1;
  }
}

function collectRoles(node, out, trail, parts = []) {
  for (const [key, value] of entries(node)) {
    if (isPlainObject(leafOf(value))) {
      collectRoles(value, out, trail, [...parts, key]);
      continue;
    }
    const at = [...trail, ...parts, key];
    const name = `--color-${at.map(roleSegment).join('-')}`;
    const literal = resolve(value, [at.join('.')], at.join('.'));
    if (literal === null) continue;
    setVar(out, name, formatValue(name, literal));
  }
}

/* ------------------------------------------------------- non-colour groups */

function collectVars(node, groupKey, out, parts = []) {
  for (const [key, value] of entries(node)) {
    if (isPlainObject(leafOf(value))) {
      collectVars(value, groupKey, out, [...parts, key]);
      continue;
    }
    const at = [...parts, key];
    const segments = at.length > 1 && kebab(at[0]) === kebab(groupKey) ? at.slice(1) : at;
    const joined = segments.map(kebab).join('-');
    // A bare key such as "sm" or "0" would collide across groups, so keep the
    // group prefix. Already-qualified keys such as "font-size-xs" stand alone.
    const name = `--${joined.includes('-') ? joined : `${kebab(groupKey)}-${joined}`}`;
    const literal = resolve(value, [`${groupKey}.${at.join('.')}`], `${groupKey}.${at.join('.')}`);
    if (literal === null) continue;
    setVar(out, name, formatValue(name, literal));
  }
}

/**
 * Returns { light, dark }; `dark` is empty when the group is not themed.
 *
 * A group may mix themed sub-objects with plain ones. The themed keys supply
 * both themes; any remaining key belongs to the light theme, so it is collected
 * rather than dropped.
 */
function collectScale(node, groupKey) {
  const themed = entries(node).filter(
    ([key, value]) => THEME_KEYS.has(key.toLowerCase()) && isLeafMap(leafOf(value)),
  );

  const result = { light: {}, dark: {} };
  if (!themed.length) {
    collectVars(node, groupKey, result.light);
    return result;
  }

  for (const [key, value] of themed) {
    const lower = key.toLowerCase();
    collectVars(leafOf(value), groupKey, DARK_KEYS.includes(lower) ? result.dark : result.light);
  }

  // Anything not claimed by a themed key belongs to the light theme, and is
  // named as though the group were unthemed (`{ "radius-pill": ... }`).
  for (const [key, value] of entries(node)) {
    if (themed.some(([themedKey]) => themedKey === key)) continue;
    collectVars(leafOf(value), groupKey, result.light);
  }

  return result;
}

/* ------------------------------------------------------------------- fonts */

function fontInfo(typography) {
  if (!isPlainObject(typography)) return { unique: [], weightList: [] };
  const families = [];
  const weights = new Set();

  for (const [key, value] of entries(typography)) {
    const flatKey = kebab(key);
    const literal = leafOf(value);
    if (flatKey.startsWith('font-family-') && typeof literal === 'string' && !literal.includes(',')) {
      families.push(literal);
    }
    if (flatKey.startsWith('font-weight-') && Number.isFinite(Number(literal))) {
      weights.add(Number(literal));
    }
  }

  const unique = [...new Set(families)];
  const weightList = [...weights].sort((a, b) => a - b);
  return { unique, weightList };
}

function fontImport(typography) {
  const { unique, weightList } = fontInfo(typography);
  if (!unique.length) return '';

  const query = unique
    .map((family) => {
      const name = family.trim().replace(/\s+/g, '+');
      return weightList.length ? `${name}:wght@${weightList.join(';')}` : name;
    })
    .join('&');

  return `@import url('https://fonts.googleapis.com/css2?family=${query}&display=swap');`;
}

/* --------------------------------------------------------------- contrast */

function parseColour(value) {
  const text = String(value).trim();

  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const body = hex[1].length === 3 ? hex[1].replace(/./g, '$&$&') : hex[1];
    return [0, 2, 4].map((i) => parseInt(body.slice(i, i + 2), 16));
  }

  const rgb = text.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3);
    return parts.map((part) => (part.endsWith('%') ? (parseFloat(part) / 100) * 255 : parseFloat(part)));
  }

  const hsl = text.match(/^hsla?\(([^)]+)\)$/i);
  if (hsl) {
    const [h, s, l] = hsl[1].split(/[\s,/]+/).filter(Boolean);
    const H = parseFloat(h) / 360;
    const S = parseFloat(s) / 100;
    const L = parseFloat(l) / 100;
    const a = S * Math.min(L, 1 - L);
    const k = (n) => (n + parseFloat(h) / 30) % 12;
    const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  }

  return null;
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground, background) {
  const a = parseColour(foreground);
  const b = parseColour(background);
  if (!a || !b) return null;
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const surfaceRoles = (vars) =>
  Object.keys(vars).filter(
    (name) => /^--color-(background|surface)/.test(name) && !name.startsWith('--color-on-'),
  );

/** Every pair the UI can realistically put together, with its WCAG threshold. */
function contrastPairs(vars) {
  const pairs = [];
  const has = (name) => vars[name] !== undefined;
  const surfaces = surfaceRoles(vars);

  for (const name of Object.keys(vars)) {
    const on = name.match(/^--color-on-(.+)$/);
    if (!on) continue;
    const base = `--color-${on[1]}`;
    if (has(base)) pairs.push([name, base, TEXT_MIN, 'text on its own role']);
  }

  for (const role of GLOBAL_TEXT_ROLES) {
    if (!has(role)) continue;
    for (const surface of surfaces) pairs.push([role, surface, TEXT_MIN, 'text on any surface']);
  }

  for (const role of UI_SURFACE_ROLES) {
    if (!has(role)) continue;
    for (const surface of surfaces) {
      // A border never sits on surface-variant; that is a fill, not a container edge.
      if (surface === '--color-surface-variant') continue;
      pairs.push([role, surface, UI_MIN, 'control boundary']);
    }
  }

  if (has('--color-outline') && has('--color-outline-variant')) {
    pairs.push(['--color-outline-variant', '--color-outline', DISTINCT_MIN, 'divider vs boundary']);
  }

  return pairs;
}

function auditContrast(themes) {
  const failures = [];
  let checked = 0;

  for (const [themeName, vars] of Object.entries(themes)) {
    if (!vars || !Object.keys(vars).length) continue;
    for (const [fg, bg, min, note] of contrastPairs(vars)) {
      const ratio = contrastRatio(vars[fg], vars[bg]);
      if (ratio === null) {
        warn(`cannot parse colour for ${fg} or ${bg} in ${themeName}`);
        continue;
      }
      checked += 1;
      if (ratio + 0.005 < min) {
        failures.push({
          theme: themeName,
          pair: `${fg} on ${bg}`,
          note,
          ratio,
          min,
        });
      }
    }
  }

  return { checked, failures };
}

/* ------------------------------------------------------------------ output */

function declarations(vars, indent) {
  return Object.entries(vars)
    .map(([name, value]) => `${indent}${name}: ${value};`)
    .join('\n');
}

/**
 * Two groups that derive the same custom property name emit two declarations of
 * it, and the browser silently keeps the last. `setVar` cannot see this because
 * each group collects into its own object, so it is checked once here.
 *
 * Light and dark are the same source: a role is expected to be defined once per
 * theme, so only a clash *between* groups is a defect.
 */
function detectCollisions(light, dark, scales) {
  const sources = new Map();

  const record = (vars, source) => {
    for (const [name, value] of Object.entries(vars)) {
      if (!sources.has(name)) sources.set(name, new Map());
      const owners = sources.get(name);
      if (!owners.has(source)) owners.set(source, value);
    }
  };

  record(light, 'color');
  if (dark) record(dark, 'color');
  for (const [group, scale] of Object.entries(scales)) {
    record(scale.light, group);
    record(scale.dark, group);
  }

  for (const [name, owners] of sources) {
    if (owners.size < 2) continue;
    fail(
      `duplicate custom property ${name} is defined by the ` +
        `${[...owners.keys()].join(' and ')} groups ` +
        `(${[...owners.values()].map((value) => `"${value}"`).join(' vs ')}) - ` +
        `rename one so a single value wins`,
    );
  }
}

function build() {
  const themes = {};
  const primitives = { count: 0 };
  const scales = {};

  const colourSource = tokens.color || tokens.colour;
  if (isPlainObject(colourSource)) collectColour(colourSource, themes, primitives);
  else warn('no colour tokens found');

  for (const [group, value] of entries(tokens)) {
    if (group === 'color' || group === 'colour' || !isPlainObject(leafOf(value))) continue;
    const scale = collectScale(leafOf(value), group);
    if (Object.keys(scale.light).length || Object.keys(scale.dark).length) scales[group] = scale;
  }

  const light =
    themes.light ||
    themes.default ||
    themes.base ||
    Object.values(themes).find((entries_) => Object.keys(entries_).length) ||
    {};
  const darkThemeKey = DARK_KEYS.find((key) => themes[key]);
  const dark = darkThemeKey ? themes[darkThemeKey] : null;

  detectCollisions(light, dark, scales);

  const rootLines = ['  /* Colour roles - light */', declarations(light, '  ')];
  for (const [group, scale] of Object.entries(scales)) {
    rootLines.push('', `  /* ${group} */`, declarations(scale.light, '  '));
  }

  // A themed scale is emitted for the dark scheme on its own account. Gating this
  // on the colour theme used to drop dark shadows whenever colour had no dark
  // variant, while still counting them in the footer.
  const darkScaleGroups = Object.entries(scales).filter(([, scale]) => Object.keys(scale.dark).length);
  const hasDark = Boolean(dark) || darkScaleGroups.length > 0;

  const darkSections = [];
  if (dark) darkSections.push('    /* Colour roles - dark */', declarations(dark, '    '));
  for (const [group, scale] of darkScaleGroups) {
    darkSections.push('', `    /* ${group} - dark */`, declarations(scale.dark, '    '));
  }
  const darkNested = darkSections.join('\n');

  const lightCount = Object.keys(light).length;
  const darkCount = dark ? Object.keys(dark).length : 0;
  const scaleCount = Object.values(scales).reduce(
    (sum, scale) => sum + Object.keys(scale.light).length + Object.keys(scale.dark).length,
    0,
  );

  const sections = [
    '/* ============================================================',
    '   EHEMS - Design tokens',
    '   Generated by scripts/build-tokens.js - do not edit by hand.',
    `   Source: ${path.basename(INPUT)}`,
    '   ============================================================ */',
    '',
    '/* Colour is exposed as roles only. Palette primitives are resolved',
    '   at build time and never reach the UI layer. */',
    '',
  ];

  if (FONT_IMPORT) {
    const rule = fontImport(tokens.typography);
    if (rule) sections.push(rule, '');
  } else {
    const { unique, weightList } = fontInfo(tokens.typography);
    if (unique.length) {
      const weights = weightList.length ? `, weights ${weightList.join(' ')}` : '';
      sections.push(
        '/* Fonts: load these in the app (next/font), not from this file -',
        '   a nested @import is invalid CSS. */',
        ...unique.map((family) => `/*   ${family}${weights} */`),
        '',
      );
    }
  }

  sections.push(':root {', rootLines.join('\n'), '}');

  if (hasDark) {
    sections.push(
      '',
      '/* Colour roles - dark (follows the OS scheme) */',
      '',
      '@media (prefers-color-scheme: dark) {',
      "  :root:not([data-theme='light']) {",
      darkNested,
      '  }',
      '}',
      '',
      '/* Colour roles - dark (explicit override) */',
      '',
      ":root[data-theme='dark'] {",
      ...(dark ? [declarations(dark, '  ')] : []),
      ...darkScaleGroups.flatMap(([group, scale]) => [
        '',
        `  /* ${group} - dark */`,
        declarations(scale.dark, '  '),
      ]),
      '}',
    );
  }

  sections.push(
    '',
    `/* ${lightCount + darkCount} colour role declarations`,
    `   ${scaleCount} scale declarations`,
    `   ${primitives.count} primitives resolved and withheld */`,
    '',
  );

  return { css: sections.join('\n'), light, dark, scales, primitives: primitives.count, scaleCount };
}

/** Line endings are not content: a CRLF checkout must not read as stale. */
const normalise = (text) => text.replace(/\r\n/g, '\n');

function main() {
  if (!fs.existsSync(INPUT)) die(`token source not found at ${INPUT}`);

  try {
    tokens = JSON.parse(fs.readFileSync(INPUT, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    die(`could not parse ${INPUT}\n  ${error.message}`);
  }
  flat = flatten(tokens);

  const { css, light, dark, primitives, scaleCount } = build();
  const audit = auditContrast({ light, ...(dark ? { dark } : {}) });

  for (const message of warnings) process.stderr.write(`  warning: ${message}\n`);

  // Structural faults are reported before anything is written: a stylesheet
  // missing a custom property is worse than a stale one, because the stale one
  // is detectable and the missing one is not.
  if (errors.length) {
    for (const message of errors) process.stderr.write(`  error: ${message}\n`);
    process.stderr.write(`\n${errors.length} unresolved problem(s); ${path.basename(OUTPUT)} not written\n`);
    process.exit(1);
  }

  if (CHECK) {
    const current = fs.existsSync(OUTPUT) ? normalise(fs.readFileSync(OUTPUT, 'utf8')) : '';
    if (current !== css) {
      process.stderr.write(
        `error: ${path.relative(process.cwd(), OUTPUT)} is out of date, re-run the build\n`,
      );
      process.exit(1);
    }
    process.stdout.write(`tokens: ${path.relative(process.cwd(), OUTPUT)} is up to date\n`);
  } else {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, css, 'utf8');
    process.stdout.write(
      `tokens: ${path.relative(process.cwd(), INPUT)} -> ${path.relative(process.cwd(), OUTPUT)}\n` +
        `  ${Object.keys(light).length + (dark ? Object.keys(dark).length : 0) + scaleCount} custom properties\n` +
        `  ${primitives} colour primitives resolved and withheld\n`,
    );
  }

  if (audit.checked === 0) {
    process.stderr.write(
      'error: the contrast audit checked 0 pairs, so WCAG 2.1 AA is unverified, not met\n',
    );
    process.exit(1);
  }

  if (audit.failures.length) {
    process.stderr.write(`\nWCAG 2.1 AA: ${audit.failures.length} of ${audit.checked} pairs fail\n`);
    const width = Math.max(...audit.failures.map((f) => f.pair.length));
    for (const failure of audit.failures) {
      process.stderr.write(
        `  ${failure.theme.padEnd(6)} ${failure.pair.padEnd(width)}  ` +
          `${failure.ratio.toFixed(2)}:1 (needs ${failure.min}) ${failure.note}\n`,
      );
    }
    process.exit(1);
  }
  process.stdout.write(`  contrast: ${audit.checked} role pairs meet WCAG 2.1 AA\n`);
}

main();
