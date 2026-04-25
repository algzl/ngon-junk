import { startTransition, useEffect, useRef, useState } from 'react'
import '@fontsource/space-mono/400.css'
import '@fontsource/space-mono/700.css'
import { CanvasTexture, ClampToEdgeWrapping, SRGBColorSpace } from 'three'
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
  type ViewLightSettings,
  type ViewLightType,
  type ViewMotionBlurSettings,
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
type FloatingPanelKey = 'light' | 'motion' | 'uv' | 'wire'
type BakeDeliveryMode = 'embedded' | 'separate'
type PreviewFramePreset = 'landscape' | 'portrait' | 'square'
type ImageExportScale = 2 | 4
type ImageExportDpi = 72 | 150 | 300
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
  { key: 'uvScaleX', label: 'scale x', min: 0.2, max: 8, step: 0.01 },
  { key: 'uvScaleY', label: 'scale y', min: 0.2, max: 8, step: 0.01 },
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

const MAX_IMAGE_EXPORT_LONG_EDGE = 8192

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
  const displayValue = Number(value.toFixed(decimals))

  return (
    <label className="slider-row">
      <div className="slider-head">
        <span>{label}</span>
        <input
          className="value-input"
          max={max}
          min={min}
          onChange={(event) => {
            const nextValue = Number(event.target.value)
            if (Number.isNaN(nextValue)) {
              return
            }

            onChange(clampValue(nextValue, min, max))
          }}
          onDoubleClick={() => onChange(defaultValue)}
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
        onDoubleClick={() => onChange(defaultValue)}
        step={step}
        type="range"
        value={value}
      />
    </label>
  )
}

const PANEL_TITLES: Record<FloatingPanelKey, string> = {
  light: 'light',
  motion: 'motion',
  uv: 'uv',
  wire: 'wire',
}

function App() {
  const viewerHostRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
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
  const [bakeExportOptions, setBakeExportOptions] = useState<BakeExportOptions>(
    DEFAULT_BAKE_EXPORT_OPTIONS,
  )
  const [liveViewerAspect, setLiveViewerAspect] = useState(16 / 9)
  const [wireColor, setWireColor] = useState('#111111')
  const [wireframeEnabled, setWireframeEnabled] = useState(false)
  const [wireframeShowModel, setWireframeShowModel] = useState(true)
  const [wireThickness, setWireThickness] = useState(1.4)
  const [smoothShadingEnabled, setSmoothShadingEnabled] = useState(true)
  const [motionBlur, setMotionBlur] =
    useState<ViewMotionBlurSettings>(DEFAULT_MOTION_SETTINGS)
  const [collapsedPanels, setCollapsedPanels] = useState<Record<FloatingPanelKey, boolean>>({
    light: false,
    motion: false,
    uv: false,
    wire: false,
  })
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
    await runSurfaceViewerTask(() => {
      setMaterialMode('custom')
      setSurface((current) => ({
        ...current,
        [key]: nextValue,
      }))
    })
  }

  const toggleFoliage = async () => {
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

  const runModelExport = async (bakeOptions?: BakeExportOptions) => {
    if (!viewportRef.current) {
      return
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
        return
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
            return
          }

          downloadBlob(new Blob([zipBytes], { type: 'application/zip' }), `${baseName}-bake.zip`)
          updateStatus(`saved / ${baseName}-bake.zip`)
          return
        }

        const text = viewportRef.current.exportObjText()
        if (picked && bridge?.writeExportText) {
          await bridge.writeExportText(picked.filePath, text)
          updateStatus(`saved / ${baseName}.obj`)
          return
        }

        downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${baseName}.obj`)
        updateStatus(`saved / ${baseName}.obj`)
        return
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
            return
          }

          downloadBlob(new Blob([zipBytes], { type: 'application/zip' }), `${baseName}-bake.zip`)
          updateStatus(`saved / ${baseName}-bake.zip`)
          return
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
        return
      }

      downloadBlob(new Blob([bytes], { type: 'model/gltf-binary' }), `${baseName}.glb`)
      updateStatus(`saved / ${baseName}.glb`)
    } catch (error) {
      updateStatus(
        `error / ${error instanceof Error ? error.message : 'export basarisiz'}`,
      )
    }
    }

  const exportModel = async () => {
    if (
      (modelExportFormat === 'glb' || modelExportFormat === 'obj') &&
      materialMode === 'custom'
    ) {
      setShowBakeExportDialog(true)
      return
    }

    await runModelExport()
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
      return
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
        return
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
        return
      }

      downloadBlob(
        new Blob([bytes], { type: format === 'jpg' ? 'image/jpeg' : 'image/png' }),
        `${baseName}-preview.${format}`,
      )
      updateStatus(`saved / ${baseName}-preview.${format}`)
    } catch (error) {
      updateStatus(
        `error / ${
          error instanceof Error ? error.message : 'image export basarisiz'
        }`,
      )
    }
  }

  const confirmImageExport = async () => {
    setShowImageExportDialog(false)
    await exportPreviewImage(imageExportOptions)
  }

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
            {isViewerBusy ? (
              <div className="viewer-busy">
                <div className="viewer-busy-spinner" />
              </div>
            ) : null}
          </div>
        </div>

        <section className="frame-panel">
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
        </section>

        <section className={`light-panel ${collapsedPanels.light ? 'panel-collapsed' : ''}`}>
          <div className="light-topline">
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
            </>
          ) : null}
        </section>

        {materialMode === 'custom' ? (
          <section className={`uv-panel ${collapsedPanels.uv ? 'panel-collapsed' : ''}`}>
            <div className="uv-topline">
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

        <section className={`retopo-panel ${collapsedPanels.wire ? 'panel-collapsed' : ''}`}>
          <div className="retopo-topline">
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

        <section className={`aa-panel ${collapsedPanels.motion ? 'panel-collapsed' : ''}`}>
          <div className="light-topline">
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

        <div className="viewer-export-bar">
          <div className="viewer-export-title">export</div>
          <div className="viewer-export-group">
            {BACKGROUND_PRESETS.map((item) => (
              <button
                key={item.key}
                className={`chip viewer-export-chip ${
                  backgroundColor === item.key ? 'chip-active' : ''
                }`}
                onClick={() => setBackgroundColor(item.key)}
                type="button"
              >
                {item.label}
              </button>
            ))}
            <label className="viewer-color-chip">
              <span>bg:</span>
              <input
                className="color-input"
                onChange={(event) => setBackgroundColor(event.target.value)}
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
