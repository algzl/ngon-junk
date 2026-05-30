import { startTransition, useEffect, useRef, useState } from 'react'
import '@fontsource/space-mono/400.css'
import '@fontsource/space-mono/700.css'
import { CanvasTexture, ClampToEdgeWrapping, Color, SRGBColorSpace } from 'three'
import './App.css'
import {
  cloneSurfaceState,
  createPresetSurface,
  generateBakeMaps,
  getPresetLabel,
  MATERIAL_PRESET_ORDER,
  SURFACE_MAP_ORDER,
  type GeneratedBakeMaps,
  type LoadedTextureMap,
  type MaterialPresetKey,
  type SurfaceMapSlot,
  type SurfaceState,
} from './lib/materialSystem'
import { loadModelFile, type ViewerFileSource } from './lib/modelLoader'
import {
  ModelViewport,
  type ViewBackgroundImageLayerSettings,
  type ViewBackgroundImageMode,
  type ViewBackgroundGradientStop,
  type ViewBackgroundGradientSettings,
  type ViewLightSettings,
  type ViewLightType,
  type ViewMotionBlurSettings,
  type ViewTurntableCaptureOptions,
  type ViewTurntableSettings,
} from './lib/sceneManager'

type ModelSummary = {
  extension: string
  meshCount: number
  triangleCount: number
  vertexCount: number
  name: string
}

type MaterialMode = 'original' | 'custom'
type ImageExportFormat = 'jpg' | 'png'
type ModelExportFormat = 'glb' | 'obj'
type FloatingPanelKey = 'background' | 'light' | 'motion' | 'uv' | 'wire'
type BakeDeliveryMode = 'embedded' | 'separate'
type PreviewFramePreset = 'landscape' | 'portrait' | 'square'
type ImageExportScale = 2 | 4
type ImageExportDpi = 72 | 150 | 300
type DockPanelKey = 'export' | 'frame' | FloatingPanelKey
type BakeExportOptions = {
  bakeCombined: boolean
  bakeDiffuseLike: boolean
  bakeReflectionIntoMaps: boolean
  deliveryMode: BakeDeliveryMode
}
type ImageExportOptions = {
  dpi: ImageExportDpi
  longEdge: number
  scale: ImageExportScale | null
}
type TurntableCaptureExportType = 'frames' | 'gif'
type TurntableCaptureOptions = {
  delayMs: number
  durationSeconds: number
  fps: number
  frameCount: number
}
type CloseExportSelection = {
  image: boolean
  model: boolean
  turntableFrames: boolean
  turntableGif: boolean
}
type BackgroundImageLayer = ViewBackgroundImageLayerSettings & {
  name: string
  sourceUrl: string | null
}
type BackgroundImageState = {
  enabled: boolean
  layers: BackgroundImageLayer[]
  selectedLayerId: string | null
}
type BackgroundImageSliderKey =
  | 'blur'
  | 'offsetU'
  | 'offsetV'
  | 'scaleU'
  | 'scaleV'
type GradientDragTarget =
  | {
      endX: number
      endY: number
      kind: 'line'
      pointerX: number
      pointerY: number
      startX: number
      startY: number
    }
  | { kind: 'start' | 'end' }
  | { id: string; kind: 'stop' }
type DockPanelPosition = {
  left: number
  top: number
}
type DockDragTarget = {
  height: number
  key: DockPanelKey
  offsetX: number
  offsetY: number
  width: number
}
type PendingGradientStopDrag = {
  id: string
  startX: number
  startY: number
}

const SUPPORTED_FORMATS = ['OBJ', 'FBX', '3DS', 'STL', 'BLEND', 'SKP']
const FILE_INPUT_ACCEPT = '.obj,.fbx,.3ds,.stl,.blend,.skp'
const IMAGE_INPUT_ACCEPT = '.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff'
const SAMPLE_MODEL_ASSET_URL = `${import.meta.env.BASE_URL}sample-model.fbx`
const SAMPLE_MODEL_FILE_NAME = 'sample model'

const SLIDER_DEFS: Array<{
  key: 'reflection' | 'refraction' | 'bump' | 'coating'
  label: string
}> = [
  { key: 'reflection', label: 'reflection' },
  { key: 'refraction', label: 'refraction' },
  { key: 'bump', label: 'bump' },
  { key: 'coating', label: 'coating' },
]

const FOLIAGE_SLIDERS: Array<{
  key: 'opacityCut' | 'leafSoftness'
  label: string
}> = [
  { key: 'opacityCut', label: 'cut' },
  { key: 'leafSoftness', label: 'soft' },
]

const UV_SLIDERS: Array<{
  key: 'uvScaleX' | 'uvScaleY' | 'uvOffsetX' | 'uvOffsetY' | 'uvRotation'
  label: string
  min: number
  max: number
  step: number
}> = [
  { key: 'uvScaleX', label: 'scale x', min: 0.2, max: 100, step: 0.01 },
  { key: 'uvScaleY', label: 'scale y', min: 0.2, max: 100, step: 0.01 },
  { key: 'uvOffsetX', label: 'move x', min: -2, max: 2, step: 0.01 },
  { key: 'uvOffsetY', label: 'move y', min: -2, max: 2, step: 0.01 },
  { key: 'uvRotation', label: 'rotate', min: -180, max: 180, step: 1 },
]

const LIGHT_TYPES: Array<{
  key: ViewLightType
  label: string
}> = [
  { key: 'studio', label: 'studio' },
  { key: 'sun', label: 'sun' },
  { key: 'spot', label: 'spot' },
]

const LIGHT_SLIDERS: Array<{
  key: 'intensity' | 'bloom' | 'turn' | 'lift'
  label: string
  min: number
  max: number
  step: number
}> = [
  { key: 'intensity', label: 'amount', min: 0, max: 5, step: 0.01 },
  { key: 'bloom', label: 'bloom', min: 0, max: 1.4, step: 0.01 },
  { key: 'turn', label: 'turn', min: 0, max: 360, step: 1 },
  { key: 'lift', label: 'lift', min: -85, max: 85, step: 1 },
]

const MOTION_SLIDERS: Array<{
  key: keyof Pick<
    ViewMotionBlurSettings,
    'distance' | 'gaussian' | 'intensity' | 'strobe'
  >
  label: string
  max: number
  min: number
  step: number
}> = [
  { key: 'intensity', label: 'power', min: 0, max: 1, step: 0.01 },
  { key: 'distance', label: 'distance', min: 0, max: 2, step: 0.01 },
  { key: 'gaussian', label: 'gauss blur', min: 0, max: 1, step: 0.01 },
  { key: 'strobe', label: 'strobe', min: 0, max: 1, step: 0.01 },
]

const MOTION_AXIS_SLIDERS: Array<{
  key: keyof Pick<ViewMotionBlurSettings, 'axisX' | 'axisY' | 'axisZ'>
  label: string
}> = [
  { key: 'axisX', label: 'left / right' },
  { key: 'axisY', label: 'up / down' },
  { key: 'axisZ', label: 'front / back' },
]

const MOTION_MODES: Array<{
  key: ViewMotionBlurSettings['mode']
  label: string
}> = [
  { key: 'trail', label: 'trail' },
  { key: 'smear', label: 'smear' },
  { key: 'silhouette', label: 'silhouette' },
]

const TURNTABLE_MODES: Array<{
  key: ViewTurntableSettings['mode']
  label: string
}> = [
  { key: 'loop', label: '360' },
  { key: 'pingpong', label: 'pingpong' },
]

const DEFAULT_LIGHT_SETTINGS: ViewLightSettings = {
  bloom: 0,
  lift: 34,
  intensity: 2.4,
  turn: 38,
  type: 'studio',
}

const DEFAULT_MOTION_SETTINGS: ViewMotionBlurSettings = {
  axisX: 0,
  axisY: 0,
  axisZ: 0,
  distance: 0.45,
  enabled: false,
  gaussian: 0.28,
  intensity: 0.46,
  mode: 'trail',
  strobe: 0.45,
}

const DEFAULT_TURNTABLE_SETTINGS: ViewTurntableSettings = {
  enabled: false,
  mode: 'loop',
  speed: 0.28,
}

const BACKGROUND_PRESETS = [
  { key: '#ffffff', label: 'bg: white' },
  { key: '#000000', label: 'bg: black' },
]

const IMAGE_EXPORT_OPTIONS: Array<{
  key: ImageExportFormat
  label: string
}> = [
  { key: 'jpg', label: 'jpg' },
  { key: 'png', label: 'png' },
]

const FRAME_OPTIONS: Array<{
  aspect: number
  key: PreviewFramePreset
  label: string
}> = [
  { aspect: 16 / 9, key: 'landscape', label: '16:9' },
  { aspect: 9 / 16, key: 'portrait', label: '9:16' },
  { aspect: 1, key: 'square', label: '1:1' },
]

const MODEL_EXPORT_OPTIONS: Array<{
  key: ModelExportFormat
  label: string
}> = [
  { key: 'glb', label: 'glb' },
  { key: 'obj', label: 'obj' },
]

const IMAGE_EXPORT_FILTERS = [
  { name: 'JPG Image', extensions: ['jpg', 'jpeg'] },
  { name: 'PNG Image', extensions: ['png'] },
]

const MODEL_EXPORT_FILTERS = [
  { name: 'OBJ Model', extensions: ['obj'] },
  { name: 'GLB Model', extensions: ['glb'] },
]

const CAPTURE_EXPORT_FILTERS: Record<
  'frames' | 'gif',
  Array<{ name: string; extensions: string[] }>
> = {
  frames: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  gif: [{ name: 'GIF Animation', extensions: ['gif'] }],
}

const DEFAULT_TURNTABLE_CAPTURE_OPTIONS: TurntableCaptureOptions = {
  delayMs: 0,
  durationSeconds: 3,
  fps: 24,
  frameCount: 72,
}

const DEFAULT_BAKE_EXPORT_OPTIONS: BakeExportOptions = {
  bakeCombined: true,
  bakeDiffuseLike: false,
  bakeReflectionIntoMaps: true,
  deliveryMode: 'embedded',
}

const DEFAULT_IMAGE_EXPORT_OPTIONS: ImageExportOptions = {
  dpi: 72,
  longEdge: 1600,
  scale: null,
}

const DEFAULT_CLOSE_EXPORT_SELECTION: CloseExportSelection = {
  image: false,
  model: false,
  turntableFrames: false,
  turntableGif: false,
}
const DEFAULT_BACKGROUND_GRADIENT_SETTINGS: ViewBackgroundGradientSettings = {
  enabled: false,
  endX: 0.8,
  endY: 0.18,
  startX: 0.18,
  startY: 0.86,
  stops: [
    { alpha: 1, color: '#d29595', id: 'start', position: 0.11 },
    { alpha: 1, color: '#aaa26f', id: 'mid', position: 0.41 },
    { alpha: 1, color: '#982525', id: 'end', position: 0.96 },
  ],
}

const DEFAULT_BACKGROUND_IMAGE_SETTINGS: BackgroundImageState = {
  enabled: false,
  layers: [],
  selectedLayerId: null,
}

const BACKGROUND_IMAGE_ACCEPT = 'image/png,.png'
const BACKGROUND_IMAGE_SLIDERS: Array<{
  decimals?: number
  defaultValue: number
  key: BackgroundImageSliderKey
  label: string
  max: number
  min: number
  step: number
}> = [
  { defaultValue: 1, key: 'scaleU', label: 'u', max: 8, min: 0.05, step: 0.01 },
  { defaultValue: 1, key: 'scaleV', label: 'v', max: 8, min: 0.05, step: 0.01 },
  { defaultValue: 0, key: 'offsetU', label: 'x', max: 2, min: -2, step: 0.01 },
  { defaultValue: 0, key: 'offsetV', label: 'y', max: 2, min: -2, step: 0.01 },
  { defaultValue: 0, key: 'blur', label: 'blur', max: 48, min: 0, step: 0.5 },
]

const MAX_IMAGE_EXPORT_LONG_EDGE = 8192

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const lerp = (start: number, end: number, amount: number) => start + (end - start) * amount
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))
const createGradientStopId = () =>
  `stop-${Math.random().toString(36).slice(2, 10)}`
const createBackgroundImageLayerId = () =>
  `bg-${Math.random().toString(36).slice(2, 10)}`

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '')
  const compact =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : normalized

  const value = Number.parseInt(compact, 16)
  return {
    b: value & 255,
    g: (value >> 8) & 255,
    r: (value >> 16) & 255,
  }
}

const gradientStopToCss = (stop: ViewBackgroundGradientStop) => {
  const { r, g, b } = hexToRgb(stop.color)
  return `rgba(${r}, ${g}, ${b}, ${clamp(stop.alpha, 0, 1)})`
}

const hslToHex = (hue: number, saturation: number, lightness: number) =>
  `#${new Color(
    `hsl(${((hue % 360) + 360) % 360}, ${clamp(saturation, 0, 100)}%, ${clamp(lightness, 0, 100)}%)`,
  ).getHexString()}`

const createRandomGradientSettings = (): ViewBackgroundGradientSettings => {
  const baseHue = Math.random() * 360
  const scheme = Math.random() > 0.45 ? 'analogous' : 'split'
  const hueOffsets =
    scheme === 'analogous'
      ? [-22 + Math.random() * 8, 2 + Math.random() * 10, 28 + Math.random() * 12]
      : [-34 + Math.random() * 8, -6 + Math.random() * 12, 36 + Math.random() * 12]
  const saturationBase = 52 + Math.random() * 18
  const lightnessBase = 54 + Math.random() * 12
  const centerX = 0.5 + (Math.random() - 0.5) * 0.16
  const centerY = 0.5 + (Math.random() - 0.5) * 0.16
  const angle = Math.random() * Math.PI * 2
  const spread = 0.58 + Math.random() * 0.28
  const halfSpreadX = Math.cos(angle) * spread * 0.5
  const halfSpreadY = Math.sin(angle) * spread * 0.5

  return {
    enabled: true,
    startX: clamp01(centerX - halfSpreadX),
    startY: clamp01(centerY - halfSpreadY),
    endX: clamp01(centerX + halfSpreadX),
    endY: clamp01(centerY + halfSpreadY),
    stops: [
      {
        alpha: 1,
        color: hslToHex(baseHue + hueOffsets[0], saturationBase - 4, lightnessBase + 16),
        id: 'start',
        position: 0.08 + Math.random() * 0.1,
      },
      {
        alpha: 1,
        color: hslToHex(baseHue + hueOffsets[1], saturationBase - 10, lightnessBase + 2),
        id: 'mid',
        position: 0.38 + Math.random() * 0.16,
      },
      {
        alpha: 1,
        color: hslToHex(baseHue + hueOffsets[2], saturationBase + 8, lightnessBase - 18),
        id: 'end',
        position: 0.86 + Math.random() * 0.1,
      },
    ],
  }
}

