import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  MOUSE,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PCFSoftShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Raycaster,
  Scene,
  ShadowMaterial,
  SpotLight,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { applySurfaceToObject, type SurfaceState } from './materialSystem'

const CAMERA_OFFSET = new Vector3(1.8, 1.2, 1.8)
const LIGHT_DIRECTION_OFFSET = new Vector3()
const CAMERA_DIRECTION = new Vector3()
const CAMERA_RIGHT = new Vector3()
const CAMERA_UP = new Vector3()
const DEG_TO_RAD = Math.PI / 180
const MODEL_BOUNDS_SIZE = new Vector3()
const MODEL_BOUNDS_CENTER = new Vector3()
const OFF_WHITE_BACKGROUND = new Color('#f5f3ec')
const MAX_UNDO_ENTRIES = 48
const MODEL_LAYER = 1
const TRAIL_LAYER = 2

export type ViewLightType = 'studio' | 'sun' | 'spot'

export type ViewLightSettings = {
  bloom: number
  lift: number
  intensity: number
  turn: number
  type: ViewLightType
}

export type ViewportModelStats = {
  meshCount: number
  triangleCount: number
  vertexCount: number
}

export type ViewWireframeSettings = {
  color: string
  enabled: boolean
  showModel: boolean
  thickness: number
}

export type ViewMotionBlurSettings = {
  axisX: number
  axisY: number
  axisZ: number
  distance: number
  enabled: boolean
  gaussian: number
  intensity: number
  mode: 'trail' | 'smear' | 'silhouette'
  strobe: number
}

export type ViewImageExportOptions = {
  dpi: number
  format: 'png' | 'jpg'
  height: number
  width: number
}

type ViewSnapshot = {
  cameraPosition: [number, number, number]
  controlTarget: [number, number, number]
  modelOffset: [number, number, number]
  motionVector: [number, number, number]
}

const DEFAULT_LIGHT_SETTINGS: ViewLightSettings = {
  bloom: 0,
  lift: 34,
  intensity: 2.4,
  turn: 38,
  type: 'studio',
}

const DEFAULT_WIREFRAME_SETTINGS: ViewWireframeSettings = {
  color: '#111111',
  enabled: false,
  showModel: true,
  thickness: 1.4,
}

const DEFAULT_ANTIALIAS_ENABLED = true

const DEFAULT_MOTION_BLUR_SETTINGS: ViewMotionBlurSettings = {
  axisX: 0,
  axisY: 0,
  axisZ: 0,
  distance: 0.45,
  enabled: false,
  gaussian: 0.28,
  intensity: 0.52,
  mode: 'trail',
  strobe: 0.48,
}

const disposeObject = (object: Object3D) => {
  object.traverse((child) => {
    const mesh = child as {
      geometry?: { dispose?: () => void }
      material?:
        | { dispose?: () => void }
        | Array<{
            dispose?: () => void
          }>
    }

    mesh.geometry?.dispose?.()

    const materials = mesh.material
    if (Array.isArray(materials)) {
      materials.filter(Boolean).forEach((material) => material.dispose?.())
      return
    }

    materials?.dispose?.()
  })
}

const createFullySmoothedGeometry = (geometry: BufferGeometry) => {
  const sourceGeometry =
    geometry.index ? geometry.toNonIndexed() ?? geometry.clone() : geometry.clone()
  const position = sourceGeometry.getAttribute('position')

  if (!position) {
    return sourceGeometry
  }

  const normalValues = new Float32Array(position.count * 3)
  const accumulated = new Map<string, Vector3>()
  const keyForIndex = (index: number) =>
    `${position.getX(index).toFixed(5)}|${position.getY(index).toFixed(5)}|${position
      .getZ(index)
      .toFixed(5)}`

  const vertexA = new Vector3()
  const vertexB = new Vector3()
  const vertexC = new Vector3()
  const edgeAB = new Vector3()
  const edgeAC = new Vector3()
  const faceNormal = new Vector3()

  for (let index = 0; index < position.count; index += 3) {
    vertexA.fromBufferAttribute(position, index)
    vertexB.fromBufferAttribute(position, index + 1)
    vertexC.fromBufferAttribute(position, index + 2)

    edgeAB.subVectors(vertexB, vertexA)
    edgeAC.subVectors(vertexC, vertexA)
    faceNormal.crossVectors(edgeAB, edgeAC)

    if (faceNormal.lengthSq() <= 0.0000001) {
      continue
    }

    faceNormal.normalize()

    ;[index, index + 1, index + 2].forEach((vertexIndex) => {
      const key = keyForIndex(vertexIndex)
      const current = accumulated.get(key) ?? new Vector3()
      current.add(faceNormal)
      accumulated.set(key, current)
    })
  }

  for (let index = 0; index < position.count; index += 1) {
    const key = keyForIndex(index)
    const vertexNormal = accumulated.get(key)?.clone().normalize() ?? new Vector3(0, 1, 0)
    normalValues[index * 3] = vertexNormal.x
    normalValues[index * 3 + 1] = vertexNormal.y
    normalValues[index * 3 + 2] = vertexNormal.z
  }

  sourceGeometry.setAttribute('normal', new Float32BufferAttribute(normalValues, 3))
  return sourceGeometry
}

const disposeSmoothCaches = (object: Object3D) => {
  object.traverse((child) => {
    const mesh = child as {
      geometry?: BufferGeometry
      userData: {
        ngonSmoothBaseGeometry?: BufferGeometry
        ngonSmoothGeometry?: BufferGeometry
      }
    }

    const currentGeometry = mesh.geometry
    const baseGeometry = mesh.userData.ngonSmoothBaseGeometry
    const smoothGeometry = mesh.userData.ngonSmoothGeometry

    if (baseGeometry && baseGeometry !== currentGeometry) {
      baseGeometry.dispose()
    }

    if (smoothGeometry && smoothGeometry !== currentGeometry) {
      smoothGeometry.dispose()
    }

    delete mesh.userData.ngonSmoothBaseGeometry
    delete mesh.userData.ngonSmoothGeometry
  })
}

const cloneTextureValue = (value: unknown) => {
  if (
    !value ||
    typeof value !== 'object' ||
    !('isTexture' in value) ||
    value.isTexture !== true ||
    !('clone' in value) ||
    typeof value.clone !== 'function'
  ) {
    return value
  }

  return (value as { clone: () => unknown }).clone()
}

const cloneMaterialValue = (material: unknown) => {
  if (
    !material ||
    typeof material !== 'object' ||
    !('clone' in material) ||
    typeof material.clone !== 'function'
  ) {
    return material
  }

  const cloned = (material as { clone: () => Record<string, unknown> }).clone()

  for (const key of Object.keys(cloned)) {
    cloned[key] = cloneTextureValue(cloned[key])
  }

  return cloned
}

const cloneModelSnapshot = (object: Object3D) => {
  const cloned = cloneSkeleton(object)

  cloned.traverse((child) => {
    const mesh = child as {
      geometry?: unknown
      material?: unknown
    }

    const geometry = mesh.geometry
    if (
      geometry &&
      typeof geometry === 'object' &&
      'clone' in geometry &&
      typeof geometry.clone === 'function'
    ) {
      mesh.geometry = geometry.clone()
    }

    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((material) => cloneMaterialValue(material))
      return
    }

    mesh.material = cloneMaterialValue(mesh.material)
  })

  return cloned
}

const stripTaggedChildren = (object: Object3D, tag: string) => {
  const tagged: Object3D[] = []

  object.traverse((child) => {
    if (child.userData[tag]) {
      tagged.push(child)
    }
  })

  tagged.forEach((child) => {
    child.parent?.remove(child)
  })
}

const cloneRenderableSnapshot = (object: Object3D) => {
  const cloned = cloneModelSnapshot(object)
  stripTaggedChildren(cloned, 'ngonWireOverlay')
  stripTaggedChildren(cloned, 'ngonMotionGhost')
  return cloned
}

const applyEmbeddedBakeMaterial = (
  material: unknown,
  bakedCanvas: HTMLCanvasElement,
) => {
  if (!material || typeof material !== 'object') {
    return
  }

  const bakedTexture = new CanvasTexture(bakedCanvas)
  bakedTexture.colorSpace = 'srgb'
  bakedTexture.needsUpdate = true

  const mutableMaterial = material as Record<string, unknown>
  mutableMaterial.map = bakedTexture

  if ('color' in mutableMaterial && mutableMaterial.color instanceof Color) {
    mutableMaterial.color.set('#ffffff')
  }

  mutableMaterial.metalness = 0
  mutableMaterial.roughness = 1
  mutableMaterial.transmission = 0
  mutableMaterial.clearcoat = 0
  mutableMaterial.envMapIntensity = 0
  mutableMaterial.bumpMap = null
  mutableMaterial.normalMap = null
  mutableMaterial.roughnessMap = null
  mutableMaterial.metalnessMap = null
  mutableMaterial.specularIntensityMap = null
  mutableMaterial.thicknessMap = null
  mutableMaterial.transmissionMap = null

  if ('needsUpdate' in mutableMaterial) {
    mutableMaterial.needsUpdate = true
  }
}

