/**
 * Hand-written Client Remote contribution. Out-of-tree packages cannot run the
 * DSH Typert generator, so descriptors and Client types are authored here.
 * @module @deepseek-ai/dsh-debug-mode/remote
 */

import { z } from 'zod'
import type { InvocationDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type {
  DebugAttachRequest,
  DebugProceedRequest,
  DebugSetOutcome,
  DebugSnapshot,
  DebugStartRequest,
} from './types.ts'

const sessionIdSchema = z.string().min(1)
const startSchema = z.object({ problem: z.string().min(1) })
const proceedSchema = z.object({ details: z.string().optional() })
const attachSchema = z.object({
  path: z.string().min(1),
  requestId: z.string().optional(),
})
const snapshotSchema = z.object({
  active: z.boolean(),
  pending: z.boolean(),
  stage: z.enum(['investigating', 'user_turn', 'cleaning_up']).nullable(),
  problem: z.string().nullable(),
  round: z.number().int().nullable(),
  handoff: z.enum(['reproduce', 'capture', 'question', 'incomplete']).nullable(),
  reproductionSteps: z.array(z.string()),
  plan: z.array(z.unknown()),
  pendingRequests: z.array(z.unknown()),
  probes: z.array(z.unknown()),
  artifacts: z.array(z.unknown()),
  observations: z.array(z.unknown()),
  logFile: z.string().nullable(),
  logCount: z.number().int(),
  runId: z.string().nullable(),
})
const outcomeSchema = z.enum(['committed', 'queued', 'cancelled', 'noop'])

const SRC_JSON = { mode: 'src-json' as const }

function lookupAgent(method: string, extra: readonly InvocationDescriptor['parameters']): InvocationDescriptor {
  return {
    id: `@siuver/dsh-debug-mode#debug/${method}`,
    service: 'debugMode',
    namespace: 'debug',
    method,
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'agent',
      wire: 'agentId',
      source: 'lookup',
      lookup: 'agent',
      codec: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-session/types#SessionId', create: () => sessionIdSchema },
    }, ...extra],
    result: { mode: 'strict', typeSymbol: `@siuver/dsh-debug-mode#${method}Result`, create: () => outcomeSchema },
  }
}

const descriptors: readonly InvocationDescriptor[] = [
  {
    ...lookupAgent('get', []),
    result: { mode: 'strict', typeSymbol: '@siuver/dsh-debug-mode#DebugSnapshot', create: () => snapshotSchema },
  },
  {
    id: '@siuver/dsh-debug-mode#debug/follow',
    service: 'debugMode',
    namespace: 'debug',
    method: 'follow',
    mode: 'stream',
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'agent',
      wire: 'agentId',
      source: 'lookup',
      lookup: 'agent',
      codec: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-session/types#SessionId', create: () => sessionIdSchema },
    }],
    cancellation: { parameter: 'signal' },
    result: { mode: 'strict', typeSymbol: '@siuver/dsh-debug-mode#DebugSnapshot', create: () => snapshotSchema },
  },
  {
    ...lookupAgent('start', [{
      name: 'request',
      wire: 'request',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: '@siuver/dsh-debug-mode#DebugStartRequest', create: () => startSchema },
    }]),
    result: { mode: 'strict', typeSymbol: '@siuver/dsh-debug-mode#DebugSetOutcome', create: () => outcomeSchema },
  },
  {
    ...lookupAgent('proceed', [{
      name: 'request',
      wire: 'request',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: '@siuver/dsh-debug-mode#DebugProceedRequest', create: () => proceedSchema },
    }]),
    result: { mode: 'strict', typeSymbol: '@siuver/dsh-debug-mode#DebugSetOutcome', create: () => outcomeSchema },
  },
  {
    ...lookupAgent('done', []),
    result: { mode: 'strict', typeSymbol: '@siuver/dsh-debug-mode#DebugSetOutcome', create: () => outcomeSchema },
  },
  {
    ...lookupAgent('abort', []),
    result: { mode: 'strict', typeSymbol: '@siuver/dsh-debug-mode#DebugSetOutcome', create: () => outcomeSchema },
  },
  {
    ...lookupAgent('clearLogs', []),
    result: SRC_JSON,
  },
  {
    ...lookupAgent('attach', [{
      name: 'request',
      wire: 'request',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: '@siuver/dsh-debug-mode#DebugAttachRequest', create: () => attachSchema },
    }]),
    result: { mode: 'strict', typeSymbol: '@siuver/dsh-debug-mode#DebugSetOutcome', create: () => outcomeSchema },
  },
]

/** Client contribution mounted by the UI plugin. */
export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: '@siuver/dsh-debug-mode',
  descriptors,
}

export default TYPERT_REMOTE

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'debug/get': (
      agentId: string,
      signal?: AbortSignal,
    ) => Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<DebugSnapshot>>
    'debug/follow': (
      agentId: string,
      signal?: AbortSignal,
    ) => AsyncIterable<DebugSnapshot>
    'debug/start': (
      agentId: string,
      request: DebugStartRequest,
      signal?: AbortSignal,
    ) => Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<DebugSetOutcome>>
    'debug/proceed': (
      agentId: string,
      request: DebugProceedRequest,
      signal?: AbortSignal,
    ) => Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<DebugSetOutcome>>
    'debug/done': (
      agentId: string,
      signal?: AbortSignal,
    ) => Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<DebugSetOutcome>>
    'debug/abort': (
      agentId: string,
      signal?: AbortSignal,
    ) => Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<DebugSetOutcome>>
    'debug/clearLogs': (
      agentId: string,
      signal?: AbortSignal,
    ) => Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<void>>
    'debug/attach': (
      agentId: string,
      request: DebugAttachRequest,
      signal?: AbortSignal,
    ) => Promise<import('@deepseek-ai/dsh-typert-protocol').RemoteResult<DebugSetOutcome>>
  }

  interface TypertRemoteNamespaceMap {
    debug: import('@deepseek-ai/dsh-typert-protocol').TypertRemoteNamespace<'debug'>
  }
}
