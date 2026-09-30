/**
 * Per-session debug directory under the workspace `.dsh/debug/<sessionId>/`.
 * @module @deepseek-ai/dsh-debug-mode/storage
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ACTIVE_LOG_FILE, DEBUG_ROOT, STATE_FILE } from './constants.ts'
import { INACTIVE } from './state.ts'
import type { DebugPersistedState } from './types.ts'

/**
 * Safe directory name for one Session id.
 * @param sessionId - live Session identity.
 */
export function sessionDirName(sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, '')
  return safe.length > 0 ? safe.slice(0, 64) : 'session'
}

/**
 * Absolute debug directory for one Session.
 * @param cwd - session working directory.
 * @param sessionId - live Session identity.
 */
export function debugDirFor(cwd: string, sessionId: string): string {
  return join(cwd, ...DEBUG_ROOT, sessionDirName(sessionId))
}

/**
 * Read persisted state, defaulting to inactive when the file is absent or invalid.
 * @param debugDir - session debug directory.
 */
export async function readState(debugDir: string): Promise<DebugPersistedState> {
  try {
    const raw = await readFile(join(debugDir, STATE_FILE), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!isPersistedState(parsed)) return INACTIVE
    return parsed
  } catch (_unreadable) {
    return INACTIVE
  }
}

/**
 * Write persisted state.
 * @param debugDir - session debug directory.
 * @param state - machine state.
 */
export async function writeState(debugDir: string, state: DebugPersistedState): Promise<void> {
  await mkdir(debugDir, { recursive: true })
  await writeFile(join(debugDir, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

/**
 * Truncate the active JSONL log for a new run.
 * @param debugDir - session debug directory.
 */
export async function truncateActiveLog(debugDir: string): Promise<string> {
  await mkdir(debugDir, { recursive: true })
  const file = join(debugDir, ACTIVE_LOG_FILE)
  await writeFile(file, '', 'utf8')
  return file
}

/**
 * Archive the current log under a completed run id, then truncate.
 * @param debugDir - session debug directory.
 * @param runId - completed run id.
 */
export async function rotateActiveLog(debugDir: string, runId: string): Promise<string> {
  const active = join(debugDir, ACTIVE_LOG_FILE)
  try {
    const contents = await readFile(active, 'utf8')
    await writeFile(join(debugDir, `${runId}.jsonl`), contents, 'utf8')
  } catch (_missingActive) {
    await writeFile(join(debugDir, `${runId}.jsonl`), '', 'utf8')
  }
  return truncateActiveLog(debugDir)
}

/**
 * Count non-empty JSONL lines.
 * @param file - absolute path.
 */
export async function countLogLines(file: string): Promise<number> {
  try {
    const text = await readFile(file, 'utf8')
    return text.split(/\r?\n/).filter(line => line.trim().length > 0).length
  } catch (_missing) {
    return 0
  }
}

/**
 * Read JSONL lines.
 * @param file - absolute path.
 */
export async function readLogLines(file: string): Promise<string[]> {
  try {
    const text = await readFile(file, 'utf8')
    return text.split(/\r?\n/).filter(line => line.trim().length > 0)
  } catch (_missing) {
    return []
  }
}

/**
 * Remove a session debug directory after abort or successful cleanup.
 * @param debugDir - session debug directory.
 */
export async function removeDebugDir(debugDir: string): Promise<void> {
  await rm(debugDir, { recursive: true, force: true })
}

function isPersistedState(value: unknown): value is DebugPersistedState {
  if (typeof value !== 'object' || value === null) return false
  const record = value as { active?: unknown }
  return record.active === false || record.active === true
}
