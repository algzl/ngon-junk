import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { inflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const logoPath = path.join(rootDir, 'public', 'ngonlogos.png')
const outputPath = path.join(rootDir, 'build', 'icons', 'icon.ico')
const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngSignature = '89504e470d0a1a0a'

const colorTypeChannels = new Map([
  [0, 1],
  [2, 3],
  [4, 2],
  [6, 4],
])

const paethPredictor = (a, b, c) => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)

  if (pa <= pb && pa <= pc) {
    return a
  }

  return pb <= pc ? b : c
}

const parsePng = (buffer) => {
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error('Logo source must be a PNG file.')
  }

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatChunks = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      const interlace = data[12]

      if (bitDepth !== 8 || interlace !== 0 || !colorTypeChannels.has(colorType)) {
        throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}`)
      }
    } else if (type === 'IDAT') {
      idatChunks.push(data)
    } else if (type === 'IEND') {
      break
    }
  }

  if (!width || !height || idatChunks.length === 0) {
    throw new Error('Could not read PNG dimensions or image data.')
  }

  const channels = colorTypeChannels.get(colorType)
  const stride = width * channels
  const inflated = inflateSync(Buffer.concat(idatChunks))
  const rgba = Buffer.alloc(width * height * 4)
  let sourceOffset = 0
  let previous = Buffer.alloc(stride)

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset]
    sourceOffset += 1

    const scanline = Buffer.from(inflated.subarray(sourceOffset, sourceOffset + stride))
    sourceOffset += stride

    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? scanline[x - channels] : 0
      const up = previous[x] ?? 0
      const upLeft = x >= channels ? previous[x - channels] : 0

      if (filter === 1) {
        scanline[x] = (scanline[x] + left) & 0xff
      } else if (filter === 2) {
        scanline[x] = (scanline[x] + up) & 0xff
      } else if (filter === 3) {
        scanline[x] = (scanline[x] + Math.floor((left + up) / 2)) & 0xff
      } else if (filter === 4) {
        scanline[x] = (scanline[x] + paethPredictor(left, up, upLeft)) & 0xff
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter: ${filter}`)
      }
    }

    for (let x = 0; x < width; x += 1) {
      const sourcePixel = x * channels
      const targetPixel = (y * width + x) * 4

      if (colorType === 0) {
        const value = scanline[sourcePixel]
        rgba[targetPixel] = value
        rgba[targetPixel + 1] = value
        rgba[targetPixel + 2] = value
        rgba[targetPixel + 3] = 0xff
      } else if (colorType === 2) {
        rgba[targetPixel] = scanline[sourcePixel]
        rgba[targetPixel + 1] = scanline[sourcePixel + 1]
        rgba[targetPixel + 2] = scanline[sourcePixel + 2]
        rgba[targetPixel + 3] = 0xff
      } else if (colorType === 4) {
        const value = scanline[sourcePixel]
        rgba[targetPixel] = value
        rgba[targetPixel + 1] = value
        rgba[targetPixel + 2] = value
        rgba[targetPixel + 3] = scanline[sourcePixel + 1]
      } else {
        rgba[targetPixel] = scanline[sourcePixel]
        rgba[targetPixel + 1] = scanline[sourcePixel + 1]
        rgba[targetPixel + 2] = scanline[sourcePixel + 2]
        rgba[targetPixel + 3] = scanline[sourcePixel + 3]
      }
    }

    previous = scanline
  }

  return { width, height, pixels: rgba }
}

const sampleBilinear = (source, x, y) => {
  const x0 = Math.max(0, Math.min(source.width - 1, Math.floor(x)))
  const y0 = Math.max(0, Math.min(source.height - 1, Math.floor(y)))
  const x1 = Math.max(0, Math.min(source.width - 1, x0 + 1))
  const y1 = Math.max(0, Math.min(source.height - 1, y0 + 1))
  const tx = x - x0
  const ty = y - y0
  const values = [0, 0, 0, 0]

  for (let channel = 0; channel < 4; channel += 1) {
    const topLeft = source.pixels[(y0 * source.width + x0) * 4 + channel]
    const topRight = source.pixels[(y0 * source.width + x1) * 4 + channel]
    const bottomLeft = source.pixels[(y1 * source.width + x0) * 4 + channel]
    const bottomRight = source.pixels[(y1 * source.width + x1) * 4 + channel]
    const top = topLeft * (1 - tx) + topRight * tx
    const bottom = bottomLeft * (1 - tx) + bottomRight * tx
    values[channel] = Math.round(top * (1 - ty) + bottom * ty)
  }

  return values
}

const renderDib = (source, size) => {
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

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sourceX = ((x + 0.5) / size) * source.width - 0.5
      const sourceY = ((y + 0.5) / size) * source.height - 0.5
      const [r, g, b, a] = sampleBilinear(source, sourceX, sourceY)
      const bottomUpY = size - 1 - y
      const pixelOffset = headerSize + (bottomUpY * size + x) * 4

      dib[pixelOffset] = b
      dib[pixelOffset + 1] = g
      dib[pixelOffset + 2] = r
      dib[pixelOffset + 3] = a
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

const source = parsePng(await readFile(logoPath))
const images = sizes.map((size) => ({
  bytes: renderDib(source, size),
  size,
}))

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, createIco(images))
console.log(path.relative(rootDir, outputPath))
