/** Emit the Host plugin as ESM, leaving DeepSeek Harness packages external. */
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'debug-mode')

await build({
  absWorkingDir: pkg,
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
})

await build({
  absWorkingDir: pkg,
  entryPoints: ['src/remote.ts'],
  outfile: 'lib/remote.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
})
