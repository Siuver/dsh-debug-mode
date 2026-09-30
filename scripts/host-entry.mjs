/** Loader entry: register peer resolution, then load the Host plugin. */
import { createRequire, register } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PEERS = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  .peerDependencies ?? {}

function requireFrom(anchor) {
  try {
    return createRequire(anchor)
  } catch {
    return undefined
  }
}

function peerUrls() {
  const anchors = []
  if (typeof process.argv[1] === 'string' && process.argv[1].length > 0) anchors.push(process.argv[1])
  const nextToNode = join(dirname(process.execPath), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  if (existsSync(nextToNode)) anchors.push(nextToNode)
  /** @type {Record<string, string>} */
  const urls = {}
  for (const anchor of anchors) {
    const require = requireFrom(anchor)
    if (require === undefined) continue
    for (const name of Object.keys(PEERS)) {
      if (urls[name] !== undefined) continue
      try {
        urls[name] = pathToFileURL(require.resolve(name)).href
      } catch {
        // Try the next dsh installation anchor.
      }
    }
  }
  return urls
}

register(new URL('./hooks.mjs', import.meta.url), {
  data: { peers: peerUrls() },
})

const plugin = await import(new URL('./plugin.js', import.meta.url))
export const DebugModeController = plugin.DebugModeController
export const HANDOFF_TOOL = plugin.HANDOFF_TOOL
export const PROBE_MARK = plugin.PROBE_MARK
export const TYPERT_REMOTE = plugin.TYPERT_REMOTE
export default plugin.default
