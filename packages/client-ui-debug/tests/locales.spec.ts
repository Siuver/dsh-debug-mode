import { describe, expect, it } from 'vitest'
import { en, zh } from '../src/client/locales.ts'

describe('debug-mode dictionaries', () => {
  it('keeps English complete against the Chinese key set', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})
