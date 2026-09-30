import { describe, expect, it } from 'vitest'
import { COMMAND_ECHO_RULE, HANDOFF_RULE, METHODOLOGY, extractReproductionSteps } from '../src/methodology.ts'

describe('methodology copy', () => {
  it('never names slash commands', () => {
    expect(METHODOLOGY).not.toMatch(/\/debug-/)
    expect(METHODOLOGY).toContain('@dsh-probe')
    expect(METHODOLOGY).not.toContain('@omp-probe')
    expect(HANDOFF_RULE).not.toMatch(/\/debug-/)
    expect(COMMAND_ECHO_RULE).toContain('Proceed')
  })

  it('extracts numbered reproduction steps', () => {
    expect(extractReproductionSteps('<reproduction_steps>\n1. Restart.\n2. Jump.\n</reproduction_steps>'))
      .toEqual(['1. Restart.', '2. Jump.'])
    expect(extractReproductionSteps('no tags')).toEqual([])
  })
})
