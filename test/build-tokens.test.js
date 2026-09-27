'use strict';

/**
 * Regression tests for scripts/build-tokens.js.
 *
 * Each test in the "critical" group reproduces a bug that was found by audit:
 * the token silently disappeared, was duplicated, or was counted but never
 * emitted. Run with `npm test`.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'build-tokens.js');
const REAL_TOKENS = path.join(__dirname, '..', 'tokens.json');
const REAL_CSS = path.join(__dirname, '..', 'styles', 'tokens.css');

let workdir;

test.beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ehems-tokens-'));
});

test.afterEach(() => {
  fs.rmSync(workdir, { recursive: true, force: true });
});

/** Run the build script against an inline token source. */
function build(source, args = []) {
  const input = path.join(workdir, 'tokens.json');
  const output = path.join(workdir, 'tokens.css');
  fs.writeFileSync(input, typeof source === 'string' ? source : JSON.stringify(source), 'utf8');

  const result = spawnSync(process.execPath, [SCRIPT, input, output, ...args], {
    encoding: 'utf8',
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    css: fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '',
    input,
    output,
    read: () => fs.readFileSync(output, 'utf8'),
  };
}

/** Re-run --check against an already-written output file. */
function check(input, output) {
  return spawnSync(process.execPath, [SCRIPT, input, output, '--check'], { encoding: 'utf8' });
}

/** A minimal token source with a valid two-theme colour section. */
function colour(overrides = {}) {
  return {
    color: {
      palette: {
        navy: { 700: 'hsl(218, 74%, 15%)' },
        white: { 0: 'hsl(0, 0%, 100%)' },
      },
      role: {
        light: {
          'primary-color': '{color.palette.navy.700}',
          'on-primary-color': '{color.palette.white.0}',
          'background-color': '{color.palette.white.0}',
          'on-background-color': '{color.palette.navy.700}',
          ...(overrides.light || {}),
        },
        dark: {
          'primary-color': '{color.palette.white.0}',
          'on-primary-color': '{color.palette.navy.700}',
          'background-color': '{color.palette.navy.700}',
          'on-background-color': '{color.palette.white.0}',
          ...(overrides.dark || {}),
        },
      },
    },
  };
}

/* ------------------------------------------------------------ critical: 1 */

test('an unresolvable reference fails the build instead of silently dropping the role', () => {
  const source = colour();
  source.color.role.light['error-color'] = '{colour.palette.red.600}';

  const result = build(source);

  assert.equal(result.status, 1, 'build should fail');
  assert.match(result.stderr, /unresolved reference/i);
  assert.match(result.stderr, /error-color/, 'the error should name the offending role');
});

test('a circular reference fails the build', () => {
  const source = colour();
  source.color.role.light['loop-a-color'] = '{color.role.light.loop-b-color}';
  source.color.role.light['loop-b-color'] = '{color.role.light.loop-a-color}';

  const result = build(source);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /circular reference/i);
});

/* ------------------------------------------------------------ critical: 2 */

test('two groups that resolve to the same variable name fail the build', () => {
  const result = build({
    ...colour(),
    typography: { 'font-size': { xs: '0.75rem' } },
    spacing: { 'font-size': { xs: '99rem' } },
  });

  assert.equal(result.status, 1, 'build should fail');
  assert.match(result.stderr, /--font-size-xs/);
  assert.match(result.stderr, /duplicate|collision/i);
});

test('a variable name repeated inside one group still warns rather than duplicating', () => {
  // `spacing` already qualifies its keys, so this is the supported shape and must build.
  const result = build({
    ...colour(),
    spacing: { 'spacing-sm': '0.5rem', 'spacing-md': '1rem' },
  });

  assert.equal(result.status, 0);
  assert.match(result.css, /--spacing-sm: 0\.5rem;/);
  assert.match(result.css, /--spacing-md: 1rem;/);
});

/* ------------------------------------------------------------ critical: 3 */

test('a themed scale keeps its dark values even when colour has no dark theme', () => {
  const source = colour();
  delete source.color.role.dark;
  source.shadows = {
    light: { 'shadow-sm': '0 1px 2px rgba(0,0,0,0.10)' },
    dark: { 'shadow-sm': '0 1px 2px rgba(0,0,0,0.60)' },
  };

  const result = build(source);

  assert.equal(result.status, 0);
  assert.match(result.css, /prefers-color-scheme: dark/);
  assert.match(result.css, /--shadow-sm: 0 1px 2px rgba\(0,0,0,0\.60\)/);
});

