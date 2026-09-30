/**
 * Pure helpers over persisted debug-mode state.
 * @module @deepseek-ai/dsh-debug-mode/state
 */

import { ACTIVE_LOG_FILE } from './constants.ts'
import type {
  DebugPersistedState,
  DebugRound,
  DebugSessionRecord,
  DebugSnapshot,
  EvidenceRequest,
  Probe,
} from './types.ts'

/** Inactive persisted value. */
export const INACTIVE: DebugPersistedState = { active: false }

/**
 * Empty round record.
 * @param index - 1-based round number.
 * @param runId - probe-log run id, or null before the first run.
 */
export function blankRound(index: number, runId: string | null): DebugRound {
  return {
    index,
    runId,
    plan: null,
    reproductionSteps: [],
    probeIds: [],
    nudges: { handoff: 0, probes: 0 },
    awaitingProgress: false,
    handoff: null,
  }
}

/**
 * First-round session after the user starts debug mode.
 * @param problem - user-authored symptom.
 * @param debugDir - absolute session debug directory.
 * @param runId - first run id.
 */
export function freshSession(problem: string, debugDir: string, runId: string): DebugSessionRecord {
  return {
    stage: 'investigating',
    problem,
    debugDir,
    rounds: [blankRound(1, runId)],
    probes: [],
    runHistory: [runId],
    logCounts: { [runId]: 0 },
    artifacts: [],
    observations: [],
    turnProduced: false,
    cleanupNudges: 0,
  }
}

/**
 * Last round, or a blank first round when the array is empty.
 * @param session - active session.
 */
export function currentRound(session: DebugSessionRecord): DebugRound {
  return session.rounds[session.rounds.length - 1] ?? blankRound(1, null)
}

/**
 * Active run id for the current round.
 * @param session - active session.
 */
export function activeRunId(session: DebugSessionRecord): string | null {
  return currentRound(session).runId
}

/**
 * Absolute JSONL path for one run.
 * @param debugDir - session debug directory.
 * @param run - run id.
 * @param activeRun - current run id.
 */
export function resolveRunLogFile(debugDir: string, run: string, activeRun: string | null): string {
  return joinPosix(debugDir, run === activeRun ? ACTIVE_LOG_FILE : `${run}.jsonl`)
}

/**
 * Absolute JSONL path for a run on an active session.
 * @param session - active session.
 * @param run - run id, defaulting to the current run.
 */
export function logFileFor(session: DebugSessionRecord, run: string | null = activeRunId(session)): string | null {
  if (run === null) return null
  return resolveRunLogFile(session.debugDir, run, activeRunId(session))
}

/**
 * Replace the last round.
 * @param session - active session.
 * @param round - replacement last round.
 */
export function withRound(session: DebugSessionRecord, round: DebugRound): DebugSessionRecord {
  return { ...session, rounds: [...session.rounds.slice(0, -1), round] }
}

/**
 * Requests that still need a user report or artifact.
 * @param session - active session.
 * @param round - round to inspect.
 */
export function pendingRequests(
  session: DebugSessionRecord,
  round: DebugRound = currentRound(session),
): EvidenceRequest[] {
  return (round.plan ?? []).filter((request) => {
    if (request.method === 'user_artifact') {
      return !session.artifacts.some(artifact => artifact.requestId === request.id)
    }
    if (request.method === 'user_report') {
      return !session.observations.some(observation => observation.requestIds.includes(request.id))
    }
    return false
  })
}

/**
 * Every request the session has declared, newest round last.
 * @param session - active session.
 */
export function allRequests(session: DebugSessionRecord): EvidenceRequest[] {
  return session.rounds.flatMap(round => round.plan ?? [])
}

/**
 * Whether the round selected runtime probes.
 * @param round - round to inspect.
 */
export function declaresRuntimeProbe(round: DebugRound): boolean {
  return (round.plan ?? []).some(request => request.method === 'runtime_probe')
}

/**
 * Whether the round asks the user to report or capture something themselves.
 * @param round - round to inspect.
 */
export function needsUserCapture(round: DebugRound): boolean {
  return (round.plan ?? []).some(
    request => request.method === 'user_report' || request.method === 'user_artifact',
  )
}

/**
 * One-line evidence status.
 * @param session - active session.
 * @param round - round to summarize.
 */
export function evidenceSummary(
  session: DebugSessionRecord,
  round: DebugRound = currentRound(session),
): string {
  const requests = round.plan ?? []
  if (requests.length === 0) return 'no evidence requests this round'
  const pending = pendingRequests(session, round)
  const methods = requests.map(request => `${request.id}:${request.method}`).join(', ')
  return `${requests.length} request(s) [${methods}], ${pending.length} pending user action(s), ${session.artifacts.length} artifact(s), ${session.observations.length} observation(s)`
}

/**
 * Client snapshot from persisted state plus a pending enter/leave flag.
 * @param state - persisted machine.
 * @param pending - process-local pending selection.
 */
export function snapshotOf(state: DebugPersistedState, pending: boolean): DebugSnapshot {
  if (!state.active) {
    return {
      active: false,
      pending,
      stage: null,
      problem: null,
      round: null,
      handoff: null,
      reproductionSteps: [],
      plan: [],
      pendingRequests: [],
      probes: [],
      artifacts: [],
      observations: [],
      logFile: null,
      logCount: 0,
      runId: null,
    }
  }
  const round = currentRound(state)
  const runId = activeRunId(state)
  return {
    active: true,
    pending,
    stage: state.stage,
    problem: state.problem,
    round: round.index,
    handoff: round.handoff,
    reproductionSteps: round.reproductionSteps,
    plan: round.plan ?? [],
    pendingRequests: pendingRequests(state, round),
    probes: state.probes,
    artifacts: state.artifacts,
    observations: state.observations,
    logFile: logFileFor(state, runId),
    logCount: runId === null ? 0 : state.logCounts[runId] ?? 0,
    runId,
  }
}

/**
 * Deduplicate probes by id, keeping the first occurrence.
 * @param probes - unordered probe list.
 */
export function uniqueProbes(probes: readonly Probe[]): Probe[] {
  const seen = new Set<string>()
  const out: Probe[] = []
  for (const probe of probes) {
    if (seen.has(probe.id)) continue
    seen.add(probe.id)
    out.push(probe)
  }
  return out
}

function joinPosix(root: string, name: string): string {
  if (root.endsWith('/') || root.endsWith('\\')) return `${root}${name}`
  return `${root}/${name}`
}
