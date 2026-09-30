/** Compact composer-right chip that opens or starts debug mode. */
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconInspectOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { DebugReadiness } from './observe.ts'
import type { DebugKey } from './locales.ts'

export interface DebugChipInjected {
  hooks: {
    debugReadiness: HostObservable<DebugReadiness>
    debugPanel: HostObservable<boolean>
  }
  togglePanel: () => void
}

export type DebugChipProps =
  PropsRuntime<'conversation.input.right'>
  & InjectFace<DebugChipInjected>
  & PropsLocale<'debug-mode'>

/** Compact Debug control. Active sessions keep the chip highlighted. */
export function DebugChip({ useDebugReadiness, useDebugPanel, togglePanel, t }: DebugChipProps) {
  const readiness = useDebugReadiness(value => value)
  const panelOpen = useDebugPanel(value => value)
  const active = readiness.snapshot.active || readiness.snapshot.pending
  const closingStartForm = !active && panelOpen
  const label = t('chip.label' satisfies DebugKey)
  return (
    <button
      type="button"
      className="dsh-debug-chip"
      data-active={active || panelOpen ? 'true' : 'false'}
      aria-label={t(active ? 'chip.on.aria' : closingStartForm ? 'chip.off.close.aria' : 'chip.off.aria')}
      title={t(active ? 'chip.on.title' : closingStartForm ? 'chip.off.close.title' : 'chip.off.title')}
      onClick={togglePanel}
    >
      <span className="dsh-debug-chip-glyph" aria-hidden>
        <IconInspectOutlineRegular size={14} />
      </span>
      {label}
    </button>
  )
}