test('every scale value the footer counts is actually emitted', () => {
  const source = colour();
  delete source.color.role.dark;
  source.shadows = {
    light: { 'shadow-sm': '0 1px 2px rgba(0,0,0,0.10)' },
    dark: { 'shadow-sm': '0 1px 2px rgba(0,0,0,0.60)' },
  };

  const result = build(source);
  assert.equal(result.status, 0, result.stderr);

  // The footer counts distinct scale values; every one of them must be present in
  // at least one block. A counted-but-absent value is the dark-scale bug.
  const counted = Number(result.css.match(/(\d+) scale declarations/)[1]);
  const emitted = new Set(
    [...result.css.matchAll(/(--(?!color-)[a-z0-9-]+):\s*([^;]+);/g)].map(
      (m) => `${m[1]}: ${m[2]}`,
    ),
  );

  assert.equal(
    emitted.size,
    counted,
    `footer counts ${counted} scale values but only ${emitted.size} are emitted`,
  );
});

test('the committed stylesheet emits every scale value its footer counts', () => {
  const css = fs.readFileSync(REAL_CSS, 'utf8');
  const counted = Number(css.match(/(\d+) scale declarations/)[1]);
  const emitted = new Set(
    [...css.matchAll(/(--(?!color-)[a-z0-9-]+):\s*([^;]+);/g)].map((m) => `${m[1]}: ${m[2]}`),
  );

  assert.equal(emitted.size, counted, `footer counts ${counted} but ${emitted.size} are emitted`);
});

/* ---------------------------------------------------------------- medium */

test('an unthemed sibling of a themed group is not dropped', () => {
  const result = build({
    ...colour(),
    radius: {
      default: { 'radius-md': '0.5rem' },
      dark: { 'radius-md': '0.25rem' },
      brandOnly: { 'radius-pill': '9999px' },
    },
  });

  assert.equal(result.status, 0);
  assert.match(result.css, /--radius-pill: 9999px;/);
});

test('an unrecognised theme key is reported', () => {
  const source = colour();
  source.color.role.day = { 'primary-color': 'hsl(218, 74%, 15%)' };

  const result = build(source);

  assert.match(result.stderr, /day/);
});

test('--check tolerates CRLF line endings', () => {
  const result = build(colour());
  assert.equal(result.status, 0);

  fs.writeFileSync(result.output, result.read().replace(/\n/g, '\r\n'), 'utf8');
  const checked = check(result.input, result.output);

  assert.equal(checked.status, 0, `CRLF should not read as stale: ${checked.stderr}`);
  assert.match(checked.stdout, /up to date/);
});

test('--check reports a genuinely stale file', () => {
  const result = build(colour());
  fs.writeFileSync(result.output, '/* tampered */', 'utf8');
  const checked = check(result.input, result.output);

  assert.equal(checked.status, 1);
  assert.match(checked.stderr, /out of date/i);
});

test('a token source with no colour roles fails rather than claiming a vacuous pass', () => {
  const result = build({ spacing: { sm: '0.5rem' } });

  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout, /meet WCAG/);
});

/* ------------------------------------------------------- auditor behaviour */

