/** Probe marker scanned in the working tree. */
export const PROBE_MARK = '@dsh-probe'

/** Active run log file name under a session debug directory. */
export const ACTIVE_LOG_FILE = 'current.jsonl'

/** Persisted machine filename under a session debug directory. */
export const STATE_FILE = 'state.json'

/** Workspace-relative parent of per-session debug directories. */
export const DEBUG_ROOT = ['.dsh', 'debug'] as const

/** Upper bound on accepted plan entries. */
export const MAX_EVIDENCE_REQUESTS = 12

/** Handoff reminder budget per agent turn. */
export const MAX_HANDOFF_NUDGES = 3

/** Probe-instrumentation reminder budget per agent turn. */
export const MAX_PROBE_NUDGES = 1

/** Tool that closes a round and hands it to the user. */
export const HANDOFF_TOOL = 'hand_off_to_user'

/** Prompt section name while debug mode is active. */
export const DEBUG_POLICY_SECTION = 'debug:policy'

/** Placement next to plan-mode policy (PLAN_POLICY = 500). */
export const DEBUG_POLICY_ORDER = 501
