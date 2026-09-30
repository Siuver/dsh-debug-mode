import { describe, expect, it } from 'vitest'
import { decideGate, describeHandoff } from '../src/gate.ts'
import { handoffNudge, PROBE_NUDGE } from '../src/methodology.ts'

const base = {
  round: 1,
  hasReproductionSteps: false,
  hasEvidencePlan: false,
  declaresRuntimeProbe: false,
  needsUserCapture: false,
  liveProbes: 0,
  probesAddedThisRound: 0,
  nudges: { handoff: 0, probes: 0 },
  awaitingProgress: false,
}

describe('decideGate', () => {
  it('nudges for missing instrumentation before anything else', () => {
    expect(decideGate({ ...base, declaresRuntimeProbe: true, hasReproductionSteps: true, hasEvidencePlan: true }))
      .toEqual({ kind: 'nudge', budget: 'probes', context: PROBE_NUDGE })
  })

  it('nudges for a missing handoff tool call', () => {
    expect(decideGate({ ...base, hasReproductionSteps: true, hasEvidencePlan: true }))
      .toEqual({ kind: 'nudge', budget: 'handoff', context: handoffNudge(1, true) })
  })

  it('hands over a question once the reminder is spent', () => {
    expect(decideGate({ ...base, nudges: { handoff: 1, probes: 0 }, awaitingProgress: true }))
      .toEqual({ kind: 'handoff', mode: 'question', missingPlan: false })
  })
})

describe('describeHandoff', () => {
  it('never names a slash command', () => {
    for (const mode of ['reproduce', 'capture', 'question', 'incomplete'] as const) {
      expect(describeHandoff(mode, 1, true)).not.toMatch(/\/debug-/)
    }
  })
})
