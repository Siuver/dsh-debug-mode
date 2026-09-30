/** One reconnecting Host snapshot mirror shared by a Session's debug UI. */
import type { Context } from '@deepseek-ai/cordis'
import { RemoteStreamCarrierError } from '@deepseek-ai/dsh-api-gateway/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { DebugSnapshot } from '@deepseek-ai/dsh-debug-mode/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

const INACTIVE: DebugSnapshot = {
  active: false,
  pending: false,
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

/** Complete debug snapshot plus a transport failure that never rewrites Host state. */
export interface DebugReadiness {
  readonly snapshot: DebugSnapshot
  readonly connected: boolean
  readonly error: string | null
}

/**
 * Subscribe once per Session to the debug Remote stream.
 * @param ctx - mounted debug Remote owner.
 * @param sessionId - live Session identity.
 */
export function observeDebug(
  ctx: Context,
  sessionId: SessionId,
): { state: SnapshotStore<DebugReadiness>; dispose: () => Promise<void> } {
  const state = createSnapshotStore<DebugReadiness>({ snapshot: INACTIVE, connected: false, error: null })
  let disposed = false
  const fail = (error: unknown): void => {
    if (disposed) return
    state.set({
      ...state.getSnapshot(),
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  const stream = ctx.remote.$stream<DebugSnapshot>({
    name: 'Debug snapshot',
    open: signal => ctx.remote.debug.follow(sessionId, signal),
    ended: () => new RemoteStreamCarrierError('Debug snapshot stream ended'),
    carrierFailed: fail,
  })
  const observing = (async () => {
    try {
      for await (const item of stream) {
        state.set({ snapshot: item.value, connected: true, error: null })
        item.accept()
      }
    } catch (error) {
      if (!disposed) fail(error)
    }
  })()
  return {
    state,
    dispose: async () => {
      disposed = true
      await stream.dispose()
      await observing
    },
  }
}

export { INACTIVE as INACTIVE_SNAPSHOT }
