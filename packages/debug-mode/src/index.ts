/**
 * Debug mode is per-agent collaboration state stored on disk under the
 * workspace `.dsh/debug/<sessionId>/` directory. Session.append cannot mark
 * unknown events `ignorable`, so an out-of-tree plugin must not write custom
 * session events: a stock DSH reader would refuse the log.
 *
 * While active, a deployment-owned `debug:policy` section is included in each
 * model request. The four debug tools stay registered while inactive so
 * entering or leaving debug mode changes only the prompt section, not the
 * request tool catalog. There are no `/debug-*` slash commands; the Client
 * drives enter/proceed/done/abort through this Remote.
 *
 * @module @deepseek-ai/dsh-debug-mode
 */

import { Context } from '@deepseek-ai/cordis'
import { stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContextFormed, UserMessage } from '@deepseek-ai/dsh-llm'
import { RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { markRemoteMethods } from './remote-marks.ts'
import { CLEANUP_CONTRACT, METHODOLOGY } from './methodology.ts'
import { DEBUG_POLICY_ORDER, DEBUG_POLICY_SECTION, HANDOFF_TOOL } from './constants.ts'
import { describeHandoff } from './gate.ts'
import { reduce, type Effect } from './machine.ts'
import { ledgerAfterScan, probesInInput, scanLedger } from './probes.ts'
import {
  INACTIVE,
  currentRound,
  logFileFor,
  snapshotOf,
} from './state.ts'
import {
  countLogLines,
  debugDirFor,
  readLogLines,
  readState,
  removeDebugDir,
  rotateActiveLog,
  truncateActiveLog,
  writeState,
} from './storage.ts'
import { registerDebugTools, type HandoffRequest } from './tools.ts'
import type {
  DebugAttachRequest,
  DebugPersistedState,
  DebugProceedRequest,
  DebugSetOutcome,
  DebugSnapshot,
  DebugStartRequest,
} from './types.ts'

export type * from './types.ts'
export { TYPERT_REMOTE } from './remote.ts'
export { HANDOFF_TOOL, PROBE_MARK } from './constants.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'debug-mode': { kind: 'debug-mode' } & ContextFormed
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    debugMode: DebugModeController
  }
  interface Events {
    /**
     * Debug-mode snapshot changed for one Session.
     * @param payload.sessionId - Session identity.
     * @param payload.snapshot - latest Client snapshot.
     * @mode emit
     */
    'debug/changed'(payload: { sessionId: string; snapshot: DebugSnapshot }): void
  }
}

/** Deployment-owned debug guidance. */
export interface DebugModeConfig {
  /** Guidance rendered as the `debug:policy` prompt section while debug mode is active. */
  section?: string
}

const DEFAULT_SECTION = `${METHODOLOGY}\n\n${CLEANUP_CONTRACT}`

interface SessionRuntime {
  state: DebugPersistedState
  pending: { active: boolean; problem?: string } | undefined
  debugDir: string
  listeners: Set<(snapshot: DebugSnapshot) => void>
}

function runId(round: number): string {
  return `run${round}-${Date.now().toString(36)}`
}

function cwdOf(agent: Agent): string {
  const cwd = agent.session.header.cwd
  if (typeof cwd !== 'string' || cwd.trim() === '') {
    throw new RemoteError('debug/invalid-state', 'Debug mode needs a session working directory', {
      reason: 'missing-cwd',
    })
  }
  return cwd
}

function authoredByUser(messages: readonly { source: { kind: string } }[]): boolean {
  return messages.some(message => message.source.kind === 'user')
}

function textOf(content: string | readonly { type: string; text?: string }[]): string {
  if (typeof content === 'string') return content
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n')
}