const assignMaterialName = (material: unknown, name: string) => {
  if (!material || typeof material !== 'object') {
    return
  }

  ;(material as { name?: string }).name = name
}

const getGeometryTriangleCount = (geometry: BufferGeometry) => {
  const index = geometry.getIndex()
  if (index) {
    return Math.floor(index.count / 3)
  }

  const position = geometry.getAttribute('position')
  return position ? Math.floor(position.count / 3) : 0
}

const getGeometryVertexCount = (geometry: BufferGeometry) => {
  const position = geometry.getAttribute('position')
  return position ? position.count : 0
}

const collectObjectStats = (object: Object3D): ViewportModelStats => {
  let meshCount = 0
  let triangleCount = 0
  let vertexCount = 0

  object.traverse((child) => {
    if (!(child instanceof Mesh) || child.userData.ngonWireOverlay) {
      return
    }

    meshCount += 1
    triangleCount += getGeometryTriangleCount(child.geometry)
    vertexCount += getGeometryVertexCount(child.geometry)
  })

  return {
    meshCount,
    triangleCount,
    vertexCount,
  }
}

const getColorLuminance = (color: Color) =>
  color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722

const getSrgbColorBytes = (color: Color) => {
  const srgb = color.clone().convertLinearToSRGB()
  return [
    Math.round(srgb.r * 255),
    Math.round(srgb.g * 255),
    Math.round(srgb.b * 255),
  ] as const
}

const canvasToArrayBuffer = async (
  canvas: HTMLCanvasElement,
  format: 'png' | 'jpg',
): Promise<ArrayBuffer> => {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (!nextBlob) {
          reject(new Error('Preview image olusturulamadi.'))
          return
        }

        resolve(nextBlob)
      },
      format === 'jpg' ? 'image/jpeg' : 'image/png',
      format === 'jpg' ? 0.92 : undefined,
    )
  })

  return blob.arrayBuffer()
}

const readUint32BE = (bytes: Uint8Array, offset: number) =>
  (bytes[offset] << 24) |
  (bytes[offset + 1] << 16) |
  (bytes[offset + 2] << 8) |
  bytes[offset + 3]

const writeUint32BE = (bytes: Uint8Array, offset: number, value: number) => {
  bytes[offset] = (value >>> 24) & 0xff
  bytes[offset + 1] = (value >>> 16) & 0xff
  bytes[offset + 2] = (value >>> 8) & 0xff
  bytes[offset + 3] = value & 0xff
}

const computeCrc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff

  for (const value of bytes) {
    crc ^= value
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }

  return (crc ^ 0xffffffff) >>> 0
}

const applyPngDpiMetadata = (buffer: ArrayBuffer, dpi: number) => {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 33) {
    return buffer
  }

  const pixelsPerMeter = Math.round(dpi / 0.0254)
  const data = new Uint8Array(9)
  writeUint32BE(data, 0, pixelsPerMeter)
  writeUint32BE(data, 4, pixelsPerMeter)
  data[8] = 1

  const typeBytes = new TextEncoder().encode('pHYs')
  const crcSource = new Uint8Array(typeBytes.length + data.length)
  crcSource.set(typeBytes, 0)
  crcSource.set(data, typeBytes.length)

  const chunk = new Uint8Array(4 + 4 + data.length + 4)
  writeUint32BE(chunk, 0, data.length)
  chunk.set(typeBytes, 4)
  chunk.set(data, 8)
  writeUint32BE(chunk, 8 + data.length, computeCrc32(crcSource))

  const ihdrLength = readUint32BE(bytes, 8)
  const insertOffset = 8 + 4 + 4 + ihdrLength + 4
  const output = new Uint8Array(bytes.length + chunk.length)
  output.set(bytes.subarray(0, insertOffset), 0)
  output.set(chunk, insertOffset)
  output.set(bytes.subarray(insertOffset), insertOffset + chunk.length)
  return output.buffer
}

const applyJpegDpiMetadata = (buffer: ArrayBuffer, dpi: number) => {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return buffer
  }

  const density = Math.max(1, Math.min(65535, Math.round(dpi)))
  const app0 = new Uint8Array([
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x02,
    0x01,
    (density >>> 8) & 0xff,
    density & 0xff,
    (density >>> 8) & 0xff,
    density & 0xff,
    0x00,
    0x00,
  ])

  const replaceStart = 2
  let replaceEnd = 2

  if (bytes.length > 6 && bytes[2] === 0xff && bytes[3] === 0xe0) {
    const segmentLength = (bytes[4] << 8) | bytes[5]
    replaceEnd = 2 + 2 + segmentLength
  }

  const output = new Uint8Array(bytes.length - (replaceEnd - replaceStart) + app0.length)
  output.set(bytes.subarray(0, replaceStart), 0)
  output.set(app0, replaceStart)
  output.set(bytes.subarray(replaceEnd), replaceStart + app0.length)
  return output.buffer
}

const applyImageDpiMetadata = (
  buffer: ArrayBuffer,
  format: 'png' | 'jpg',
  dpi: number,
) => (format === 'png' ? applyPngDpiMetadata(buffer, dpi) : applyJpegDpiMetadata(buffer, dpi))

const cloneCanvas = (sourceCanvas: HTMLCanvasElement) => {
  const clonedCanvas = document.createElement('canvas')
  clonedCanvas.width = sourceCanvas.width
  clonedCanvas.height = sourceCanvas.height
  const context = clonedCanvas.getContext('2d')
  if (!context) {
    throw new Error('Preview image olusturulamadi.')
  }

  context.drawImage(sourceCanvas, 0, 0)
  return clonedCanvas
}

const resizeCanvas = (
  sourceCanvas: HTMLCanvasElement,
  width: number,
  height: number,
) => {
  if (sourceCanvas.width === width && sourceCanvas.height === height) {
    return sourceCanvas
  }

  let workingCanvas = sourceCanvas

  while (
    workingCanvas.width * 0.5 > width &&
    workingCanvas.height * 0.5 > height
  ) {
    const stepCanvas = document.createElement('canvas')
    stepCanvas.width = Math.max(width, Math.floor(workingCanvas.width * 0.5))
    stepCanvas.height = Math.max(height, Math.floor(workingCanvas.height * 0.5))
    const stepContext = stepCanvas.getContext('2d')

    if (!stepContext) {
      throw new Error('Export image yeniden boyutlandirilamadi.')
    }

    stepContext.imageSmoothingEnabled = true
    stepContext.imageSmoothingQuality = 'high'
    stepContext.drawImage(workingCanvas, 0, 0, stepCanvas.width, stepCanvas.height)
    workingCanvas = stepCanvas
  }

  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = width
  outputCanvas.height = height
  const context = outputCanvas.getContext('2d')

  if (!context) {
    throw new Error('Export image yeniden boyutlandirilamadi.')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(workingCanvas, 0, 0, width, height)
  return outputCanvas
}

const removeFlatBackgroundFromCanvas = async (
  sourceCanvas: HTMLCanvasElement,
  background: Color,
  alphaMaskCanvas?: HTMLCanvasElement,
): Promise<HTMLCanvasElement> => {
  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = sourceCanvas.width
  outputCanvas.height = sourceCanvas.height

  const context = outputCanvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('PNG export icin canvas olusturulamadi.')
  }

  context.drawImage(sourceCanvas, 0, 0)

  const imageData = context.getImageData(0, 0, outputCanvas.width, outputCanvas.height)
  const data = imageData.data
  const maskData = alphaMaskCanvas
    ?.getContext('2d', { willReadFrequently: true })
    ?.getImageData(0, 0, alphaMaskCanvas.width, alphaMaskCanvas.height).data
  const [backgroundR, backgroundG, backgroundB] = getSrgbColorBytes(background)
  const transparentThreshold = 8
  const opaqueThreshold = 74

  for (let index = 0; index < data.length; index += 4) {
    const sourceR = data[index]
    const sourceG = data[index + 1]
    const sourceB = data[index + 2]
    const maskAlpha = maskData ? maskData[index + 3] / 255 : null

    if (maskAlpha !== null) {
      if (maskAlpha <= 0.001) {
        data[index] = 0
        data[index + 1] = 0
        data[index + 2] = 0
        data[index + 3] = 0
        continue
      }

      if (maskAlpha >= 0.999) {
        data[index + 3] = 255
        continue
      }

      const alphaByte = Math.round(maskAlpha * 255)
      const normalizedAlpha = alphaByte / 255

      data[index] = Math.min(
        255,
        Math.max(0, Math.round(sourceR / normalizedAlpha)),
      )
      data[index + 1] = Math.min(
        255,
        Math.max(0, Math.round(sourceG / normalizedAlpha)),
      )
      data[index + 2] = Math.min(
        255,
        Math.max(0, Math.round(sourceB / normalizedAlpha)),
      )
      data[index + 3] = alphaByte
      continue
    }

    const distance = Math.sqrt(
      (sourceR - backgroundR) ** 2 +
        (sourceG - backgroundG) ** 2 +
        (sourceB - backgroundB) ** 2,
    )
    const keyedAlpha =
      distance <= transparentThreshold
        ? 0
        : distance >= opaqueThreshold
          ? 1
          : (distance - transparentThreshold) / (opaqueThreshold - transparentThreshold)
    const alpha = Math.min(Math.max(keyedAlpha, 0), 1)

    if (alpha <= 0.001) {
      data[index + 3] = 0
      continue
    }

    if (alpha >= 0.999) {
      data[index + 3] = 255
      continue
    }

    const alphaByte = Math.round(alpha * 255)
    const normalizedAlpha = alphaByte / 255

    data[index] = Math.min(
      255,
      Math.max(0, Math.round((sourceR - backgroundR * (1 - normalizedAlpha)) / normalizedAlpha)),
    )
    data[index + 1] = Math.min(
      255,
      Math.max(0, Math.round((sourceG - backgroundG * (1 - normalizedAlpha)) / normalizedAlpha)),
    )
    data[index + 2] = Math.min(
      255,
      Math.max(0, Math.round((sourceB - backgroundB * (1 - normalizedAlpha)) / normalizedAlpha)),
    )
    data[index + 3] = alphaByte
  }

  context.putImageData(imageData, 0, 0)
  return outputCanvas
}

