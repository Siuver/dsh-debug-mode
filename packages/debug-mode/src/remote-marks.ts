/**
 * Record Typert Remote methods without `@Remote`. Out-of-tree esbuild leaves
 * decorator syntax in the Host artifact, and Node refuses that file.
 * @module @deepseek-ai/dsh-debug-mode/remote-marks
 */

const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'

/** One Host method the Gateway source-mode fallback should export. */
export interface RemoteMark {
  /** Public instance method on the service. */
  readonly method: string
  /** Wire name when it differs from {@link RemoteMark.method}. */
  readonly exportName?: string
  /** Stream delivery; omit for a direct call. */
  readonly mode?: 'stream'
}

/**
 * Attach the Typert Remote descriptor the Gateway reads from a live service.
 * @param prototype - the service class prototype.
 * @param methods - methods in declaration order.
 */
export function markRemoteMethods(prototype: object, methods: readonly RemoteMark[]): void {
  Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, {
    configurable: true,
    value: Object.freeze({
      version: 1,
      methods: Object.freeze(methods.map(item => Object.freeze({
        method: item.method,
        ...item.exportName === undefined || item.exportName === item.method ? {} : { exportName: item.exportName },
        ...item.mode === undefined ? {} : { mode: item.mode },
        invocation: Object.freeze({ kind: 'direct' as const }),
      }))),
    }),
  })
}
