import fs from 'fs'
import path from 'path'

/**
 * The id of the client build this server ships with: dist/client/build-id.txt, written by the
 * Vite build (client/vite.config.ts). 'dev' when there's no build (local dev, tests).
 */
export function readBuildId(clientBuildPath: string): string {
  try {
    const id = fs.readFileSync(path.join(clientBuildPath, 'build-id.txt'), 'utf8').trim()
    return id || 'dev'
  } catch {
    return 'dev'
  }
}
