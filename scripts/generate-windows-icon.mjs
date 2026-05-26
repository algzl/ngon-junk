import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const svgPath = path.join(rootDir, 'public', 'favicon.svg')
const outputPath = path.join(rootDir, 'build', 'icons', 'icon.ico')
const sizes = [16, 24, 32, 48, 64, 128, 256]
const fill = { r: 0xe3, g: 0x1b, b: 0x23, a: 0xff }

const parseNumber = (source, state) => {
  while (state.index < source.length && /[\s,]/.test(source[state.index])) {
    state.index += 1
  }

  const start = state.index
  while (state.index < source.length && /[-+0-9.eE]/.test(source[state.index])) {
    state.index += 1
  }

  if (start === state.index) {
    throw new Error(`Expected number near ${source.slice(state.index, state.index + 12)}`)
  }

  return Number(source.slice(start, state.index))
}

const pathToPolygon = (pathData) => {
  const points = []
  const state = { command: '', index: 0, x: 0, y: 0 }

  while (state.index < pathData.length) {
    while (state.index < pathData.length && /[\s,]/.test(pathData[state.index])) {
      state.index += 1
    }

    const char = pathData[state.index]
    if (!char) {
      break
    }

    if (/[A-Za-z]/.test(char)) {
      state.command = char
      state.index += 1
    }

    if (state.command === 'M' || state.command === 'L') {
      state.x = parseNumber(pathData, state)
      state.y = parseNumber(pathData, state)
      points.push([state.x, state.y])
      if (state.command === 'M') {
        state.command = 'L'
      }
    } else if (state.command === 'H') {
      state.x = parseNumber(pathData, state)
      points.push([state.x, state.y])
    } else if (state.command === 'V') {
      state.y = parseNumber(pathData, state)
      points.push([state.x, state.y])
    } else if (state.command === 'Z' || state.command === 'z') {
      break
    } else {
      throw new Error(`Unsupported SVG path command: ${state.command}`)
    }
  }

  return points
}

const containsPoint = (polygon, x, y) => {
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

const renderDib = (polygon, sourceWidth, sourceHeight, size) => {
  const headerSize = 40
  const pixelBytes = size * size * 4
  const maskStride = Math.ceil(size / 32) * 4
  const maskBytes = maskStride * size
  const dib = Buffer.alloc(headerSize + pixelBytes + maskBytes)

  dib.writeUInt32LE(headerSize, 0)
  dib.writeInt32LE(size, 4)
  dib.writeInt32LE(size * 2, 8)
  dib.writeUInt16LE(1, 12)
  dib.writeUInt16LE(32, 14)
  dib.writeUInt32LE(0, 16)
  dib.writeUInt32LE(pixelBytes, 20)
  dib.writeInt32LE(0, 24)
  dib.writeInt32LE(0, 28)
  dib.writeUInt32LE(0, 32)
  dib.writeUInt32LE(0, 36)

  const scale = Math.min((size - 2) / sourceWidth, (size - 2) / sourceHeight)
  const offsetX = (size - sourceWidth * scale) / 2
  const offsetY = (size - sourceHeight * scale) / 2

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sourceX = (x + 0.5 - offsetX) / scale
      const sourceY = (y + 0.5 - offsetY) / scale
      const bottomUpY = size - 1 - y
      const pixelOffset = headerSize + (bottomUpY * size + x) * 4

      if (containsPoint(polygon, sourceX, sourceY)) {
        dib[pixelOffset] = fill.b
        dib[pixelOffset + 1] = fill.g
        dib[pixelOffset + 2] = fill.r
        dib[pixelOffset + 3] = fill.a
      }
    }
  }

  return dib
}

const createIco = (images) => {
  const headerSize = 6
  const entrySize = 16
  const directorySize = headerSize + images.length * entrySize
  const imageBytes = images.reduce((total, image) => total + image.bytes.length, 0)
  const ico = Buffer.alloc(directorySize + imageBytes)

  ico.writeUInt16LE(0, 0)
  ico.writeUInt16LE(1, 2)
  ico.writeUInt16LE(images.length, 4)

  let imageOffset = directorySize
  images.forEach((image, index) => {
    const entryOffset = headerSize + index * entrySize
    ico[entryOffset] = image.size === 256 ? 0 : image.size
    ico[entryOffset + 1] = image.size === 256 ? 0 : image.size
    ico[entryOffset + 2] = 0
    ico[entryOffset + 3] = 0
    ico.writeUInt16LE(1, entryOffset + 4)
    ico.writeUInt16LE(32, entryOffset + 6)
    ico.writeUInt32LE(image.bytes.length, entryOffset + 8)
    ico.writeUInt32LE(imageOffset, entryOffset + 12)
    image.bytes.copy(ico, imageOffset)
    imageOffset += image.bytes.length
  })

  return ico
}

const svg = await readFile(svgPath, 'utf8')
const pathData = svg.match(/<path[^>]+d="([^"]+)"/)?.[1]
const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1]?.split(/\s+/).map(Number)

if (!pathData || !viewBox || viewBox.length !== 4) {
  throw new Error('Could not read favicon SVG path or viewBox.')
}

const polygon = pathToPolygon(pathData)
const [, , sourceWidth, sourceHeight] = viewBox
const images = sizes.map((size) => ({
  bytes: renderDib(polygon, sourceWidth, sourceHeight, size),
  size,
}))

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, createIco(images))
console.log(path.relative(rootDir, outputPath))
