import { describe, expect, it } from 'vitest'
import TYPERT_REMOTE from '../src/remote.ts'

describe('TYPERT_REMOTE', () => {
  it('exports the debug namespace methods the dock calls', () => {
    expect(TYPERT_REMOTE.package).toBe('@siuver/dsh-debug-mode')
    expect(TYPERT_REMOTE.descriptors.map(item => item.method)).toEqual([
      'get',
      'follow',
      'start',
      'proceed',
      'done',
      'abort',
      'clearLogs',
      'attach',
    ])
  })
})
