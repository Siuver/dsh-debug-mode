/**
 * Evidence-plan validation shared by the handoff tool and any prose parser.
 * @module @deepseek-ai/dsh-debug-mode/evidence
 */

import { MAX_EVIDENCE_REQUESTS } from './constants.ts'
import type { EvidenceMethod, EvidenceRequest } from './types.ts'

const METHODS: readonly EvidenceMethod[] = [
  'agent_inspection',
  'runtime_probe',
  'user_report',
  'user_artifact',
]

/** All-or-nothing validation of one evidence plan. */
export type EvidenceRequestsValidation =
  | { readonly ok: true; readonly requests: EvidenceRequest[] }
  | { readonly ok: false; readonly error: string }

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString)
}

/**
 * Validate evidence plan entries. Any malformed entry rejects the whole plan.
 * @param entries - untrusted JSON array.
 */
export function validateEvidenceRequests(entries: unknown): EvidenceRequestsValidation {
  const fail = (error: string): EvidenceRequestsValidation => ({ ok: false, error })
  if (!Array.isArray(entries)) return fail('the evidence plan must be a JSON array')
  if (entries.length === 0) return fail('the evidence plan array must not be empty')
  if (entries.length > MAX_EVIDENCE_REQUESTS) {
    return fail(`the evidence plan has ${entries.length} entries; at most ${MAX_EVIDENCE_REQUESTS} are allowed`)
  }
  const requests: EvidenceRequest[] = []
  const seenIds = new Set<string>()
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) return fail('every evidence plan entry must be an object')
    const record = entry as Record<string, unknown>
    if (!isNonEmptyString(record.id)) return fail('every evidence plan entry needs a non-empty id')
    if (seenIds.has(record.id)) return fail(`duplicate evidence request id ${record.id}`)
    seenIds.add(record.id)
    if (!isNonEmptyStringArray(record.hypothesisIds) || new Set(record.hypothesisIds).size !== record.hypothesisIds.length) {
      return fail(`request ${record.id} needs one or more unique non-empty hypothesisIds`)
    }
    if (!METHODS.includes(record.method as EvidenceMethod)) {
      return fail(`request ${record.id} has unknown method ${JSON.stringify(record.method)}`)
    }
    if (!isNonEmptyString(record.title)) return fail(`request ${record.id} needs a non-empty title`)
    if (!isNonEmptyString(record.rationale)) {
      return fail(`request ${record.id} needs a non-empty rationale explaining why this method is decisive`)
    }
    if (!isNonEmptyStringArray(record.instructions)) {
      return fail(`request ${record.id} needs one or more non-empty instructions`)
    }
    if (record.artifactHint !== undefined && !isNonEmptyString(record.artifactHint)) {
      return fail(`request ${record.id} has an empty artifactHint`)
    }
    if (record.method === 'user_artifact' && !isNonEmptyString(record.artifactHint)) {
      return fail(`request ${record.id} needs artifactHint when method is user_artifact`)
    }
    requests.push({
      id: record.id.trim(),
      hypothesisIds: record.hypothesisIds.map(id => id.trim()),
      method: record.method as EvidenceMethod,
      title: record.title.trim(),
      rationale: record.rationale.trim(),
      instructions: record.instructions.map(step => step.trim()),
      ...isNonEmptyString(record.artifactHint) ? { artifactHint: record.artifactHint.trim() } : {},
    })
  }
  return { ok: true, requests }
}

/**
 * Format the evidence ledger for the model.
 * @param requests - plan entries.
 * @param observations - user reports.
 * @param artifacts - attached files.
 */
export function describeEvidence(
  requests: readonly EvidenceRequest[],
  observations: readonly { id: string; requestIds: readonly string[]; text: string }[],
  artifacts: readonly { id: string; requestId: string | null; path: string; size: number }[],
): string {
  const requestLines = requests.length === 0
    ? '(no evidence requests)'
    : requests.map(request =>
      `${request.id} [${request.method}] hypotheses=${request.hypothesisIds.join(',')}: ${request.title}`).join('\n')
  const observationLines = observations.length === 0
    ? '(no observations)'
    : observations.map(item => `${item.id} → ${item.requestIds.join(',') || '-'}: ${item.text}`).join('\n')
  const artifactLines = artifacts.length === 0
    ? '(no artifacts)'
    : artifacts.map(item => `${item.id} → ${item.requestId ?? '-'} ${item.path} (${item.size} bytes)`).join('\n')
  return `Requests:\n${requestLines}\nObservations:\n${observationLines}\nArtifacts:\n${artifactLines}`
}