const setRenderableMaterialVisibility = (material: unknown, visible: boolean) => {
  if (!material || typeof material !== 'object') {
    return
  }

  if ('visible' in material) {
    material.visible = visible
  }

  if ('needsUpdate' in material) {
    material.needsUpdate = true
  }
}

const setRenderableMaterialFlatShading = (material: unknown, flatShading: boolean) => {
  if (!material || typeof material !== 'object') {
    return
  }

  if ('flatShading' in material) {
    material.flatShading = flatShading
  }

  if ('needsUpdate' in material) {
    material.needsUpdate = true
  }
}

const setGhostMaterialStyle = (material: unknown, opacity: number) => {
  if (!material || typeof material !== 'object') {
    return
  }

  const ghostMaterial = material as {
    alphaMap?: unknown
    aoMap?: unknown
    bumpMap?: unknown
    bumpScale?: number
    clearcoat?: number
    color?: { clone?: () => { multiplyScalar?: (value: number) => void } }
    emissive?: { copy?: (value: unknown) => void; multiplyScalar?: (value: number) => void }
    envMapIntensity?: number
    metalnessMap?: unknown
    metalness?: number
    normalMap?: unknown
    normalScale?: { setScalar?: (value: number) => void }
    opacity?: number
    polygonOffset?: boolean
    polygonOffsetFactor?: number
    polygonOffsetUnits?: number
    roughnessMap?: unknown
    roughness?: number
    transmission?: number
    transparent?: boolean
    userData?: Record<string, number>
    depthWrite?: boolean
    needsUpdate?: boolean
  }

  ghostMaterial.userData ??= {}

  if ('transparent' in material) {
    material.transparent = true
  }

  if ('opacity' in material) {
    material.opacity = opacity
  }

  if ('depthWrite' in material) {
    material.depthWrite = false
  }

  if ('depthTest' in material) {
    material.depthTest = true
  }

  if ('polygonOffset' in material) {
    material.polygonOffset = true
  }

  if ('polygonOffsetFactor' in material) {
    material.polygonOffsetFactor = -1
  }

  if ('polygonOffsetUnits' in material) {
    material.polygonOffsetUnits = -1
  }

  if (typeof ghostMaterial.metalness === 'number') {
    ghostMaterial.userData.ngonGhostMetalness ??= ghostMaterial.metalness
    ghostMaterial.metalness = ghostMaterial.userData.ngonGhostMetalness * 0.04
  }

  if (typeof ghostMaterial.roughness === 'number') {
    ghostMaterial.userData.ngonGhostRoughness ??= ghostMaterial.roughness
    ghostMaterial.roughness = Math.max(
      ghostMaterial.userData.ngonGhostRoughness,
      0.88,
    )
  }

  if (typeof ghostMaterial.envMapIntensity === 'number') {
    ghostMaterial.userData.ngonGhostEnv ??= ghostMaterial.envMapIntensity
    ghostMaterial.envMapIntensity = ghostMaterial.userData.ngonGhostEnv * 0.015
  }

  if (typeof ghostMaterial.clearcoat === 'number') {
    ghostMaterial.userData.ngonGhostClearcoat ??= ghostMaterial.clearcoat
    ghostMaterial.clearcoat = ghostMaterial.userData.ngonGhostClearcoat * 0.04
  }

  if (typeof ghostMaterial.transmission === 'number') {
    ghostMaterial.userData.ngonGhostTransmission ??= ghostMaterial.transmission
    ghostMaterial.transmission = 0
  }

  if ('normalMap' in ghostMaterial) {
    ghostMaterial.normalMap = null
  }

  if ('roughnessMap' in ghostMaterial) {
    ghostMaterial.roughnessMap = null
  }

  if ('metalnessMap' in ghostMaterial) {
    ghostMaterial.metalnessMap = null
  }

  if ('bumpMap' in ghostMaterial) {
    ghostMaterial.bumpMap = null
  }

  if ('aoMap' in ghostMaterial) {
    ghostMaterial.aoMap = null
  }

  if ('alphaMap' in ghostMaterial) {
    ghostMaterial.alphaMap = null
  }

  if (typeof ghostMaterial.bumpScale === 'number') {
    ghostMaterial.bumpScale = 0
  }

  if (ghostMaterial.normalScale?.setScalar) {
    ghostMaterial.normalScale.setScalar(0)
  }

  if (ghostMaterial.emissive?.copy && ghostMaterial.color?.clone) {
    const glowColor = ghostMaterial.color.clone()
    glowColor.multiplyScalar?.(0.05)
    ghostMaterial.emissive.copy(glowColor)
  }

  if ('needsUpdate' in material) {
    material.needsUpdate = true
  }
}

const viewSnapshotEqual = (left: ViewSnapshot, right: ViewSnapshot) => {
  const epsilon = 0.00001

  const matches = (a: number[], b: number[]) =>
    a.every((value, index) => Math.abs(value - b[index]) < epsilon)

  if (!matches(left.cameraPosition, right.cameraPosition)) {
    return false
  }

  if (!matches(left.controlTarget, right.controlTarget)) {
    return false
  }

  if (!matches(left.modelOffset, right.modelOffset)) {
    return false
  }

  return matches(left.motionVector, right.motionVector)
}

export class ModelViewport {
  private readonly handleMiddleMouseDown = (event: MouseEvent) => {
    if (event.button === 1) {
      event.preventDefault()
    }
  }

  private readonly handleViewportWheel = (event: WheelEvent) => {
    event.preventDefault()
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    const hit = this.pickModelMesh(event)

    if (!hit) {
      return
    }

    this.beginUndoCapture()
    this.pointerDragging = true
    this.dragStartClientY = event.clientY
    this.dragStartOffset.copy(this.modelOffset)
    this.renderer.domElement.style.cursor = 'ns-resize'

    this.controls.enabled = false
    event.preventDefault()
  }

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (this.pointerDragging) {
      const delta = (this.dragStartClientY - event.clientY) * (this.homeDistance / 260)
      this.setModelOffset(
        this.dragStartOffset.clone().setY(this.dragStartOffset.y + delta),
      )
      this.renderer.domElement.style.cursor = 'ns-resize'
      event.preventDefault()
      return
    }

