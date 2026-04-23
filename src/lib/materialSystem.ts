import {
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshPhysicalMaterial,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
} from 'three'

export type MaterialPresetKey = 'gold' | 'obsidian' | 'ice' | 'concrete'
export type SurfaceMapSlot =
  | 'diffuse'
  | 'reflection'
  | 'refraction'
  | 'bump'
  | 'roughness'
  | 'metallic'
  | 'normal'

export type LoadedTextureMap = {
  name: string
  texture: CanvasTexture
}

export type SurfaceMapSet = Record<SurfaceMapSlot, LoadedTextureMap | null>

export type SurfaceState = {
  bump: number
  coating: number
  coatingColor: string
  diffuseColor: string
  foliage: boolean
  leafSoftness: number
  maps: SurfaceMapSet
  opacityCut: number
  preset: MaterialPresetKey
  reflection: number
  refraction: number
  uvOffsetX: number
  uvOffsetY: number
  uvRotation: number
  uvScaleX: number
  uvScaleY: number
  uvTileLock: boolean
}

export type GeneratedBakeMaps = {
  base: HTMLCanvasElement | null
  combined: HTMLCanvasElement | null
}

type TextureSet = {
  bump: CanvasTexture
  color: CanvasTexture
  roughness: CanvasTexture
}

type MaterialPreset = {
  attenuationColor: string
  attenuationDistance: number
  baseColor: string
  bumpStrength: number
  coatingColor: string
  defaults: Pick<SurfaceState, 'bump' | 'coating' | 'reflection' | 'refraction'>
  label: string
  metalness: number
  roughness: number
  textureFactory: () => TextureSet
}

