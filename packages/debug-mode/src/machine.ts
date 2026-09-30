/**
 * Pure debug-mode reducer. Filesystem, UI, and model I/O are returned as effects.
 * @module @deepseek-ai/dsh-debug-mode/machine
 */

import { MAX_HANDOFF_NUDGES, MAX_PROBE_NUDGES } from './constants.ts'
import { decideGate, describeHandoff, type GateFacts } from './gate.ts'
import {
  CLEANUP_NUDGE,
  buildFixedMessage,
  buildProceedMessage,
  buildStartMessage,
  extractReproductionSteps,
} from './methodology.ts'
import { validateEvidenceRequests } from './evidence.ts'
import {
  INACTIVE,
  allRequests,
  blankRound,
  currentRound,
  declaresRuntimeProbe,
  evidenceSummary,
  freshSession,
  needsUserCapture,
  pendingRequests,
  withRound,
} from './state.ts'
import type {
  DebugPersistedState,
  DebugRound,
  DebugSessionRecord,
  EvidenceArtifact,
  EvidenceObservation,
  EvidenceRequest,
  HandoffMode,
  Probe,
} from './types.ts'

export const PROMPT_START = 'debug-mode-start'
export const PROMPT_PROCEED = 'debug-mode-proceed'
export const PROMPT_FIXED = 'debug-mode-fixed'

const SPENT_NUDGES = { handoff: MAX_HANDOFF_NUDGES, probes: MAX_PROBE_NUDGES }

/** Artifact metadata gathered by the shell; the reducer only files it. */
export type ArtifactCandidate = Omit<EvidenceArtifact, 'id' | 'addedAt' | 'requestId'>

export type DebugEvent =
  | { readonly t: 'start'; readonly problem: string; readonly debugDir: string; readonly runId: string; readonly logFile: string }
  | { readonly t: 'turn_started' }
  | { readonly t: 'user_replied' }
  | { readonly t: 'assistant_message'; readonly text: string }
  | { readonly t: 'tool_used' }
  | { readonly t: 'probes_found'; readonly probes: readonly Probe[] }
  | { readonly t: 'ledger_synced'; readonly probes: readonly Probe[] }
  | { readonly t: 'runs_observed'; readonly runHistory: readonly string[]; readonly logCounts: Readonly<Record<string, number>> }
  | { readonly t: 'turn_settled' }
  | { readonly t: 'handoff'; readonly mode: Exclude<HandoffMode, 'incomplete'>; readonly steps: readonly string[]; readonly plan: readonly EvidenceRequest[] | null }
  | { readonly t: 'reclaim' }
  | { readonly t: 'proceed'; readonly runId: string; readonly logCount: number; readonly hypotheses: string; readonly details?: string; readonly now: number }
  | { readonly t: 'mark_fixed' }
  | { readonly t: 'attach_artifact'; readonly candidate: ArtifactCandidate; readonly requestId: string | null; readonly now: number }
  | { readonly t: 'abort' }

export type Effect =
  | { readonly kind: 'notify'; readonly level: 'info' | 'warning' | 'error'; readonly text: string }
  | { readonly kind: 'prompt'; readonly customType: string; readonly content: string; readonly summary: string }
  | { readonly kind: 'continue'; readonly context: string }
  | { readonly kind: 'teardown'; readonly outcome: 'finished' | 'aborted'; readonly probesLeft: readonly Probe[]; readonly debugDir: string | null }

export interface Transition {
  readonly state: DebugPersistedState
  readonly effects: readonly Effect[]
}

type ActiveState = { readonly active: true } & DebugSessionRecord

function unchanged(state: DebugPersistedState): Transition {
  return { state, effects: [] }
}

/**
 * Reduce one event. Pure and total.
 * @param state - previous persisted state.
 * @param event - one machine event.
 */