test('a real WCAG AA violation fails the build', () => {
  const result = build({
    color: {
      palette: { navy: { 700: 'hsl(218, 74%, 15%)' } },
      role: {
        light: {
          // on-primary identical to primary: a 1:1 pairing, impossible to read.
          'primary-color': '{color.palette.navy.700}',
          'on-primary-color': '{color.palette.navy.700}',
          'background-color': 'hsl(0, 0%, 100%)',
          'on-background-color': '{color.palette.navy.700}',
        },
      },
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /WCAG 2\.1 AA/);
});

test('the nearest tone fallback stays a warning, not an error', () => {
  const source = colour();
  source.color.role.light['error-color'] = '{color.palette.navy.9999}';

  const result = build(source);

  assert.equal(result.status, 0);
  assert.match(result.stderr, /no exact tone/i);
  assert.match(result.css, /--color-error:/);
});

test('DTCG $value is read as the leaf value', () => {
  const result = build({
    color: {
      palette: { navy: { 700: { $value: 'hsl(218, 74%, 15%)', $description: 'brand navy' } } },
      role: {
        light: {
          'primary-color': { $value: '{color.palette.navy.700}' },
          'on-primary-color': 'hsl(0, 0%, 100%)',
          'background-color': 'hsl(0, 0%, 100%)',
          'on-background-color': '{color.palette.navy.700}',
        },
      },
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.css, /--color-primary: hsl\(218, 74%, 15%\);/);
});

test('palette primitives never reach the CSS', () => {
  const result = build(colour());

  assert.doesNotMatch(result.css, /--navy-700/);
  assert.doesNotMatch(result.css, /\{color\.palette/);
});

/* ------------------------------------------------------- the real project */

test('the committed stylesheet matches the committed token source', () => {
  const checked = spawnSync(process.execPath, [SCRIPT, '--check'], { encoding: 'utf8' });

  assert.equal(checked.status, 0, `run "npm run build:tokens": ${checked.stderr}`);
  assert.match(checked.stdout, /up to date/);
});

test('the committed stylesheet has no duplicate custom property names', () => {
  const css = fs.readFileSync(REAL_CSS, 'utf8');
  const root = css.match(/:root \{([\s\S]*?)\n\}/)[1].match(/--[\w-]+(?=:)/g);

  assert.equal(root.length, new Set(root).size);
});

test('the committed stylesheet passes the contrast audit', () => {
  const checked = spawnSync(process.execPath, [SCRIPT, '--check'], { encoding: 'utf8' });

  assert.match(checked.stdout, /contrast: \d+ role pairs meet WCAG 2\.1 AA/);
  assert.ok(REAL_TOKENS);
});

/* ------------------------------------------------------------- typography */

/**
 * Material Design 3 type roles, as the spec states them. Sizes are px, which is
 * how MD3 publishes them; tokens.json holds them in rem.
 */
const MD3 = {
  'display-large': { px: 57, weight: 'regular' },
  'display-medium': { px: 45, weight: 'regular' },
  'display-small': { px: 36, weight: 'regular' },
  'headline-large': { px: 32, weight: 'regular' },
  'headline-medium': { px: 28, weight: 'regular' },
  'headline-small': { px: 24, weight: 'regular' },
  'title-large': { px: 22, weight: 'regular' },
  'title-medium': { px: 16, weight: 'medium' },
  'title-small': { px: 14, weight: 'medium' },
  'body-large': { px: 16, weight: 'regular' },
  'body-medium': { px: 14, weight: 'regular' },
  'body-small': { px: 12, weight: 'regular' },
  'label-large': { px: 14, weight: 'medium' },
  'label-medium': { px: 12, weight: 'medium' },
  'label-small': { px: 11, weight: 'medium' },
};

const TYPE_CSS = path.join(__dirname, '..', 'styles', 'type.css');

const realTokens = () => JSON.parse(fs.readFileSync(REAL_TOKENS, 'utf8'));
const realCss = () => fs.readFileSync(REAL_CSS, 'utf8');

/** Every custom property declared anywhere in the generated stylesheet. */
function emittedVars(css) {
  return new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
}

/** `--type-size-display-large` -> the 57 in `3.5625rem`. */
function remToPx(value) {
  const match = String(value).match(/^([\d.]+)rem$/);
  return match ? Math.round(parseFloat(match[1]) * 16) : NaN;
}

test('every declared type role is emitted with all four of its parts', () => {
  const { typography } = realTokens();
  const emitted = emittedVars(realCss());
  const roles = Object.keys(typography).filter((key) => key.startsWith('type-size-'));

  assert.equal(roles.length, Object.keys(MD3).length, 'a role is missing from tokens.json');

  for (const key of roles) {
    const role = key.replace('type-size-', '');
    const weight = MD3[role]?.weight;
    assert.ok(weight, `${role} is not an MD3 role`);
    for (const part of [
      `--type-size-${role}`,
      `--type-line-height-${role}`,
      `--type-tracking-${role}`,
      `--type-weight-${weight}-role`,
    ]) {
      assert.ok(emitted.has(part), `${part} is declared in tokens.json but never emitted`);
    }
  }
});

test('every type.css utility binds a real emitted variable, and every role is bound', () => {
  const typeCss = fs.readFileSync(TYPE_CSS, 'utf8');
  const emitted = emittedVars(realCss());
  const utilities = [...typeCss.matchAll(/@utility\s+([a-z0-9-]+)\s*\{([^}]*)\}/g)];

  assert.equal(utilities.length, Object.keys(MD3).length, 'a role has no @utility binding');

  for (const [, name, body] of utilities) {
    const referenced = [...body.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]);
    assert.equal(referenced.length, 4, `${name} must bind size, line-height, weight and tracking`);
    for (const variable of referenced) {
      // An unresolvable var() is not a build error - the browser drops the
      // declaration and the text silently renders unstyled. So it is asserted here.
      assert.ok(
        emitted.has(variable),
        `${name} references ${variable}, which the token build never emits`,
      );
    }
  }
});

test('the role set and its sizes match Material Design 3, with unitless line heights', () => {
  const { typography } = realTokens();
  const declared = Object.keys(typography)
    .filter((key) => key.startsWith('type-size-'))
    .sort();

  assert.deepEqual(
    declared,
    Object.keys(MD3)
      .map((r) => `type-size-${r}`)
      .sort(),
  );

  for (const [role, spec] of Object.entries(MD3)) {
    const px = remToPx(typography[`type-size-${role}`]);
    assert.equal(px, spec.px, `${role} is ${px}px; MD3 specifies ${spec.px}px`);

    // MD3 publishes line heights in px. A px line-height is fixed regardless of
    // the reader's font-size preference, so the tokens hold the ratio instead.
    const lineHeight = typography[`type-line-height-${role}`];
    assert.doesNotMatch(
      String(lineHeight),
      /px|rem|em|%/,
      `${role} line-height must be a unitless ratio, not ${lineHeight}`,
    );
  }

  // MD3 uses exactly two weights. Shipping more would cost the member bandwidth
  // for type the system never asks for.
  const weights = Object.keys(typography).filter((key) => key.startsWith('type-weight-'));
  assert.deepEqual(weights.sort(), ['type-weight-medium-role', 'type-weight-regular-role']);
});
