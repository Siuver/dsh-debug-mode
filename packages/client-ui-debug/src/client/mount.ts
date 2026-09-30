/** Source-safe lifecycle for the optional debug Remote and browser UI. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-debug-mode/remote'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { DebugChip, type DebugChipInjected } from './DebugChip.tsx'
import { DebugDock, type DebugDockInjected } from './DebugDock.tsx'
import { en, NS, zh, type DebugKey } from './locales.ts'
import { observeDebug } from './observe.ts'
import { panelStore } from './panel.ts'
import { installDebugStyles } from './styles.ts'

export const inject = ['remote', 'slots', 'locale']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Debug-mode composer chip and dock copy. */
    'debug-mode': DebugKey
  }
}

function registerUi(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }))
  ctx.effect(() => installDebugStyles())
  const observations = new Map<SessionId, ReturnType<typeof observeDebug>>()
  const panels = new Map<SessionId, SnapshotStore<boolean>>()
  ctx.effect(() => async () => {
    await Promise.all([...observations.values()].map(item => item.dispose()))
    observations.clear()
    panels.clear()
  })

  const readinessOf = (sessionId: SessionId) => {
    let observation = observations.get(sessionId)
    if (observation === undefined) {
      observation = observeDebug(ctx, sessionId)
      observations.set(sessionId, observation)
    }
    return observation.state
  }

  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'debug',
    order: 20,
    locale: NS,
    inject: (sessionId: SessionId): DebugChipInjected => ({
      hooks: {
        debugReadiness: readinessOf(sessionId),
        debugPanel: panelStore(panels, sessionId),
      },
      togglePanel: () => {
        const store = panelStore(panels, sessionId)
        store.set(!store.getSnapshot())
      },
    }),
  }, DebugChip))

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'debug',
    order: 20,
    locale: NS,
    inject: (sessionId: SessionId): DebugDockInjected => ({
      hooks: {
        debugReadiness: readinessOf(sessionId),
        debugPanel: panelStore(panels, sessionId),
      },
      closePanel: () => { panelStore(panels, sessionId).set(false) },
      start: async problem => await ctx.remote.debug.start(sessionId, { problem }),
      proceed: async details => await ctx.remote.debug.proceed(sessionId, details === undefined ? {} : { details }),
      done: async () => await ctx.remote.debug.done(sessionId),
      abort: async () => {
        const result = await ctx.remote.debug.abort(sessionId)
        if (result.ok) panelStore(panels, sessionId).set(false)
        return result
      },
      clearLogs: async () => await ctx.remote.debug.clearLogs(sessionId),
      attach: async (path, requestId) => await ctx.remote.debug.attach(sessionId, {
        path,
        ...requestId === undefined ? {} : { requestId },
      }),
    }),
  }, DebugDock))
}

/**
 * Mount this namespace without adding it to stable API Remotes.
 * @param ctx - Client runtime.
 * @param contribution - debug Remote definitions.
 */
export async function mountDebug(ctx: Context, contribution: TypertRemoteContribution): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.debug', 'slots', 'locale'], registerUi)
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await disposeRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await disposeRemote()
  }
}
