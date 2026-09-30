/**
 * Per-turn settle gate: hand off, or nudge the agent to close properly.
 * @module @deepseek-ai/dsh-debug-mode/gate
 */

import { MAX_HANDOFF_NUDGES, MAX_PROBE_NUDGES } from './constants.ts'
import { handoffNudge, PROBE_NUDGE } from './methodology.ts'
import type { HandoffMode } from './types.ts'

/** Facts the gate reads; never the whole session. */
export interface GateFacts {
  readonly round: number
  readonly hasReproductionSteps: boolean
  readonly hasEvidencePlan: boolean
  readonly declaresRuntimeProbe: boolean
  readonly needsUserCapture: boolean
  readonly liveProbes: number
  readonly probesAddedThisRound: number
  readonly nudges: { readonly handoff: number; readonly probes: number }
  readonly awaitingProgress: boolean
}

export type GateDecision =
  | { readonly kind: 'handoff'; readonly mode: HandoffMode; readonly missingPlan: boolean }
  | { readonly kind: 'nudge'; readonly budget: 'handoff' | 'probes'; readonly context: string }

/**
 * Decide whether a settled investigating turn may reach the user.
 * Every path is a missing `hand_off_to_user` call.
 * @param facts - round facts.
 */
export function decideGate(facts: GateFacts): GateDecision {
  if (facts.declaresRuntimeProbe && facts.liveProbes === 0) {
    if (facts.nudges.probes < MAX_PROBE_NUDGES) {
      return { kind: 'nudge', budget: 'probes', context: PROBE_NUDGE }
    }
    return close('incomplete', facts)
  }
  if (facts.nudges.handoff < MAX_HANDOFF_NUDGES && !facts.awaitingProgress) {
    return {
      kind: 'nudge',
      budget: 'handoff',
      context: handoffNudge(facts.round, facts.hasReproductionSteps || facts.hasEvidencePlan),
    }
  }
  return close(proseMode(facts), facts)
}

function proseMode(facts: GateFacts): HandoffMode {
  if (facts.hasReproductionSteps) {
    return facts.needsUserCapture && !facts.declaresRuntimeProbe ? 'capture' : 'reproduce'
  }
  if (facts.hasEvidencePlan && facts.needsUserCapture) return 'capture'
  if (!facts.hasEvidencePlan && facts.probesAddedThisRound === 0) return 'question'
  return 'incomplete'
}

function close(mode: HandoffMode, facts: GateFacts): GateDecision {
  const expectsPlan = mode === 'reproduce' || mode === 'capture'
  return { kind: 'handoff', mode, missingPlan: expectsPlan && !facts.hasEvidencePlan }
}

/**
 * One-line handoff description for the dock and transcript.
 * @param mode - handoff wording.
 * @param round - round index.
 * @param missingPlan - whether the plan is still absent.
 */
export function describeHandoff(mode: HandoffMode, round: number, missingPlan: boolean): string {
  const planNote = missingPlan
    ? ' The agent declared no valid evidence plan for this round, so nothing links what you capture to a hypothesis.'
    : ''
  switch (mode) {
    case 'reproduce':
      return `Round ${round} is with you — reproduce so the probes record, then proceed from the debug dock.${planNote}`
    case 'capture':
      return `Round ${round} is with you — capture or report the requested evidence, then proceed from the debug dock.${planNote}`
    case 'question':
      return `Round ${round} is with you — answer the agent's question. Proceed only once you have something to analyze.`
    case 'incomplete':
      return `Round ${round} is with you — the agent stopped without a complete handoff. Reply in the composer or proceed with whatever evidence already exists.${planNote}`
  }
}