export function reduce(state: DebugPersistedState, event: DebugEvent): Transition {
  if (event.t === 'start') {
    if (state.active) return unchanged(state)
    return {
      state: { active: true, ...freshSession(event.problem, event.debugDir, event.runId) },
      effects: [{
        kind: 'prompt',
        customType: PROMPT_START,
        content: buildStartMessage(event.problem, event.logFile),
        summary: 'debug mode started — hypotheses and instrumentation',
      }],
    }
  }
  if (!state.active) return unchanged(state)
  const session: ActiveState = state

  switch (event.t) {
    case 'turn_started':
      return session.turnProduced ? unchanged({ ...session, turnProduced: false }) : unchanged(session)
    case 'user_replied':
      return unchanged(session.stage === 'user_turn' ? reopenRound(session) : session)
    case 'assistant_message':
      return unchanged(absorbAssistantText(session, event.text))
    case 'tool_used':
      return unchanged(clearNudgeWait(session))
    case 'probes_found': {
      const fresh = event.probes.filter(probe => !session.probes.some(known => known.id === probe.id))
      if (fresh.length === 0) return unchanged(session)
      const probes = [...session.probes, ...fresh]
      if (session.stage !== 'investigating') return unchanged({ ...session, probes })
      const round = currentRound(session)
      return unchanged(withRound({ ...session, probes }, {
        ...round,
        probeIds: [...round.probeIds, ...fresh.map(probe => probe.id)],
      }))
    }
    case 'ledger_synced': {
      const same = event.probes.length === session.probes.length
        && event.probes.every((probe, index) => probe.id === session.probes[index]?.id)
      return unchanged(same ? session : { ...session, probes: [...event.probes] })
    }
    case 'runs_observed':
      return unchanged({ ...session, runHistory: [...event.runHistory], logCounts: { ...event.logCounts } })
    case 'turn_settled':
      return settle(session)
    case 'handoff':
      return applyHandoff(session, event)
    case 'reclaim':
      return reclaim(session)
    case 'proceed':
      return advance(session, event)
    case 'mark_fixed':
      return startCleanup(session)
    case 'attach_artifact':
      return attach(session, event)
    case 'abort':
      return {
        state: INACTIVE,
        effects: [{
          kind: 'teardown',
          outcome: 'aborted',
          probesLeft: session.probes,
          debugDir: session.debugDir,
        }],
      }
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
  }
}

function reopenRound(session: ActiveState): ActiveState {
  const round = currentRound(session)
  return withRound(
    { ...session, stage: 'investigating', turnProduced: false },
    { ...round, handoff: null, nudges: { handoff: 0, probes: 0 }, awaitingProgress: false },
  )
}

function clearNudgeWait(session: ActiveState): ActiveState {
  if (session.stage !== 'investigating') return session
  const round = currentRound(session)
  if (!round.awaitingProgress) return session
  return withRound(session, { ...round, awaitingProgress: false })
}

function absorbAssistantText(session: ActiveState, text: string): ActiveState {
  const round = currentRound(session)
  const steps = session.stage === 'investigating' ? extractReproductionSteps(text) : []
  const parsed = session.stage === 'investigating' ? parsePlanFromText(text) : null
  const next: DebugRound = {
    ...round,
    reproductionSteps: steps.length > 0 ? steps : round.reproductionSteps,
    plan: parsed ?? round.plan,
  }
  const roundChanged = next.reproductionSteps !== round.reproductionSteps || next.plan !== round.plan
  if (!roundChanged) return session.turnProduced ? session : { ...session, turnProduced: true }
  return withRound({ ...session, turnProduced: true }, next)
}

function parsePlanFromText(text: string): EvidenceRequest[] | null {
  const match = /<evidence_plan>\s*([\s\S]*?)\s*<\/evidence_plan>/i.exec(text)
  if (match === null) return null
  try {
    const parsed: unknown = JSON.parse(match[1]!)
    const validation = validateEvidenceRequests(parsed)
    return validation.ok ? validation.requests : null
  } catch (_parseError) {
    return null
  }
}

function gateFacts(session: ActiveState, round: DebugRound): GateFacts {
  return {
    round: round.index,
    hasReproductionSteps: round.reproductionSteps.length > 0,
    hasEvidencePlan: round.plan !== null,
    declaresRuntimeProbe: declaresRuntimeProbe(round),
    needsUserCapture: needsUserCapture(round),
    liveProbes: session.probes.length,
    probesAddedThisRound: round.probeIds.filter(id => session.probes.some(probe => probe.id === id)).length,
    nudges: round.nudges,
    awaitingProgress: round.awaitingProgress,
  }
}

function settle(session: ActiveState): Transition {
  if (session.stage === 'cleaning_up') return finishCleanup(session)
  if (session.stage !== 'investigating' || !session.turnProduced) return unchanged(session)
  const round = currentRound(session)
  const decision = decideGate(gateFacts(session, round))
  if (decision.kind === 'nudge') {
    const nudges = decision.budget === 'probes'
      ? { ...round.nudges, probes: round.nudges.probes + 1 }
      : { ...round.nudges, handoff: round.nudges.handoff + 1 }
    return {
      state: withRound(session, { ...round, nudges, awaitingProgress: true }),
      effects: [{ kind: 'continue', context: decision.context }],
    }
  }
  return handOff(session, decision.mode, decision.missingPlan)
}

function handOff(session: ActiveState, mode: HandoffMode, missingPlan: boolean): Transition {
  const round = currentRound(session)
  const next = withRound({ ...session, stage: 'user_turn' }, { ...round, handoff: mode })
  const pending = pendingRequests(next)
  const detail = pending.length > 0 ? ` Pending: ${pending.map(request => request.id).join(', ')}.` : ''
  return {
    state: next,
    effects: [{
      kind: 'notify',
      level: mode === 'incomplete' || missingPlan ? 'warning' : 'info',
      text: `${describeHandoff(mode, round.index, missingPlan)}${detail}`,
    }],
  }
}