function hypothesisTally(lines: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const line of lines) {
    let id = '(unattributed)'
    try {
      const entry = JSON.parse(line) as { hypothesisId?: unknown }
      if (typeof entry.hypothesisId === 'string' && entry.hypothesisId.trim().length > 0) {
        id = entry.hypothesisId.trim()
      }
    } catch (_parseError) {
      // Keep unattributed.
    }
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  if (counts.size === 0) return 'none'
  return [...counts.entries()].map(([id, count]) => `${id}:${count}`).join(', ')
}

/**
 * `ctx.debugMode`: owns on-disk debug state, applies selected state at step
 * start, the `debug:policy` section, the stable debug tools, and the Remote.
 */
export class DebugModeController extends TypertRemoteService {
  static inject = ['tools', 'systemPrompt']

  private readonly section: string
  private readonly runtimes = new Map<string, SessionRuntime>()
  private disposed = false
  private readonly ingestStack: UserMessage[][] = []

  constructor(ctx: Context, config: DebugModeConfig = {}) {
    super(ctx, 'debugMode', { namespace: 'debug' })
    this.section = typeof config.section === 'string' && config.section.trim() !== ''
      ? config.section
      : DEFAULT_SECTION

    ctx.on('agent/created', async ({ agent }) => {
      if (agent.session.header.origin === 'subagent') return
      try {
        await this.ensureRuntime(agent)
      } catch (error) {
        ctx.logger.debug('dsh-debug-mode: skipped runtime load on agent created: %o', error)
      }
    })

    ctx.on('agent/pre-step', async ({ agent, messages, signal }, next): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) return decision
      const runtime = await this.ensureRuntime(agent)
      const pending = runtime.pending
      if (pending === undefined) {
        if (runtime.state.active && runtime.state.stage === 'user_turn' && authoredByUser(messages)) {
          this.dispatch(agent, runtime, { t: 'user_replied' })
        }
        this.dispatch(agent, runtime, { t: 'turn_started' })
        return this.withDebugContext(decision, runtime)
      }
      const prompted: UserMessage[] = []
      this.ingestStack.push(prompted)
      try {
        if (pending.active) {
          if (!runtime.state.active) {
            const problem = pending.problem?.trim() || 'Debug the reported problem.'
            const logFile = await truncateActiveLog(runtime.debugDir)
            this.dispatch(agent, runtime, {
              t: 'start',
              problem,
              debugDir: runtime.debugDir,
              runId: runId(1),
              logFile,
            })
          }
        } else if (runtime.state.active) {
          this.dispatch(agent, runtime, { t: 'abort' })
        }
        runtime.pending = undefined
        await this.persist(runtime)
      } catch (error) {
        ctx.logger.warn('dsh-debug-mode: failed to apply pending debug mode at step start: %o', error)
        return decision
      } finally {
        this.ingestStack.pop()
      }
      this.dispatch(agent, runtime, { t: 'turn_started' })
      const assembled = this.withDebugContext(decision, runtime)
      if (prompted.length === 0 || assembled.kind !== 'enter') return assembled
      return { ...assembled, messages: [...assembled.messages, ...prompted] }
    })

    ctx.on('agent/turn-stopping', async ({ agent }) => {
      const runtime = this.runtimes.get(agent.session.id)
      if (runtime === undefined || !runtime.state.active) return
      if (runtime.state.stage === 'investigating' || runtime.state.stage === 'cleaning_up') {
        this.dispatch(agent, runtime, { t: 'turn_settled' })
        await this.persist(runtime)
      }
    })

    ctx.on('agent/assistant-stream', ({ agent, frame }) => {
      if (frame.type !== 'end' || frame.outcome.kind !== 'committed') return
      if (frame.outcome.eventType !== 'assistant/message') return
      const runtime = this.runtimes.get(agent.session.id)
      if (runtime === undefined || !runtime.state.active) return
      const event = agent.session.eventAt(frame.outcome.seq)
      if (event === undefined || event.type !== 'assistant/message') return
      const text = textOf(event.data.message.content)
      if (text.length === 0) return
      this.dispatch(agent, runtime, { t: 'assistant_message', text })
      void this.persist(runtime)
    })

    ctx.on('tools/result', (exec) => {
      const agent = exec.agent
      if (agent === undefined) return
      const runtime = this.runtimes.get(agent.session.id)
      if (runtime === undefined || !runtime.state.active) return
      this.dispatch(agent, runtime, { t: 'tool_used' })
      if (typeof exec.arguments === 'object' && exec.arguments !== null && !Array.isArray(exec.arguments)) {
        const cwd = agent.session.header.cwd
        if (typeof cwd === 'string') {
          const round = runtime.state.active ? currentRound(runtime.state).index : 0
          const probes = probesInInput(exec.arguments, cwd, round)
          if (probes.length > 0) this.dispatch(agent, runtime, { t: 'probes_found', probes })
        }
      }
      void this.persist(runtime)
    })

    ctx.on('tools/ptc-dispatch-log', async (dispatch, next) => {
      const content = await next()
      const agent = dispatch.agent ?? dispatch.exec.agent
      if (agent === undefined) return content
      const runtime = this.runtimes.get(agent.session.id)
      if (runtime === undefined || !runtime.state.active) return content
      this.dispatch(agent, runtime, { t: 'tool_used' })
      void this.persist(runtime)
      return content
    })

    ctx.systemPrompt.section({
      name: DEBUG_POLICY_SECTION,
      order: DEBUG_POLICY_ORDER,
      text: (context) => {
        if (context.agent === undefined) return ''
        const runtime = this.runtimes.get(context.agent.session.id)
        const pending = runtime?.pending
        const active = pending?.active ?? runtime?.state.active === true
        if (!active) return ''
        const extra = runtime?.state.active && runtime.state.stage === 'cleaning_up'
          ? `\n\n${CLEANUP_CONTRACT}`
          : ''
        return this.section + extra
      },
    })

    registerDebugTools(tool => ctx.tools.register(tool), {
      getState: agent => this.runtimeOf(agent)?.state ?? INACTIVE,
      refreshLogCounts: async (agent) => {
        const runtime = this.runtimeOf(agent)
        if (runtime === undefined || !runtime.state.active) return
        await this.refreshCounts(runtime)
      },
      readRunLines: async (agent, run) => {
        const runtime = this.runtimeOf(agent)
        if (runtime === undefined || !runtime.state.active) return []
        const file = logFileFor(runtime.state, run)
        if (file === null) return []
        return await readLogLines(file)
      },
      syncLedger: async (agent) => {
        const runtime = this.runtimeOf(agent)
        if (runtime === undefined || !runtime.state.active) {
          return { alive: [], gone: [], unknown: [] }
        }
        const scan = await scanLedger(runtime.state.probes)
        this.dispatch(agent, runtime, { t: 'ledger_synced', probes: ledgerAfterScan(scan) })
        await this.persist(runtime)
        return scan
      },
      handOff: (agent, request) => this.handOffFor(agent, request),
    })

    ctx.effect(() => () => { this.disposed = true }, 'dsh-debug-mode: close service lifetime')
  }

  /**
   * Read logged-or-pending debug state.
   * @param agent - live Agent.
   */
  async get(agent: Agent): Promise<DebugSnapshot> {
    const runtime = await this.ensureRuntime(agent)
    return snapshotOf(runtime.state, runtime.pending !== undefined)
  }

  /**
   * Follow debug snapshots for one Agent.
   * @param agent - live Agent.
   * @param signal - Client observation lifetime.
   */
  async *follow(agent: Agent, signal: AbortSignal): AsyncIterable<DebugSnapshot> {
    const runtime = await this.ensureRuntime(agent)
    yield snapshotOf(runtime.state, runtime.pending !== undefined)
    const queue: DebugSnapshot[] = []
    let notify: (() => void) | undefined
    const listener = (snapshot: DebugSnapshot): void => {
      queue.push(snapshot)
      notify?.()
    }
    runtime.listeners.add(listener)
    const onAbort = (): void => { notify?.() }
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      while (!signal.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((resolveWait) => {
            notify = resolveWait
          })
          notify = undefined
          continue
        }
        const next = queue.shift()
        if (next !== undefined) yield next
      }
    } finally {
      signal.removeEventListener('abort', onAbort)
      runtime.listeners.delete(listener)
    }
  }

  /**
   * Enter debug mode. Between turns the change is applied immediately; during
   * an open turn it remains pending until the next accepted pre-step.
   * @param agent - live Agent.
   * @param request - problem report.
   */
  async start(agent: Agent, request: DebugStartRequest): Promise<DebugSetOutcome> {
    this.assertRoot(agent)
    const runtime = await this.ensureRuntime(agent)
    if (runtime.state.active && runtime.pending === undefined) return 'noop'
    if (runtime.pending?.active === true) return 'noop'
    const problem = request.problem.trim()
    if (problem === '') {
      throw new RemoteError('debug/invalid-state', 'Debug mode needs a non-empty problem report', {
        reason: 'empty-problem',
      })
    }
    this.leavePlanIfPresent(agent)
    if (this.hasOpenTurn(agent)) {
      runtime.pending = { active: true, problem }
      this.publish(agent, runtime)
      return 'queued'
    }
    const logFile = await truncateActiveLog(runtime.debugDir)
    this.dispatch(agent, runtime, {
      t: 'start',
      problem,
      debugDir: runtime.debugDir,
      runId: runId(1),
      logFile,
    })
    runtime.pending = undefined
    await this.persist(runtime)
    return 'committed'
  }

  /**
   * Continue after the user reproduced or captured.
   * @param agent - live Agent.
   * @param request - optional extra details.
   */
  async proceed(agent: Agent, request: DebugProceedRequest = {}): Promise<DebugSetOutcome> {
    this.assertRoot(agent)
    const runtime = await this.ensureRuntime(agent)
    if (!runtime.state.active) {
      throw new RemoteError('debug/invalid-state', 'Debug mode is not active', { reason: 'inactive' })
    }
    if (runtime.state.stage !== 'user_turn') {
      throw new RemoteError('debug/invalid-state', 'Proceed is available only after a handoff', {
        reason: 'not-user-turn',
      })
    }
    await this.refreshCounts(runtime)
    const closing = currentRound(runtime.state)
    const closingRun = closing.runId
    const logCount = closingRun === null ? 0 : runtime.state.logCounts[closingRun] ?? 0
    const file = closingRun === null ? null : logFileFor(runtime.state, closingRun)
    const lines = file === null ? [] : await readLogLines(file)
    if (closingRun !== null) await rotateActiveLog(runtime.debugDir, closingRun)
    const nextRun = runId(closing.index + 1)
    this.dispatch(agent, runtime, {
      t: 'proceed',
      runId: nextRun,
      logCount,
      hypotheses: hypothesisTally(lines),
      now: Date.now(),
      ...request.details === undefined ? {} : { details: request.details },
    })
    await this.persist(runtime)
    return 'committed'
  }

  /**
   * Mark the problem fixed and start probe cleanup.
   * @param agent - live Agent.
   */
  async done(agent: Agent): Promise<DebugSetOutcome> {
    this.assertRoot(agent)
    const runtime = await this.ensureRuntime(agent)
    if (!runtime.state.active) {
      throw new RemoteError('debug/invalid-state', 'Debug mode is not active', { reason: 'inactive' })
    }
    this.dispatch(agent, runtime, { t: 'mark_fixed' })
    await this.persist(runtime)
    return 'committed'
  }

  /**
   * Leave debug mode without requiring cleanup.
   * @param agent - live Agent.
   */
  async abort(agent: Agent): Promise<DebugSetOutcome> {
    this.assertRoot(agent)
    const runtime = await this.ensureRuntime(agent)
    if (!runtime.state.active && runtime.pending === undefined) return 'noop'
    if (this.hasOpenTurn(agent) && runtime.state.active) {
      runtime.pending = { active: false }
      this.publish(agent, runtime)
      return 'queued'
    }
    if (runtime.pending?.active === true && !runtime.state.active) {
      runtime.pending = undefined
      this.publish(agent, runtime)
      return 'cancelled'
    }
    this.dispatch(agent, runtime, { t: 'abort' })
    await this.persist(runtime)
    return 'committed'
  }

  /**
   * Truncate the current run log so the user can reproduce again.
   * @param agent - live Agent.
   */
  async clearLogs(agent: Agent): Promise<void> {
    this.assertRoot(agent)
    const runtime = await this.ensureRuntime(agent)
    if (!runtime.state.active) {
      throw new RemoteError('debug/invalid-state', 'Debug mode is not active', { reason: 'inactive' })
    }
    await truncateActiveLog(runtime.debugDir)
    await this.refreshCounts(runtime)
    await this.persist(runtime)
  }

  /**
   * Attach one user artifact, referenced in place.
   * @param agent - live Agent.
   * @param request - absolute or cwd-relative path and optional request id.
   */
  async attach(agent: Agent, request: DebugAttachRequest): Promise<DebugSetOutcome> {
    this.assertRoot(agent)
    const runtime = await this.ensureRuntime(agent)
    if (!runtime.state.active) {
      throw new RemoteError('debug/invalid-state', 'Debug mode is not active', { reason: 'inactive' })
    }
    const path = resolve(cwdOf(agent), request.path)
    let size = 0
    let mtimeMs = Date.now()
    try {
      const info = await stat(path)
      size = info.size
      mtimeMs = info.mtimeMs
    } catch (_statError) {
      throw new RemoteError('debug/invalid-state', `Artifact path is not readable: ${path}`, {
        reason: 'artifact-missing',
      })
    }
    this.dispatch(agent, runtime, {
      t: 'attach_artifact',
      candidate: { path, name: basename(path), size, mtimeMs },
      requestId: request.requestId ?? null,
      now: Date.now(),
    })
    await this.persist(runtime)
    return 'committed'
  }

  private runtimeOf(agent: Agent | undefined): SessionRuntime | undefined {
    if (agent === undefined) return undefined
    return this.runtimes.get(agent.session.id)
  }

  private handOffFor(agent: Agent | undefined, request: HandoffRequest): { ok: true; summary: string } | { ok: false; error: string } {
    const runtime = this.runtimeOf(agent)
    if (runtime === undefined || !runtime.state.active) return { ok: false, error: 'debug mode is not active.' }
    if (runtime.state.stage !== 'investigating') {
      return { ok: false, error: 'a handoff is only valid while the agent holds the round.' }
    }
    this.dispatch(agent, runtime, {
      t: 'handoff',
      mode: request.mode,
      steps: request.steps,
      plan: request.plan,
    })
    void this.persist(runtime)
    const round = currentRound(runtime.state)
    const mode = round.handoff ?? request.mode
    return { ok: true, summary: describeHandoff(mode, round.index, round.plan === null) }
  }

  private assertRoot(agent: Agent): void {
    if (agent.session.header.origin === 'subagent') {
      throw new RemoteError('debug/invalid-state', 'Debug mode is available only on the root Agent', {
        reason: 'subagent',
      })
    }
  }

  private hasOpenTurn(agent: Agent): boolean {
    const projections = this.ctx.get('sessionProjections') as {
      stateOf?(session: Agent['session'], key: string): { openTurnStartSeq: number | null } | undefined
    } | undefined
    const state = projections?.stateOf?.(agent.session, 'turnBoundary')
    if (state !== undefined) return state.openTurnStartSeq != null
    return agent.status !== 'idle'
  }

  private leavePlanIfPresent(agent: Agent): void {
    const planMode = this.ctx.get('planMode') as { set?(agent: Agent, active: boolean): unknown } | undefined
    try {
      planMode?.set?.(agent, false)
    } catch (error) {
      this.ctx.logger.debug('dsh-debug-mode: plan-mode leave skipped: %o', error)
    }
  }

  private async ensureRuntime(agent: Agent): Promise<SessionRuntime> {
    const existing = this.runtimes.get(agent.session.id)
    if (existing !== undefined) return existing
    const debugDir = debugDirFor(cwdOf(agent), agent.session.id)
    const state = await readState(debugDir)
    const runtime: SessionRuntime = {
      state: state.active && state.stage === 'investigating'
        ? { ...state, stage: 'user_turn' }
        : state,
      pending: undefined,
      debugDir,
      listeners: new Set(),
    }
    this.runtimes.set(agent.session.id, runtime)
    return runtime
  }

  private dispatch(agent: Agent | undefined, runtime: SessionRuntime, event: Parameters<typeof reduce>[1]): void {
    const { state, effects } = reduce(runtime.state, event)
    runtime.state = state
    this.applyEffects(agent, runtime, effects)
    this.publish(agent, runtime)
  }

  private applyEffects(agent: Agent | undefined, runtime: SessionRuntime, effects: readonly Effect[]): void {
    for (const effect of effects) {
      switch (effect.kind) {
        case 'prompt':
        case 'continue': {
          const message = createUserMessage({
            content: [{ type: 'text', text: effect.kind === 'prompt' ? effect.content : effect.context }],
            source: {
              kind: 'debug-mode',
              form: 'notice',
              summary: effect.kind === 'prompt' ? effect.summary.slice(0, 120) : 'debug-mode reminder',
            },
          })
          const sink = this.ingestStack.at(-1)
          if (sink !== undefined) sink.push(message)
          else agent?.steer(message)
          break
        }
        case 'teardown':
          void removeDebugDir(effect.debugDir ?? runtime.debugDir)
          runtime.state = INACTIVE
          runtime.pending = undefined
          break
        case 'notify':
          break
      }
    }
  }

  private withDebugContext(decision: PreStepDecision, runtime: SessionRuntime): PreStepDecision {
    if (decision.kind !== 'enter' || !runtime.state.active) return decision
    const logFile = logFileFor(runtime.state) ?? '(none)'
    const text = runtime.state.stage === 'cleaning_up'
      ? CLEANUP_CONTRACT
      : `Debug mode is active. Runtime log file (absolute): ${logFile}\nCall ${HANDOFF_TOOL} to hand the round to the user.`
    const message = createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'debug-mode', form: 'snapshot', sections: [{ name: 'debug-mode', text }] },
    })
    return { ...decision, messages: [...decision.messages, message] }
  }

  private publish(agent: Agent | undefined, runtime: SessionRuntime): void {
    const snapshot = snapshotOf(runtime.state, runtime.pending !== undefined)
    for (const listener of runtime.listeners) listener(snapshot)
    const sessionId = agent?.session.id
    if (sessionId !== undefined) this.ctx.emit('debug/changed', { sessionId, snapshot })
  }

  private async persist(runtime: SessionRuntime): Promise<void> {
    if (this.disposed) return
    if (!runtime.state.active) return
    await writeState(runtime.debugDir, runtime.state)
  }

  private async refreshCounts(runtime: SessionRuntime): Promise<void> {
    if (!runtime.state.active) return
    const logCounts: Record<string, number> = { ...runtime.state.logCounts }
    for (const run of runtime.state.runHistory) {
      const file = logFileFor(runtime.state, run)
      if (file !== null) logCounts[run] = await countLogLines(file)
    }
    this.dispatch(undefined, runtime, {
      t: 'runs_observed',
      runHistory: runtime.state.runHistory,
      logCounts,
    })
  }
}

markRemoteMethods(DebugModeController.prototype, [
  { method: 'get' },
  { method: 'follow', mode: 'stream' },
  { method: 'start' },
  { method: 'proceed' },
  { method: 'done' },
  { method: 'abort' },
  { method: 'clearLogs' },
  { method: 'attach' },
])

export default DebugModeController
