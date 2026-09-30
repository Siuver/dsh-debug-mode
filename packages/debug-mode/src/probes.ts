/**
 * Probe-ledger scan for `@dsh-probe <id>` markers.
 * @module @deepseek-ai/dsh-debug-mode/probes
 */

import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PROBE_MARK } from './constants.ts'
import type { Probe } from './types.ts'

const PROBE_MARK_RE = new RegExp(`${PROBE_MARK}\\s+([A-Za-z0-9_-]+)`, 'g')
const PRE_EDIT_KEYS = /^old(_?(string|str|text|content|source))?$/i

/** Result of rescanning recorded probe files. */
export interface LedgerScan {
  readonly alive: Probe[]
  readonly gone: Probe[]
  readonly unknown: Probe[]
}

/**
 * Collect probe ids from one string.
 * @param text - file contents or tool argument.
 */
export function probeIdsIn(text: unknown): string[] {
  if (typeof text !== 'string') return []
  const ids: string[] = []
  for (const match of text.matchAll(PROBE_MARK_RE)) {
    const id = match[1]
    if (id !== undefined) ids.push(id)
  }
  return ids
}

/**
 * Absolute path of the file an edit/write tool call targets.
 * @param input - tool arguments.
 * @param cwd - session working directory.
 */
export function probeFileFromInput(input: object, cwd: string): string {
  const raw = typeof input.path === 'string'
    ? input.path
    : typeof input.file_path === 'string'
      ? input.file_path
      : null
  if (raw === null) return '(unknown)'
  return resolve(cwd, raw)
}

/**
 * Every `@dsh-probe <id>` marker an edit/write introduces, deduplicated by id.
 * @param input - tool arguments.
 * @param cwd - session working directory.
 * @param round - current round index.
 */
export function probesInInput(input: object, cwd: string, round: number): Probe[] {
  const file = probeFileFromInput(input, cwd)
  const found: Probe[] = []
  for (const [key, value] of Object.entries(input)) {
    if (PRE_EDIT_KEYS.test(key)) continue
    for (const id of probeIdsIn(value)) {
      if (!found.some(probe => probe.id === id)) found.push({ id, file, round })
    }
  }
  return found
}

/**
 * Rescan every recorded file and classify each probe.
 * @param probes - last known ledger.
 */
export async function scanLedger(probes: readonly Probe[]): Promise<LedgerScan> {
  const scan: LedgerScan = { alive: [], gone: [], unknown: [] }
  const byFile = new Map<string, Probe[]>()
  for (const probe of probes) {
    const list = byFile.get(probe.file) ?? []
    list.push(probe)
    byFile.set(probe.file, list)
  }
  for (const [file, filed] of byFile) {
    let text: string | undefined
    let missing = false
    try {
      await stat(file)
    } catch (_missing) {
      missing = true
    }
    if (!missing) {
      try {
        text = await readFile(file, 'utf8')
      } catch (_unreadable) {
        for (const probe of filed) scan.unknown.push(probe)
        continue
      }
    }
    for (const probe of filed) {
      if (missing || text === undefined || !text.includes(`${PROBE_MARK} ${probe.id}`)) {
        scan.gone.push(probe)
      } else {
        scan.alive.push(probe)
      }
    }
  }
  return scan
}

/**
 * Ledger after a rescan. Unreadable files keep their probes.
 * @param scan - classified probes.
 */
export function ledgerAfterScan(scan: LedgerScan): Probe[] {
  return [...scan.alive, ...scan.unknown]
}

/**
 * Human-readable ledger for the model.
 * @param scan - classified probes.
 */
export function describeLedger(scan: LedgerScan): string {
  if (scan.alive.length === 0 && scan.unknown.length === 0 && scan.gone.length === 0) {
    return '(probe ledger is empty)'
  }
  const lines: string[] = []
  if (scan.alive.length > 0) {
    lines.push('Alive:')
    for (const probe of scan.alive) lines.push(`- ${PROBE_MARK} ${probe.id} @ ${probe.file} (round ${probe.round})`)
  }
  if (scan.unknown.length > 0) {
    lines.push('Unreadable (kept):')
    for (const probe of scan.unknown) lines.push(`- ${PROBE_MARK} ${probe.id} @ ${probe.file}`)
  }
  if (scan.gone.length > 0) {
    lines.push('Gone:')
    for (const probe of scan.gone) lines.push(`- ${PROBE_MARK} ${probe.id} @ ${probe.file}`)
  }
  return lines.join('\n')
}
