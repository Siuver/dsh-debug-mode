import { describe, expect, it } from 'vitest'
import { PROBE_NUDGE, handoffNudge } from '../src/methodology.ts'
import {
  type DebugEvent,
  type Effect,
  PROMPT_FIXED,
  PROMPT_PROCEED,
  PROMPT_START,
  reduce,
} from '../src/machine.ts'
import { INACTIVE, currentRound, type DebugPersistedState, type DebugSessionRecord } from '../src/state.ts'
import type { HandoffMode } from '../src/types.ts'

const START: DebugEvent = {
  t: 'start',
  problem: 'player falls through the floor',
  debugDir: '/tmp/dbg',
  runId: 'run1-aaa',
  logFile: '/tmp/dbg/current.jsonl',
}

const PLAN = (method: string): string =>
  `<evidence_plan>${JSON.stringify([{
    id: 'E1',
    hypothesisIds: ['A'],
    method,
    title: 'check the branch',
    rationale: 'the disputed branch is not in existing logs',
    instructions: ['reproduce once'],
    ...method === 'user_artifact' ? { artifactHint: 'log file' } : {},
  }])}</evidence_plan>`

const STEPS = '<reproduction_steps>\n1. Restart the game.\n2. Jump near the pit.\n</reproduction_steps>'

function run(events: readonly DebugEvent[], from: DebugPersistedState = INACTIVE): { state: DebugPersistedState; effects: Effect[] } {
  let state = from
  let effects: Effect[] = []
  for (const event of events) {
    const transition = reduce(state, event)
    state = transition.state
    effects = [...transition.effects]
  }
  return { state, effects }
}

function session(state: DebugPersistedState): DebugSessionRecord {
  if (!state.active) throw new Error('expected an active session')
  return state
}

describe('start', () => {
  it('opens round 1 with the agent holding the turn and injects the start prompt', () => {
    const { state, effects } = run([START])
    const active = session(state)
    expect(active.stage).toBe('investigating')
    expect(currentRound(active).index).toBe(1)
    expect(currentRound(active).runId).toBe('run1-aaa')
    expect(effects).toHaveLength(1)
    expect(effects[0]).toMatchObject({ kind: 'prompt', customType: PROMPT_START })
    if (effects[0]?.kind === 'prompt') {
      expect(effects[0].content).toContain('player falls through the floor')
      expect(effects[0].content).toContain('/tmp/dbg/current.jsonl')
    }
  })

  it('ignores a second start and every event while inactive', () => {
    expect(run([START, START]).effects).toEqual([])
    expect(run([{ t: 'turn_settled' }]).state.active).toBe(false)
    expect(run([{ t: 'mark_fixed' }]).state.active).toBe(false)
  })
})

describe('absorbing a turn', () => {
  it('records the plan and steps onto the current round only while investigating', () => {
    const state = run([START, { t: 'assistant_message', text: `${PLAN('agent_inspection')}\n${STEPS}` }]).state
    const round = currentRound(session(state))
    expect(round.plan?.map(request => request.id)).toEqual(['E1'])
    expect(round.reproductionSteps).toEqual(['1. Restart the game.', '2. Jump near the pit.'])
    expect(session(state).turnProduced).toBe(true)
  })

  it('keeps a validated plan when a later message emits an invalid one', () => {
    const state = run([
      START,
      { t: 'assistant_message', text: PLAN('agent_inspection') },
      { t: 'assistant_message', text: '<evidence_plan>[]</evidence_plan>' },
    ]).state
    expect(currentRound(session(state)).plan?.map(request => request.id)).toEqual(['E1'])
  })

  it('attributes probes to the round that wrote them and dedupes the ledger', () => {
    const probe = { id: 'alpha', file: '/a.ts', round: 1 }
    const state = run([
      START,
      { t: 'probes_found', probes: [probe] },
      { t: 'probes_found', probes: [probe] },
    ]).state
    expect(session(state).probes).toEqual([probe])
    expect(currentRound(session(state)).probeIds).toEqual(['alpha'])
  })
})