const MATERIAL_PRESETS: Record<MaterialPresetKey, MaterialPreset> = {
  gold: {
    attenuationColor: '#f7d87f',
    attenuationDistance: 4.5,
    baseColor: '#d6b24a',
    bumpStrength: 0.22,
    coatingColor: '#fff7cc',
    defaults: {
      reflection: 0.92,
      refraction: 0.04,
      bump: 0.18,
      coating: 0.22,
    },
    label: 'altin',
    metalness: 0.96,
    roughness: 0.24,
    textureFactory: () =>
      createPresetTextures(280, (ctx, size, rand) => {
        ctx.fillStyle = '#d4af37'
        ctx.fillRect(0, 0, size, size)

        for (let index = 0; index < 420; index += 1) {
          const x = rand() * size
          const width = 1 + rand() * 3
          const alpha = 0.05 + rand() * 0.12
          ctx.fillStyle = `rgba(255, 244, 201, ${alpha})`
          ctx.fillRect(x, 0, width, size)
        }

        for (let index = 0; index < 120; index += 1) {
          const y = rand() * size
          const alpha = 0.03 + rand() * 0.06
          ctx.fillStyle = `rgba(126, 83, 6, ${alpha})`
          ctx.fillRect(0, y, size, 1 + rand() * 1.5)
        }
      }),
  },
  obsidian: {
    attenuationColor: '#0c0b12',
    attenuationDistance: 2.8,
    baseColor: '#111016',
    bumpStrength: 0.12,
    coatingColor: '#a694ff',
    defaults: {
      reflection: 0.86,
      refraction: 0.1,
      bump: 0.12,
      coating: 0.88,
    },
    label: 'obsidian',
    metalness: 0.18,
    roughness: 0.1,
    textureFactory: () =>
      createPresetTextures(280, (ctx, size, rand) => {
        ctx.fillStyle = '#0b0a0f'
        ctx.fillRect(0, 0, size, size)

        for (let index = 0; index < 32; index += 1) {
          const startX = rand() * size
          const startY = rand() * size
          const endX = startX + (rand() - 0.5) * 180
          const endY = startY + (rand() - 0.5) * 180
          ctx.strokeStyle = `rgba(118, 103, 168, ${0.07 + rand() * 0.11})`
          ctx.lineWidth = 1 + rand() * 2
          ctx.beginPath()
          ctx.moveTo(startX, startY)
          ctx.quadraticCurveTo(
            startX + (rand() - 0.5) * 120,
            startY + (rand() - 0.5) * 120,
            endX,
            endY,
          )
          ctx.stroke()
        }

        for (let index = 0; index < 900; index += 1) {
          const x = rand() * size
          const y = rand() * size
          const alpha = 0.02 + rand() * 0.05
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
          ctx.fillRect(x, y, 1, 1)
        }
      }),
  },
  ice: {
    attenuationColor: '#d7f6ff',
    attenuationDistance: 0.95,
    baseColor: '#a8eeff',
    bumpStrength: 0.3,
    coatingColor: '#ffffff',
    defaults: {
      reflection: 0.72,
      refraction: 0.88,
      bump: 0.24,
      coating: 0.42,
    },
    label: 'ice',
    metalness: 0.02,
    roughness: 0.08,
    textureFactory: () =>
      createPresetTextures(320, (ctx, size, rand) => {
        const gradient = ctx.createLinearGradient(0, 0, size, size)
        gradient.addColorStop(0, '#d9fbff')
        gradient.addColorStop(0.48, '#8cdfff')
        gradient.addColorStop(1, '#5fb8df')
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, size, size)

        for (let index = 0; index < 48; index += 1) {
          const startX = rand() * size
          const startY = rand() * size
          const endX = startX + (rand() - 0.5) * 220
          const endY = startY + (rand() - 0.5) * 220
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.08 + rand() * 0.14})`
          ctx.lineWidth = 1 + rand() * 2.6
          ctx.beginPath()
          ctx.moveTo(startX, startY)
          ctx.lineTo(endX, endY)
          ctx.stroke()
        }

        for (let index = 0; index < 260; index += 1) {
          const radius = 6 + rand() * 26
          ctx.fillStyle = `rgba(255, 255, 255, ${0.03 + rand() * 0.04})`
          ctx.beginPath()
          ctx.arc(rand() * size, rand() * size, radius, 0, Math.PI * 2)
          ctx.fill()
        }
      }),
  },
  concrete: {
    attenuationColor: '#c0c0bc',
    attenuationDistance: 5.8,
    baseColor: '#b9b8b4',
    bumpStrength: 0.42,
    coatingColor: '#f0f0f0',
    defaults: {
      reflection: 0.22,
      refraction: 0.02,
      bump: 0.34,
      coating: 0.06,
    },
    label: 'concrete',
    metalness: 0.04,
    roughness: 0.92,
    textureFactory: () =>
      createPresetTextures(300, (ctx, size, rand) => {
        ctx.fillStyle = '#bebdb8'
        ctx.fillRect(0, 0, size, size)

        for (let index = 0; index < 2200; index += 1) {
          const value = 128 + Math.floor(rand() * 82)
          ctx.fillStyle = `rgb(${value}, ${value}, ${value - 8})`
          const radius = 1 + rand() * 2.4
          ctx.beginPath()
          ctx.arc(rand() * size, rand() * size, radius, 0, Math.PI * 2)
          ctx.fill()
        }

        for (let index = 0; index < 340; index += 1) {
          const x = rand() * size
          const y = rand() * size
          const width = 10 + rand() * 48
          const height = 1 + rand() * 4
          ctx.fillStyle = `rgba(94, 94, 94, ${0.05 + rand() * 0.08})`
          ctx.fillRect(x, y, width, height)
        }
      }),
  },
}

const textureCache = new Map<MaterialPresetKey, TextureSet>()

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const createSeededRandom = (seed: number) => {
  let value = seed % 2147483647

  return () => {
    value = (value * 16807) % 2147483647
    return (value - 1) / 2147483646
  }
}

const configureTexture = (
  texture: Texture,
  colorSpace: typeof texture.colorSpace,
) => {
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(1.8, 1.8)
  texture.colorSpace = colorSpace
  texture.needsUpdate = true
}

const createTextureCanvas = (
  size: number,
  seed: number,
  painter: (
    ctx: CanvasRenderingContext2D,
    size: number,
    rand: () => number,
  ) => void,
) => {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Canvas 2D context olusturulamadi.')
  }

  painter(ctx, size, createSeededRandom(seed))

  return canvas
}

const createPresetTextures = (
  size: number,
  painter: (
    ctx: CanvasRenderingContext2D,
    size: number,
    rand: () => number,
  ) => void,
): TextureSet => {
  const color = new CanvasTexture(createTextureCanvas(size, 11, painter))
  const roughness = new CanvasTexture(
    createTextureCanvas(size, 17, (ctx, width, rand) => {
      ctx.fillStyle = '#8c8c8c'
      ctx.fillRect(0, 0, width, width)

      for (let index = 0; index < width * 16; index += 1) {
        const shade = Math.floor(70 + rand() * 130)
        ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`
        ctx.fillRect(
          rand() * width,
          rand() * width,
          2 + rand() * 4,
          2 + rand() * 4,
        )
      }
    }),
  )
  const bump = new CanvasTexture(
    createTextureCanvas(size, 29, (ctx, width, rand) => {
      ctx.fillStyle = '#808080'
      ctx.fillRect(0, 0, width, width)

      for (let index = 0; index < width * 22; index += 1) {
        const shade = Math.floor(50 + rand() * 180)
        ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`
        ctx.beginPath()
        ctx.arc(
          rand() * width,
          rand() * width,
          1 + rand() * 4,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }
    }),
  )

  configureTexture(color, SRGBColorSpace)
  configureTexture(roughness, '')
  configureTexture(bump, '')

  roughness.wrapS = ClampToEdgeWrapping
  roughness.wrapT = ClampToEdgeWrapping
  bump.wrapS = ClampToEdgeWrapping
  bump.wrapT = ClampToEdgeWrapping

  return {
    bump,
    color,
    roughness,
  }
}

const getTextures = (preset: MaterialPresetKey) => {
  const cached = textureCache.get(preset)

  if (cached) {
    return cached
  }

  const created = MATERIAL_PRESETS[preset].textureFactory()
  textureCache.set(preset, created)

  return created
}

const disposeMaterial = (
  material:
    | {
        dispose?: () => void
      }
    | Array<{
        dispose?: () => void
      }>
    | undefined,
) => {
  if (Array.isArray(material)) {
    material.filter(Boolean).forEach((entry) => entry.dispose?.())
    return
  }

  material?.dispose?.()
}

const ensureUvGeometry = (geometry: BufferGeometry) => {
  const position = geometry.getAttribute('position')
  const existingUv = geometry.getAttribute('uv')

  if (!position) {
    return geometry
  }

  if (existingUv && existingUv.count === position.count) {
    return geometry
  }

  const workingGeometry =
    geometry.index || existingUv ? geometry.toNonIndexed() ?? geometry.clone() : geometry

  workingGeometry.computeBoundingBox()
  workingGeometry.computeVertexNormals()

  const workingPosition = workingGeometry.getAttribute('position')
  const normal = workingGeometry.getAttribute('normal')
  const bounds = workingGeometry.boundingBox

  if (!workingPosition || !normal || !bounds) {
    return workingGeometry
  }

  const min = bounds.min
  const size = bounds.getSize(new Vector3())
  const safeSize = new Vector3(
    size.x || 1,
    size.y || 1,
    size.z || 1,
  )
  const uvs = new Float32Array(workingPosition.count * 2)

  for (let index = 0; index < workingPosition.count; index += 1) {
    const px = workingPosition.getX(index)
    const py = workingPosition.getY(index)
    const pz = workingPosition.getZ(index)
    const nx = Math.abs(normal.getX(index))
    const ny = Math.abs(normal.getY(index))
    const nz = Math.abs(normal.getZ(index))
    let u = 0
    let v = 0

    if (nz >= nx && nz >= ny) {
      u = (px - min.x) / safeSize.x
      v = (py - min.y) / safeSize.y
    } else if (ny >= nx && ny >= nz) {
      u = (px - min.x) / safeSize.x
      v = (pz - min.z) / safeSize.z
    } else {
      u = (pz - min.z) / safeSize.z
      v = (py - min.y) / safeSize.y
    }

    uvs[index * 2] = u
    uvs[index * 2 + 1] = v
  }

  workingGeometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))

  return workingGeometry
}

const applyUvTransform = (texture: Texture | null | undefined, surface: SurfaceState) => {
  if (!texture) {
    return
  }

  const repeatX = 1 / clamp(surface.uvScaleX, 0.2, 8)
  const repeatY = 1 / clamp(surface.uvScaleY, 0.2, 8)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.center.set(0.5, 0.5)
  texture.repeat.set(repeatX, repeatY)
  texture.offset.set(surface.uvOffsetX, surface.uvOffsetY)
  texture.rotation = (surface.uvRotation * Math.PI) / 180
  texture.needsUpdate = true
}

const drawWrappedTexture = (
  targetContext: CanvasRenderingContext2D,
  source: CanvasImageSource,
  surface: SurfaceState,
  canvasSize: number,
  opacity = 1,
  compositeOperation: GlobalCompositeOperation = 'source-over',
) => {
  const tileWidth = canvasSize * clamp(surface.uvScaleX, 0.2, 8)
  const tileHeight = canvasSize * clamp(surface.uvScaleY, 0.2, 8)
  const offsetX = surface.uvOffsetX * canvasSize
  const offsetY = surface.uvOffsetY * canvasSize
  const rotation = (surface.uvRotation * Math.PI) / 180
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = canvasSize * 3
  tempCanvas.height = canvasSize * 3
  const tempContext = tempCanvas.getContext('2d')

  if (!tempContext) {
    return
  }

  tempContext.clearRect(0, 0, tempCanvas.width, tempCanvas.height)
  tempContext.save()
  tempContext.translate(tempCanvas.width / 2 + offsetX, tempCanvas.height / 2 + offsetY)
  tempContext.rotate(rotation)
  tempContext.globalAlpha = opacity
  tempContext.globalCompositeOperation = compositeOperation

  const startX = -tempCanvas.width
  const endX = tempCanvas.width
  const startY = -tempCanvas.height
  const endY = tempCanvas.height

  for (let x = startX; x <= endX; x += tileWidth) {
    for (let y = startY; y <= endY; y += tileHeight) {
      tempContext.drawImage(source, x, y, tileWidth, tileHeight)
    }
  }

  tempContext.restore()
  targetContext.drawImage(
    tempCanvas,
    canvasSize,
    canvasSize,
    canvasSize,
    canvasSize,
    0,
    0,
    canvasSize,
    canvasSize,
  )
}

const getTextureImageSource = (texture: Texture | null | undefined) => {
  if (!texture || !('image' in texture) || !texture.image) {
    return null
  }

  return texture.image as CanvasImageSource
}

const fillCanvas = (
  context: CanvasRenderingContext2D,
  canvasSize: number,
  color: string,
) => {
  context.fillStyle = color
  context.fillRect(0, 0, canvasSize, canvasSize)
}

const applyReflectionBake = (
  context: CanvasRenderingContext2D,
  canvasSize: number,
  surface: SurfaceState,
) => {
  const reflectionSource = getTextureImageSource(surface.maps.reflection?.texture)
  const reflectionOpacity = clamp(0.12 + surface.reflection * 0.5, 0, 0.72)

  if (reflectionSource) {
    drawWrappedTexture(
      context,
      reflectionSource,
      surface,
      canvasSize,
      reflectionOpacity,
      'screen',
    )
  }

  const highlightGradient = context.createLinearGradient(0, 0, canvasSize, canvasSize)
  const coatingColor = new Color(surface.coatingColor)
  const coatingHex = `#${coatingColor.getHexString()}`
  highlightGradient.addColorStop(0, `${coatingHex}00`)
  highlightGradient.addColorStop(0.18, `${coatingHex}${Math.round(
    clamp(surface.reflection * 120 + surface.coating * 65, 0, 255),
  )
    .toString(16)
    .padStart(2, '0')}`)
  highlightGradient.addColorStop(0.48, `${coatingHex}00`)
  highlightGradient.addColorStop(1, `${coatingHex}00`)

  context.save()
  context.globalCompositeOperation = 'screen'
  context.fillStyle = highlightGradient
  context.fillRect(0, 0, canvasSize, canvasSize)
  context.restore()
}

const createPhysicalMaterial = (surface: SurfaceState) => {
  const preset = MATERIAL_PRESETS[surface.preset]
  const textures = getTextures(surface.preset)
  const reflection = clamp(surface.reflection, 0, 1)
  const refraction = clamp(surface.refraction, 0, 1)
  const bump = clamp(surface.bump, 0, 1)
  const coating = clamp(surface.coating, 0, 1)

  const reflectionMap = surface.maps.reflection?.texture ?? null
  const refractionMap = surface.maps.refraction?.texture ?? null
  const diffuseMap = surface.maps.diffuse?.texture ?? textures.color
  const bumpMap = surface.maps.bump?.texture ?? textures.bump
  const roughnessMap = surface.maps.roughness?.texture ?? textures.roughness
  const metallicMap = surface.maps.metallic?.texture ?? reflectionMap
  const normalMap = surface.maps.normal?.texture ?? null
  const alphaMap = surface.foliage ? surface.maps.diffuse?.texture ?? null : null

  ;[
    diffuseMap,
    reflectionMap,
    refractionMap,
    bumpMap,
    roughnessMap,
    metallicMap,
    normalMap,
    alphaMap,
  ].forEach((texture) => applyUvTransform(texture, surface))

  const material = new MeshPhysicalMaterial({
    alphaMap,
    alphaTest: surface.foliage ? clamp(surface.opacityCut, 0, 0.95) : 0,
    attenuationColor: new Color(preset.attenuationColor),
    attenuationDistance: preset.attenuationDistance,
    bumpMap,
    bumpScale: bump * preset.bumpStrength,
    clearcoat: coating,
    clearcoatRoughness: clamp(0.24 - coating * 0.16, 0.02, 0.34),
    color: new Color(surface.diffuseColor),
    envMapIntensity: 0.25 + reflection * 2.4,
    ior: 1.02 + refraction * 1.22,
    map: diffuseMap,
    metalness: clamp(preset.metalness + reflection * 0.08, 0, 1),
    metalnessMap: metallicMap,
    normalMap,
    normalScale: new Vector2(bump, bump),
    roughness: clamp(
      preset.roughness + (1 - reflection) * 0.18 - coating * 0.06,
      0.03,
      1,
    ),
    roughnessMap,
    specularColor: new Color(surface.coatingColor),
    specularIntensity: 0.18 + reflection * 0.82,
    specularIntensityMap: reflectionMap,
    thickness: 0.08 + refraction * 2.8,
    thicknessMap: refractionMap,
    transmission: refraction,
    transmissionMap: refractionMap,
    side: DoubleSide,
  })

  if (surface.foliage) {
    const emissiveColor = new Color(surface.diffuseColor)
      .lerp(new Color('#ffffff'), 0.16 + surface.leafSoftness * 0.22)
      .multiplyScalar(0.05 + surface.leafSoftness * 0.12)

    material.transparent = alphaMap !== null
    material.alphaHash = surface.leafSoftness > 0.08
    material.alphaToCoverage = alphaMap !== null
    material.depthWrite = alphaMap === null
    material.forceSinglePass = true
    material.emissive.copy(emissiveColor)
    material.emissiveIntensity = 0.55 + surface.leafSoftness * 1.15
    material.roughness = clamp(material.roughness * 0.82, 0.06, 1)
    material.specularIntensity = clamp(
      material.specularIntensity * (0.78 + surface.leafSoftness * 0.36),
      0,
      1,
    )
  }

  material.needsUpdate = true

  return material
}

export const MATERIAL_PRESET_ORDER = Object.keys(
  MATERIAL_PRESETS,
) as MaterialPresetKey[]

export const SURFACE_MAP_ORDER: SurfaceMapSlot[] = [
  'diffuse',
  'reflection',
  'refraction',
  'bump',
  'roughness',
  'metallic',
  'normal',
]

export const getPresetLabel = (preset: MaterialPresetKey) =>
  MATERIAL_PRESETS[preset].label

export const getEmptySurfaceMaps = (): SurfaceMapSet => ({
  diffuse: null,
  reflection: null,
  refraction: null,
  bump: null,
  roughness: null,
  metallic: null,
  normal: null,
})

export const createPresetSurface = (preset: MaterialPresetKey): SurfaceState => ({
  preset,
  diffuseColor: MATERIAL_PRESETS[preset].baseColor,
  coatingColor: MATERIAL_PRESETS[preset].coatingColor,
  foliage: false,
  leafSoftness: 0.18,
  maps: getEmptySurfaceMaps(),
  opacityCut: 0.42,
  ...MATERIAL_PRESETS[preset].defaults,
  uvOffsetX: 0,
  uvOffsetY: 0,
  uvRotation: 0,
  uvScaleX: 1,
  uvScaleY: 1,
  uvTileLock: true,
})

export const cloneSurfaceState = (surface: SurfaceState): SurfaceState => ({
  ...surface,
  maps: {
    diffuse: surface.maps.diffuse,
    reflection: surface.maps.reflection,
    refraction: surface.maps.refraction,
    bump: surface.maps.bump,
    roughness: surface.maps.roughness,
    metallic: surface.maps.metallic,
    normal: surface.maps.normal,
  },
})

export const generateBakeMaps = (
  surface: SurfaceState,
  options: {
    includeCombined: boolean
    includeDiffuseLike: boolean
    includeReflection: boolean
    size?: number
  },
): GeneratedBakeMaps => {
  const size = options.size ?? 1024
  const createCanvas = () => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    return canvas
  }

  const diffuseSource = getTextureImageSource(
    surface.maps.diffuse?.texture ?? getTextures(surface.preset).color,
  )

  const renderBaseLike = () => {
    const canvas = createCanvas()
    const context = canvas.getContext('2d')
    if (!context) {
      return null
    }

    fillCanvas(context, size, surface.diffuseColor)

    if (diffuseSource) {
      drawWrappedTexture(context, diffuseSource, surface, size)
    }

    if (options.includeReflection) {
      applyReflectionBake(context, size, surface)
    }

    return canvas
  }

  const base = options.includeDiffuseLike ? renderBaseLike() : null
  let combined: HTMLCanvasElement | null = null

  if (options.includeCombined) {
    combined = renderBaseLike()

    if (combined) {
      const context = combined.getContext('2d')
      if (context) {
        const coatingOverlay = context.createLinearGradient(0, 0, size, size)
        const coatingColor = new Color(surface.coatingColor)
        const coatingHex = `#${coatingColor.getHexString()}`
        coatingOverlay.addColorStop(0, `${coatingHex}00`)
        coatingOverlay.addColorStop(
          0.3,
          `${coatingHex}${Math.round(clamp(surface.coating * 150, 0, 255))
            .toString(16)
            .padStart(2, '0')}`,
        )
        coatingOverlay.addColorStop(0.62, `${coatingHex}00`)
        context.save()
        context.globalCompositeOperation = 'screen'
        context.fillStyle = coatingOverlay
        context.fillRect(0, 0, size, size)
        context.restore()
      }
    }
  }

  return {
    base,
    combined,
  }
}

export const applySurfaceToObject = (
  object: Object3D,
  surface: SurfaceState,
) => {
  object.traverse((child) => {
    if (!(child instanceof Mesh) || child.userData.ngonWireOverlay) {
      return
    }

    const nextGeometry = ensureUvGeometry(child.geometry)

    if (nextGeometry !== child.geometry) {
      child.geometry = nextGeometry
    }

    const material = createPhysicalMaterial(surface)
    child.castShadow = true
    child.receiveShadow = true
    material.shadowSide = DoubleSide

    disposeMaterial(child.material)
    child.material = material
  })
}
