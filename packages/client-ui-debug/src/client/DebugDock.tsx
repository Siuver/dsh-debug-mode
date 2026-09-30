/** Full-width debug dock above the composer. */
import { useCallback, useRef, useState } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconCloseOutlineRegular, IconInspectOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DebugSnapshot, EvidenceMethod } from '@deepseek-ai/dsh-debug-mode/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { DebugReadiness } from './observe.ts'
import type { DebugKey } from './locales.ts'

export interface DebugDockActions {
  start: (problem: string) => Promise<RemoteResult<unknown>>
  proceed: (details?: string) => Promise<RemoteResult<unknown>>
  done: () => Promise<RemoteResult<unknown>>
  abort: () => Promise<RemoteResult<unknown>>
  clearLogs: () => Promise<RemoteResult<unknown>>
  attach: (path: string, requestId?: string) => Promise<RemoteResult<unknown>>
}

export interface DebugDockInjected extends DebugDockActions {
  hooks: {
    debugReadiness: HostObservable<DebugReadiness>
    debugPanel: HostObservable<boolean>
  }
  closePanel: () => void
}

export type DebugDockProps =
  PropsRuntime<'conversation.input.dock'>
  & InjectFace<DebugDockInjected>
  & PropsLocale<'debug-mode'>

const METHOD_KEYS = {
  agent_inspection: 'method.agent_inspection',
  runtime_probe: 'method.runtime_probe',
  user_report: 'method.user_report',
  user_artifact: 'method.user_artifact',
} as const satisfies Record<EvidenceMethod, DebugKey>

const STAGE_KEYS = {
  investigating: 'dock.stage.investigating',
  user_turn: 'dock.stage.user_turn',
  cleaning_up: 'dock.stage.cleaning_up',
} as const satisfies Record<NonNullable<DebugSnapshot['stage']>, DebugKey>

const HANDOFF_KEYS = {
  reproduce: 'dock.handoff.reproduce',
  capture: 'dock.handoff.capture',
  question: 'dock.handoff.question',
  incomplete: 'dock.handoff.incomplete',
} as const satisfies Record<NonNullable<DebugSnapshot['handoff']>, DebugKey>

function failureText(result: RemoteResult<unknown>): string | null {
  return result.ok ? null : `${result.error.message} (${result.error.code})`
}