    this.renderer.domElement.style.cursor = this.pickModelMesh(event)
      ? 'ns-resize'
      : 'default'
  }

  private readonly handlePointerUp = () => {
    if (!this.pointerDragging) {
      return
    }

    this.pointerDragging = false
    this.controls.enabled = true
    this.commitUndoCapture()

    this.renderer.domElement.style.cursor = 'default'
  }

  private readonly handleControlStart = () => {
    if (!this.pointerDragging) {
      this.beginUndoCapture()
    }
  }

  private readonly handleControlEnd = () => {
    if (!this.pointerDragging) {
      this.commitUndoCapture()
    }
  }

  private readonly handleControlChange = () => {
    this.requestRender()
  }

  private readonly camera: PerspectiveCamera
  private readonly composer: EffectComposer
  private readonly container: HTMLElement
  private readonly controls: OrbitControls
  private readonly baseRenderPass: RenderPass
  private readonly bloomPass: UnrealBloomPass
  private readonly directionalLight: DirectionalLight
  private readonly floorShadow: Mesh
  private readonly hemiLight: HemisphereLight
  private readonly fillLight: PointLight
  private readonly fxaaPass: ShaderPass
  private readonly renderer: WebGLRenderer
  private readonly resizeObserver: ResizeObserver
  private readonly scene: Scene
  private readonly spotLight: SpotLight
  private readonly ambientLight: AmbientLight
  private readonly sunLight: DirectionalLight
  private readonly modelRoot = new Group()
  private readonly motionTrailRoot = new Group()
  private readonly dragPointer = new Vector2()
  private readonly raycaster = new Raycaster()
  private readonly dragStartOffset = new Vector3()
  private antialiasEnabled = DEFAULT_ANTIALIAS_ENABLED
  private animationFrameId = 0
  private backgroundColor = '#ffffff'
  private dragStartClientY = 0
  private homeDistance = 8
  private lightRadius = 18
  private lightSettings: ViewLightSettings = DEFAULT_LIGHT_SETTINGS
  private modelBaseCenter = new Vector3()
  private modelBounds = new Box3()
  private modelCenter = new Vector3()
  private modelFloorY = -2
  private modelOffset = new Vector3()
  private motionBlurSettings: ViewMotionBlurSettings = DEFAULT_MOTION_BLUR_SETTINGS
  private motionVector = new Vector3()
  private motionWorldVector = new Vector3()
  private motionTrailRefreshTimer: number | null = null
  private originalModel: Object3D | null = null
  private pendingUndoSnapshot: ViewSnapshot | null = null
  private pointerDragging = false
  private renderQueued = false
  private shadowEnabled = true
  private shadowSoftness = 0.45
  private smoothShadingEnabled = true
  private undoStack: ViewSnapshot[] = []
  private wireframeSettings: ViewWireframeSettings = DEFAULT_WIREFRAME_SETTINGS

  constructor(container: HTMLElement) {
    this.container = container
    this.scene = new Scene()
    this.scene.background = OFF_WHITE_BACKGROUND.clone()

    this.camera = new PerspectiveCamera(45, 1, 0.1, 5000)
    this.camera.position.set(8, 6, 8)

    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(container.clientWidth, container.clientHeight, false)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFSoftShadowMap
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08

    this.composer = new EffectComposer(this.renderer)
    this.baseRenderPass = new RenderPass(this.scene, this.camera)
    this.composer.addPass(this.baseRenderPass)
      this.bloomPass = new UnrealBloomPass(
        new Vector2(container.clientWidth || 1, container.clientHeight || 1),
        0.2,
        0.28,
        0.92,
      )
      this.fxaaPass = new ShaderPass(FXAAShader)
      this.composer.addPass(this.bloomPass)
      this.composer.addPass(this.fxaaPass)

      const pmrem = new PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture
    pmrem.dispose()

    container.append(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = false
    this.controls.target.set(0, 0, 0)
    this.controls.mouseButtons.LEFT = MOUSE.ROTATE
    this.controls.mouseButtons.MIDDLE = MOUSE.PAN
    this.controls.mouseButtons.RIGHT = MOUSE.PAN
    this.controls.addEventListener('start', this.handleControlStart)
    this.controls.addEventListener('end', this.handleControlEnd)
    this.controls.addEventListener('change', this.handleControlChange)

    this.renderer.domElement.addEventListener('wheel', this.handleViewportWheel, {
      passive: false,
    })
    this.renderer.domElement.addEventListener('mousedown', this.handleMiddleMouseDown)
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown)
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove)
    window.addEventListener('pointerup', this.handlePointerUp)
    this.raycaster.layers.enable(MODEL_LAYER)

    this.ambientLight = new AmbientLight('#ffffff', 1.1)
    this.ambientLight.layers.enable(MODEL_LAYER)
    this.ambientLight.layers.enable(TRAIL_LAYER)
    this.hemiLight = new HemisphereLight('#ffffff', '#efefef', 0.9)
    this.hemiLight.layers.enable(MODEL_LAYER)
    this.hemiLight.layers.enable(TRAIL_LAYER)
    this.directionalLight = new DirectionalLight('#ffffff', 2.4)
    this.directionalLight.layers.enable(MODEL_LAYER)
    this.directionalLight.layers.enable(TRAIL_LAYER)
    this.directionalLight.castShadow = true
    this.directionalLight.shadow.mapSize.set(1024, 1024)
    this.directionalLight.shadow.bias = -0.00035
    this.directionalLight.shadow.normalBias = 0.02

    this.spotLight = new SpotLight('#ffffff', 2.4, 0, Math.PI / 5.6, 0.25, 1.2)
    this.spotLight.layers.enable(MODEL_LAYER)
    this.spotLight.layers.enable(TRAIL_LAYER)
    this.spotLight.castShadow = true
    this.spotLight.target.position.set(0, 0, 0)
    this.spotLight.shadow.mapSize.set(1024, 1024)
    this.spotLight.shadow.bias = -0.00025
    this.spotLight.shadow.normalBias = 0.02

    this.sunLight = new DirectionalLight('#fff7dd', 2.8)
    this.sunLight.layers.enable(MODEL_LAYER)
    this.sunLight.layers.enable(TRAIL_LAYER)
    this.sunLight.castShadow = true
    this.sunLight.shadow.mapSize.set(1024, 1024)
    this.sunLight.shadow.bias = -0.00035
    this.sunLight.shadow.normalBias = 0.03

    this.fillLight = new PointLight('#ffffff', 1.2, 0, 2)
    this.fillLight.layers.enable(MODEL_LAYER)
    this.fillLight.layers.enable(TRAIL_LAYER)
    this.fillLight.position.set(-7, 4, -6)

    const floorMaterial = new ShadowMaterial({
      color: '#000000',
      opacity: 0.2,
    })
    this.floorShadow = new Mesh(new PlaneGeometry(1, 1), floorMaterial)
    this.floorShadow.rotation.x = -Math.PI / 2
    this.floorShadow.receiveShadow = true

    this.scene.add(
      this.ambientLight,
      this.hemiLight,
      this.directionalLight,
      this.directionalLight.target,
      this.sunLight,
      this.sunLight.target,
      this.spotLight,
      this.spotLight.target,
      this.fillLight,
      this.floorShadow,
      this.modelRoot,
      this.motionTrailRoot,
    )

    this.updateShadowSoftness(this.shadowSoftness)
    this.applyBackgroundColor()
    this.setAntialiasEnabled(DEFAULT_ANTIALIAS_ENABLED)
    this.updateLightSettings(DEFAULT_LIGHT_SETTINGS)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.requestRender()
  }

  setModel(object: Object3D, bounds: Box3) {
    disposeSmoothCaches(this.modelRoot)
    disposeObject(this.modelRoot)
    this.modelRoot.clear()
    this.clearMotionTrail()
    this.modelRoot.add(object)
    this.originalModel = cloneModelSnapshot(object)
    this.modelBounds.copy(bounds)
    this.modelOffset.set(0, 0, 0)
    this.motionVector.set(0, 0, 0)
    this.motionBlurSettings = {
      ...this.motionBlurSettings,
      axisX: 0,
      axisY: 0,
      axisZ: 0,
      enabled: false,
      mode: 'trail',
    }
    this.undoStack = []
    this.pendingUndoSnapshot = null

    this.prepareModelForPreview(this.modelRoot)
    this.applySmoothShading(this.modelRoot)
    this.modelBounds.getCenter(MODEL_BOUNDS_CENTER)
    this.modelBaseCenter.copy(MODEL_BOUNDS_CENTER)
    this.modelCenter.copy(this.modelBaseCenter)
    this.modelBounds.getSize(MODEL_BOUNDS_SIZE)
    this.modelFloorY =
      bounds.min.y - Math.max(MODEL_BOUNDS_SIZE.y * 0.03, 0.02)
    this.lightRadius = Math.max(MODEL_BOUNDS_SIZE.length() * 1.15, 12)
    this.rebuildWireOverlay()
    this.applyWireframeSettings()
    this.updateFloor()
    this.frameModel(bounds)
    this.updateLightSettings(this.lightSettings)
    this.updateMotionTrail()
  }

  applySurface(surface: SurfaceState) {
    applySurfaceToObject(this.modelRoot, surface)
    this.applySmoothShading(this.modelRoot)
    this.applyWireframeSettings()
    if (this.motionBlurSettings.enabled) {
      this.scheduleMotionTrailRefresh(140)
    }
    this.requestRender()
  }

  restoreOriginalMaterial() {
    if (!this.originalModel) {
      return
    }

    disposeSmoothCaches(this.modelRoot)
    disposeObject(this.modelRoot)
    this.modelRoot.clear()
    const restored = cloneModelSnapshot(this.originalModel)
    this.modelRoot.add(restored)
    this.prepareModelForPreview(this.modelRoot)
    this.applySmoothShading(this.modelRoot)
    this.rebuildWireOverlay()
    this.applyWireframeSettings()
    if (this.motionBlurSettings.enabled) {
      this.clearMotionTrail()
      this.updateMotionTrail()
    }
    this.requestRender()
  }

  getModelStats() {
    return collectObjectStats(this.modelRoot)
  }

  resetView() {
    this.beginUndoCapture()
    this.camera.position
      .copy(CAMERA_OFFSET)
      .multiplyScalar(this.homeDistance)
      .add(this.modelCenter)
    this.controls.target.copy(this.modelCenter)
    this.controls.update()
    this.commitUndoCapture()
  }

  undoLastChange() {
    const snapshot = this.undoStack.pop()

    if (!snapshot) {
      return false
    }

    this.applySnapshot(snapshot)
    return false
  }

  setBackgroundColor(color: string) {
    this.backgroundColor = color
    this.applyBackgroundColor()
    this.requestRender()
  }

  setShadowSoftness(value: number) {
    this.shadowSoftness = Math.min(Math.max(value, 0), 1)
    this.updateShadowSoftness(this.shadowSoftness)
    this.requestRender()
  }

  setShadowEnabled(enabled: boolean) {
    this.shadowEnabled = enabled
    this.renderer.shadowMap.enabled = enabled
    this.directionalLight.castShadow = enabled
    this.sunLight.castShadow = enabled
    this.spotLight.castShadow = enabled
    this.floorShadow.visible =
      enabled &&
      (this.lightSettings.type === 'studio' ||
        this.lightSettings.type === 'sun' ||
        this.lightSettings.type === 'spot')
    this.requestRender()
  }

  setAntialiasEnabled(enabled: boolean) {
    this.antialiasEnabled = enabled
    this.applyRenderQuality()
    this.requestRender()
  }

  setWireframe(enabled: boolean) {
    this.wireframeSettings = {
      ...this.wireframeSettings,
      enabled,
    }
    this.applyWireframeSettings()
    this.requestRender()
  }

  setWireframeStyle(color: string, thickness: number) {
    this.wireframeSettings = {
      ...this.wireframeSettings,
      color,
      thickness,
    }
    this.applyWireframeSettings()
    this.requestRender()
  }

  setWireframeSurfaceVisibility(showModel: boolean) {
    this.wireframeSettings = {
      ...this.wireframeSettings,
      showModel,
    }
    this.applyWireframeSettings()
    this.requestRender()
  }

  setSmoothShadingEnabled(enabled: boolean) {
    this.smoothShadingEnabled = enabled
    this.applySmoothShading(this.modelRoot)
    this.rebuildWireOverlay()
    this.applyWireframeSettings()
    if (this.motionBlurSettings.enabled) {
      this.clearMotionTrail()
      this.updateMotionTrail()
    }
    this.requestRender()
  }

  setMotionBlurSettings(settings: ViewMotionBlurSettings) {
    const preservedCameraPosition = this.camera.position.clone()
    const preservedControlTarget = this.controls.target.clone()
    const wasEnabled = this.motionBlurSettings.enabled
    const axisChanged =
      Math.abs(this.motionBlurSettings.axisX - settings.axisX) > 0.0001 ||
      Math.abs(this.motionBlurSettings.axisY - settings.axisY) > 0.0001 ||
      Math.abs(this.motionBlurSettings.axisZ - settings.axisZ) > 0.0001

    const nextAxisX =
      settings.enabled &&
      Math.abs(settings.axisX) < 0.0001 &&
      Math.abs(settings.axisY) < 0.0001 &&
      Math.abs(settings.axisZ) < 0.0001
        ? 0.1
        : settings.axisX

    this.motionBlurSettings = {
      axisX: Math.min(Math.max(nextAxisX, -1), 1),
      axisY: Math.min(Math.max(settings.axisY, -1), 1),
      axisZ: Math.min(Math.max(settings.axisZ, -1), 1),
      distance: Math.min(Math.max(settings.distance, 0), 2),
      enabled: settings.enabled,
      gaussian: Math.min(Math.max(settings.gaussian, 0), 1),
      intensity: Math.min(Math.max(settings.intensity, 0), 1),
      mode: settings.mode,
      strobe: Math.min(Math.max(settings.strobe, 0), 1),
    }
    this.motionVector.set(
      this.motionBlurSettings.axisX,
      this.motionBlurSettings.axisY,
      this.motionBlurSettings.axisZ,
    )

    if (wasEnabled && !this.motionBlurSettings.enabled) {
      if (this.motionTrailRefreshTimer !== null) {
        window.clearTimeout(this.motionTrailRefreshTimer)
        this.motionTrailRefreshTimer = null
      }
      this.motionTrailRoot.visible = false
      this.setBaseModelVisible(true)
      this.requestRender()
      window.setTimeout(() => {
        this.clearMotionTrail()
        this.motionTrailRoot.visible = true
      }, 0)
      this.camera.position.copy(preservedCameraPosition)
      this.controls.target.copy(preservedControlTarget)
      this.controls.update()
      return
    }

    if (axisChanged) {
      this.camera.getWorldDirection(CAMERA_DIRECTION).normalize()
      CAMERA_RIGHT.crossVectors(CAMERA_DIRECTION, this.camera.up).normalize()
      CAMERA_UP.copy(this.camera.up).normalize()

      this.motionWorldVector
        .set(0, 0, 0)
        .addScaledVector(CAMERA_RIGHT, this.motionVector.x)
        .addScaledVector(CAMERA_UP, this.motionVector.y)
        .addScaledVector(CAMERA_DIRECTION, this.motionVector.z)
    }

    this.updateMotionTrail()
    this.camera.position.copy(preservedCameraPosition)
    this.controls.target.copy(preservedControlTarget)
    this.controls.update()
  }

  updateLightSettings(settings: ViewLightSettings) {
    this.lightSettings = settings

    const radius = this.lightRadius
    const isStudio = settings.type === 'studio'
    const isSun = settings.type === 'sun'
    const isSpot = settings.type === 'spot'

    const azimuth = settings.turn * DEG_TO_RAD
    const elevation = settings.lift * DEG_TO_RAD
    LIGHT_DIRECTION_OFFSET.set(
      Math.cos(elevation) * Math.cos(azimuth),
      Math.sin(elevation),
      Math.cos(elevation) * Math.sin(azimuth),
    )
      .normalize()
      .multiplyScalar(radius)

    this.ambientLight.visible = isStudio
    this.hemiLight.visible = isStudio || isSun
    this.directionalLight.visible = isStudio
    this.sunLight.visible = isSun
    this.spotLight.visible = isSpot
    this.fillLight.visible = isStudio
    this.floorShadow.visible = this.shadowEnabled && (isStudio || isSun || isSpot)

    this.ambientLight.intensity = isStudio ? 0.94 : isSun ? 0.12 : 0.08
    this.hemiLight.intensity = isStudio ? 1.06 : isSun ? 0.48 : 0.1
    this.directionalLight.intensity = isStudio ? settings.intensity * 1.22 : 0
    this.sunLight.intensity = isSun ? settings.intensity * 1.74 : 0
    this.spotLight.intensity = isSpot ? settings.intensity * 1.82 : 0
    this.fillLight.intensity = isStudio ? settings.intensity * 0.68 : isSpot ? settings.intensity * 0.18 : 0

    this.directionalLight.position.copy(this.modelCenter).add(LIGHT_DIRECTION_OFFSET)
    this.sunLight.position.copy(this.modelCenter).add(LIGHT_DIRECTION_OFFSET)
    this.spotLight.position.copy(this.modelCenter).add(LIGHT_DIRECTION_OFFSET)
    this.fillLight.position.copy(this.modelCenter).addScaledVector(LIGHT_DIRECTION_OFFSET, -0.45)
    this.fillLight.position.y = Math.max(
      this.modelCenter.y + radius * 0.28,
      this.modelFloorY + radius * 0.2,
    )

    this.directionalLight.target.position.copy(this.modelCenter)
    this.sunLight.target.position.copy(this.modelCenter)
    this.spotLight.target.position.copy(this.modelCenter)
    this.spotLight.distance = radius * 4.4
    this.spotLight.angle = isSpot ? Math.PI / 7 : Math.PI / 5.6
    this.spotLight.penumbra = isSpot ? 0.62 : 0.25
    this.spotLight.decay = isSpot ? 1.55 : 1.2

    this.renderer.toneMappingExposure = isSpot ? 1.02 : isSun ? 1.06 : 1.1
    this.bloomPass.strength = settings.bloom * (isSpot ? 2.4 : isSun ? 1.8 : 1.5)
    this.bloomPass.radius = 0.2 + settings.bloom * 0.42
    this.bloomPass.threshold = isSpot ? 0.62 : isSun ? 0.68 : 0.72

    this.directionalLight.target.updateMatrixWorld()
    this.sunLight.target.updateMatrixWorld()
    this.spotLight.target.updateMatrixWorld()
    this.updateShadowCamera()
    this.requestRender()
  }

  async exportBinaryGlb(options?: { bakedMapCanvas?: HTMLCanvasElement | null }) {
    if (this.modelRoot.children.length === 0) {
      throw new Error('Export icin once model yukle.')
    }

    const exporter = new GLTFExporter()
    const exportRoot = cloneRenderableSnapshot(this.modelRoot)

    if (options?.bakedMapCanvas) {
      const bakedMapCanvas = options.bakedMapCanvas
      exportRoot.traverse((child) => {
        if (!(child instanceof Mesh) || child.userData.ngonWireOverlay) {
          return
        }

        const material = child.material
        if (Array.isArray(material)) {
          material.forEach((entry) => applyEmbeddedBakeMaterial(entry, bakedMapCanvas))
        } else {
          applyEmbeddedBakeMaterial(material, bakedMapCanvas)
        }
      })
    }

    return new Promise<ArrayBuffer>((resolve, reject) => {
      exporter.parse(
        exportRoot,
        (result) => {
          disposeObject(exportRoot)

          if (result instanceof ArrayBuffer) {
            resolve(result)
            return
          }

          reject(new Error('GLB export binary cikti uretmedi.'))
        },
        (error) => {
          disposeObject(exportRoot)
          reject(
            error instanceof Error
              ? error
              : new Error('GLB export sirasinda hata olustu.'),
          )
        },
        {
          binary: true,
          maxTextureSize: 2048,
          onlyVisible: true,
        },
      )
    })
  }

  async exportPreviewImage(options: ViewImageExportOptions) {
    const finalWidth = Math.max(1, Math.round(options.width))
    const finalHeight = Math.max(1, Math.round(options.height))
    const renderWidth = finalWidth
    const renderHeight = finalHeight
    const previewBackground = this.resolveBackgroundColor()

    this.camera.aspect = renderWidth / renderHeight
    this.camera.updateProjectionMatrix()
    this.syncRenderTargets(renderWidth, renderHeight, 1)
    this.renderScene(this.composer)
    const colorCanvas = resizeCanvas(cloneCanvas(this.renderer.domElement), finalWidth, finalHeight)

    try {
      if (options.format === 'jpg') {
        const bytes = await canvasToArrayBuffer(colorCanvas, 'jpg')
        return applyImageDpiMetadata(bytes, 'jpg', options.dpi)
      }

      const maskRenderer = new WebGLRenderer({
        antialias: false,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      })
      maskRenderer.setPixelRatio(1)
      maskRenderer.setSize(renderWidth, renderHeight, false)
      maskRenderer.setClearColor(0x000000, 0)

      const previousMask = this.camera.layers.mask
      const previousBackground = this.scene.background
      const previousOverrideMaterial = this.scene.overrideMaterial
      const maskMaterial = new MeshBasicMaterial({
        color: 0xffffff,
        fog: false,
        toneMapped: false,
      })

      try {
        this.scene.background = null
        this.scene.overrideMaterial = maskMaterial
        this.camera.layers.disable(0)
        this.camera.layers.enable(MODEL_LAYER)
        this.camera.layers.enable(TRAIL_LAYER)
        maskRenderer.render(this.scene, this.camera)

        const transparentCanvas = await removeFlatBackgroundFromCanvas(
          colorCanvas,
          previewBackground,
          resizeCanvas(cloneCanvas(maskRenderer.domElement), finalWidth, finalHeight),
        )
        const bytes = await canvasToArrayBuffer(transparentCanvas, 'png')
        return applyImageDpiMetadata(bytes, 'png', options.dpi)
      } finally {
        this.scene.overrideMaterial = previousOverrideMaterial
        this.scene.background = previousBackground
        this.camera.layers.mask = previousMask
        maskMaterial.dispose()
        maskRenderer.dispose()
      }
    } finally {
      this.resize()
      this.requestRender()
    }
  }

  exportObjText() {
    if (this.modelRoot.children.length === 0) {
      throw new Error('Export icin once model yukle.')
    }

    const exportRoot = cloneRenderableSnapshot(this.modelRoot)
    const output = new OBJExporter().parse(exportRoot)
    disposeObject(exportRoot)
    return output
  }

  exportObjPackage(options?: {
    bakedMapCanvas?: HTMLCanvasElement | null
    bakedTextureFileName?: string | null
    materialName?: string
    mtlFileName?: string
  }) {
    if (this.modelRoot.children.length === 0) {
      throw new Error('Export icin once model yukle.')
    }

    const exportRoot = cloneRenderableSnapshot(this.modelRoot)
    const materialName = options?.materialName ?? 'ngon_bake_material'
    const mtlFileName = options?.mtlFileName ?? 'materials.mtl'
    let shouldWriteMtl = false

    if (options?.bakedMapCanvas) {
      const bakedMapCanvas = options.bakedMapCanvas
      exportRoot.traverse((child) => {
        if (!(child instanceof Mesh) || child.userData.ngonWireOverlay) {
          return
        }

        const material = child.material
        if (Array.isArray(material)) {
          material.forEach((entry) => {
            applyEmbeddedBakeMaterial(entry, bakedMapCanvas)
            assignMaterialName(entry, materialName)
          })
        } else {
          applyEmbeddedBakeMaterial(material, bakedMapCanvas)
          assignMaterialName(material, materialName)
        }

        shouldWriteMtl = true
      })
    }

    let objText = new OBJExporter().parse(exportRoot)
    disposeObject(exportRoot)

    if (shouldWriteMtl) {
      objText = `mtllib ${mtlFileName}\n${objText}`
    }

    const mtlText =
      shouldWriteMtl && options?.bakedTextureFileName
        ? [
            `newmtl ${materialName}`,
            'Ka 1.000000 1.000000 1.000000',
            'Kd 1.000000 1.000000 1.000000',
            'Ks 0.000000 0.000000 0.000000',
            'Ns 10.000000',
            'd 1.000000',
            'illum 2',
            `map_Kd ${options.bakedTextureFileName}`,
            '',
          ].join('\n')
        : null

    return {
      mtlText,
      objText,
    }
  }

  dispose() {
    cancelAnimationFrame(this.animationFrameId)
    this.controls.removeEventListener('start', this.handleControlStart)
    this.controls.removeEventListener('end', this.handleControlEnd)
    this.controls.removeEventListener('change', this.handleControlChange)
    this.controls.dispose()
    this.resizeObserver.disconnect()
    disposeObject(this.modelRoot)
    this.clearMotionTrail()
    this.renderer.domElement.removeEventListener('wheel', this.handleViewportWheel)
    this.renderer.domElement.removeEventListener('mousedown', this.handleMiddleMouseDown)
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown)
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove)
    window.removeEventListener('pointerup', this.handlePointerUp)
    this.floorShadow.geometry.dispose()
    if (Array.isArray(this.floorShadow.material)) {
      this.floorShadow.material.forEach((material) => material.dispose())
    } else {
      this.floorShadow.material.dispose()
    }
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private requestRender() {
    if (this.renderQueued) {
      return
    }

    this.renderQueued = true
    this.animationFrameId = window.requestAnimationFrame(() => {
      this.renderQueued = false
      this.renderScene(this.composer)
    })
  }

  private beginUndoCapture() {
    this.pendingUndoSnapshot = this.captureSnapshot()
  }

  private commitUndoCapture() {
    if (!this.pendingUndoSnapshot) {
      return
    }

    const currentSnapshot = this.captureSnapshot()
    if (!viewSnapshotEqual(this.pendingUndoSnapshot, currentSnapshot)) {
      this.undoStack.push(this.pendingUndoSnapshot)
      if (this.undoStack.length > MAX_UNDO_ENTRIES) {
        this.undoStack.shift()
      }
    }

    this.pendingUndoSnapshot = null
  }

  private captureSnapshot(): ViewSnapshot {
    return {
      cameraPosition: [
        this.camera.position.x,
        this.camera.position.y,
        this.camera.position.z,
      ],
      controlTarget: [
        this.controls.target.x,
        this.controls.target.y,
        this.controls.target.z,
      ],
      modelOffset: [this.modelOffset.x, this.modelOffset.y, this.modelOffset.z],
      motionVector: [this.motionVector.x, this.motionVector.y, this.motionVector.z],
    }
  }

  private applySnapshot(snapshot: ViewSnapshot) {
    this.camera.position.fromArray(snapshot.cameraPosition)
    this.controls.target.fromArray(snapshot.controlTarget)
    this.setModelOffset(new Vector3().fromArray(snapshot.modelOffset))
    this.motionVector.fromArray(snapshot.motionVector)
    this.motionBlurSettings = {
      ...this.motionBlurSettings,
      axisX: this.motionVector.x,
      axisY: this.motionVector.y,
      axisZ: this.motionVector.z,
    }

    this.updateMotionTrail()

    this.controls.update()
    this.requestRender()
  }

  private applyBackgroundColor() {
    const background = this.resolveBackgroundColor()
    this.scene.background = background
    const floorMaterial = this.floorShadow.material
    if (!Array.isArray(floorMaterial)) {
      floorMaterial.opacity =
        (getColorLuminance(background) > 0.9 ? 0.3 : 0.24) -
        this.shadowSoftness * 0.1
    }
  }

  private resolveBackgroundColor() {
    const background = new Color(this.backgroundColor)

    if (getColorLuminance(background) > 0.97) {
      background.lerp(OFF_WHITE_BACKGROUND, 0.72)
    }

    return background
  }

  private renderScene(composer: EffectComposer) {
    this.applyBackgroundColor()
    const previousMask = this.camera.layers.mask
    this.camera.layers.enable(0)
    this.camera.layers.enable(MODEL_LAYER)
    this.camera.layers.enable(TRAIL_LAYER)
    composer.render()
    this.camera.layers.mask = previousMask
  }

  private syncRenderTargets(width: number, height: number, pixelRatio: number) {
    const basePixelRatio = pixelRatio
    this.renderer.setPixelRatio(basePixelRatio)
    this.renderer.setSize(width, height, false)
    this.composer.setPixelRatio(basePixelRatio)
    this.composer.setSize(width, height)
    this.bloomPass.setSize(width, height)
    this.modelRoot.traverse((child) => {
      if (!child.userData.ngonWireOverlay) {
        return
      }

      const material = (child as Object3D & { material?: unknown }).material
      if (material instanceof LineMaterial) {
        material.resolution.set(width, height)
      }
    })
    this.fxaaPass.enabled = this.antialiasEnabled
    this.fxaaPass.material.uniforms.resolution.value.set(
      1 / (width * basePixelRatio),
      1 / (height * basePixelRatio),
    )
  }

  private applyRenderQuality() {
    const width = Math.max(this.container.clientWidth, 320)
    const height = Math.max(this.container.clientHeight, 320)
    const basePixelRatio = this.antialiasEnabled
      ? Math.min(window.devicePixelRatio, 1.2)
      : 1
    this.syncRenderTargets(width, height, basePixelRatio)
  }

  private setBaseModelVisible(visible: boolean) {
    this.modelRoot.traverse((child) => {
      if (!(child instanceof Mesh) || child.userData.ngonWireOverlay) {
        return
      }

      const material = child.material
      if (Array.isArray(material)) {
        material.forEach((entry) => setRenderableMaterialVisibility(entry, visible))
      } else {
        setRenderableMaterialVisibility(material, visible)
      }
    })
  }

  private prepareModelForPreview(object: Object3D) {
    object.traverse((child) => {
      if (!('castShadow' in child) || !('receiveShadow' in child)) {
        return
      }

      child.castShadow = true
      child.receiveShadow = true
      child.layers.set(MODEL_LAYER)
    })
  }

  private applySmoothShading(object: Object3D) {
    object.traverse((child) => {
      if (!(child instanceof Mesh) || child.userData.ngonWireOverlay) {
        return
      }

      const currentGeometry = child.geometry
      if (!(currentGeometry instanceof BufferGeometry)) {
        return
      }

      let baseGeometry = child.userData.ngonSmoothBaseGeometry as BufferGeometry | undefined
      if (!baseGeometry) {
        baseGeometry = currentGeometry.clone()
        child.userData.ngonSmoothBaseGeometry = baseGeometry
      }

      let smoothGeometry = child.userData.ngonSmoothGeometry as BufferGeometry | undefined
      if (!smoothGeometry) {
        smoothGeometry = createFullySmoothedGeometry(baseGeometry)
        child.userData.ngonSmoothGeometry = smoothGeometry
      }

      const targetGeometry = this.smoothShadingEnabled ? smoothGeometry : baseGeometry
      if (child.geometry !== targetGeometry) {
        child.geometry = targetGeometry
      }

      const material = child.material
      if (Array.isArray(material)) {
        material.forEach((entry) =>
          setRenderableMaterialFlatShading(entry, !this.smoothShadingEnabled),
        )
      } else {
        setRenderableMaterialFlatShading(material, !this.smoothShadingEnabled)
      }
    })
  }

  private updateFloor() {
    this.floorShadow.scale.set(36000, 36000, 1)
    this.floorShadow.position.set(this.modelBaseCenter.x, this.modelFloorY, this.modelBaseCenter.z)
  }

  private updateShadowCamera() {
    const shadowSpan = Math.max(this.lightRadius * 2.8, 40)
    this.directionalLight.shadow.camera.left = -shadowSpan
    this.directionalLight.shadow.camera.right = shadowSpan
    this.directionalLight.shadow.camera.top = shadowSpan
    this.directionalLight.shadow.camera.bottom = -shadowSpan
    this.directionalLight.shadow.camera.near = 0.5
    this.directionalLight.shadow.camera.far = shadowSpan * 4.5
    this.directionalLight.shadow.camera.updateProjectionMatrix()

    this.sunLight.shadow.camera.left = -shadowSpan
    this.sunLight.shadow.camera.right = shadowSpan
    this.sunLight.shadow.camera.top = shadowSpan
    this.sunLight.shadow.camera.bottom = -shadowSpan
    this.sunLight.shadow.camera.near = 0.5
    this.sunLight.shadow.camera.far = shadowSpan * 4.5
    this.sunLight.shadow.camera.updateProjectionMatrix()

    this.spotLight.shadow.camera.near = 0.5
    this.spotLight.shadow.camera.far = this.lightRadius * 8
    this.spotLight.shadow.camera.updateProjectionMatrix()
  }

  private updateShadowSoftness(value: number) {
    const softness = Math.min(Math.max(value, 0), 1)
    const radius = 0.25 + softness * 8
    const floorMaterial = this.floorShadow.material

    this.directionalLight.shadow.radius = radius
    this.sunLight.shadow.radius = radius
    this.spotLight.shadow.radius = radius

    this.directionalLight.shadow.needsUpdate = true
    this.sunLight.shadow.needsUpdate = true
    this.spotLight.shadow.needsUpdate = true

    if (!Array.isArray(floorMaterial)) {
      floorMaterial.opacity =
        (getColorLuminance(this.scene.background as Color) > 0.9 ? 0.3 : 0.24) -
        softness * 0.1
    }

    this.requestRender()
  }

  private rebuildWireOverlay() {
    this.modelRoot.traverse((child) => {
      if (!(child instanceof Mesh)) {
        return
      }

      const overlays = child.children.filter((entry) => entry.userData.ngonWireOverlay)

      overlays.forEach((overlay) => {
        child.remove(overlay)
        const wireSource = overlay.userData.ngonWireSource as
          | {
              edges?: { dispose?: () => void }
              wireGeometry?: { dispose?: () => void }
            }
          | undefined
        wireSource?.edges?.dispose?.()
        wireSource?.wireGeometry?.dispose?.()

        const material = (overlay as Object3D & { material?: unknown }).material
        if (Array.isArray(material)) {
          material.forEach((entry) => entry?.dispose?.())
        } else if (material && typeof material === 'object' && 'dispose' in material) {
          ;(material as { dispose?: () => void }).dispose?.()
        }
      })
    })

    this.modelRoot.traverse((child) => {
      if (!(child instanceof Mesh) || child.userData.ngonWireOverlay) {
        return
      }

      const edges = new EdgesGeometry(child.geometry, 1)
      const positions = edges.getAttribute('position')

      if (!positions) {
        edges.dispose()
        return
      }

      const wireGeometry = new LineSegmentsGeometry()
      wireGeometry.setPositions(Array.from(positions.array as ArrayLike<number>))

      const wireMaterial = new LineMaterial({
        color: this.wireframeSettings.color,
        dashed: false,
        depthTest: false,
        transparent: true,
        linewidth: this.wireframeSettings.thickness,
      })
      wireMaterial.resolution.set(
        Math.max(this.container.clientWidth, 1),
        Math.max(this.container.clientHeight, 1),
      )

      const wireMesh = new LineSegments2(wireGeometry, wireMaterial)
      wireMesh.userData.ngonWireOverlay = true
      wireMesh.userData.ngonWireSource = {
        edges,
        wireGeometry,
      }
      wireMesh.layers.set(MODEL_LAYER)
      wireMesh.renderOrder = 9
      wireMesh.visible = this.wireframeSettings.enabled
      child.add(wireMesh)
    })
  }

  private applyWireframeSettings() {
    const showBaseModel =
      !this.wireframeSettings.enabled || this.wireframeSettings.showModel

    this.modelRoot.traverse((child) => {
      if (!(child instanceof Mesh) || child.userData.ngonWireOverlay) {
        return
      }

      const material = (child as Object3D & { material?: unknown }).material
      if (Array.isArray(material)) {
        material.forEach((entry) =>
          setRenderableMaterialVisibility(entry, showBaseModel),
        )
      } else {
        setRenderableMaterialVisibility(material, showBaseModel)
      }
    })

    this.modelRoot.traverse((child) => {
      if (!child.userData.ngonWireOverlay) {
        return
      }

      const material = (child as Object3D & { material?: unknown }).material
      if (material instanceof LineMaterial) {
        material.color.set(this.wireframeSettings.color)
        material.linewidth = this.wireframeSettings.thickness
        material.resolution.set(
          Math.max(this.container.clientWidth, 1),
          Math.max(this.container.clientHeight, 1),
        )
        material.needsUpdate = true
      }

      child.visible = this.wireframeSettings.enabled
    })
  }

  private clearMotionTrail() {
    if (this.motionTrailRefreshTimer !== null) {
      window.clearTimeout(this.motionTrailRefreshTimer)
      this.motionTrailRefreshTimer = null
    }
    const ghosts = [...this.motionTrailRoot.children]
    ghosts.forEach((ghost) => {
      this.motionTrailRoot.remove(ghost)
      disposeObject(ghost)
    })
  }

  private scheduleMotionTrailRefresh(delayMs = 90) {
    if (this.motionTrailRefreshTimer !== null) {
      window.clearTimeout(this.motionTrailRefreshTimer)
    }

    this.motionTrailRefreshTimer = window.setTimeout(() => {
      this.motionTrailRefreshTimer = null
      this.clearMotionTrail()
      this.updateMotionTrail()
    }, delayMs)
  }

  private ensureMotionTrailCopies(copyCount: number) {
    while (this.motionTrailRoot.children.length > copyCount) {
      const ghost = this.motionTrailRoot.children[this.motionTrailRoot.children.length - 1]
      this.motionTrailRoot.remove(ghost)
      disposeObject(ghost)
    }

    while (this.motionTrailRoot.children.length < copyCount) {
      const clone = cloneRenderableSnapshot(this.modelRoot)
      clone.traverse((child) => {
        child.layers.set(TRAIL_LAYER)
        child.castShadow = false
        child.receiveShadow = false

        if (!(child instanceof Mesh) || child.userData.ngonWireOverlay) {
          return
        }

        const material = child.material
        if (Array.isArray(material)) {
          child.material = material.map((entry) => cloneMaterialValue(entry))
          ;(child.material as unknown[]).forEach((entry: unknown) =>
            setRenderableMaterialVisibility(entry, true),
          )
        } else {
          child.material = cloneMaterialValue(material)
          setRenderableMaterialVisibility(child.material, true)
        }
      })
      this.motionTrailRoot.add(clone)
    }
  }

  private updateMotionTrail() {
    const hasDirection =
      Math.abs(this.motionVector.x) > 0.0001 ||
      Math.abs(this.motionVector.y) > 0.0001 ||
      Math.abs(this.motionVector.z) > 0.0001

    if (!this.motionBlurSettings.enabled || !hasDirection) {
      this.clearMotionTrail()
      this.setBaseModelVisible(true)
      this.requestRender()
      return
    }

    if (this.motionWorldVector.lengthSq() <= 0.000001) {
      this.clearMotionTrail()
      this.setBaseModelVisible(true)
      this.requestRender()
      return
    }

    this.setBaseModelVisible(true)

    const worldAxis = this.motionWorldVector.clone().normalize()
    const gaussianWeight = this.motionBlurSettings.gaussian
    const silhouetteMode = this.motionBlurSettings.mode === 'silhouette'
    const smearMode = this.motionBlurSettings.mode === 'smear'
    const copyCount =
      (silhouetteMode ? 28 : smearMode ? 16 : 10) +
      Math.round(
        this.motionBlurSettings.strobe * (silhouetteMode ? 32 : smearMode ? 24 : 20),
      ) +
      Math.round(gaussianWeight * (silhouetteMode ? 18 : smearMode ? 14 : 12))
    const distanceScale =
      silhouetteMode
        ? (0.08 + this.motionBlurSettings.distance * (2.1 + gaussianWeight * 0.8)) *
          (this.homeDistance * 0.08)
        : smearMode
        ? (0.04 + this.motionBlurSettings.distance * (1.8 + gaussianWeight * 1.2)) *
          (this.homeDistance * 0.11)
        : (0.16 + this.motionBlurSettings.distance * (6.2 + gaussianWeight * 3.4)) *
          (this.homeDistance * 0.16)
    const opacityScale =
      silhouetteMode
        ? (0.12 + this.motionBlurSettings.intensity * 0.22) *
          (1.45 + gaussianWeight * 1.35)
        : smearMode
        ? (0.05 + this.motionBlurSettings.intensity * 0.11) *
          (1.15 + gaussianWeight * 0.95)
        : (0.034 + this.motionBlurSettings.intensity * 0.085) *
          (0.95 + gaussianWeight * 0.8)
    const trailSpread = silhouetteMode
      ? 0.34 + gaussianWeight * 0.14
      : smearMode
      ? 0.28 + gaussianWeight * 0.18
      : 1 + gaussianWeight * 0.38

    this.ensureMotionTrailCopies(copyCount)

    for (let index = 0; index < copyCount; index += 1) {
      const clone = this.motionTrailRoot.children[index]
      const linearProgress = (index + 1) / copyCount
      const progress = silhouetteMode
        ? Math.pow(linearProgress, 2.25) * 0.34
        : smearMode
        ? Math.pow(linearProgress, 2.6) * 0.42
        : linearProgress
      clone.position.copy(this.modelRoot.position).addScaledVector(
        worldAxis,
        distanceScale * progress * trailSpread,
      )

      clone.traverse((child) => {
        child.layers.set(TRAIL_LAYER)
        child.castShadow = false
        child.receiveShadow = false

        if (!(child instanceof Mesh) || child.userData.ngonWireOverlay) {
          return
        }

        const gaussianFalloff = silhouetteMode
          ? Math.pow(1 - progress / 0.34, 1.45 + gaussianWeight * 1.2)
          : smearMode
          ? Math.pow(1 - progress / 0.42, 2.8 + gaussianWeight * 2.4)
          : Math.pow(1 - progress, 2.35 + gaussianWeight * 4.6)
        const opacity = Math.max(
          silhouetteMode ? 0.028 : smearMode ? 0.014 : 0.009,
          gaussianFalloff * opacityScale,
        )
        const material = child.material

        if (Array.isArray(material)) {
          material.forEach((entry) => setGhostMaterialStyle(entry, opacity))
        } else {
          setGhostMaterialStyle(child.material, opacity)
        }
      })

      const ghostScale = silhouetteMode
        ? 1 - progress * (0.18 + gaussianWeight * 0.06)
        : smearMode
        ? 1 - progress * (0.06 + gaussianWeight * 0.03)
        : 1 + gaussianWeight * progress * 0.028
      clone.scale.copy(this.modelRoot.scale).multiplyScalar(ghostScale)
    }

    this.requestRender()
  }

  private setModelOffset(nextOffset: Vector3) {
    this.modelOffset.copy(nextOffset)
    this.modelRoot.position.copy(this.modelOffset)
    this.modelCenter.copy(this.modelBaseCenter).add(this.modelOffset)
    this.controls.target.copy(this.modelCenter)
    this.updateLightSettings(this.lightSettings)

    if (
      Math.abs(this.motionVector.x) > 0.0001 ||
      Math.abs(this.motionVector.y) > 0.0001 ||
      Math.abs(this.motionVector.z) > 0.0001
    ) {
      this.updateMotionTrail()
    }

    this.controls.update()
    this.requestRender()
  }

  private pickModelMesh(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.dragPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.dragPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.dragPointer, this.camera)

    const hits = this.raycaster.intersectObjects(this.modelRoot.children, true)
    return hits.find(
      (hit) => hit.object instanceof Mesh && !hit.object.userData.ngonWireOverlay,
    )
  }

  private frameModel(bounds: Box3) {
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    const maxDimension = Math.max(size.x, size.y, size.z, 1)
    const distance = maxDimension * 1.7
    this.homeDistance = distance

    this.camera.near = Math.max(distance / 100, 0.01)
    this.camera.far = Math.max(distance * 30, 200)
    this.camera.position.copy(CAMERA_OFFSET.clone().multiplyScalar(distance).add(center))
    this.camera.updateProjectionMatrix()

    this.controls.target.copy(center)
    this.controls.maxDistance = Infinity
    this.controls.minDistance = 0
    this.controls.update()
    this.requestRender()
  }

  private resize() {
    const width = Math.max(this.container.clientWidth, 320)
    const height = Math.max(this.container.clientHeight, 320)

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.applyRenderQuality()
    this.requestRender()
  }
}
