import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROBE_MARK } from '../src/constants.ts'
import { describeLedger, ledgerAfterScan, probeIdsIn, probesInInput, scanLedger } from '../src/probes.ts'

describe('probe scanning', () => {
  it('extracts probe ids from text and skips pre-edit fields', async () => {
    expect(probeIdsIn(`// ${PROBE_MARK} alpha\n// ${PROBE_MARK} beta`)).toEqual(['alpha', 'beta'])
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-debug-cwd-'))
    expect(probesInInput({
      path: 'src/a.ts',
      old_string: `// ${PROBE_MARK} old`,
      new_string: `// ${PROBE_MARK} fresh`,
    }, cwd, 2)).toEqual([{ id: 'fresh', file: resolve(cwd, 'src/a.ts'), round: 2 }])
  })

  it('classifies alive, gone, and unreadable probes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-debug-probes-'))
    const alive = join(dir, 'alive.ts')
    const gone = join(dir, 'gone.ts')
    await writeFile(alive, `// ${PROBE_MARK} keep\n`, 'utf8')
    await writeFile(gone, 'export {}\n', 'utf8')
    const scan = await scanLedger([
      { id: 'keep', file: alive, round: 1 },
      { id: 'lost', file: gone, round: 1 },
      { id: 'ghost', file: join(dir, 'missing.ts'), round: 1 },
    ])
    expect(scan.alive.map(probe => probe.id)).toEqual(['keep'])
    expect(scan.gone.map(probe => probe.id)).toEqual(['lost', 'ghost'])
    expect(scan.unknown.map(probe => probe.id)).toEqual([])
    expect(ledgerAfterScan(scan).map(probe => probe.id)).toEqual(['keep'])
    expect(describeLedger(scan)).toContain(`${PROBE_MARK} keep`)
  })
})