/** Debug dock: start form when inactive, round controls when active. */
export function DebugDock({
  useDebugReadiness, useDebugPanel, closePanel, start, proceed, done, abort, clearLogs, attach, t,
}: DebugDockProps) {
  const readiness = useDebugReadiness(value => value)
  const panelOpen = useDebugPanel(value => value)
  const snapshot = readiness.snapshot
  const [problem, setProblem] = useState('')
  const [details, setDetails] = useState('')
  const [artifactPath, setArtifactPath] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef(false)

  const run = useCallback(async (action: () => Promise<RemoteResult<unknown>>): Promise<void> => {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    setError(null)
    try {
      const result = await action()
      const failure = failureText(result)
      if (failure !== null) setError(failure)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }, [])

  if (!snapshot.active && !snapshot.pending) {
    if (!panelOpen) return null
    return (
      <div className="dsh-debug-dock" data-debug-dock>
        <div className="dsh-debug-bar">
          <div className="dsh-debug-header">
            <span className="dsh-debug-chip-glyph"><IconInspectOutlineRegular size={14} /></span>
            <span className="dsh-debug-title">{t('dock.title')}</span>
            <button
              type="button"
              className="dsh-debug-close"
              aria-label={t('dock.close.aria')}
              title={t('dock.close')}
              onClick={closePanel}
            >
              <IconCloseOutlineRegular size={14} />
            </button>
          </div>
          <div className="dsh-debug-body">
            <p className="dsh-debug-hint">{t('dock.empty')}</p>
            <textarea
              className="dsh-debug-input"
              aria-label={t('dock.problem')}
              placeholder={t('dock.problem.placeholder')}
              value={problem}
              onChange={(event) => { setProblem(event.target.value) }}
            />
            {error !== null && <span className="dsh-debug-error" role="alert">{error}</span>}
            <div className="dsh-debug-actions">
              <button
                type="button"
                className="dsh-debug-primary"
                disabled={pending || problem.trim() === ''}
                onClick={() => { void run(() => start(problem.trim())) }}
              >
                {t('dock.start')}
              </button>
              <button
                type="button"
                className="dsh-debug-secondary"
                disabled={pending}
                onClick={closePanel}
              >
                {t('dock.close')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const stage = snapshot.stage
  const handoff = snapshot.handoff
  const userTurn = stage === 'user_turn'
  return (
    <div className="dsh-debug-dock" data-debug-dock>
      <div className="dsh-debug-bar">
        <div className="dsh-debug-header">
          <span className="dsh-debug-chip-glyph"><IconInspectOutlineRegular size={14} /></span>
          <span className="dsh-debug-title">{t('dock.title')}</span>
          <span className="dsh-debug-stage">
            {stage === null ? t('chip.pending') : t(STAGE_KEYS[stage])}
            {handoff !== null ? ` · ${t(HANDOFF_KEYS[handoff])}` : ''}
          </span>
        </div>
        <div className="dsh-debug-body">
          {snapshot.problem !== null && (
            <div className="dsh-debug-section">
              <span className="dsh-debug-label">{t('dock.problem')}</span>
              <p className="dsh-debug-hint">{snapshot.problem}</p>
            </div>
          )}
          {snapshot.reproductionSteps.length > 0 && (
            <div className="dsh-debug-section">
              <span className="dsh-debug-label">{t('dock.steps')}</span>
              <ol className="dsh-debug-steps">
                {snapshot.reproductionSteps.map((step, index) => <li key={index}>{step}</li>)}
              </ol>
            </div>
          )}
          {snapshot.plan.length > 0 && (
            <div className="dsh-debug-section">
              <span className="dsh-debug-label">{t('dock.plan')}</span>
              <div className="dsh-debug-plan">
                {snapshot.plan.map(request => (
                  <div key={request.id}>
                    <span className="dsh-debug-plan-title">{request.id} · {request.title}</span>
                    <span className="dsh-debug-plan-meta">{t(METHOD_KEYS[request.method])} · {request.hypothesisIds.join(', ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {snapshot.probes.length > 0 && (
            <div className="dsh-debug-section">
              <span className="dsh-debug-label">{t('dock.probes')}</span>
              <p className="dsh-debug-hint">{snapshot.probes.map(probe => probe.id).join(', ')}</p>
            </div>
          )}
          {snapshot.artifacts.length > 0 && (
            <div className="dsh-debug-section">
              <span className="dsh-debug-label">{t('dock.artifacts')}</span>
              <p className="dsh-debug-hint">{snapshot.artifacts.map(item => item.name).join(', ')}</p>
            </div>
          )}
          {snapshot.logFile !== null && (
            <div className="dsh-debug-section">
              <span className="dsh-debug-label">{t('dock.logs')}</span>
              <p className="dsh-debug-hint">{snapshot.logFile} · {snapshot.logCount}</p>
            </div>
          )}
          {userTurn && (
            <textarea
              className="dsh-debug-input"
              aria-label={t('dock.details.placeholder')}
              placeholder={t('dock.details.placeholder')}
              value={details}
              onChange={(event) => { setDetails(event.target.value) }}
            />
          )}
          {userTurn && (
            <textarea
              className="dsh-debug-input dsh-debug-path"
              aria-label={t('dock.artifact.placeholder')}
              placeholder={t('dock.artifact.placeholder')}
              value={artifactPath}
              onChange={(event) => { setArtifactPath(event.target.value) }}
            />
          )}
          {error !== null && <span className="dsh-debug-error" role="alert">{error}</span>}
          <div className="dsh-debug-actions">
            {userTurn && (
              <button
                type="button"
                className="dsh-debug-primary"
                disabled={pending}
                onClick={() => {
                  void run(() => proceed(details.trim() === '' ? undefined : details.trim()))
                }}
              >
                {t('dock.proceed')}
              </button>
            )}
            {userTurn && (
              <button
                type="button"
                className="dsh-debug-secondary"
                disabled={pending || artifactPath.trim() === ''}
                onClick={() => { void run(() => attach(artifactPath.trim())) }}
              >
                {t('dock.attach')}
              </button>
            )}
            {userTurn && (
              <button
                type="button"
                className="dsh-debug-secondary"
                disabled={pending}
                onClick={() => { void run(clearLogs) }}
              >
                {t('dock.clear')}
              </button>
            )}
            {snapshot.active && (
              <button
                type="button"
                className="dsh-debug-secondary"
                disabled={pending}
                onClick={() => { void run(done) }}
              >
                {t('dock.done')}
              </button>
            )}
            <button
              type="button"
              className="dsh-debug-secondary"
              disabled={pending}
              onClick={() => { void run(abort) }}
            >
              {t('dock.abort')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
