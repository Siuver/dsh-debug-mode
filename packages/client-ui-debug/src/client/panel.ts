/** Per-session whether the inactive start form is open. */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * Resolve one Session's start-form store.
 * @param stores - per-session stores.
 * @param sessionId - Session identity.
 */
export function panelStore(
  stores: Map<SessionId, SnapshotStore<boolean>>,
  sessionId: SessionId,
): SnapshotStore<boolean> {
  let store = stores.get(sessionId)
  if (store === undefined) {
    store = createSnapshotStore(false)
    stores.set(sessionId, store)
  }
  return store
}
