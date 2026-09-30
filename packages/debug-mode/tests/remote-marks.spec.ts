import { describe, expect, it } from 'vitest'
import { markRemoteMethods } from '../src/remote-marks.ts'

const KEY = '@deepseek-ai/dsh-typert-protocol/remote-methods'

describe('markRemoteMethods', () => {
  it('writes the Gateway source-mode descriptor onto the prototype', () => {
    class Sample {
      get(): void {}
      async *follow(): AsyncIterable<number> { yield 1 }
    }
    markRemoteMethods(Sample.prototype, [
      { method: 'get' },
      { method: 'follow', mode: 'stream' },
    ])
    expect(Object.getOwnPropertyDescriptor(Sample.prototype, KEY)?.value).toEqual({
      version: 1,
      methods: [
        { method: 'get', invocation: { kind: 'direct' } },
        { method: 'follow', mode: 'stream', invocation: { kind: 'direct' } },
      ],
    })
  })
})
