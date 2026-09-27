import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// A component reaching for a raw colour is the failure this repo's whole token
// pipeline exists to prevent: a hex in a component bypasses the contrast audit,
// so nothing would fail and the class would just be wrong.
//
// Flat config replaces a rule's options rather than merging them, so a scoped
// block that also sets `no-restricted-syntax` would silently drop these. They are
// defined once and spread into every block that needs them.
const rawColourRules = [
  {
    selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]',
    message:
      'No hex colour literals. Colour comes from a semantic role in tokens.json — add a role and run `npm run build:tokens` so the contrast audit can verify it.',
  },
  {
    selector: "Literal[value=/\\b(hsl|hsla|rgb|rgba)\\(/]",
    // Worded without "rgb(" / "hsl(" so this message does not trip the very
    // rule it describes, which is reporting on this file.
    message:
      'No rgb or hsl colour function literals. Colour comes from a semantic role in tokens.json — add a role and run `npm run build:tokens`.',
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Typed linting, scoped to TypeScript sources. `no-unnecessary-type-assertion`
    // throws without type information, and type information is the whole point:
    // it is what lets the rules below catch an `as` cast laundered around a colour
    // role. Scoped to ts/tsx because eslint.config.mjs is not in the TypeScript
    // program and asking the project service about it would error.
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
    },
  },
  {
    rules: {
      // .agents/rules/code-style.md §TypeScript: no `any`, and no `as` casts
      // used to silence a type error. An `as` is sometimes legitimate, so this is
      // a warning rather than an error, but it must be argued for in review.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-syntax': ['error', ...rawColourRules],
    },
  },
  {
    // Additional `className` checks on the component surface: the JSX attribute is
    // what needs constraining, and a bare global rule on `className` would fire on
    // the prop declaration rather than on its contents. The raw-colour rules are
    // re-stated here because this block replaces the global ones.
    files: ['components/**/*.tsx', 'app/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...rawColourRules,
        {
          selector: "JSXAttribute[name.name='className'] Literal[value=/\\[[^\\]]*\\]/]",
          message:
            'No arbitrary Tailwind values in className (e.g. `p-[13px]`). Use the token scale from styles/tokens.css.',
        },
        {
          selector: "JSXAttribute[name.name='className'] Literal[value=/#[0-9a-fA-F]{3,8}/]",
          message: 'No hex colour in className. Use a colour role, e.g. `bg-primary`.',
        },
      ],
    },
  },
  {
    // The token pipeline test asserts on tokens.json's raw HSL primitives and
    // runs under node:test as CommonJS. Both rules fire on the assertions
    // themselves rather than on app code, so they are lifted for this file only.
    files: ['test/build-tokens.test.js'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // The token pipeline and its tests are generated-artifact tooling, not app
    // code, and are held to the Prettier config in .prettierrc.json only.
    'scripts/**',
  ]),
]);

export default eslintConfig;
