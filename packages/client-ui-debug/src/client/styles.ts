/** Injected stylesheet. Class names are unique to this plugin. */
export const DEBUG_STYLE = `
.dsh-debug-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  min-width: 34px;
  padding: 0 8px;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  cursor: pointer;
}
.dsh-debug-chip:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh-debug-chip[data-active='true'] {
  background: var(--dsw-alias-state-business-tertiary);
  color: var(--dsw-alias-state-business-primary);
}
.dsh-debug-chip:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
.dsh-debug-chip-glyph {
  display: inline-flex;
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  color: currentColor;
}
.dsh-debug-dock {
  box-sizing: border-box;
  width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));
  margin: 0 auto;
}
.dsh-debug-bar {
  position: relative;
  isolation: isolate;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset));
  margin: 0 auto;
  padding: 10px 12px 12px;
  border: 0;
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-md);
  box-shadow: var(--dsw-elevation-panel);
}
.dsh-debug-bar::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  border-radius: inherit;
  background: var(--dsw-specific-menu);
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  content: '';
  pointer-events: none;
}
.dsh-debug-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.dsh-debug-title {
  flex: none;
  font-size: 13px;
  line-height: 24px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.dsh-debug-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  margin-left: auto;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.dsh-debug-close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh-debug-stage {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary-dimmed);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-debug-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.dsh-debug-hint {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}
.dsh-debug-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.dsh-debug-label {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-debug-steps {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
}
.dsh-debug-plan {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dsh-debug-plan-title {
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
}
.dsh-debug-plan-meta {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-debug-input {
  width: 100%;
  min-height: 52px;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-base);
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
  resize: vertical;
  outline: none;
}
.dsh-debug-input:focus {
  border-color: var(--dsw-alias-state-business-primary);
}
.dsh-debug-path {
  min-height: 28px;
  height: 28px;
  resize: none;
}
.dsh-debug-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.dsh-debug-primary,
.dsh-debug-secondary {
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: var(--dsw-radius-sm);
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  cursor: pointer;
}
.dsh-debug-primary {
  background: var(--dsw-alias-state-business-primary);
  color: var(--dsw-alias-label-on-business);
}
.dsh-debug-secondary {
  background: transparent;
  color: var(--dsw-alias-label-secondary);
}
.dsh-debug-primary:disabled,
.dsh-debug-secondary:disabled {
  opacity: 0.4;
  cursor: default;
}
.dsh-debug-error {
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`

const STYLE_ID = 'dsh-debug-mode-styles'

/**
 * Install the plugin stylesheet once per document.
 * @returns disposer that removes the tag when this was the installing fiber.
 */
export function installDebugStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) return () => {}
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = DEBUG_STYLE
  document.head.appendChild(el)
  return () => { el.remove() }
}
