import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { readBuildId } from './buildId.js'

describe('readBuildId', () => {
  it('reads dist/client/build-id.txt, else falls back to "dev"', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildid-'))
    expect(readBuildId(dir)).toBe('dev')
    fs.writeFileSync(path.join(dir, 'build-id.txt'), 'abc123\n')
    expect(readBuildId(dir)).toBe('abc123')
    fs.writeFileSync(path.join(dir, 'build-id.txt'), '   ')
    expect(readBuildId(dir)).toBe('dev')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
