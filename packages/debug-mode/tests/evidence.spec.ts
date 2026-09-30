import { describe, expect, it } from 'vitest'
import { describeEvidence, validateEvidenceRequests } from '../src/evidence.ts'

function validEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'E1',
    hypothesisIds: ['A'],
    method: 'agent_inspection',
    title: 'Read existing logs',
    rationale: 'Existing logs already contain the disputed branch decisions.',
    instructions: ['Inspect the log for branch decisions.'],
    ...overrides,
  }
}

describe('validateEvidenceRequests', () => {
  it('accepts a well-formed plan', () => {
    const result = validateEvidenceRequests([validEntry()])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.requests[0]?.id).toBe('E1')
  })

  it('rejects an empty array and a non-array', () => {
    expect(validateEvidenceRequests([])).toEqual({ ok: false, error: expect.stringContaining('must not be empty') })
    expect(validateEvidenceRequests({})).toEqual({ ok: false, error: expect.stringContaining('JSON array') })
  })

  it('rejects duplicate ids and unknown methods', () => {
    expect(validateEvidenceRequests([validEntry(), validEntry({ id: 'E1', title: 'other' })]).ok).toBe(false)
    expect(validateEvidenceRequests([validEntry({ method: 'guess' })]).ok).toBe(false)
  })

  it('requires artifactHint only for user_artifact', () => {
    expect(validateEvidenceRequests([validEntry({ method: 'user_artifact' })]).ok).toBe(false)
    expect(validateEvidenceRequests([validEntry({ method: 'user_artifact', artifactHint: 'trace' })]).ok).toBe(true)
  })
})

describe('describeEvidence', () => {
  it('formats empty ledgers and populated rows', () => {
    expect(describeEvidence([], [], [])).toContain('(no evidence requests)')
    expect(describeEvidence(
      [{
        id: 'E1',
        hypothesisIds: ['A'],
        method: 'user_report',
        title: 'What you saw',
        rationale: 'only the user saw it',
        instructions: ['describe it'],
      }],
      [{ id: 'observation-1', requestIds: ['E1'], text: 'it crashed' }],
      [{ id: 'artifact-1', requestId: 'E1', path: '/tmp/a.log', size: 12 }],
    )).toContain('E1 [user_report]')
  })
})
