/**
 * Emit the installable root Host plugin and the Web `__ModuleLoader__` client
 * half. Nested workspace packages stay for development; the profile Loader
 * imports only this package. Host peers resolve from the running `dsh` bin.
 */
import { cp, mkdir } from 'node:fs/promises'
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const host = join(root, 'packages', 'debug-mode')
const client = join(root, 'packages', 'client-ui-debug')
const scripts = join(root, 'scripts')
const id = '@siuver/dsh-debug-mode'

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

await mkdir(join(root, 'lib'), { recursive: true })

await build({
  absWorkingDir: host,
  entryPoints: ['src/index.ts'],
  outfile: join(root, 'lib', 'plugin.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
})

await build({
  absWorkingDir: host,
  entryPoints: ['src/remote.ts'],
  outfile: join(root, 'lib', 'remote.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
})

await cp(join(scripts, 'host-hooks.mjs'), join(root, 'lib', 'hooks.mjs'))
await cp(join(scripts, 'host-entry.mjs'), join(root, 'lib', 'index.js'))

await build({
  absWorkingDir: client,
  entryPoints: ['src/client/index.ts'],
  outfile: join(root, 'lib', 'client.js'),
  bundle: true,
  minify: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  alias: {
    '@deepseek-ai/dsh-debug-mode/remote': join(host, 'src', 'remote.ts'),
  },
  external: [
    ...platform,
    '@deepseek-ai/dsh-api-gateway/client',
  ],
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: 'return module.exports; } });',
  },
})