describe('settling a round', () => {
  function settle(text: string, extra: readonly DebugEvent[] = []): { state: DebugPersistedState; effects: Effect[] } {
    return run([START, { t: 'assistant_message', text }, ...extra, { t: 'turn_settled' }])
  }

  function handOver(text: string, extra: readonly DebugEvent[] = []): { state: DebugPersistedState; effects: Effect[] } {
    return run([
      START,
      { t: 'assistant_message', text },
      ...extra,
      { t: 'turn_settled' },
      { t: 'assistant_message', text: 'still only prose' },
      { t: 'turn_settled' },
    ])
  }

  function handoffOf(state: DebugPersistedState): HandoffMode | null {
    return currentRound(session(state)).handoff
  }

  it('does nothing when the turn produced no assistant message', () => {
    const { state, effects } = run([START, { t: 'turn_settled' }])
    expect(session(state).stage).toBe('investigating')
    expect(effects).toEqual([])
  })

  it('sends a round back for the missing tool call', () => {
    const { state, effects } = settle(`${PLAN('agent_inspection')}\n${STEPS}`)
    expect(session(state).stage).toBe('investigating')
    expect(currentRound(session(state)).nudges).toEqual({ handoff: 1, probes: 0 })
    expect(currentRound(session(state)).awaitingProgress).toBe(true)
    expect(effects).toEqual([{ kind: 'continue', context: handoffNudge(1, true) }])
  })

  it('hands the round over as a reproduction once the reminder went unanswered', () => {
    const { state, effects } = handOver(`${PLAN('agent_inspection')}\n${STEPS}`)
    expect(session(state).stage).toBe('user_turn')
    expect(handoffOf(state)).toBe('reproduce')
    expect(effects[0]).toMatchObject({ kind: 'notify', level: 'info' })
  })

  it('closes the round when the agent answers the reminder with the call', () => {
    const { state, effects } = run([
      START,
      { t: 'assistant_message', text: `${PLAN('agent_inspection')}\n${STEPS}` },
      { t: 'turn_settled' },
      { t: 'tool_used' },
      { t: 'handoff', mode: 'reproduce', steps: ['1. Restart.', '2. Jump.'], plan: null },
      { t: 'turn_settled' },
    ])
    expect(session(state).stage).toBe('user_turn')
    expect(handoffOf(state)).toBe('reproduce')
    expect(currentRound(session(state)).plan?.map(request => request.id)).toEqual(['E1'])
    expect(effects).toEqual([])
  })

  it('calls a user-only plan a capture rather than a reproduction', () => {
    expect(handoffOf(handOver(`${PLAN('user_artifact')}\n${STEPS}`).state)).toBe('capture')
  })

  it('nudges a runtime_probe round whose probes never reached the code', () => {
    const { state, effects } = settle(`${PLAN('runtime_probe')}\n${STEPS}`)
    expect(session(state).stage).toBe('investigating')
    expect(currentRound(session(state)).nudges).toEqual({ handoff: 0, probes: 1 })
    expect(effects).toEqual([{ kind: 'continue', context: PROBE_NUDGE }])
  })

  it('hands over a round that only asked a question as a question', () => {
    const { state, effects } = handOver('Which build are you running?')
    expect(session(state).stage).toBe('user_turn')
    expect(handoffOf(state)).toBe('question')
    expect(effects[0]).toMatchObject({ kind: 'notify', level: 'info' })
  })

  it('gives the round back to the agent when the user replies at a handoff', () => {
    const handed = handOver(`${PLAN('agent_inspection')}\n${STEPS}`).state
    const replied = reduce(handed, { t: 'user_replied' }).state
    expect(session(replied).stage).toBe('investigating')
    expect(session(replied).turnProduced).toBe(false)
    expect(currentRound(session(replied)).handoff).toBeNull()
  })

  it('keeps the round with the user when a turn starts without a user message', () => {
    const handed = handOver(`${PLAN('agent_inspection')}\n${STEPS}`).state
    const nudged = reduce(handed, { t: 'turn_started' }).state
    expect(session(nudged).stage).toBe('user_turn')
    expect(currentRound(session(nudged))).toEqual(currentRound(session(handed)))
  })
})

describe('explicit handoff', () => {
  const HANDOFF: DebugEvent = {
    t: 'handoff',
    mode: 'reproduce',
    steps: ['1. Restart.', '2. Jump.'],
    plan: [{
      id: 'E1',
      hypothesisIds: ['A'],
      method: 'runtime_probe',
      title: 'check the branch',
      rationale: 'the disputed branch is not in existing logs',
      instructions: ['reproduce once'],
    }],
  }

  it('records the declared plan and steps and moves to the user\'s turn', () => {
    const { state, effects } = run([START, HANDOFF])
    const round = currentRound(session(state))
    expect(session(state).stage).toBe('user_turn')
    expect(round.handoff).toBe('reproduce')
    expect(round.plan?.map(request => request.id)).toEqual(['E1'])
    expect(round.reproductionSteps).toEqual(['1. Restart.', '2. Jump.'])
    expect(effects[0]).toMatchObject({ kind: 'notify' })
  })

  it('is ignored once the round already belongs to the user', () => {
    const handed = run([START, HANDOFF]).state
    const again = reduce(handed, { ...HANDOFF, mode: 'question' })
    expect(again.state).toBe(handed)
    expect(again.effects).toEqual([])
  })
})

describe('proceed and cleanup', () => {
  it('opens the next round and injects the proceed prompt', () => {
    const handed = run([
      START,
      { t: 'handoff', mode: 'reproduce', steps: ['1. Restart.'], plan: null },
    ]).state
    const { state, effects } = run([{
      t: 'proceed',
      runId: 'run2-bbb',
      logCount: 4,
      hypotheses: 'A:4',
      now: 1000,
      details: 'still falling',
    }], handed)
    const active = session(state)
    expect(active.stage).toBe('investigating')
    expect(currentRound(active).index).toBe(2)
    expect(active.observations).toHaveLength(1)
    expect(effects[0]).toMatchObject({ kind: 'prompt', customType: PROMPT_PROCEED })
  })

  it('starts cleanup when the user marks the problem fixed', () => {
    const { state, effects } = run([START, { t: 'mark_fixed' }])
    expect(session(state).stage).toBe('cleaning_up')
    expect(effects[0]).toMatchObject({ kind: 'prompt', customType: PROMPT_FIXED })
  })

  it('tears down after a produced cleanup turn with an empty ledger', () => {
    const cleaning = run([
      START,
      { t: 'mark_fixed' },
      { t: 'assistant_message', text: 'removed probes' },
      { t: 'turn_settled' },
    ])
    expect(cleaning.state.active).toBe(false)
    expect(cleaning.effects[0]).toMatchObject({ kind: 'teardown', outcome: 'finished' })
  })

  it('aborts to inactive and tears down', () => {
    const { state, effects } = run([START, { t: 'abort' }])
    expect(state.active).toBe(false)
    expect(effects[0]).toMatchObject({ kind: 'teardown', outcome: 'aborted' })
  })
})
