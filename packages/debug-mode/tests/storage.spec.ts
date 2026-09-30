import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACTIVE_LOG_FILE, STATE_FILE } from '../src/constants.ts'
import { INACTIVE } from '../src/state.ts'
import {
  countLogLines,
  debugDirFor,
  readLogLines,
  readState,
  rotateActiveLog,
  sessionDirName,
  truncateActiveLog,
  writeState,
} from '../src/storage.ts'

describe('debug storage', () => {
  it('sanitizes session directory names', () => {
    expect(sessionDirName('abc/../def')).toBe('abcdef')
    expect(sessionDirName('!!!')).toBe('session')
  })

  it('round-trips state and rotates the active log', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-debug-cwd-'))
    const debugDir = debugDirFor(cwd, 'sess-1')
    expect(await readState(debugDir)).toEqual(INACTIVE)
    const log = await truncateActiveLog(debugDir)
    expect(log.endsWith(ACTIVE_LOG_FILE)).toBe(true)
    await writeState(debugDir, {
      active: true,
      stage: 'investigating',
      problem: 'bug',
      debugDir,
      rounds: [],
      probes: [],
      runHistory: ['run1'],
      logCounts: { run1: 0 },
      artifacts: [],
      observations: [],
      turnProduced: false,
      cleanupNudges: 0,
    })
    const restored = await readState(debugDir)
    expect(restored.active).toBe(true)
    await truncateActiveLog(debugDir)
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(debugDir, ACTIVE_LOG_FILE), '{"probe":"a"}\n\n', 'utf8')
    expect(await countLogLines(join(debugDir, ACTIVE_LOG_FILE))).toBe(1)
    await rotateActiveLog(debugDir, 'run1')
    expect(await readLogLines(join(debugDir, 'run1.jsonl'))).toEqual(['{"probe":"a"}'])
    expect(await readFile(join(debugDir, STATE_FILE), 'utf8')).toContain('"problem": "bug"')
  })
})