const buildGradientCss = (gradient: ViewBackgroundGradientSettings) => {
  const angle =
    (Math.atan2(
      gradient.endY - gradient.startY,
      gradient.endX - gradient.startX,
    ) *
      180) /
      Math.PI +
    90
  const stops = [...gradient.stops]
    .sort((left, right) => left.position - right.position)
    .map((stop) => `${gradientStopToCss(stop)} ${Math.round(stop.position * 100)}%`)
    .join(', ')
  return `linear-gradient(${angle}deg, ${stops})`
}

const projectPointOnGradient = (
  gradient: ViewBackgroundGradientSettings,
  pointX: number,
  pointY: number,
) => {
  const startX = gradient.startX
  const startY = gradient.startY
  const directionX = gradient.endX - startX
  const directionY = gradient.endY - startY
  const lengthSquared = directionX * directionX + directionY * directionY

  if (lengthSquared <= 0.000001) {
    return 0
  }

  const ratio =
    ((pointX - startX) * directionX + (pointY - startY) * directionY) / lengthSquared

  return clamp01(ratio)
}

const LIGHT_PRESETS: Record<ViewLightType, ViewLightSettings> = {
  studio: {
    ...DEFAULT_LIGHT_SETTINGS,
    bloom: 0,
    intensity: 2.4,
    lift: 34,
    turn: 38,
    type: 'studio',
  },
  sun: {
    ...DEFAULT_LIGHT_SETTINGS,
    bloom: 0,
    intensity: 2.7,
    lift: 52,
    turn: 132,
    type: 'sun',
  },
  spot: {
    ...DEFAULT_LIGHT_SETTINGS,
    bloom: 0,
    intensity: 2.1,
    lift: 28,
    turn: 312,
    type: 'spot',
  },
}

const MAP_LABELS: Record<SurfaceMapSlot, string> = {
  diffuse: 'diff',
  reflection: 'refl',
  refraction: 'refract',
  bump: 'bump',
  roughness: 'rough',
  metallic: 'metal',
  normal: 'normal',
}

const loadTextureMapFromFile = async (
  file: File,
  slot: SurfaceMapSlot,
): Promise<LoadedTextureMap> => {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Texture canvas olusturulamadi.')
  }

  context.drawImage(bitmap, 0, 0)

  const texture = new CanvasTexture(canvas)
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.needsUpdate = true

  if (slot === 'diffuse') {
    texture.colorSpace = SRGBColorSpace
  } else {
    texture.colorSpace = ''
  }

  bitmap.close()

  return {
    name: file.name,
    texture,
  }
}

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

const crcTable = (() => {
  const table = new Uint32Array(256)

  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }

  return table
})()

const computeCrc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const dateToDos = (date: Date) => {
  const year = Math.max(1980, date.getFullYear())
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    Math.floor(date.getSeconds() / 2)
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f)
  return {
    dosDate,
    dosTime,
  }
}

const concatenateUint8Arrays = (chunks: Uint8Array[]) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const output = new Uint8Array(totalLength)
  let offset = 0

  chunks.forEach((chunk) => {
    output.set(chunk, offset)
    offset += chunk.length
  })

  return output
}

const createStoredZip = (
  entries: Array<{
    bytes: Uint8Array
    fileName: string
  }>,
) => {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  const encoder = new TextEncoder()
  let offset = 0
  const now = dateToDos(new Date())

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.fileName)
    const crc32 = computeCrc32(entry.bytes)

    const localHeader = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(localHeader.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0, true)
    localView.setUint16(8, 0, true)
    localView.setUint16(10, now.dosTime, true)
    localView.setUint16(12, now.dosDate, true)
    localView.setUint32(14, crc32, true)
    localView.setUint32(18, entry.bytes.length, true)
    localView.setUint32(22, entry.bytes.length, true)
    localView.setUint16(26, nameBytes.length, true)
    localView.setUint16(28, 0, true)
    localHeader.set(nameBytes, 30)
    localParts.push(localHeader, entry.bytes)

    const centralHeader = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(centralHeader.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, now.dosTime, true)
    centralView.setUint16(14, now.dosDate, true)
    centralView.setUint32(16, crc32, true)
    centralView.setUint32(20, entry.bytes.length, true)
    centralView.setUint32(24, entry.bytes.length, true)
    centralView.setUint16(28, nameBytes.length, true)
    centralView.setUint16(30, 0, true)
    centralView.setUint16(32, 0, true)
    centralView.setUint16(34, 0, true)
    centralView.setUint16(36, 0, true)
    centralView.setUint32(38, 0, true)
    centralView.setUint32(42, offset, true)
    centralHeader.set(nameBytes, 46)
    centralParts.push(centralHeader)

    offset += localHeader.length + entry.bytes.length
  })

  const centralDirectory = concatenateUint8Arrays(centralParts)
  const localDirectory = concatenateUint8Arrays(localParts)
  const endRecord = new Uint8Array(22)
  const endView = new DataView(endRecord.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralDirectory.length, true)
  endView.setUint32(16, localDirectory.length, true)
  endView.setUint16(20, 0, true)

  return concatenateUint8Arrays([localDirectory, centralDirectory, endRecord]).buffer
}

const canvasToPngBytes = async (canvas: HTMLCanvasElement) => {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (!nextBlob) {
        reject(new Error('Bake map olusturulamadi.'))
        return
      }
      resolve(nextBlob)
    }, 'image/png')
  })

  return new Uint8Array(await blob.arrayBuffer())
}

type SliderFieldProps = {
  decimals?: number
  defaultValue: number
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  value: number
}

const clampValue = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const formatSliderValue = (value: number, decimals: number) =>
  String(Number(value.toFixed(decimals)))

const SliderField = ({
  decimals = 2,
  defaultValue,
  label,
  max,
  min,
  onChange,
  step,
  value,
}: SliderFieldProps) => {
  const [draftValue, setDraftValue] = useState<string | null>(null)
  const displayValue = draftValue ?? formatSliderValue(value, decimals)

  const resetValue = () => {
    onChange(defaultValue)
    setDraftValue(null)
  }

  const commitDraftValue = () => {
    const normalizedValue = displayValue.trim().replace(',', '.')
    const nextValue = Number(normalizedValue)

    if (Number.isFinite(nextValue)) {
      const clampedValue = clampValue(nextValue, min, max)
      onChange(clampedValue)
    }

    setDraftValue(null)
  }

  return (
    <label className="slider-row">
      <div className="slider-head">
        <span>{label}</span>
        <input
          className="value-input"
          max={max}
          min={min}
          onBlur={commitDraftValue}
          onChange={(event) => setDraftValue(event.target.value)}
          onDoubleClick={resetValue}
          onFocus={() => {
            setDraftValue(formatSliderValue(value, decimals))
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }

            if (event.key === 'Escape') {
              setDraftValue(null)
              event.currentTarget.blur()
            }
          }}
          step={step}
          type="number"
          value={displayValue}
        />
      </div>
      <input
        className="slider"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        onDoubleClick={resetValue}
        step={step}
        type="range"
        value={value}
      />
    </label>
  )
}

const PANEL_TITLES: Record<FloatingPanelKey, string> = {
  background: 'bg img',
  light: 'light',
  motion: 'motion',
  uv: 'uv',
  wire: 'wire',
}

const DEFAULT_COLLAPSED_PANELS: Record<FloatingPanelKey, boolean> = {
  background: false,
  light: false,
  motion: false,
  uv: false,
  wire: false,
}

const DEFAULT_DOCK_PANEL_POSITIONS: Record<DockPanelKey, DockPanelPosition | null> = {
  background: null,
  export: null,
  frame: null,
  light: null,
  motion: null,
  uv: null,
  wire: null,
}

