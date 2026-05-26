import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import packageJson from '../package.json' with { type: 'json' }

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const outputDir = path.join(rootDir, 'release', 'windows app')
const unpackedDir = path.join(outputDir, 'win-unpacked')
const versionedExe = path.join(outputDir, `ngon-junk-${packageJson.version}.exe`)
const latestExe = path.join(
  outputDir,
  `ngon-junk-${packageJson.version}-latest.exe`,
)
const logoFileName = 'ngonlogos.png'
const iconFileName = 'icon.ico'
const sourceLogo = path.join(rootDir, 'public', logoFileName)
const sourceIcon = path.join(rootDir, 'build', 'icons', iconFileName)

await mkdir(outputDir, { recursive: true })
await copyFile(versionedExe, latestExe)
await copyFile(sourceLogo, path.join(outputDir, logoFileName))
await copyFile(sourceIcon, path.join(outputDir, iconFileName))

try {
  await mkdir(unpackedDir, { recursive: true })
  await copyFile(sourceLogo, path.join(unpackedDir, logoFileName))
  await copyFile(sourceIcon, path.join(unpackedDir, iconFileName))
} catch (error) {
  console.warn(`skipped win-unpacked icon assets: ${error.message}`)
}

console.log(`copied ${path.relative(rootDir, latestExe)}`)
console.log(`copied ${path.relative(rootDir, path.join(outputDir, logoFileName))}`)
console.log(`copied ${path.relative(rootDir, path.join(outputDir, iconFileName))}`)
