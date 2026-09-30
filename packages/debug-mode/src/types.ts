/**
 * JSON-safe debug-mode values shared by Host storage, tools, and the Client Remote.
 * @module @deepseek-ai/dsh-debug-mode/types
 */

/** Whose move it is. Exactly one user stage exists: a handed-back round is the user's. */
export type DebugStage = 'investigating' | 'user_turn' | 'cleaning_up'

/** How the agent handed the round back. Wording only; every mode is the same user stage. */
export type HandoffMode = 'reproduce' | 'capture' | 'question' | 'incomplete'

/** Cheapest-first evidence method per hypothesis. */
export type EvidenceMethod = 'agent_inspection' | 'runtime_probe' | 'user_report' | 'user_artifact'

/** One `@dsh-probe <id>` marker still recorded against a file. */
export interface Probe {
  readonly id: string
  readonly file: string
  readonly round: number
}

/** One evidence request covering one or more hypotheses. */
export interface EvidenceRequest {
  readonly id: string
  readonly hypothesisIds: readonly string[]
  readonly method: EvidenceMethod
  readonly title: string
  readonly rationale: string
  readonly instructions: readonly string[]
  readonly artifactHint?: string
}

/** A user-supplied file referenced in place. */
export interface EvidenceArtifact {
  readonly id: string
  readonly requestId: string | null
  readonly path: string
  readonly name: string
  readonly size: number
  readonly mtimeMs: number
  readonly addedAt: number
}

/** A user report recorded on proceed. */
export interface EvidenceObservation {
  readonly id: string
  readonly requestIds: readonly string[]
  readonly text: string
  readonly round: number
  readonly addedAt: number
}

/** One evidence round. Round-scoped data lives here, not in a session-wide filter. */
export interface DebugRound {
  readonly index: number
  readonly runId: string | null
  readonly plan: readonly EvidenceRequest[] | null
  readonly reproductionSteps: readonly string[]
  readonly probeIds: readonly string[]
  readonly nudges: { readonly handoff: number; readonly probes: number }
  readonly awaitingProgress: boolean
  readonly handoff: HandoffMode | null
}

/** Active debug session persisted under the workspace `.dsh/debug/<sessionId>/` directory. */
export interface DebugSessionRecord {
  readonly stage: DebugStage
  readonly problem: string
  readonly debugDir: string
  readonly rounds: readonly DebugRound[]
  readonly probes: readonly Probe[]
  readonly runHistory: readonly string[]
  readonly logCounts: Readonly<Record<string, number>>
  readonly artifacts: readonly EvidenceArtifact[]
  readonly observations: readonly EvidenceObservation[]
  readonly turnProduced: boolean
  readonly cleanupNudges: number
}

/** Discriminated persisted state. */
export type DebugPersistedState =
  | { readonly active: false }
  | ({ readonly active: true } & DebugSessionRecord)

/** Client/Remote snapshot: persisted state plus process-local pending and log path. */
export interface DebugSnapshot {
  readonly active: boolean
  readonly pending: boolean
  readonly stage: DebugStage | null
  readonly problem: string | null
  readonly round: number | null
  readonly handoff: HandoffMode | null
  readonly reproductionSteps: readonly string[]
  readonly plan: readonly EvidenceRequest[]
  readonly pendingRequests: readonly EvidenceRequest[]
  readonly probes: readonly Probe[]
  readonly artifacts: readonly EvidenceArtifact[]
  readonly observations: readonly EvidenceObservation[]
  readonly logFile: string | null
  readonly logCount: number
  readonly runId: string | null
}

/** Result of one Remote mutation. */
export type DebugSetOutcome = 'committed' | 'queued' | 'cancelled' | 'noop'

/** Wire payload for entering debug mode. */
export interface DebugStartRequest {
  readonly problem: string
}

/** Wire payload for proceeding after a user reproduction or capture. */
export interface DebugProceedRequest {
  readonly details?: string
}

/** Wire payload for attaching one user artifact. */
export interface DebugAttachRequest {
  readonly path: string
  readonly requestId?: string
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Debug mode refused the mutation because the session is not in the required stage. */
    'debug/invalid-state': { readonly reason: string }
    /** Debug mode could not resolve the live Agent for the named Session. */
    'debug/agent-unavailable': { readonly sessionId: string }
  }
}
