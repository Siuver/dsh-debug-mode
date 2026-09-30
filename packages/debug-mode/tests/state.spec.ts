import { describe, expect, it } from 'vitest'
import { INACTIVE, freshSession, snapshotOf } from '../src/state.ts'

describe('snapshotOf', () => {
  it('projects inactive state including a pending enter', () => {
    expect(snapshotOf(INACTIVE, true)).toMatchObject({ active: false, pending: true, stage: null })
  })

  it('projects an active first round', () => {
    const session = { active: true as const, ...freshSession('bug', '/tmp/dbg', 'run1') }
    const snapshot = snapshotOf(session, false)
    expect(snapshot.active).toBe(true)
    expect(snapshot.round).toBe(1)
    expect(snapshot.logFile).toBe('/tmp/dbg/current.jsonl')
  })
})
