/** Resolve DeepSeek Harness peers from URLs the Host entry computed on the main thread. */
/** @type {Record<string, string>} */
let peers = {}

/**
 * @param {{ peers?: Record<string, string> } | undefined} data
 */
export function initialize(data) {
  peers = data?.peers ?? {}
}

/**
 * @param {string} specifier
 * @param {{ parentURL?: string }} context
 * @param {(specifier: string, context: object) => object | Promise<object>} nextResolve
 */
export async function resolve(specifier, context, nextResolve) {
  const mapped = peers[specifier]
  if (mapped !== undefined) return { url: mapped, shortCircuit: true }
  return nextResolve(specifier, context)
}
