/**
 * Emit the Host node half and the Web `__ModuleLoader__` client half.
 * Out-of-tree packages cannot import DSH `clientBundle()`, so this local
 * esbuild step reproduces the registration wrapper and the platform externals.
 */
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = join(root, 'packages', 'client-ui-debug')
const id = '@deepseek-ai/dsh-client-ui-debug'

const platform = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const clientExternal = [
  ...platform,
  '@deepseek-ai/dsh-api-gateway/client',
]

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
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  minify: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  external: clientExternal,
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: 'return module.exports; } });',
  },
})
