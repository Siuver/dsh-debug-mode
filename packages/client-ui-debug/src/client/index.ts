/** Browser entry for the optional debug Remote contribution and composer controls. */
import type { Context } from '@deepseek-ai/cordis'
import debugRemote from '@deepseek-ai/dsh-debug-mode/remote'
import { mountDebug } from './mount.ts'

export { inject } from './mount.ts'

/**
 * Activate the debug-mode contribution.
 * @param ctx - Client runtime.
 * @returns complete UI and Remote disposer.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  return await mountDebug(ctx, debugRemote)
}
