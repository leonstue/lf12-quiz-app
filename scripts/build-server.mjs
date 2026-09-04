import { build } from 'esbuild';

/**
 * Bündelt den Server zu einer einzigen ESM-Datei.
 * Runtime-Abhängigkeiten bleiben extern und werden im Docker-Image
 * über `npm ci --omit=dev` bereitgestellt.
 */
await build({
  entryPoints: ['src/server/index.ts'],
  outfile: 'dist/server/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  sourcemap: false,
  minify: false,
  logLevel: 'info',
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
});
