import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import packageJson from '../package.json' with { type: 'json' }

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const outputDir = path.join(rootDir, 'release', 'windows app')
const versionedExe = path.join(outputDir, `ngon-junk-${packageJson.version}.exe`)
const latestExe = path.join(
  outputDir,
  `ngon-junk-${packageJson.version}-latest.exe`,
)

await mkdir(outputDir, { recursive: true })
await copyFile(versionedExe, latestExe)
console.log(`copied ${path.relative(rootDir, latestExe)}`)
