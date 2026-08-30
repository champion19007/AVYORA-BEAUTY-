import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

// eslint-config-next v16 publishes native flat configs, so they are imported
// directly. Routing them through FlatCompat (the bridge for legacy shareable
// configs) fails with a circular-structure error during validation.
export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'drizzle/**', 'next-env.d.ts', 'public/**'],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Worth surfacing, but not worth blocking a deploy over on their own.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