function applyHandoff(
  session: ActiveState,
  event: Extract<DebugEvent, { t: 'handoff' }>,
): Transition {
  if (session.stage !== 'investigating') return unchanged(session)
  const round = currentRound(session)
  const updated: DebugRound = {
    ...round,
    plan: event.plan ?? round.plan,
    reproductionSteps: event.steps.length > 0 ? [...event.steps] : round.reproductionSteps,
  }
  const staged = withRound({ ...session, turnProduced: true }, updated)
  const expectsPlan = event.mode !== 'question'
  return handOff(staged, event.mode, expectsPlan && updated.plan === null)
}

function reclaim(session: ActiveState): Transition {
  if (session.stage !== 'investigating') return unchanged(session)
  const round = currentRound(session)
  const decision = decideGate({ ...gateFacts(session, round), nudges: SPENT_NUDGES })
  if (decision.kind === 'nudge') return handOff(session, 'incomplete', round.plan === null)
  return handOff(session, decision.mode, decision.missingPlan)
}

function finishCleanup(session: ActiveState): Transition {
  if (!session.turnProduced) return unchanged(session)
  if (session.probes.length > 0 && session.cleanupNudges < 1) {
    return {
      state: { ...session, cleanupNudges: session.cleanupNudges + 1 },
      effects: [{
        kind: 'continue',
        context: `${CLEANUP_NUDGE}\nRemaining probes: ${JSON.stringify(session.probes)}`,
      }],
    }
  }
  return {
    state: INACTIVE,
    effects: [{
      kind: 'teardown',
      outcome: 'finished',
      probesLeft: session.probes,
      debugDir: session.debugDir,
    }],
  }
}

function advance(session: ActiveState, event: Extract<DebugEvent, { t: 'proceed' }>): Transition {
  const closing = currentRound(session)
  const details = event.details?.trim() ?? ''
  let withObservation: ActiveState = session
  if (details.length > 0) {
    const reportIds = (closing.plan ?? [])
      .filter(request => request.method === 'user_report')
      .map(request => request.id)
    const observation: EvidenceObservation = {
      id: `observation-${event.now.toString(36)}`,
      requestIds: reportIds,
      text: details,
      round: closing.index,
      addedAt: event.now,
    }
    withObservation = { ...session, observations: [...session.observations, observation] }
  }
  const summary = evidenceSummary(withObservation, closing)
  const next: ActiveState = {
    ...withObservation,
    stage: 'investigating',
    turnProduced: false,
    rounds: [...withObservation.rounds, blankRound(closing.index + 1, event.runId)],
    runHistory: [...withObservation.runHistory, event.runId],
    logCounts: { ...withObservation.logCounts, [event.runId]: 0 },
  }
  const label = details.length > 0 ? 'proceed with user details' : 'proceed'
  return {
    state: next,
    effects: [{
      kind: 'prompt',
      customType: PROMPT_PROCEED,
      content: buildProceedMessage({
        run: closing.runId ?? '(none)',
        logCount: event.logCount,
        ...details.length > 0 ? { userDetails: details } : {},
        hypotheses: event.hypotheses,
        evidenceSummary: summary,
      }),
      summary: `${label} — analyzing run ${closing.runId ?? '(none)'} (${event.logCount} entries)`,
    }],
  }
}

function startCleanup(session: ActiveState): Transition {
  const next: ActiveState = { ...session, stage: 'cleaning_up', turnProduced: false, cleanupNudges: 0 }
  const evidenceJson = JSON.stringify({
    requests: allRequests(session),
    observations: session.observations,
    artifacts: session.artifacts,
  })
  return {
    state: next,
    effects: [{
      kind: 'prompt',
      customType: PROMPT_FIXED,
      content: buildFixedMessage(JSON.stringify(session.probes), evidenceJson),
      summary: `marked fixed — removing ${session.probes.length} probe(s)`,
    }],
  }
}

function attach(session: ActiveState, event: Extract<DebugEvent, { t: 'attach_artifact' }>): Transition {
  if (event.requestId !== null && !allRequests(session).some(request => request.id === event.requestId)) {
    return {
      state: session,
      effects: [{ kind: 'notify', level: 'error', text: `debug-mode: unknown evidence request id ${event.requestId}` }],
    }
  }
  const existing = session.artifacts.find(artifact => artifact.path === event.candidate.path)
  const artifact: EvidenceArtifact = existing === undefined
    ? { id: `artifact-${event.now.toString(36)}`, requestId: event.requestId, ...event.candidate, addedAt: event.now }
    : { ...existing, ...event.candidate, requestId: event.requestId }
  const artifacts = existing === undefined
    ? [...session.artifacts, artifact]
    : session.artifacts.map(item => (item.path === artifact.path ? artifact : item))
  return {
    state: { ...session, artifacts },
    effects: [{
      kind: 'notify',
      level: 'info',
      text: `debug-mode: attached ${artifact.id} → ${artifact.path} (${artifact.size} bytes)`,
    }],
  }
}