function App() {
  const viewerPanelRef = useRef<HTMLElement | null>(null)
  const viewerHostRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const backgroundImageInputRef = useRef<HTMLInputElement | null>(null)
  const backgroundImageUrlsRef = useRef<Set<string>>(new Set())
  const viewportRef = useRef<ModelViewport | null>(null)
  const imageInputRefs = useRef<Record<SurfaceMapSlot, HTMLInputElement | null>>({
    diffuse: null,
    reflection: null,
    refraction: null,
    bump: null,
    roughness: null,
    metallic: null,
    normal: null,
  })
  const surfaceRef = useRef<SurfaceState>(createPresetSurface('gold'))
  const busyTaskCountRef = useRef(0)
  const busyTimerRef = useRef<number | null>(null)
  const pendingSurfaceBusyRef = useRef(false)
  const pendingMotionBusyRef = useRef(false)
  const pendingSmoothBusyRef = useRef(false)
  const [surface, setSurface] = useState<SurfaceState>(() =>
    createPresetSurface('gold'),
  )
  const [materialMode, setMaterialMode] = useState<MaterialMode>('original')
  const [backgroundColor, setBackgroundColor] = useState('#ffffff')
  const [backgroundGridEnabled, setBackgroundGridEnabled] = useState(false)
  const [backgroundGradient, setBackgroundGradient] =
    useState<ViewBackgroundGradientSettings>(DEFAULT_BACKGROUND_GRADIENT_SETTINGS)
  const [backgroundImage, setBackgroundImage] = useState<BackgroundImageState>(
    DEFAULT_BACKGROUND_IMAGE_SETTINGS,
  )
  const [backgroundImageEditEnabled, setBackgroundImageEditEnabled] = useState(false)
  const [backgroundImageScaleLocked, setBackgroundImageScaleLocked] =
    useState(true)
  const [backgroundImageLayerDragId, setBackgroundImageLayerDragId] =
    useState<string | null>(null)
  const [backgroundImageDrag, setBackgroundImageDrag] = useState<{
    pointerId: number
    pointerX: number
    pointerY: number
    startOffsetU: number
    startOffsetV: number
  } | null>(null)
  const [gradientPanelOpen, setGradientPanelOpen] = useState(false)
  const [selectedGradientStopId, setSelectedGradientStopId] = useState<string | null>(
    DEFAULT_BACKGROUND_GRADIENT_SETTINGS.stops[1]?.id ??
      DEFAULT_BACKGROUND_GRADIENT_SETTINGS.stops[0]?.id ??
      null,
  )
  const [antialiasEnabled, setAntialiasEnabled] = useState(true)
  const [light, setLight] = useState<ViewLightSettings>(DEFAULT_LIGHT_SETTINGS)
  const [shadowsEnabled, setShadowsEnabled] = useState(true)
  const [shadowSoftness, setShadowSoftness] = useState(0.45)
  const [status, setStatus] = useState('idle')
  const [summary, setSummary] = useState<ModelSummary | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isViewerBusy, setIsViewerBusy] = useState(false)
  const [imageExportFormat, setImageExportFormat] =
    useState<ImageExportFormat>('png')
  const [previewFramePreset, setPreviewFramePreset] =
    useState<PreviewFramePreset | null>(null)
  const [showImageExportDialog, setShowImageExportDialog] = useState(false)
  const [imageExportOptions, setImageExportOptions] = useState<ImageExportOptions>(
    DEFAULT_IMAGE_EXPORT_OPTIONS,
  )
  const [modelExportFormat, setModelExportFormat] =
    useState<ModelExportFormat>('glb')
  const [showBakeExportDialog, setShowBakeExportDialog] = useState(false)
  const [showTurntableCaptureDialog, setShowTurntableCaptureDialog] =
    useState(false)
  const [showCloseExportDialog, setShowCloseExportDialog] = useState(false)
  const [closeExportSelection, setCloseExportSelection] =
    useState<CloseExportSelection>(DEFAULT_CLOSE_EXPORT_SELECTION)
  const [isCloseExporting, setIsCloseExporting] = useState(false)
  const [bakeExportOptions, setBakeExportOptions] = useState<BakeExportOptions>(
    DEFAULT_BAKE_EXPORT_OPTIONS,
  )
  const [turntableCaptureOptions, setTurntableCaptureOptions] =
    useState<TurntableCaptureOptions>(DEFAULT_TURNTABLE_CAPTURE_OPTIONS)
  const [liveViewerAspect, setLiveViewerAspect] = useState(16 / 9)
  const [wireColor, setWireColor] = useState('#111111')
  const [wireframeEnabled, setWireframeEnabled] = useState(false)
  const [wireframeShowModel, setWireframeShowModel] = useState(true)
  const [wireThickness, setWireThickness] = useState(1.4)
  const [smoothShadingEnabled, setSmoothShadingEnabled] = useState(true)
  const [motionBlur, setMotionBlur] =
    useState<ViewMotionBlurSettings>(DEFAULT_MOTION_SETTINGS)
  const [turntable, setTurntable] = useState<ViewTurntableSettings>(
    DEFAULT_TURNTABLE_SETTINGS,
  )
  const [cellShaderEnabled, setCellShaderEnabled] = useState(false)
  const [collapsedPanels, setCollapsedPanels] =
    useState<Record<FloatingPanelKey, boolean>>(DEFAULT_COLLAPSED_PANELS)
  const [panelPositions, setPanelPositions] = useState<Record<DockPanelKey, DockPanelPosition | null>>(
    DEFAULT_DOCK_PANEL_POSITIONS,
  )
  const [panelDragTarget, setPanelDragTarget] = useState<DockDragTarget | null>(null)
  const [gradientDragTarget, setGradientDragTarget] =
    useState<GradientDragTarget | null>(null)
  const [pendingGradientStopDrag, setPendingGradientStopDrag] =
    useState<PendingGradientStopDrag | null>(null)
  const [viewerBounds, setViewerBounds] = useState({ height: 0, width: 0 })
  const gradientStopPopoverRef = useRef<HTMLDivElement | null>(null)
  const summaryRef = useRef<ModelSummary | null>(null)
  const closeExportDialogRef = useRef(false)
  const presetDefaults = createPresetSurface(surface.preset)
  const lightDefaults = LIGHT_PRESETS[light.type]
  const activeFrame = FRAME_OPTIONS.find((item) => item.key === previewFramePreset) ?? null
  const previewAspect = activeFrame?.aspect ?? liveViewerAspect
  const scaleMultiplier = imageExportOptions.scale ?? 1
  const dpiDensityScale = imageExportOptions.dpi / 72
  const requestedLongEdge = Math.max(
    1,
    Math.round(imageExportOptions.longEdge * scaleMultiplier * dpiDensityScale),
  )
  const finalLongEdge = Math.min(requestedLongEdge, MAX_IMAGE_EXPORT_LONG_EDGE)
  const exportPreviewWidth =
    previewAspect >= 1
      ? finalLongEdge
      : Math.max(1, Math.round(finalLongEdge * previewAspect))
  const exportPreviewHeight =
    previewAspect >= 1
      ? Math.max(1, Math.round(finalLongEdge / previewAspect))
      : finalLongEdge
  const waitForPaint = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })

  const beginViewerBusy = (delayMs = 1000) => {
    busyTaskCountRef.current += 1

    if (delayMs === 0) {
      if (busyTimerRef.current) {
        window.clearTimeout(busyTimerRef.current)
        busyTimerRef.current = null
      }
      setIsViewerBusy(true)
      return
    }

    if (busyTaskCountRef.current === 1 && busyTimerRef.current === null) {
      busyTimerRef.current = window.setTimeout(() => {
        busyTimerRef.current = null
        if (busyTaskCountRef.current > 0) {
          setIsViewerBusy(true)
        }
      }, delayMs)
    }
  }

  const finishViewerBusy = () => {
    busyTaskCountRef.current = Math.max(0, busyTaskCountRef.current - 1)
    if (busyTaskCountRef.current === 0) {
      if (busyTimerRef.current) {
        window.clearTimeout(busyTimerRef.current)
        busyTimerRef.current = null
      }
      setIsViewerBusy(false)
    }
  }

  const updateStatus = (nextStatus: string) => {
    startTransition(() => setStatus(nextStatus))
  }

  const runAsyncViewerTask = async <T,>(
    task: () => Promise<T>,
    options?: { delayMs?: number },
  ) => {
    beginViewerBusy(options?.delayMs ?? 1000)
    try {
      return await task()
    } finally {
      finishViewerBusy()
    }
  }

  const runSurfaceViewerTask = async (mutate: () => void) => {
    if (!pendingSurfaceBusyRef.current) {
      pendingSurfaceBusyRef.current = true
      beginViewerBusy(0)
    }
    await waitForPaint()
    mutate()
  }

  const runMotionViewerTask = (mutate: () => void) => {
    if (!pendingMotionBusyRef.current) {
      pendingMotionBusyRef.current = true
      beginViewerBusy(0)
    }
    mutate()
  }

  const runMotionToggleTask = async (mutate: () => void) => {
    if (!pendingMotionBusyRef.current) {
      pendingMotionBusyRef.current = true
      beginViewerBusy(0)
    }
    await waitForPaint()
    await waitForPaint()
    mutate()
  }

  const runSmoothViewerTask = async (mutate: () => void) => {
    if (!pendingSmoothBusyRef.current) {
      pendingSmoothBusyRef.current = true
      beginViewerBusy(0)
    }
    await waitForPaint()
    mutate()
  }

  const disableMotionBlurForMaterialChange = async () => {
    if (!motionBlur.enabled) {
      return
    }

    const nextMotion = {
      ...motionBlur,
      enabled: false,
    }

    await runMotionToggleTask(() => {
      viewportRef.current?.setMotionBlurSettings(nextMotion)
      setMotionBlur(nextMotion)
    })
  }

  useEffect(() => {
    if (!viewerHostRef.current) {
      return
    }

    const viewport = new ModelViewport(viewerHostRef.current)
    viewportRef.current = viewport
    viewport.applySurface(surfaceRef.current)

    return () => {
      viewport.dispose()
      viewportRef.current = null
    }
  }, [])

  useEffect(() => {
    surfaceRef.current = surface
    if (materialMode === 'custom') {
      viewportRef.current?.applySurface(surface)
    }

    if (pendingSurfaceBusyRef.current) {
      pendingSurfaceBusyRef.current = false
      requestAnimationFrame(() => finishViewerBusy())
    }
  }, [materialMode, surface])

  useEffect(() => {
    const host = viewerHostRef.current
    if (!host) {
      return
    }

    const updateAspect = () => {
      if (host.clientWidth > 0 && host.clientHeight > 0) {
        setViewerBounds({ height: host.clientHeight, width: host.clientWidth })
        setLiveViewerAspect(host.clientWidth / host.clientHeight)
      }
    }

    updateAspect()
    const observer = new ResizeObserver(updateAspect)
    observer.observe(host)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    viewportRef.current?.updateLightSettings(light)
  }, [light])

  useEffect(() => {
    viewportRef.current?.setWireframe(wireframeEnabled)
  }, [wireframeEnabled])

  useEffect(() => {
    viewportRef.current?.setWireframeStyle(wireColor, wireThickness)
  }, [wireColor, wireThickness])

  useEffect(() => {
    viewportRef.current?.setWireframeSurfaceVisibility(wireframeShowModel)
  }, [wireframeShowModel])

  useEffect(() => {
    viewportRef.current?.setSmoothShadingEnabled(smoothShadingEnabled)

    if (pendingSmoothBusyRef.current) {
      pendingSmoothBusyRef.current = false
      requestAnimationFrame(() => finishViewerBusy())
    }
  }, [smoothShadingEnabled])

  useEffect(() => {
    viewportRef.current?.setBackgroundColor(backgroundColor)
  }, [backgroundColor])

  useEffect(() => {
    viewportRef.current?.setBackgroundGridEnabled(backgroundGridEnabled)
  }, [backgroundGridEnabled])

  useEffect(() => {
    viewportRef.current?.setBackgroundGradient(backgroundGradient)
  }, [backgroundGradient])

  useEffect(() => {
    viewportRef.current?.setBackgroundImage(backgroundImage)
  }, [backgroundImage])

  useEffect(
    () => () => {
      backgroundImageUrlsRef.current.forEach((sourceUrl) => {
        URL.revokeObjectURL(sourceUrl)
      })
      backgroundImageUrlsRef.current.clear()
    },
    [],
  )

  useEffect(() => {
    viewportRef.current?.setAntialiasEnabled(antialiasEnabled)
  }, [antialiasEnabled])

  useEffect(() => {
    viewportRef.current?.setShadowSoftness(shadowSoftness)
  }, [shadowSoftness])

  useEffect(() => {
    viewportRef.current?.setShadowEnabled(shadowsEnabled)
  }, [shadowsEnabled])

  useEffect(() => {
    viewportRef.current?.setMotionBlurSettings(motionBlur)

    if (pendingMotionBusyRef.current) {
      pendingMotionBusyRef.current = false
      requestAnimationFrame(() => finishViewerBusy())
    }
  }, [motionBlur])

  useEffect(() => {
    viewportRef.current?.setTurntableSettings(turntable)
  }, [turntable])

  useEffect(() => {
    viewportRef.current?.setCellShaderEnabled(cellShaderEnabled)
  }, [cellShaderEnabled])

  useEffect(() => {
    if (!selectedGradientStopId) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target?.closest(
          '.gradient-editor-stop-popover, .gradient-editor-stop, .gradient-editor-add, .gradient-editor-color',
        )
      ) {
        return
      }

      setSelectedGradientStopId(null)
    }

    window.addEventListener('pointerdown', handlePointerDown, true)
    return () => window.removeEventListener('pointerdown', handlePointerDown, true)
  }, [selectedGradientStopId])

  useEffect(() => {
    if (!gradientDragTarget) {
      return
    }

    const host = viewerHostRef.current
    if (!host) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        return
      }

      const normalizedX = clamp01((event.clientX - rect.left) / rect.width)
      const normalizedY = clamp01((event.clientY - rect.top) / rect.height)

      setBackgroundGradient((current) => {
        if (gradientDragTarget.kind === 'line') {
          const nextDeltaX = normalizedX - gradientDragTarget.pointerX
          const nextDeltaY = normalizedY - gradientDragTarget.pointerY
          const clampedDeltaX = clamp(
            nextDeltaX,
            -gradientDragTarget.startX,
            1 - gradientDragTarget.endX,
          )
          const clampedDeltaY = clamp(
            nextDeltaY,
            -gradientDragTarget.startY,
            1 - gradientDragTarget.endY,
          )

          return {
            ...current,
            endX: gradientDragTarget.endX + clampedDeltaX,
            endY: gradientDragTarget.endY + clampedDeltaY,
            startX: gradientDragTarget.startX + clampedDeltaX,
            startY: gradientDragTarget.startY + clampedDeltaY,
          }
        }

        if (gradientDragTarget.kind === 'start') {
          return {
            ...current,
            startX: normalizedX,
            startY: normalizedY,
          }
        }

        if (gradientDragTarget.kind === 'end') {
          return {
            ...current,
            endX: normalizedX,
            endY: normalizedY,
          }
        }

        if (gradientDragTarget.kind !== 'stop') {
          return current
        }

        const stopId = gradientDragTarget.id
        const nextPosition = projectPointOnGradient(current, normalizedX, normalizedY)
        return {
          ...current,
          stops: current.stops.map((stop) =>
            stop.id === stopId
              ? { ...stop, position: nextPosition }
              : stop,
          ),
        }
      })
    }

    const handlePointerUp = () => {
      setGradientDragTarget(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [gradientDragTarget])

  useEffect(() => {
    if (!pendingGradientStopDrag) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      const moveX = event.clientX - pendingGradientStopDrag.startX
      const moveY = event.clientY - pendingGradientStopDrag.startY

      if (Math.abs(moveX) < 4 && Math.abs(moveY) < 4) {
        return
      }

      setGradientDragTarget({ id: pendingGradientStopDrag.id, kind: 'stop' })
      setPendingGradientStopDrag(null)
    }

    const handlePointerUp = () => {
      setPendingGradientStopDrag(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [pendingGradientStopDrag])

  useEffect(() => {
    if (!panelDragTarget) {
      return
    }

    const container = viewerPanelRef.current
    if (!container) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        return
      }

      const maxLeft = Math.max(0, rect.width - panelDragTarget.width)
      const maxTop = Math.max(0, rect.height - panelDragTarget.height)
      const nextLeft = clamp(
        event.clientX - rect.left - panelDragTarget.offsetX,
        0,
        maxLeft,
      )
      const nextTop = clamp(
        event.clientY - rect.top - panelDragTarget.offsetY,
        0,
        maxTop,
      )

      setPanelPositions((current) => ({
        ...current,
        [panelDragTarget.key]: {
          left: nextLeft,
          top: nextTop,
        },
      }))
    }

    const handlePointerUp = () => {
      setPanelDragTarget(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [panelDragTarget])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()

        if (viewportRef.current?.undoLastChange()) {
          updateStatus('undo / viewport')
        }

        return
      }

      const target = event.target as HTMLElement | null
      if (
        event.key.toLowerCase() !== 'z' ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA'
      ) {
        return
      }

      viewportRef.current?.resetView()
      updateStatus('view / reset')
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const loadSource = async (source: ViewerFileSource) => {
    updateStatus(`loading / ${source.name}`)

    try {
      setMotionBlur(DEFAULT_MOTION_SETTINGS)
      const result = await runAsyncViewerTask(() => loadModelFile(source), {
        delayMs: 1000,
      })
      viewportRef.current?.setModel(result.object, result.bounds)
      setWireframeEnabled(false)
      setWireframeShowModel(true)
      setSmoothShadingEnabled(true)
      setMaterialMode('original')

      startTransition(() =>
        setSummary({
          extension: source.extension.toUpperCase(),
          meshCount: result.meshCount,
          triangleCount: result.triangleCount,
          vertexCount: result.vertexCount,
          name: source.name,
        }),
      )
      updateStatus(`loaded / ${source.name}`)
      return true
    } catch (error) {
      updateStatus(
        `error / ${
          error instanceof Error
            ? error.message
            : 'Model yuklenirken beklenmeyen bir hata olustu.'
        }`,
      )
      return false
    }
  }

  const loadSampleModel = async () => {
    updateStatus('loading / sample')

    try {
      const response = await runAsyncViewerTask(() => fetch(SAMPLE_MODEL_ASSET_URL), {
        delayMs: 1000,
      })

      if (!response.ok) {
        throw new Error('Ornek model yuklenemedi.')
      }

      const loaded = await loadSource({
        bytes: await response.arrayBuffer(),
        extension: 'fbx',
        name: SAMPLE_MODEL_FILE_NAME,
      })

      if (!loaded) {
        return
      }

      await setPreset('gold')
      updateStatus('loaded / sample gold')
    } catch (error) {
      updateStatus(
        `error / ${
          error instanceof Error ? error.message : 'Ornek model yuklenemedi.'
        }`,
      )
    }
  }

  const setPreset = async (preset: MaterialPresetKey) => {
    await disableMotionBlurForMaterialChange()
    await runSurfaceViewerTask(() => {
      setSurface((current) => {
        const next = createPresetSurface(preset)
        next.maps = current.maps
        next.uvScaleX = current.uvScaleX
        next.uvScaleY = current.uvScaleY
        next.uvTileLock = current.uvTileLock
        next.uvOffsetX = current.uvOffsetX
        next.uvOffsetY = current.uvOffsetY
        next.uvRotation = current.uvRotation
        return next
      })
      setMaterialMode('custom')
    })
  }

  const setSurfaceValue = async (
    key:
      | 'reflection'
      | 'refraction'
      | 'bump'
      | 'coating'
      | 'opacityCut'
      | 'leafSoftness'
      | 'uvScaleX'
      | 'uvScaleY'
      | 'uvOffsetX'
      | 'uvOffsetY'
      | 'uvRotation',
    nextValue: number,
  ) => {
    if (
      key !== 'uvScaleX' &&
      key !== 'uvScaleY' &&
      key !== 'uvOffsetX' &&
      key !== 'uvOffsetY' &&
      key !== 'uvRotation'
    ) {
      await disableMotionBlurForMaterialChange()
    }

    await runSurfaceViewerTask(() => {
      setMaterialMode('custom')
      setSurface((current) => ({
        ...current,
        ...(key === 'uvScaleX' && current.uvTileLock
          ? { uvScaleX: nextValue, uvScaleY: nextValue }
          : key === 'uvScaleY' && current.uvTileLock
            ? { uvScaleX: nextValue, uvScaleY: nextValue }
            : { [key]: nextValue }),
      }))
    })
  }

  const setColorValue = async (
    key: 'diffuseColor' | 'coatingColor',
    nextValue: string,
  ) => {
    await disableMotionBlurForMaterialChange()
    await runSurfaceViewerTask(() => {
      setMaterialMode('custom')
      setSurface((current) => ({
        ...current,
        [key]: nextValue,
      }))
    })
  }

  const toggleFoliage = async () => {
    await disableMotionBlurForMaterialChange()
    await runSurfaceViewerTask(() => {
      setMaterialMode('custom')
      setSurface((current) => ({
        ...current,
        foliage: !current.foliage,
      }))
    })
  }

  const toggleUvTileLock = async () => {
    await runSurfaceViewerTask(() => {
      setMaterialMode('custom')
      setSurface((current) => ({
        ...current,
        uvTileLock: !current.uvTileLock,
        uvScaleY: !current.uvTileLock ? current.uvScaleX : current.uvScaleY,
      }))
    })
  }

  const updateMap = async (slot: SurfaceMapSlot, texture: LoadedTextureMap | null) => {
    await disableMotionBlurForMaterialChange()
    await runSurfaceViewerTask(() => {
      setMaterialMode('custom')
      setSurface((current) => {
        const next = cloneSurfaceState(current)
        next.maps[slot] = texture
        return next
      })
    })
  }

  const restoreOriginal = async () => {
    await disableMotionBlurForMaterialChange()
    beginViewerBusy(0)
    await waitForPaint()
    viewportRef.current?.restoreOriginalMaterial()
    const nextStats = viewportRef.current?.getModelStats()

    if (nextStats) {
      startTransition(() =>
        setSummary((current) =>
          current
            ? {
                ...current,
                meshCount: nextStats.meshCount,
                triangleCount: nextStats.triangleCount,
                vertexCount: nextStats.vertexCount,
              }
            : current,
        ),
      )
    }

    setMaterialMode('original')
    updateStatus('original / restored')
    requestAnimationFrame(() => finishViewerBusy())
  }

  const setLightType = (type: ViewLightType) => {
    setLight((current) => ({
      ...current,
      ...LIGHT_PRESETS[type],
      type,
    }))
  }

  const setLightValue = (
    key: 'intensity' | 'bloom' | 'turn' | 'lift',
    nextValue: number,
  ) => {
    setLight((current) => ({
      ...current,
      [key]: nextValue,
    }))
  }

  const setMotionValue = (
    key: keyof Pick<
      ViewMotionBlurSettings,
      | 'axisX'
      | 'axisY'
      | 'axisZ'
      | 'distance'
      | 'gaussian'
      | 'intensity'
      | 'strobe'
    >,
    value: number,
  ) => {
    runMotionViewerTask(() => {
      setMotionBlur((current) => ({
        ...current,
        [key]: value,
      }))
    })
  }

  const setMotionMode = async (mode: ViewMotionBlurSettings['mode']) => {
    await runMotionToggleTask(() => {
      setMotionBlur((current) => ({
        ...current,
        axisX:
          Math.abs(current.axisX) < 0.0001 &&
          Math.abs(current.axisY) < 0.0001 &&
          Math.abs(current.axisZ) < 0.0001
            ? 0.1
            : current.axisX,
        enabled: true,
        mode,
      }))
    })
  }

  const toggleWireframe = () => {
    setWireframeEnabled((current) => !current)
  }

  const toggleCellShader = () => {
    setCellShaderEnabled((current) => !current)
  }

  const toggleTurntable = () => {
    setTurntable((current) => ({
      ...current,
      enabled: !current.enabled,
    }))
  }

  const setTurntableMode = (mode: ViewTurntableSettings['mode']) => {
    setTurntable((current) => ({
      ...current,
      enabled: true,
      mode,
    }))
  }

  const setTurntableSpeed = (speed: number) => {
    setTurntable((current) => ({
      ...current,
      speed,
    }))
  }

  const toggleWireframeShowModel = () => {
    setWireframeShowModel((current) => !current)
  }

  const toggleSmoothShading = async () => {
    await runSmoothViewerTask(() => {
      setSmoothShadingEnabled((current) => !current)
    })
  }

  const togglePanelCollapse = (panel: FloatingPanelKey) => {
    setCollapsedPanels((current) => ({
      ...current,
      [panel]: !current[panel],
    }))
  }

  const resetDockLayout = () => {
    setPanelPositions(DEFAULT_DOCK_PANEL_POSITIONS)
    setCollapsedPanels(
      Object.fromEntries(
        Object.keys(DEFAULT_COLLAPSED_PANELS).map((key) => [key, true]),
      ) as Record<FloatingPanelKey, boolean>,
    )
  }

  const getDockPanelStyle = (key: DockPanelKey) => {
    const position = panelPositions[key]
    if (!position) {
      return undefined
    }

    return {
      bottom: 'auto',
      left: position.left,
      right: 'auto',
      top: position.top,
      transform: 'none',
    } as const
  }

  const beginDockPanelDrag = (
    event: React.PointerEvent<HTMLElement>,
    key: DockPanelKey,
  ) => {
    const interactiveTarget = (event.target as HTMLElement | null)?.closest(
      'button, input, select, label',
    )

    if (interactiveTarget) {
      return
    }

    const panelElement = (event.currentTarget as HTMLElement).closest<HTMLElement>(
      '[data-dock-key]',
    )
    const container = viewerPanelRef.current

    if (!panelElement || !container) {
      return
    }

    const panelRect = panelElement.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    event.preventDefault()
    setPanelPositions((current) => ({
      ...current,
      [key]: {
        left: panelRect.left - containerRect.left,
        top: panelRect.top - containerRect.top,
      },
    }))
    setPanelDragTarget({
      height: panelRect.height,
      key,
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top,
      width: panelRect.width,
    })
  }

  const applyRandomBackgroundGradient = () => {
    const nextGradient = createRandomGradientSettings()
    setBackgroundGradient(nextGradient)
    setGradientPanelOpen(true)
    setBackgroundImageEditEnabled(false)
    setSelectedGradientStopId(nextGradient.stops[1]?.id ?? nextGradient.stops[0]?.id ?? null)
  }

  const setGradientStopColor = (id: string, color: string) => {
    setBackgroundGradient((current) => ({
      ...current,
      stops: current.stops.map((stop) =>
        stop.id === id ? { ...stop, color } : stop,
      ),
    }))
  }

  const setGradientStopAlpha = (id: string, alpha: number) => {
    setBackgroundGradient((current) => ({
      ...current,
      stops: current.stops.map((stop) =>
        stop.id === id ? { ...stop, alpha: clamp(alpha, 0, 1) } : stop,
      ),
    }))
  }

  const setGradientStopPosition = (id: string, position: number) => {
    setBackgroundGradient((current) => ({
      ...current,
      stops: current.stops.map((stop) =>
        stop.id === id ? { ...stop, position: clamp01(position) } : stop,
      ),
    }))
  }

  const addGradientStopAtEdge = (edge: 'start' | 'end') => {
    setBackgroundGradient((current) => {
      const sortedStops = [...current.stops].sort(
        (left, right) => left.position - right.position,
      )
      const anchorStop =
        edge === 'start'
          ? sortedStops[0] ?? current.stops[0]
          : sortedStops[sortedStops.length - 1] ?? current.stops[current.stops.length - 1]

      if (!anchorStop) {
        return current
      }

      const position =
        edge === 'start'
          ? clamp01(anchorStop.position * 0.5)
          : clamp01(anchorStop.position + (1 - anchorStop.position) * 0.5)

      const nextStop: ViewBackgroundGradientStop = {
        alpha: anchorStop.alpha,
        color: anchorStop.color,
        id: createGradientStopId(),
        position,
      }

      setSelectedGradientStopId(nextStop.id)
      return {
        ...current,
        stops: [...current.stops, nextStop],
      }
    })
  }

  const removeGradientStop = (id: string) => {
    setBackgroundGradient((current) => {
      if (current.stops.length <= 2) {
        return current
      }

      const nextStops = current.stops.filter((stop) => stop.id !== id)
      const fallbackStop =
        nextStops[Math.min(nextStops.length - 1, 1)] ?? nextStops[0] ?? null
      setSelectedGradientStopId(fallbackStop?.id ?? null)

      return {
        ...current,
        stops: nextStops,
      }
    })
  }

  const toggleMotionBlur = async () => {
    await runMotionToggleTask(() => {
      setMotionBlur((current) => ({
        ...current,
        axisX:
          !current.enabled &&
          Math.abs(current.axisX) < 0.0001 &&
          Math.abs(current.axisY) < 0.0001 &&
          Math.abs(current.axisZ) < 0.0001
            ? 0.1
            : current.axisX,
        enabled: !current.enabled,
      }))
    })
  }

  const gradientLineStart = {
    x: backgroundGradient.startX * viewerBounds.width,
    y: backgroundGradient.startY * viewerBounds.height,
  }
  const gradientLineEnd = {
    x: backgroundGradient.endX * viewerBounds.width,
    y: backgroundGradient.endY * viewerBounds.height,
  }
  const gradientDeltaX = gradientLineEnd.x - gradientLineStart.x
  const gradientDeltaY = gradientLineEnd.y - gradientLineStart.y
  const gradientLength = Math.max(
    1,
    Math.sqrt(gradientDeltaX * gradientDeltaX + gradientDeltaY * gradientDeltaY),
  )
  const gradientAngle =
    (Math.atan2(gradientDeltaY, gradientDeltaX) * 180) / Math.PI
  const gradientCss = buildGradientCss(backgroundGradient)
  const selectedGradientStop =
    selectedGradientStopId === null
      ? null
      : backgroundGradient.stops.find((stop) => stop.id === selectedGradientStopId) ??
        null
  const selectedGradientStopPoint = selectedGradientStop
    ? {
        x: lerp(gradientLineStart.x, gradientLineEnd.x, selectedGradientStop.position),
        y: lerp(gradientLineStart.y, gradientLineEnd.y, selectedGradientStop.position),
      }
    : null
  const resolvedBackgroundImageLayerIndex = backgroundImage.layers.findIndex(
    (layer) => layer.id === backgroundImage.selectedLayerId,
  )
  const selectedBackgroundImageLayerIndex =
    resolvedBackgroundImageLayerIndex >= 0
      ? resolvedBackgroundImageLayerIndex
      : backgroundImage.layers.length - 1
  const selectedBackgroundImageLayer =
    selectedBackgroundImageLayerIndex >= 0
      ? backgroundImage.layers[selectedBackgroundImageLayerIndex]
      : (backgroundImage.layers[backgroundImage.layers.length - 1] ?? null)
  const hasBackgroundImageLayers = backgroundImage.layers.length > 0

  const openDesktopDialog = async () => {
    const picker = window.desktopBridge?.openModelDialog
    if (!picker) {
      fileInputRef.current?.click()
      return
    }

    const selectedFile = await picker()
    if (!selectedFile) {
      return
    }

    await loadSource({
      bytes: selectedFile.bytes,
      extension: selectedFile.extension,
      name: selectedFile.name,
      path: selectedFile.path,
    })
  }

  const loadBackgroundImageFile = (file: File) => {
    const isPng =
      file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')

    if (!isPng) {
      updateStatus('background / png gerekli')
      return
    }

    const sourceUrl = URL.createObjectURL(file)
    const image = new Image()
    const layerId = createBackgroundImageLayerId()

    image.onload = () => {
      backgroundImageUrlsRef.current.add(sourceUrl)
      const nextLayer: BackgroundImageLayer = {
        blur: 0,
        id: layerId,
        image,
        mode: 'cover',
        name: file.name,
        offsetU: 0,
        offsetV: 0,
        scaleU: 1,
        scaleV: 1,
        sourceKey: `${file.name}:${file.size}:${file.lastModified}:${layerId}`,
        sourceUrl,
      }

      setBackgroundImage((current) => ({
        enabled: true,
        layers: [...current.layers, nextLayer],
        selectedLayerId: layerId,
      }))
      setGradientPanelOpen(false)
      setBackgroundImageEditEnabled(true)
      setCollapsedPanels((current) => ({
        ...current,
        background: false,
      }))
      setBackgroundImageScaleLocked(true)
      updateStatus(`background / ${file.name}`)
    }

    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl)
      updateStatus('error / background png yuklenemedi')
    }

    image.src = sourceUrl
  }

  const onBackgroundImageInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (file) {
      loadBackgroundImageFile(file)
    }

    event.target.value = ''
  }

  const clearBackgroundImage = () => {
    setBackgroundImage((current) => {
      const selectedId =
        current.selectedLayerId ?? current.layers[current.layers.length - 1]?.id ?? null
      const targetLayer = current.layers.find((layer) => layer.id === selectedId)
      if (targetLayer?.sourceUrl) {
        URL.revokeObjectURL(targetLayer.sourceUrl)
        backgroundImageUrlsRef.current.delete(targetLayer.sourceUrl)
      }

      const nextLayers = current.layers.filter((layer) => layer.id !== selectedId)
      const nextSelectedLayer =
        nextLayers[Math.min(nextLayers.length - 1, selectedBackgroundImageLayerIndex)] ??
        nextLayers[nextLayers.length - 1] ??
        null

      return {
        enabled: nextLayers.length > 0,
        layers: nextLayers,
        selectedLayerId: nextSelectedLayer?.id ?? null,
      }
    })
    if (backgroundImage.layers.length <= 1) {
      setBackgroundImageEditEnabled(false)
    }
    setBackgroundImageDrag(null)
    updateStatus('background layer / clear')
  }

  const setBackgroundImageScaleLock = (locked: boolean) => {
    setBackgroundImageScaleLocked(locked)
    if (locked) {
      setBackgroundImage((current) => ({
        ...current,
        layers: current.layers.map((layer) =>
          layer.id === (current.selectedLayerId ?? selectedBackgroundImageLayer?.id)
            ? {
                ...layer,
                scaleV: layer.scaleU,
              }
            : layer,
        ),
      }))
    }
  }

  const selectBackgroundImageLayer = (id: string) => {
    setBackgroundImage((current) => ({
      ...current,
      selectedLayerId: id,
    }))
  }

  const reorderBackgroundImageLayer = (sourceId: string, targetId: string) => {
    setBackgroundImage((current) => {
      const currentIndex = current.layers.findIndex((layer) => layer.id === sourceId)
      const nextIndex = current.layers.findIndex((layer) => layer.id === targetId)

      if (currentIndex < 0 || currentIndex === nextIndex) {
        return current
      }

      const nextLayers = [...current.layers]
      const [layer] = nextLayers.splice(currentIndex, 1)
      nextLayers.splice(nextIndex, 0, layer)

      return {
        ...current,
        layers: nextLayers,
        selectedLayerId: sourceId,
      }
    })
  }

  const beginBackgroundImageLayerDrag = (
    event: React.DragEvent<HTMLButtonElement>,
    layerId: string,
  ) => {
    event.stopPropagation()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', layerId)
    setBackgroundImageLayerDragId(layerId)
    selectBackgroundImageLayer(layerId)
  }

  const dragBackgroundImageLayerOver = (
    event: React.DragEvent<HTMLButtonElement>,
    targetLayerId: string,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'

    const sourceLayerId =
      backgroundImageLayerDragId || event.dataTransfer.getData('text/plain')

    if (sourceLayerId && sourceLayerId !== targetLayerId) {
      reorderBackgroundImageLayer(sourceLayerId, targetLayerId)
    }
  }

  const dropBackgroundImageLayer = (
    event: React.DragEvent<HTMLButtonElement>,
    targetLayerId: string,
  ) => {
    event.preventDefault()
    event.stopPropagation()

    const sourceLayerId =
      backgroundImageLayerDragId || event.dataTransfer.getData('text/plain')

    if (sourceLayerId && sourceLayerId !== targetLayerId) {
      reorderBackgroundImageLayer(sourceLayerId, targetLayerId)
    }

    setBackgroundImageLayerDragId(null)
  }

  const setBackgroundImageMode = (mode: ViewBackgroundImageMode) => {
    setBackgroundImage((current) => ({
      ...current,
      layers: current.layers.map((layer) =>
        layer.id === (current.selectedLayerId ?? selectedBackgroundImageLayer?.id)
          ? {
              ...layer,
              mode,
            }
          : layer,
      ),
    }))
  }

  const setBackgroundImageValue = (
    key: BackgroundImageSliderKey,
    value: number,
  ) => {
    setBackgroundImage((current) => ({
      ...current,
      layers: current.layers.map((layer) => {
        if (layer.id !== (current.selectedLayerId ?? selectedBackgroundImageLayer?.id)) {
          return layer
        }

        return {
          ...layer,
          ...(backgroundImageScaleLocked && (key === 'scaleU' || key === 'scaleV')
            ? {
                scaleU: value,
                scaleV: value,
              }
            : {
                [key]: value,
              }),
        }
      }),
    }))
  }

  const beginBackgroundImageDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      !hasBackgroundImageLayers ||
      !backgroundImageEditEnabled ||
      !selectedBackgroundImageLayer
    ) {
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setBackgroundImageDrag({
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      startOffsetU: selectedBackgroundImageLayer.offsetU,
      startOffsetV: selectedBackgroundImageLayer.offsetV,
    })
  }

  const moveBackgroundImageDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!backgroundImageDrag || event.pointerId !== backgroundImageDrag.pointerId) {
      return
    }

    event.preventDefault()
    const width = Math.max(1, viewerBounds.width)
    const height = Math.max(1, viewerBounds.height)
    const deltaX = (event.clientX - backgroundImageDrag.pointerX) / width
    const deltaY = (event.clientY - backgroundImageDrag.pointerY) / height

    setBackgroundImage((current) => ({
      ...current,
      layers: current.layers.map((layer) =>
        layer.id === (current.selectedLayerId ?? selectedBackgroundImageLayer?.id)
          ? {
              ...layer,
              offsetU: clamp(backgroundImageDrag.startOffsetU + deltaX, -2, 2),
              offsetV: clamp(backgroundImageDrag.startOffsetV + deltaY, -2, 2),
            }
          : layer,
      ),
    }))
  }

  const endBackgroundImageDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!backgroundImageDrag || event.pointerId !== backgroundImageDrag.pointerId) {
      return
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    setBackgroundImageDrag(null)
  }

  const runModelExport = async (bakeOptions?: BakeExportOptions) => {
    if (!viewportRef.current) {
      return false
    }

    try {
      const baseName = summary?.name.replace(/\.[^.]+$/, '') ?? 'ngon-junk-model'
      const format = modelExportFormat
      const bridge = window.desktopBridge
      let cachedBakeMaps: GeneratedBakeMaps | null = null
      const getBakeMaps = (options: BakeExportOptions) => {
        if (!cachedBakeMaps) {
          cachedBakeMaps = buildBakeMaps(options)
        }

        return cachedBakeMaps
      }
      const resolvePrimaryBakeMap = (
        bakeMaps: GeneratedBakeMaps,
        options: BakeExportOptions,
      ) => {
        if (options.bakeCombined && bakeMaps.combined) {
          return {
            canvas: bakeMaps.combined,
            fileName: `${baseName}-combined.png`,
          }
        }

        if (options.bakeDiffuseLike && bakeMaps.base) {
          return {
            canvas: bakeMaps.base,
            fileName: `${baseName}-base.png`,
          }
        }

        return {
          canvas: null,
          fileName: null,
        }
      }
      const useBakeFlow =
        (format === 'glb' || format === 'obj') &&
        materialMode === 'custom' &&
        !!bakeOptions
      const shouldZipExport =
        !!bakeOptions &&
        useBakeFlow &&
        (format === 'obj' || bakeOptions.deliveryMode === 'separate')
      const picked =
        bridge
          ? await bridge.pickExportPath({
              defaultName: shouldZipExport
                ? `${baseName}-bake.zip`
                : `${baseName}.${format}`,
              filters: shouldZipExport
                ? [{ name: 'ZIP Archive', extensions: ['zip'] }]
                : MODEL_EXPORT_FILTERS.filter((item) =>
                    item.extensions.includes(format),
                  ),
              title: 'model export format',
            })
          : null

      if (bridge && !picked) {
        updateStatus('export / canceled')
        return false
      }

      if (bakeOptions && useBakeFlow) {
        const selectedBakeModes = [
          bakeOptions.bakeCombined ? 'combined' : null,
          bakeOptions.bakeDiffuseLike ? 'base' : null,
          bakeOptions.bakeReflectionIntoMaps ? 'reflection' : null,
        ].filter(Boolean)

        updateStatus(
          selectedBakeModes.length > 0
            ? `exporting / ${format} / ${
                shouldZipExport ? 'zip' : 'embedded'
              } / bake: ${selectedBakeModes.join(', ')}`
            : `exporting / ${format} / ${shouldZipExport ? 'zip' : 'embedded'}`,
        )
      } else {
        updateStatus(`exporting / ${format}`)
      }

      if (format === 'obj') {
        if (useBakeFlow && bakeOptions) {
          const bakeMaps = getBakeMaps(bakeOptions)
          const primaryBakeMap = resolvePrimaryBakeMap(bakeMaps, bakeOptions)
          const objPackage = viewportRef.current.exportObjPackage({
            bakedMapCanvas: primaryBakeMap.canvas,
            bakedTextureFileName: primaryBakeMap.fileName,
            materialName: 'ngon_bake_material',
            mtlFileName: `${baseName}.mtl`,
          })

          const zipEntries: Array<{ bytes: Uint8Array; fileName: string }> = [
            {
              bytes: new TextEncoder().encode(objPackage.objText),
              fileName: `${baseName}.obj`,
            },
          ]

          if (objPackage.mtlText) {
            zipEntries.push({
              bytes: new TextEncoder().encode(objPackage.mtlText),
              fileName: `${baseName}.mtl`,
            })
          }

          if (primaryBakeMap.canvas && primaryBakeMap.fileName) {
            zipEntries.push({
              bytes: await canvasToPngBytes(primaryBakeMap.canvas),
              fileName: primaryBakeMap.fileName,
            })
          }

          if (
            bakeOptions.deliveryMode === 'separate' &&
            bakeOptions.bakeCombined &&
            bakeMaps.combined &&
            primaryBakeMap.fileName !== `${baseName}-combined.png`
          ) {
            zipEntries.push({
              bytes: await canvasToPngBytes(bakeMaps.combined),
              fileName: `${baseName}-combined.png`,
            })
          }

          if (
            bakeOptions.deliveryMode === 'separate' &&
            bakeOptions.bakeDiffuseLike &&
            bakeMaps.base &&
            primaryBakeMap.fileName !== `${baseName}-base.png`
          ) {
            zipEntries.push({
              bytes: await canvasToPngBytes(bakeMaps.base),
              fileName: `${baseName}-base.png`,
            })
          }

          const zipBytes = createStoredZip(zipEntries)
          if (picked && bridge?.writeExportBinary) {
            await bridge.writeExportBinary(picked.filePath, zipBytes)
            updateStatus(`saved / ${baseName}-bake.zip`)
            return true
          }

          downloadBlob(new Blob([zipBytes], { type: 'application/zip' }), `${baseName}-bake.zip`)
          updateStatus(`saved / ${baseName}-bake.zip`)
          return true
        }

        const text = viewportRef.current.exportObjText()
        if (picked && bridge?.writeExportText) {
          await bridge.writeExportText(picked.filePath, text)
          updateStatus(`saved / ${baseName}.obj`)
          return true
        }

        downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${baseName}.obj`)
        updateStatus(`saved / ${baseName}.obj`)
        return true
      }

      if (useBakeFlow && bakeOptions?.deliveryMode === 'separate') {
        const bakeMaps = getBakeMaps(bakeOptions)
          const glbBytes = new Uint8Array(await viewportRef.current.exportBinaryGlb())
          const zipEntries: Array<{ bytes: Uint8Array; fileName: string }> = [
            {
              bytes: glbBytes,
              fileName: `${baseName}.glb`,
            },
          ]

          if (bakeMaps.combined && bakeOptions.bakeCombined) {
            zipEntries.push({
              bytes: await canvasToPngBytes(bakeMaps.combined),
              fileName: `${baseName}-combined.png`,
            })
          }

          if (bakeMaps.base && bakeOptions.bakeDiffuseLike) {
            zipEntries.push({
              bytes: await canvasToPngBytes(bakeMaps.base),
              fileName: `${baseName}-base.png`,
            })
          }

          const zipBytes = createStoredZip(zipEntries)
          if (picked && bridge?.writeExportBinary) {
            await bridge.writeExportBinary(picked.filePath, zipBytes)
            updateStatus(`saved / ${baseName}-bake.zip`)
            return true
          }

          downloadBlob(new Blob([zipBytes], { type: 'application/zip' }), `${baseName}-bake.zip`)
          updateStatus(`saved / ${baseName}-bake.zip`)
          return true
        }

      const embeddedBakeCanvas =
        useBakeFlow && bakeOptions
          ? bakeOptions.bakeCombined
            ? getBakeMaps(bakeOptions).combined
            : bakeOptions.bakeDiffuseLike
              ? getBakeMaps(bakeOptions).base
              : null
          : null

      const bytes = await viewportRef.current.exportBinaryGlb({
        bakedMapCanvas: embeddedBakeCanvas,
      })
      if (picked && bridge?.writeExportBinary) {
        await bridge.writeExportBinary(picked.filePath, bytes)
        updateStatus(`saved / ${baseName}.glb`)
        return true
      }

      downloadBlob(new Blob([bytes], { type: 'model/gltf-binary' }), `${baseName}.glb`)
      updateStatus(`saved / ${baseName}.glb`)
      return true
    } catch (error) {
      updateStatus(
        `error / ${error instanceof Error ? error.message : 'export basarisiz'}`,
      )
      return false
    }
    }

  const exportModel = async () => {
    if (
      (modelExportFormat === 'glb' || modelExportFormat === 'obj') &&
      materialMode === 'custom'
    ) {
      setShowBakeExportDialog(true)
      return false
    }

    return runModelExport()
  }

  const toggleBakeExportOption = (key: keyof BakeExportOptions) => {
    setBakeExportOptions((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const setBakeDeliveryMode = (deliveryMode: BakeDeliveryMode) => {
    setBakeExportOptions((current) => ({
      ...current,
      deliveryMode,
    }))
  }

  const buildBakeMaps = (options: BakeExportOptions): GeneratedBakeMaps =>
    generateBakeMaps(surfaceRef.current, {
      includeCombined: options.bakeCombined,
      includeDiffuseLike: options.bakeDiffuseLike,
      includeReflection: options.bakeReflectionIntoMaps,
      size: 1024,
    })

  const confirmBakeExport = async () => {
    setShowBakeExportDialog(false)
    await runModelExport(bakeExportOptions)
  }

  const exportPreviewImage = async (options: ImageExportOptions = imageExportOptions) => {
    if (!viewportRef.current) {
      return false
    }

    try {
      const baseName = summary?.name.replace(/\.[^.]+$/, '') ?? 'ngon-junk-preview'
      const format = imageExportFormat
      const bridge = window.desktopBridge
      const picked =
        bridge
          ? await bridge.pickExportPath({
              defaultName: `${baseName}-preview.${format}`,
              filters: IMAGE_EXPORT_FILTERS.filter((item) =>
                item.extensions.includes(format),
              ),
              title: 'image export format',
            })
          : null

      if (bridge && !picked) {
        updateStatus('export / canceled')
        return false
      }

      const targetLongEdge = Math.min(
        Math.max(
          1,
          Math.round(options.longEdge * (options.scale ?? 1) * (options.dpi / 72)),
        ),
        MAX_IMAGE_EXPORT_LONG_EDGE,
      )
      const targetWidth =
        previewAspect >= 1
          ? targetLongEdge
          : Math.max(1, Math.round(targetLongEdge * previewAspect))
      const targetHeight =
        previewAspect >= 1
          ? Math.max(1, Math.round(targetLongEdge / previewAspect))
          : targetLongEdge

      updateStatus(`exporting / ${format}`)
      const bytes = await runAsyncViewerTask(
        () =>
          viewportRef.current!.exportPreviewImage({
            dpi: options.dpi,
            format,
            height: targetHeight,
            width: targetWidth,
          }),
        { delayMs: 200 },
      )
      if (picked && bridge?.writeExportBinary) {
        await bridge.writeExportBinary(picked.filePath, bytes)
        updateStatus(`saved / ${baseName}-preview.${format}`)
        return true
      }

      downloadBlob(
        new Blob([bytes], { type: format === 'jpg' ? 'image/jpeg' : 'image/png' }),
        `${baseName}-preview.${format}`,
      )
      updateStatus(`saved / ${baseName}-preview.${format}`)
      return true
    } catch (error) {
      updateStatus(
        `error / ${
          error instanceof Error ? error.message : 'image export basarisiz'
        }`,
      )
      return false
    }
  }

  const confirmImageExport = async () => {
    setShowImageExportDialog(false)
    await exportPreviewImage(imageExportOptions)
  }

  const exportTurntableCapture = async (
    exportType: TurntableCaptureExportType,
  ) => {
    if (!viewportRef.current) {
      return false
    }

    try {
      const baseName = summary?.name.replace(/\.[^.]+$/, '') ?? 'ngon-junk-turntable'
      const bridge = window.desktopBridge
      const extension = exportType === 'gif' ? 'gif' : 'zip'
      const picked =
        bridge
          ? await bridge.pickExportPath({
              defaultName: `${baseName}-turntable.${extension}`,
              filters: [...CAPTURE_EXPORT_FILTERS[exportType]],
              title:
                exportType === 'gif'
                  ? 'turntable gif export'
                  : 'turntable frames export',
            })
          : null

      if (bridge && !picked) {
        updateStatus('export / canceled')
        return false
      }

      const captureConfig: ViewTurntableCaptureOptions = {
        frameCount: Math.max(1, Math.round(turntableCaptureOptions.frameCount)),
        height: Math.max(1, Math.round(viewerBounds.height || exportPreviewHeight)),
        transparentBackground: false,
        travelSeconds: Math.max(0.1, turntableCaptureOptions.durationSeconds),
        width: Math.max(1, Math.round(viewerBounds.width || exportPreviewWidth)),
      }

      updateStatus(
        exportType === 'gif' ? 'exporting / turntable / gif' : 'exporting / turntable / frames',
      )

      const frames = await runAsyncViewerTask(
        () => viewportRef.current!.captureTurntableFrames(captureConfig),
        { delayMs: 0 },
      )

      if (exportType === 'frames') {
        const digits = Math.max(3, String(frames.length).length)
        const zipEntries: Array<{ bytes: Uint8Array; fileName: string }> = []
        for (let index = 0; index < frames.length; index += 1) {
          zipEntries.push({
            bytes: await canvasToPngBytes(frames[index]),
            fileName: `${baseName}-frame-${String(index + 1).padStart(digits, '0')}.png`,
          })
        }
        const zipBytes = createStoredZip(zipEntries)

        if (picked && bridge?.writeExportBinary) {
          await bridge.writeExportBinary(picked.filePath, zipBytes)
          updateStatus(`saved / ${baseName}-turntable.zip`)
          return true
        }

        downloadBlob(
          new Blob([zipBytes], { type: 'application/zip' }),
          `${baseName}-turntable.zip`,
        )
        updateStatus(`saved / ${baseName}-turntable.zip`)
        return true
      }

      const { GIFEncoder, applyPalette, quantize } = await import('gifenc')
      const gif = GIFEncoder()
      const gifDelay = Math.max(
        1,
        Math.round(
          (turntableCaptureOptions.delayMs > 0
            ? turntableCaptureOptions.delayMs
            : 1000 / Math.max(1, turntableCaptureOptions.fps)) / 10,
        ),
      )

      for (const frame of frames) {
        const context = frame.getContext('2d', { willReadFrequently: true })
        if (!context) {
          throw new Error('GIF frame okunamadi.')
        }

        const rgba = new Uint8Array(
          context.getImageData(0, 0, frame.width, frame.height).data,
        )
        const palette = quantize(rgba, 256)
        const indexed = applyPalette(rgba, palette)
        gif.writeFrame(indexed, frame.width, frame.height, {
          delay: gifDelay,
          palette,
        })
      }

      gif.finish()
      const gifBytes = gif.bytes().slice()

      if (picked && bridge?.writeExportBinary) {
        await bridge.writeExportBinary(picked.filePath, gifBytes.buffer)
        updateStatus(`saved / ${baseName}-turntable.gif`)
        return true
      }

      downloadBlob(
        new Blob([gifBytes], { type: 'image/gif' }),
        `${baseName}-turntable.gif`,
      )
      updateStatus(`saved / ${baseName}-turntable.gif`)
      return true
    } catch (error) {
      updateStatus(
        `error / ${
          error instanceof Error ? error.message : 'turntable export basarisiz'
        }`,
      )
      return false
    }
  }

  const toggleCloseExportSelection = (key: keyof CloseExportSelection) => {
    setCloseExportSelection((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const requestCloseWindow = async () => {
    closeExportDialogRef.current = false
    setShowCloseExportDialog(false)
    setIsCloseExporting(false)
    await window.desktopBridge?.closeWindow()
  }

  const cancelCloseWindow = () => {
    closeExportDialogRef.current = false
    setShowCloseExportDialog(false)
    setIsCloseExporting(false)
    updateStatus('close / canceled')
  }

  const exportSelectedAndClose = async () => {
    if (!summary) {
      await requestCloseWindow()
      return
    }

    const exportTasks: Array<() => Promise<boolean>> = []

    if (closeExportSelection.model) {
      exportTasks.push(() =>
        runModelExport(materialMode === 'custom' ? bakeExportOptions : undefined),
      )
    }

    if (closeExportSelection.image) {
      exportTasks.push(() => exportPreviewImage(imageExportOptions))
    }

    if (closeExportSelection.turntableFrames) {
      exportTasks.push(() => exportTurntableCapture('frames'))
    }

    if (closeExportSelection.turntableGif) {
      exportTasks.push(() => exportTurntableCapture('gif'))
    }

    if (exportTasks.length === 0) {
      await requestCloseWindow()
      return
    }

    setIsCloseExporting(true)

    for (const runExportTask of exportTasks) {
      const exported = await runExportTask()
      if (!exported) {
        setIsCloseExporting(false)
        updateStatus('close / export stopped')
        return
      }
    }

    await requestCloseWindow()
  }

  useEffect(() => {
    summaryRef.current = summary
  }, [summary])

  useEffect(() => {
    closeExportDialogRef.current = showCloseExportDialog
  }, [showCloseExportDialog])

  useEffect(() => {
    const unsubscribe = window.desktopBridge?.onCloseRequest?.(() => {
      const activeSummary = summaryRef.current

      if (closeExportDialogRef.current) {
        return
      }

      setShowImageExportDialog(false)
      setShowBakeExportDialog(false)
      setShowTurntableCaptureDialog(false)
      setCloseExportSelection({
        ...DEFAULT_CLOSE_EXPORT_SELECTION,
        model: Boolean(activeSummary),
      })
      setIsCloseExporting(false)
      closeExportDialogRef.current = true
      setShowCloseExportDialog(true)
      updateStatus('close / save?')
    })

    return unsubscribe
  }, [])

  const onFallbackInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    await loadSource({
      bytes: await file.arrayBuffer(),
      extension,
      name: file.name,
    })

    event.target.value = ''
  }

  const onTextureInputChange =
    (slot: SurfaceMapSlot) =>
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) {
        return
      }

      try {
        updateStatus(`map / ${slot} / ${file.name}`)
        const texture = await runAsyncViewerTask(() => loadTextureMapFromFile(file, slot), {
          delayMs: 1000,
        })
        await updateMap(slot, texture)
        updateStatus(`map ok / ${slot}`)
      } catch (error) {
        updateStatus(
          `error / ${
            error instanceof Error ? error.message : 'image yuklenemedi'
          }`,
        )
      }

      event.target.value = ''
    }

  const onDrop = async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    setIsDragging(false)

    const file = event.dataTransfer.files?.[0]
    if (!file) {
      return
    }

    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    await loadSource({
      bytes: await file.arrayBuffer(),
      extension,
      name: file.name,
    })
  }

  return (
    <>
      {showCloseExportDialog ? (
        <div className="modal-backdrop">
          <section className="modal-card modal-card-wide close-export-modal">
            <div className="modal-title">kapatirken kaydedilsin mi?</div>
            <div className="modal-copy modal-copy-tight">
              <span>{summary ? summary.name : 'aktif model yok'}</span>
            </div>
            <div className="close-export-panel">
              <div className="modal-subtitle">model</div>
              <div className="close-export-row">
                <label className="modal-option">
                  <input
                    checked={closeExportSelection.model}
                    disabled={!summary || isCloseExporting}
                    onChange={() => toggleCloseExportSelection('model')}
                    type="checkbox"
                  />
                  <span>model export</span>
                </label>
                <div className="modal-chip-row">
                  {MODEL_EXPORT_OPTIONS.map((item) => (
                    <button
                      key={item.key}
                      className={`chip ${
                        modelExportFormat === item.key ? 'chip-active' : ''
                      }`}
                      disabled={isCloseExporting}
                      onClick={() => setModelExportFormat(item.key)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              {materialMode === 'custom' && closeExportSelection.model ? (
                <div className="close-export-bake">
                  <div className="modal-chip-row">
                    <button
                      className={`chip ${
                        bakeExportOptions.deliveryMode === 'embedded'
                          ? 'chip-active'
                          : ''
                      }`}
                      disabled={isCloseExporting}
                      onClick={() => setBakeDeliveryMode('embedded')}
                      type="button"
                    >
                      embedded
                    </button>
                    <button
                      className={`chip ${
                        bakeExportOptions.deliveryMode === 'separate'
                          ? 'chip-active'
                          : ''
                      }`}
                      disabled={isCloseExporting}
                      onClick={() => setBakeDeliveryMode('separate')}
                      type="button"
                    >
                      separate zip
                    </button>
                  </div>
                  <div className="modal-options">
                    <label className="modal-option">
                      <input
                        checked={bakeExportOptions.bakeCombined}
                        disabled={isCloseExporting}
                        onChange={() => toggleBakeExportOption('bakeCombined')}
                        type="checkbox"
                      />
                      <span>combined map</span>
                    </label>
                    <label className="modal-option">
                      <input
                        checked={bakeExportOptions.bakeDiffuseLike}
                        disabled={isCloseExporting}
                        onChange={() => toggleBakeExportOption('bakeDiffuseLike')}
                        type="checkbox"
                      />
                      <span>base map</span>
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="close-export-panel">
              <div className="modal-subtitle">image</div>
              <div className="close-export-row">
                <label className="modal-option">
                  <input
                    checked={closeExportSelection.image}
                    disabled={!summary || isCloseExporting}
                    onChange={() => toggleCloseExportSelection('image')}
                    type="checkbox"
                  />
                  <span>preview export</span>
                </label>
                <div className="modal-chip-row">
                  {IMAGE_EXPORT_OPTIONS.map((item) => (
                    <button
                      key={item.key}
                      className={`chip ${
                        imageExportFormat === item.key ? 'chip-active' : ''
                      }`}
                      disabled={isCloseExporting}
                      onClick={() => setImageExportFormat(item.key)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="close-export-panel">
              <div className="modal-subtitle">turntable</div>
              <div className="modal-options modal-options-inline">
                <label className="modal-option">
                  <input
                    checked={closeExportSelection.turntableFrames}
                    disabled={!summary || isCloseExporting}
                    onChange={() => toggleCloseExportSelection('turntableFrames')}
                    type="checkbox"
                  />
                  <span>frames zip</span>
                </label>
                <label className="modal-option">
                  <input
                    checked={closeExportSelection.turntableGif}
                    disabled={!summary || isCloseExporting}
                    onChange={() => toggleCloseExportSelection('turntableGif')}
                    type="checkbox"
                  />
                  <span>gif</span>
                </label>
              </div>
            </div>
            <div className="modal-actions close-export-actions">
              <button
                className="chip"
                disabled={isCloseExporting}
                onClick={cancelCloseWindow}
                type="button"
              >
                vazgec
              </button>
              <button
                className="chip"
                disabled={isCloseExporting}
                onClick={() => void requestCloseWindow()}
                type="button"
              >
                hayir, kapat
              </button>
              <button
                className="ui-button modal-confirm"
                disabled={isCloseExporting}
                onClick={() => void exportSelectedAndClose()}
                type="button"
              >
                {isCloseExporting ? 'exporting' : 'export et ve kapat'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {showImageExportDialog ? (
        <div className="modal-backdrop">
          <section className="modal-card">
            <div className="modal-title">image export</div>
            <div className="modal-field-row">
              <label className="modal-field">
                <span>uzun kenar</span>
                <input
                  className="value-input modal-number-input"
                  max={4096}
                  min={1}
                  onChange={(event) =>
                    setImageExportOptions((current) => ({
                      ...current,
                      longEdge: Math.max(1, Number(event.target.value) || 1),
                    }))
                  }
                  type="number"
                  value={imageExportOptions.longEdge}
                />
              </label>
              <div className="modal-field">
                <span>cozunurluk</span>
                <div className="modal-chip-row">
                  {[2, 4].map((value) => (
                    <button
                      key={value}
                      className={`chip ${imageExportOptions.scale === value ? 'chip-active' : ''}`}
                      onClick={() =>
                        setImageExportOptions((current) => ({
                          ...current,
                          scale:
                            current.scale === value
                              ? null
                              : (value as ImageExportScale),
                        }))
                      }
                      type="button"
                    >
                      {value}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-subtitle">dpi</div>
            <div className="modal-chip-row">
              {[72, 150, 300].map((value) => (
                <button
                  key={value}
                  className={`chip ${imageExportOptions.dpi === value ? 'chip-active' : ''}`}
                  onClick={() =>
                    setImageExportOptions((current) => ({
                      ...current,
                      dpi: value as ImageExportDpi,
                    }))
                  }
                  type="button"
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="modal-copy modal-copy-tight">
              <span>
                final: {exportPreviewWidth} x {exportPreviewHeight}
              </span>
            </div>
            <div className="modal-actions">
              <button
                className="chip"
                onClick={() => setShowImageExportDialog(false)}
                type="button"
              >
                vazgec
              </button>
              <button className="ui-button modal-confirm" onClick={confirmImageExport} type="button">
                devam
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {showBakeExportDialog ? (
        <div className="modal-backdrop">
          <section className="modal-card">
            <div className="modal-title">bake secenekleri</div>
              <div className="modal-subtitle">cikis sekli</div>
              <div className="modal-chip-row">
                <button
                  className={`chip ${
                    bakeExportOptions.deliveryMode === 'embedded' ? 'chip-active' : ''
                  }`}
                  onClick={() => setBakeDeliveryMode('embedded')}
                  type="button"
                >
                  tek modelde bake et
                </button>
                <button
                  className={`chip ${
                    bakeExportOptions.deliveryMode === 'separate' ? 'chip-active' : ''
                  }`}
                  onClick={() => setBakeDeliveryMode('separate')}
                  type="button"
                >
                  kanallari ayri ver
                </button>
              </div>
              <div className="modal-subtitle">hangi mapler hazirlansin</div>
              <div className="modal-options">
                <label className="modal-option">
                <input
                  checked={bakeExportOptions.bakeCombined}
                  onChange={() => toggleBakeExportOption('bakeCombined')}
                  type="checkbox"
                />
                <span>combined map</span>
              </label>
              <label className="modal-option">
                <input
                  checked={bakeExportOptions.bakeDiffuseLike}
                  onChange={() => toggleBakeExportOption('bakeDiffuseLike')}
                  type="checkbox"
                />
                <span>base map</span>
              </label>
              <label className="modal-option">
                <input
                  checked={bakeExportOptions.bakeReflectionIntoMaps}
                  onChange={() => toggleBakeExportOption('bakeReflectionIntoMaps')}
                  type="checkbox"
                />
                <span>yansimayi maplere gom</span>
              </label>
            </div>
            <div className="modal-actions">
              <button
                className="chip"
                onClick={() => setShowBakeExportDialog(false)}
                type="button"
              >
                vazgec
              </button>
              <button className="ui-button modal-confirm" onClick={confirmBakeExport} type="button">
                devam
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {showTurntableCaptureDialog ? (
        <div className="modal-backdrop">
          <section className="modal-card">
            <div className="modal-title">turntable capture</div>
            <div className="modal-field-row">
              <label className="modal-field">
                <span>frame</span>
                <input
                  className="value-input modal-number-input"
                  min={1}
                  onChange={(event) =>
                    setTurntableCaptureOptions((current) => ({
                      ...current,
                      frameCount: Math.max(1, Number(event.target.value) || 1),
                    }))
                  }
                  type="number"
                  value={turntableCaptureOptions.frameCount}
                />
              </label>
              <label className="modal-field">
                <span>sure</span>
                <input
                  className="value-input modal-number-input"
                  min={0.1}
                  onChange={(event) =>
                    setTurntableCaptureOptions((current) => ({
                      ...current,
                      durationSeconds: Math.max(0.1, Number(event.target.value) || 0.1),
                    }))
                  }
                  step={0.1}
                  type="number"
                  value={turntableCaptureOptions.durationSeconds}
                />
              </label>
            </div>
            <div className="modal-field-row">
              <label className="modal-field">
                <span>delay ms</span>
                <input
                  className="value-input modal-number-input"
                  min={0}
                  onChange={(event) =>
                    setTurntableCaptureOptions((current) => ({
                      ...current,
                      delayMs: Math.max(0, Number(event.target.value) || 0),
                    }))
                  }
                  type="number"
                  value={turntableCaptureOptions.delayMs}
                />
              </label>
              <label className="modal-field">
                <span>fps</span>
                <input
                  className="value-input modal-number-input"
                  min={1}
                  onChange={(event) =>
                    setTurntableCaptureOptions((current) => ({
                      ...current,
                      fps: Math.max(1, Number(event.target.value) || 1),
                    }))
                  }
                  type="number"
                  value={turntableCaptureOptions.fps}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                className="chip"
                onClick={() => setShowTurntableCaptureDialog(false)}
                type="button"
              >
                vazgec
              </button>
              <button
                className="chip"
                onClick={() => {
                  setShowTurntableCaptureDialog(false)
                  void exportTurntableCapture('frames')
                }}
                type="button"
              >
                export frames to zip
              </button>
              <button
                className="ui-button modal-confirm"
                onClick={() => {
                  setShowTurntableCaptureDialog(false)
                  void exportTurntableCapture('gif')
                }}
                type="button"
              >
                export gif
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <main className="app-shell">
      <aside className="sidebar">
        <header className="topline">
          <div className="brand">ngon-junk</div>
          <div className="status-line">{status}</div>
        </header>

        <div className="toolbar toolbar-grid">
          <button className="ui-button" onClick={openDesktopDialog} type="button">
            load
          </button>
          <button
            className="chip chip-active toolbar-sample-button"
            onClick={() => {
              void loadSampleModel()
            }}
            type="button"
          >
            load sample
          </button>
          <div className="toggle-row toolbar-toggle">
            <span>smooth</span>
            <button
              className={`chip ${smoothShadingEnabled ? 'chip-active' : ''}`}
              onClick={toggleSmoothShading}
              type="button"
            >
              {smoothShadingEnabled ? 'on' : 'off'}
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          accept={FILE_INPUT_ACCEPT}
          className="visually-hidden"
          onChange={onFallbackInputChange}
          type="file"
        />
        <input
          ref={backgroundImageInputRef}
          accept={BACKGROUND_IMAGE_ACCEPT}
          className="visually-hidden"
          onChange={onBackgroundImageInputChange}
          type="file"
        />

        <section className="panel">
          <div className="panel-label">material</div>
          <div className="preset-grid">
            <button
              className={`chip ${materialMode === 'original' ? 'chip-active' : ''}`}
              onClick={() => {
                void restoreOriginal()
              }}
              type="button"
            >
              original
            </button>
            {MATERIAL_PRESET_ORDER.map((preset) => (
              <button
                key={preset}
                className={`chip ${
                  materialMode === 'custom' && surface.preset === preset ? 'chip-active' : ''
                }`}
                onClick={() => {
                  void setPreset(preset)
                }}
                type="button"
              >
                {getPresetLabel(preset)}
              </button>
            ))}
          </div>
          <div className="toggle-row">
            <span>cell shader</span>
            <button
              className={`chip ${cellShaderEnabled ? 'chip-active' : ''}`}
              onClick={toggleCellShader}
              type="button"
            >
              {cellShaderEnabled ? 'on' : 'off'}
            </button>
          </div>
        </section>

        <section className="panel color-panel">
          <label className="color-row">
            <span>diffuse</span>
            <input
              className="color-input"
              onChange={(event) => {
                void setColorValue('diffuseColor', event.target.value)
              }}
              type="color"
              value={surface.diffuseColor}
            />
          </label>
          <label className="color-row">
            <span>coating</span>
            <input
              className="color-input"
              onChange={(event) => {
                void setColorValue('coatingColor', event.target.value)
              }}
              type="color"
              value={surface.coatingColor}
            />
          </label>
        </section>

        <section className="panel slider-panel">
          {SLIDER_DEFS.map((item) => (
            <SliderField
              decimals={2}
              defaultValue={presetDefaults[item.key]}
              key={item.key}
              label={item.label}
              max={1}
              min={0}
              onChange={(value) => {
                void setSurfaceValue(item.key, value)
              }}
              step={0.01}
              value={surface[item.key]}
            />
          ))}
        </section>

        <section className="panel slider-panel">
          <div className="toggle-row">
            <span>foliage</span>
            <button
              className={`chip ${surface.foliage ? 'chip-active' : ''}`}
              onClick={() => {
                void toggleFoliage()
              }}
              type="button"
            >
              {surface.foliage ? 'on' : 'off'}
            </button>
          </div>
          {FOLIAGE_SLIDERS.map((item) => (
            <SliderField
              decimals={2}
              defaultValue={presetDefaults[item.key]}
              key={item.key}
              label={item.label}
              max={1}
              min={0}
              onChange={(value) => {
                void setSurfaceValue(item.key, value)
              }}
              step={0.01}
              value={surface[item.key]}
            />
          ))}
        </section>

        <section className="panel map-panel">
          {SURFACE_MAP_ORDER.map((slot) => (
            <div className="map-row" key={slot}>
              <span className="map-slot">{MAP_LABELS[slot]}</span>
              <span className="map-name">{surface.maps[slot]?.name ?? 'none'}</span>
              <button
                className="chip"
                onClick={() => imageInputRefs.current[slot]?.click()}
                type="button"
              >
                load
              </button>
              <button
                className="chip chip-light"
                onClick={() => {
                  void updateMap(slot, null)
                }}
                type="button"
              >
                clear
              </button>
              <input
                accept={IMAGE_INPUT_ACCEPT}
                className="visually-hidden"
                onChange={onTextureInputChange(slot)}
                ref={(node) => {
                  imageInputRefs.current[slot] = node
                }}
                type="file"
              />
            </div>
          ))}
        </section>

        <section className="panel meta-panel">
          <div>{summary?.name ?? 'no file'}</div>
          <div>{summary?.extension ?? SUPPORTED_FORMATS.join(' / ')}</div>
          <div>{summary ? `${summary.meshCount} mesh` : ''}</div>
          <div>{summary ? `${summary.triangleCount} tri` : ''}</div>
          <div>{summary ? `${summary.vertexCount} vtx` : ''}</div>
        </section>
      </aside>

      <section
        className={`viewer-panel ${isDragging ? 'drag-active' : ''}`}
        ref={viewerPanelRef}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) {
            setIsDragging(false)
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (!isDragging) {
            setIsDragging(true)
          }
        }}
        onDrop={onDrop}
      >
        <div className="viewer-stage">
          <div
            className={`viewer-canvas ${activeFrame ? `viewer-frame-${previewFramePreset}` : 'viewer-frame-free'}`}
            ref={viewerHostRef}
          >
            {backgroundGridEnabled ? <div className="viewer-grid-overlay" /> : null}
            {hasBackgroundImageLayers && backgroundImageEditEnabled ? (
              <div
                className={`background-image-drag-layer ${
                  backgroundImageDrag ? 'background-image-drag-layer-active' : ''
                }`}
                onPointerCancel={endBackgroundImageDrag}
                onPointerDown={beginBackgroundImageDrag}
                onPointerMove={moveBackgroundImageDrag}
                onPointerUp={endBackgroundImageDrag}
              />
            ) : null}
            {backgroundGradient.enabled && gradientPanelOpen ? (
              <>
                <div
                  className="gradient-editor-overlay"
                  onPointerDown={(event) => {
                    if (event.target === event.currentTarget) {
                      setSelectedGradientStopId(null)
                    }
                  }}
                >
                  <div
                    className="gradient-editor-line"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setSelectedGradientStopId(null)
                      setGradientDragTarget({
                        endX: backgroundGradient.endX,
                        endY: backgroundGradient.endY,
                        kind: 'line',
                        pointerX: backgroundGradient.startX + (backgroundGradient.endX - backgroundGradient.startX) * 0.5,
                        pointerY: backgroundGradient.startY + (backgroundGradient.endY - backgroundGradient.startY) * 0.5,
                        startX: backgroundGradient.startX,
                        startY: backgroundGradient.startY,
                      })
                    }}
                    style={{
                      left: gradientLineStart.x,
                      top: gradientLineStart.y,
                      transform: `rotate(${gradientAngle}deg)`,
                      width: gradientLength,
                    }}
                  />
                  <button
                    className="gradient-editor-handle gradient-editor-endpoint"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setSelectedGradientStopId(null)
                      setGradientDragTarget({ kind: 'start' })
                    }}
                    style={{
                      left: gradientLineStart.x,
                      top: gradientLineStart.y,
                    }}
                    type="button"
                  />
                  <button
                    className="gradient-editor-add gradient-editor-add-start"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setSelectedGradientStopId(null)
                      addGradientStopAtEdge('start')
                    }}
                    style={{
                      left: gradientLineStart.x,
                      top: gradientLineStart.y,
                    }}
                    type="button"
                  >
                    +
                  </button>
                  <button
                    className="gradient-editor-handle gradient-editor-endpoint"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setSelectedGradientStopId(null)
                      setGradientDragTarget({ kind: 'end' })
                    }}
                    style={{
                      left: gradientLineEnd.x,
                      top: gradientLineEnd.y,
                    }}
                    type="button"
                  />
                  <button
                    className="gradient-editor-add gradient-editor-add-end"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setSelectedGradientStopId(null)
                      addGradientStopAtEdge('end')
                    }}
                    style={{
                      left: gradientLineEnd.x,
                      top: gradientLineEnd.y,
                    }}
                    type="button"
                  >
                    +
                  </button>
                  {backgroundGradient.stops.map((stop) => {
                    const stopX = lerp(gradientLineStart.x, gradientLineEnd.x, stop.position)
                    const stopY = lerp(gradientLineStart.y, gradientLineEnd.y, stop.position)

                    return (
                      <button
                        className={`gradient-editor-handle gradient-editor-stop ${
                          selectedGradientStopId === stop.id
                            ? 'gradient-editor-stop-selected'
                            : ''
                        }`}
                        key={stop.id}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setSelectedGradientStopId(stop.id)
                          setGradientPanelOpen(true)
                        }}
                        onPointerDown={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setSelectedGradientStopId(stop.id)
                          setGradientPanelOpen(true)
                          setPendingGradientStopDrag({
                            id: stop.id,
                            startX: event.clientX,
                            startY: event.clientY,
                          })
                        }}
                        style={{
                          background: gradientStopToCss(stop),
                          left: stopX,
                          top: stopY,
                        }}
                        type="button"
                      />
                    )
                  })}
                  {selectedGradientStop && selectedGradientStopPoint ? (
                    <div
                      className="gradient-editor-stop-popover"
                      ref={gradientStopPopoverRef}
                      style={{
                        left: selectedGradientStopPoint.x,
                        top: selectedGradientStopPoint.y,
                      }}
                    >
                      <div className="gradient-editor-stop-popover-row">
                        <input
                          className="gradient-editor-color"
                          onChange={(event) =>
                            setGradientStopColor(
                              selectedGradientStop.id,
                              event.target.value,
                            )
                          }
                          type="color"
                          value={selectedGradientStop.color}
                        />
                        <span className="gradient-editor-label">color</span>
                      </div>
                      <div className="gradient-editor-stop-popover-row">
                        <span className="gradient-editor-label">alpha</span>
                        <input
                          className="value-input"
                          max={100}
                          min={0}
                          onChange={(event) => {
                            const nextValue = Number(event.target.value)
                            if (Number.isNaN(nextValue)) {
                              return
                            }

                            setGradientStopAlpha(
                              selectedGradientStop.id,
                              nextValue / 100,
                            )
                          }}
                          step={1}
                          type="number"
                          value={Math.round(selectedGradientStop.alpha * 100)}
                        />
                      </div>
                      <button
                        className="chip gradient-editor-remove"
                        onClick={() => removeGradientStop(selectedGradientStop.id)}
                        type="button"
                      >
                        remove color
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
            {isViewerBusy ? (
              <div className="viewer-busy">
                <div className="viewer-busy-spinner" />
              </div>
            ) : null}
          </div>
        </div>

        <section
          className="frame-panel"
          data-dock-key="frame"
          style={getDockPanelStyle('frame')}
        >
          <div
            className="frame-panel-row"
            style={{
              alignItems: 'center',
              display: 'inline-flex',
              flexDirection: 'row',
              flexWrap: 'nowrap',
              gap: 8,
              justifyContent: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            <button
              className="chip frame-dock-reset-chip"
              onClick={resetDockLayout}
              type="button"
            >
              dock
            </button>
            <div
              className="frame-panel-drag-strip panel-drag-handle"
              onPointerDown={(event) => beginDockPanelDrag(event, 'frame')}
            />
            {FRAME_OPTIONS.map((item) => (
              <button
                key={item.key}
                className={`chip ${previewFramePreset === item.key ? 'chip-active' : ''}`}
                onClick={() =>
                  setPreviewFramePreset((current) =>
                    current === item.key ? null : item.key,
                  )
                }
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section
          className={`light-panel ${collapsedPanels.light ? 'panel-collapsed' : ''}`}
          data-dock-key="light"
          style={getDockPanelStyle('light')}
        >
          <div
            className="light-topline panel-drag-handle"
            onPointerDown={(event) => beginDockPanelDrag(event, 'light')}
          >
            <div className="light-title">{PANEL_TITLES.light}</div>
            <button
              className="chip panel-collapse-chip"
              onClick={() => togglePanelCollapse('light')}
              type="button"
            >
              {collapsedPanels.light ? '+' : '-'}
            </button>
          </div>
          {!collapsedPanels.light ? (
            <>
              <div className="light-type-grid">
                {LIGHT_TYPES.map((item) => (
                  <button
                    key={item.key}
                    className={`chip ${light.type === item.key ? 'chip-active' : ''}`}
                    onClick={() => setLightType(item.key)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {LIGHT_SLIDERS.map((item) => (
                <SliderField
                  decimals={2}
                  defaultValue={lightDefaults[item.key]}
                  key={item.key}
                  label={item.label}
                  max={item.max}
                  min={item.min}
                  onChange={(value) => setLightValue(item.key, value)}
                  step={item.step}
                  value={light[item.key]}
                />
              ))}
              <div className="toggle-row">
                <span>shadow</span>
                <button
                  className={`chip ${shadowsEnabled ? 'chip-active' : ''}`}
                  onClick={() => setShadowsEnabled((current) => !current)}
                  type="button"
                >
                  {shadowsEnabled ? 'on' : 'off'}
                </button>
              </div>
              <SliderField
                decimals={2}
                defaultValue={0.45}
                label="shadow soft"
                max={1}
                min={0}
                onChange={setShadowSoftness}
                step={0.01}
                value={shadowSoftness}
              />
              <div className="toggle-row">
                <span>antialias</span>
                <button
                  className={`chip ${antialiasEnabled ? 'chip-active' : ''}`}
                  onClick={() => setAntialiasEnabled((current) => !current)}
                  type="button"
                >
                  {antialiasEnabled ? 'on' : 'off'}
                </button>
              </div>
              <div className="toggle-row">
                <span>turntable</span>
                <button
                  className={`chip ${turntable.enabled ? 'chip-active' : ''}`}
                  onClick={toggleTurntable}
                  type="button"
                >
                  {turntable.enabled ? 'on' : 'off'}
                </button>
              </div>
              {turntable.enabled ? (
                <>
                  <div className="toggle-row">
                    <span>capture</span>
                    <button
                      className="chip"
                      onClick={() => setShowTurntableCaptureDialog(true)}
                      type="button"
                    >
                      capture gif
                    </button>
                  </div>
                  <div className="motion-mode-grid">
                    {TURNTABLE_MODES.map((item) => (
                      <button
                        key={item.key}
                        className={`chip ${turntable.mode === item.key ? 'chip-active' : ''}`}
                        onClick={() => setTurntableMode(item.key)}
                        type="button"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <SliderField
                    decimals={2}
                    defaultValue={DEFAULT_TURNTABLE_SETTINGS.speed}
                    label="turn speed"
                    max={1}
                    min={0}
                    onChange={setTurntableSpeed}
                    step={0.01}
                    value={turntable.speed}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </section>

        {materialMode === 'custom' ? (
          <section
            className={`uv-panel ${collapsedPanels.uv ? 'panel-collapsed' : ''}`}
            data-dock-key="uv"
            style={getDockPanelStyle('uv')}
          >
            <div
              className="uv-topline panel-drag-handle"
              onPointerDown={(event) => beginDockPanelDrag(event, 'uv')}
            >
              <div className="uv-title">{PANEL_TITLES.uv}</div>
              <div className="panel-topline-actions">
                <button
                  className={`chip ${surface.uvTileLock ? 'chip-active' : ''}`}
                  onClick={() => {
                    void toggleUvTileLock()
                  }}
                  type="button"
                >
                  lock
                </button>
                <button
                  className="chip panel-collapse-chip"
                  onClick={() => togglePanelCollapse('uv')}
                  type="button"
                >
                  {collapsedPanels.uv ? '+' : '-'}
                </button>
              </div>
            </div>
            {!collapsedPanels.uv
              ? UV_SLIDERS.map((item) => (
                  <SliderField
                    decimals={item.key === 'uvRotation' ? 0 : 2}
                    defaultValue={
                      item.key === 'uvScaleX' || item.key === 'uvScaleY'
                        ? 1
                        : 0
                    }
                    key={item.key}
                    label={item.label}
                    max={item.max}
                    min={item.min}
                    onChange={(value) => {
                      void setSurfaceValue(item.key, value)
                    }}
                    step={item.step}
                    value={surface[item.key]}
                  />
                ))
              : null}
          </section>
        ) : null}

        <section
          className={`retopo-panel ${collapsedPanels.wire ? 'panel-collapsed' : ''}`}
          data-dock-key="wire"
          style={getDockPanelStyle('wire')}
        >
          <div
            className="retopo-topline panel-drag-handle"
            onPointerDown={(event) => beginDockPanelDrag(event, 'wire')}
          >
            <div className="retopo-title">{PANEL_TITLES.wire}</div>
            <div className="panel-topline-actions">
              <div className="wire-toggle-group">
                <button
                  className={`chip ${wireframeEnabled ? 'chip-active' : ''}`}
                  onClick={toggleWireframe}
                  type="button"
                >
                  wire {wireframeEnabled ? 'on' : 'off'}
                </button>
                <button
                  className={`chip ${wireframeShowModel ? 'chip-active' : ''}`}
                  onClick={toggleWireframeShowModel}
                  type="button"
                >
                  model {wireframeShowModel ? 'on' : 'off'}
                </button>
              </div>
              <button
                className="chip panel-collapse-chip"
                onClick={() => togglePanelCollapse('wire')}
                type="button"
              >
                {collapsedPanels.wire ? '+' : '-'}
              </button>
            </div>
          </div>
          {!collapsedPanels.wire ? (
            <>
              <label className="retopo-input-row">
                <span>color</span>
                <input
                  className="color-input"
                  onChange={(event) => setWireColor(event.target.value)}
                  type="color"
                  value={wireColor}
                />
              </label>
              <SliderField
                decimals={1}
                defaultValue={1.4}
                label="thick"
                max={100}
                min={0}
                onChange={setWireThickness}
                step={0.5}
                value={wireThickness}
              />
            </>
          ) : null}
        </section>

        <section
          className={`aa-panel ${collapsedPanels.motion ? 'panel-collapsed' : ''}`}
          data-dock-key="motion"
          style={getDockPanelStyle('motion')}
        >
          <div
            className="light-topline panel-drag-handle"
            onPointerDown={(event) => beginDockPanelDrag(event, 'motion')}
          >
            <div className="light-title">{PANEL_TITLES.motion}</div>
            <button
              className="chip panel-collapse-chip"
              onClick={() => togglePanelCollapse('motion')}
              type="button"
            >
              {collapsedPanels.motion ? '+' : '-'}
            </button>
          </div>
            {!collapsedPanels.motion ? (
              <>
                <div className="toggle-row">
                  <span>motion blur</span>
                  <button
                  className={`chip ${motionBlur.enabled ? 'chip-active' : ''}`}
                  onClick={toggleMotionBlur}
                  type="button"
                  >
                    {motionBlur.enabled ? 'on' : 'off'}
                  </button>
                </div>

                {motionBlur.enabled ? (
                  <>
                    <div className="motion-mode-grid">
                      {MOTION_MODES.map((item) => (
                        <button
                          key={item.key}
                          className={`chip ${motionBlur.mode === item.key ? 'chip-active' : ''}`}
                          onClick={() => setMotionMode(item.key)}
                          type="button"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    {MOTION_SLIDERS.map((item) => (
                      <SliderField
                        decimals={2}
                        defaultValue={DEFAULT_MOTION_SETTINGS[item.key]}
                        key={item.key}
                        label={item.label}
                        max={item.max}
                        min={item.min}
                        onChange={(value) => setMotionValue(item.key, value)}
                        step={item.step}
                        value={motionBlur[item.key]}
                      />
                    ))}

                    {MOTION_AXIS_SLIDERS.map((item) => (
                    <SliderField
                        decimals={2}
                        defaultValue={0}
                        key={item.key}
                        label={item.label}
                        max={1}
                        min={-1}
                        onChange={(value) => setMotionValue(item.key, value)}
                        step={0.01}
                        value={motionBlur[item.key]}
                      />
                    ))}
                  </>
                ) : null}
              </>
            ) : null}
          </section>

          {hasBackgroundImageLayers && backgroundImageEditEnabled ? (
            <section
              className={`background-panel ${
                collapsedPanels.background ? 'panel-collapsed' : ''
              }`}
              data-dock-key="background"
              style={getDockPanelStyle('background')}
            >
              <div
                className="background-panel-topline panel-drag-handle"
                onPointerDown={(event) => beginDockPanelDrag(event, 'background')}
              >
                <div className="background-panel-title">
                  {PANEL_TITLES.background}
                </div>
                <button
                  className="chip panel-collapse-chip"
                  onClick={() => togglePanelCollapse('background')}
                  type="button"
                >
                  {collapsedPanels.background ? '+' : '-'}
                </button>
              </div>
              {!collapsedPanels.background ? (
                <div className="background-panel-body">
                  <div className="background-image-name">
                    {selectedBackgroundImageLayer?.name || 'background.png'}
                  </div>
                  <div
                    className="background-image-layer-list"
                    onDragOver={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setBackgroundImageLayerDragId(null)
                    }}
                  >
                    {backgroundImage.layers.map((layer, index) => (
                      <button
                        key={layer.id}
                        className={`chip background-image-layer-chip ${
                          layer.id === selectedBackgroundImageLayer?.id
                            ? 'chip-active'
                            : ''
                        } ${
                          layer.id === backgroundImageLayerDragId
                            ? 'background-image-layer-chip-dragging'
                            : ''
                        }`}
                        draggable
                        onDragEnd={() => setBackgroundImageLayerDragId(null)}
                        onDragOver={(event) =>
                          dragBackgroundImageLayerOver(event, layer.id)
                        }
                        onDragStart={(event) =>
                          beginBackgroundImageLayerDrag(event, layer.id)
                        }
                        onDrop={(event) => dropBackgroundImageLayer(event, layer.id)}
                        onClick={() => selectBackgroundImageLayer(layer.id)}
                        type="button"
                      >
                        {index + 1}. {layer.name}
                      </button>
                    ))}
                  </div>
                  <div className="background-image-action-row">
                    <button
                      className="chip background-image-action-chip"
                      onClick={() => backgroundImageInputRef.current?.click()}
                      type="button"
                    >
                      bg img
                    </button>
                  </div>
                  <div className="background-image-modes">
                    {(['cover', 'tile'] as const).map((mode) => (
                      <button
                        key={mode}
                        className={`chip background-image-mode ${
                          selectedBackgroundImageLayer?.mode === mode
                            ? 'chip-active'
                            : ''
                        }`}
                        disabled={!selectedBackgroundImageLayer}
                        onClick={() => setBackgroundImageMode(mode)}
                        type="button"
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                  <label className="background-image-lock-row">
                    <span>lock u/v</span>
                    <input
                      checked={backgroundImageScaleLocked}
                      onChange={(event) =>
                        setBackgroundImageScaleLock(event.target.checked)
                      }
                      type="checkbox"
                    />
                  </label>
                  <div className="background-image-sliders">
                    {BACKGROUND_IMAGE_SLIDERS.map((item) => (
                      <SliderField
                        key={item.key}
                        decimals={item.decimals ?? 2}
                        defaultValue={item.defaultValue}
                        label={item.label}
                        max={item.max}
                        min={item.min}
                        onChange={(value) =>
                          setBackgroundImageValue(item.key, value)
                        }
                        step={item.step}
                        value={
                          selectedBackgroundImageLayer?.[item.key] ??
                          item.defaultValue
                        }
                      />
                    ))}
                  </div>
                  <button
                    className="chip gradient-editor-remove"
                    onClick={clearBackgroundImage}
                    type="button"
                  >
                    clear image
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

        <div
          className="viewer-export-bar"
          data-dock-key="export"
          style={getDockPanelStyle('export')}
        >
          <div
            className="viewer-export-title panel-drag-handle"
            onPointerDown={(event) => beginDockPanelDrag(event, 'export')}
          >
            export
          </div>
            <div className="viewer-export-group">
          <div className="viewer-gradient-stack">
                {backgroundGradient.enabled && gradientPanelOpen ? (
                  <section className="gradient-editor-panel">
                    <div className="gradient-editor-strip" style={{ backgroundImage: gradientCss }} />
                    {selectedGradientStop ? (
                      <div className="gradient-editor-rows">
                        <div className="gradient-editor-row gradient-editor-row-color">
                          <span className="gradient-editor-label">color</span>
                          <div className="gradient-editor-inline-tools">
                            <input
                              className="gradient-editor-color"
                              onChange={(event) =>
                                setGradientStopColor(
                                  selectedGradientStop.id,
                                  event.target.value,
                                )
                              }
                              type="color"
                              value={selectedGradientStop.color}
                            />
                            <input
                              className="value-input"
                              max={100}
                              min={0}
                              onChange={(event) => {
                                const nextValue = Number(event.target.value)
                                if (Number.isNaN(nextValue)) {
                                  return
                                }

                                setGradientStopAlpha(
                                  selectedGradientStop.id,
                                  nextValue / 100,
                                )
                              }}
                              step={1}
                              type="number"
                              value={Math.round(selectedGradientStop.alpha * 100)}
                            />
                          </div>
                        </div>
                        <div className="gradient-editor-row">
                          <span className="gradient-editor-label">pos</span>
                          <input
                            className="value-input"
                            max={100}
                            min={0}
                            onChange={(event) => {
                              const nextValue = Number(event.target.value)
                              if (Number.isNaN(nextValue)) {
                                return
                              }

                              setGradientStopPosition(selectedGradientStop.id, nextValue / 100)
                            }}
                            step={1}
                            type="number"
                            value={Math.round(selectedGradientStop.position * 100)}
                          />
                        </div>
                        <button
                          className="chip gradient-editor-remove"
                          onClick={() => removeGradientStop(selectedGradientStop.id)}
                          type="button"
                        >
                          remove color
                        </button>
                      </div>
                    ) : null}
                  </section>
                ) : null}
                <div className="viewer-gradient-controls">
                  <button
                    className={`chip viewer-export-chip ${
                      hasBackgroundImageLayers ? 'chip-active' : ''
                    }`}
                    onClick={() => backgroundImageInputRef.current?.click()}
                    type="button"
                  >
                    bg img
                  </button>
                  <button
                    className={`chip viewer-export-chip ${
                      hasBackgroundImageLayers && backgroundImageEditEnabled
                        ? 'chip-active'
                        : ''
                    }`}
                    disabled={!hasBackgroundImageLayers}
                    onClick={() => {
                      setGradientPanelOpen(false)
                      const nextOpen = !backgroundImageEditEnabled
                      setBackgroundImageEditEnabled(nextOpen)
                      if (nextOpen) {
                        setCollapsedPanels((current) => ({
                          ...current,
                          background: false,
                        }))
                      }
                    }}
                    type="button"
                  >
                    move
                  </button>
                  <button
                    className={`chip viewer-export-chip ${
                      backgroundGradient.enabled ? 'chip-active' : ''
                    }`}
                    onClick={applyRandomBackgroundGradient}
                    type="button"
                  >
                    gradient
                  </button>
                </div>
              </div>
              <button
                className={`chip viewer-export-chip ${
                  backgroundGridEnabled ? 'chip-active' : ''
                }`}
                onClick={() =>
                  setBackgroundGridEnabled((current) => !current)
                }
                type="button"
              >
                grid
              </button>
              {BACKGROUND_PRESETS.map((item) => (
                <button
                  key={item.key}
                  className={`chip viewer-export-chip ${
                    backgroundColor === item.key ? 'chip-active' : ''
                }`}
                onClick={() => {
                  setBackgroundGradient((current) => ({
                    ...current,
                    enabled: false,
                  }))
                  setBackgroundColor(item.key)
                }}
                type="button"
              >
                {item.label}
              </button>
            ))}
            <label className="viewer-color-chip">
              <span>bg:</span>
              <input
                className="color-input"
                onChange={(event) => {
                  setBackgroundGradient((current) => ({
                    ...current,
                    enabled: false,
                  }))
                  setBackgroundColor(event.target.value)
                }}
                type="color"
                  value={backgroundColor}
                />
              </label>
            </div>
          <div className="viewer-export-group viewer-export-group-compact">
            {IMAGE_EXPORT_OPTIONS.map((item) => (
              <button
                key={item.key}
                className={`chip viewer-export-chip ${
                  imageExportFormat === item.key ? 'chip-active' : ''
                }`}
                onClick={() => setImageExportFormat(item.key)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            className="ui-button viewer-export-button"
            disabled={!summary}
            onClick={() => setShowImageExportDialog(true)}
            type="button"
          >
            image
          </button>
          <div className="viewer-export-group viewer-export-group-compact">
            {MODEL_EXPORT_OPTIONS.map((item) => (
              <button
                key={item.key}
                className={`chip viewer-export-chip ${
                  modelExportFormat === item.key ? 'chip-active' : ''
                }`}
                onClick={() => setModelExportFormat(item.key)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            className="ui-button viewer-export-button"
            disabled={!summary}
            onClick={exportModel}
            type="button"
          >
            model
          </button>
        </div>
      </section>
      </main>
    </>
  )
}

export default App
