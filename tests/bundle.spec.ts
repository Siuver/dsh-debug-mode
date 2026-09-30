import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'

describe('debug-mode-bundle', () => {
  it('declares a single Loader row on the installable repo root', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      name?: string
      exports?: Record<string, string>
      dsh?: { bundle?: { patch?: string }; client?: { platform?: string } }
    }
    expect(manifest.name).toBe('@siuver/dsh-debug-mode')
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh?.client?.platform).toBe('web')
    expect(manifest.exports?.['./client']).toBe('./lib/client.js')
    const parsed = yaml.load(readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'))
    expect(Array.isArray(parsed)).toBe(true)
    const rows = (parsed as { insert?: { id?: string; name?: string }[] }[]).flatMap(patch => patch.insert ?? [])
    expect(rows.map(row => row.id)).toEqual(['debug-mode'])
    expect(rows.map(row => row.name)).toEqual(['@siuver/dsh-debug-mode'])
  })

  it('emits a Host loader that remaps peers and a plugin without decorator syntax', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const loader = readFileSync(resolve(root, 'lib', 'index.js'), 'utf8')
    const plugin = readFileSync(resolve(root, 'lib', 'plugin.js'), 'utf8')
    expect(loader).toContain("register(new URL('./hooks.mjs', import.meta.url)")
    expect(plugin).not.toContain('@Remote')
    expect(plugin).toContain('index_default as default')
  })
})
