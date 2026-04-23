import {
  Box3,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three'
import type { AssimpModule } from 'assimpjs'

export type ViewerFileSource = {
  bytes: ArrayBuffer
  extension: string
  name: string
  path?: string
}

export type LoadedModel = {
  bounds: Box3
  hasOriginalTextures: boolean
  meshCount: number
  object: Object3D
  triangleCount: number
  vertexCount: number
}

const solidMaterial = new MeshStandardMaterial({
  color: '#83e3ff',
  metalness: 0.08,
  roughness: 0.52,
})

let assimpModulePromise: Promise<AssimpModule> | null = null

const normalizeExtension = (extension: string) =>
  extension.trim().replace(/^\./, '').toLowerCase()

const ensureRenderableMaterials = (object: Object3D) => {
  object.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return
    }

    child.castShadow = true
    child.receiveShadow = true

    if (child.material) {
      return
    }

    child.material = solidMaterial.clone()
  })
}

const summarizeGeometry = (object: Object3D) => {
  let meshCount = 0
  let triangleCount = 0
  let vertexCount = 0

  object.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return
    }

    meshCount += 1

    const geometry = child.geometry as BufferGeometry
    const position = geometry.getAttribute('position')

    if (position) {
      vertexCount += position.count
    }

    if (geometry.index) {
      triangleCount += geometry.index.count / 3
      return
    }

    if (position) {
      triangleCount += position.count / 3
    }
  })

  return {
    meshCount,
    triangleCount: Math.round(triangleCount),
    vertexCount,
  }
}

const objectHasTextureMaterials = (object: Object3D) => {
  let hasTextures = false

  object.traverse((child) => {
    if (!(child instanceof Mesh) || hasTextures) {
      return
    }

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material]

    for (const material of materials) {
      if (!material) {
        continue
      }

      const maybeTextureKeys = [
        'map',
        'alphaMap',
        'aoMap',
        'bumpMap',
        'displacementMap',
        'emissiveMap',
        'metalnessMap',
        'normalMap',
        'roughnessMap',
        'specularIntensityMap',
        'thicknessMap',
        'transmissionMap',
      ] as const

      for (const key of maybeTextureKeys) {
        const value = (material as Record<string, unknown>)[key]

        if (
          value &&
          typeof value === 'object' &&
          'isTexture' in value &&
          value.isTexture === true
        ) {
          hasTextures = true
          return
        }
      }
    }
  })

  return hasTextures
}

const centerObject = (object: Object3D) => {
  const bounds = new Box3().setFromObject(object)
  const center = bounds.getCenter(new Vector3())

  object.position.sub(center)

  return new Box3().setFromObject(object)
}

const parseStl = async (bytes: ArrayBuffer) => {
  const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js')
  const geometry = new STLLoader().parse(bytes)
  geometry.computeVertexNormals()

  return new Mesh(geometry, solidMaterial.clone())
}

const parseObj = async (bytes: ArrayBuffer) => {
  const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js')
  const text = new TextDecoder().decode(bytes)
  return new OBJLoader().parse(text)
}

const parseFbx = async (bytes: ArrayBuffer) => {
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
  return new FBXLoader().parse(bytes, '')
}

const parse3ds = async (bytes: ArrayBuffer) => {
  const { TDSLoader } = await import('three/examples/jsm/loaders/TDSLoader.js')
  const loader = new TDSLoader()
  loader.setResourcePath('')
  return loader.parse(bytes, '')
}

const getAssimpModule = () => {
  if (!assimpModulePromise) {
    assimpModulePromise = Promise.all([
      import('assimpjs'),
      import('assimpjs/dist/assimpjs.wasm?url'),
    ]).then(([assimpModule, wasmModule]) => {
      const assimpjsFactory = assimpModule.default
      const assimpjsWasmUrl = wasmModule.default

      return assimpjsFactory({
        locateFile: (fileName: string) => {
          if (fileName.endsWith('.wasm')) {
            return assimpjsWasmUrl
          }

          return fileName
        },
      })
    })
  }

  return assimpModulePromise
}

const convertWithAssimp = async (source: ViewerFileSource) => {
  const assimp = await getAssimpModule()
  const fileList = new assimp.FileList()
  fileList.AddFile(source.name, new Uint8Array(source.bytes))

  const result = assimp.ConvertFileList(fileList, 'glb2')

  if (!result.IsSuccess() || result.FileCount() === 0) {
    throw new Error(result.GetErrorCode() || 'Assimp donusumu basarisiz oldu.')
  }

  const converted = result.GetFile(0)
  const content = converted.GetContent()
  const copied = new Uint8Array(content.length)
  copied.set(content)

  return copied.buffer
}

const parseGlb = async (bytes: ArrayBuffer) => {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  const loader = new GLTFLoader()

  return new Promise<Object3D>((resolve, reject) => {
    loader.parse(
      bytes,
      '',
      (gltf) => resolve(gltf.scene),
      (error) =>
        reject(
          error instanceof Error
            ? error
            : new Error('Donusturulen GLB dosyasi okunamadi.'),
        ),
    )
  })
}

const parseByExtension = async (source: ViewerFileSource) => {
  const extension = normalizeExtension(source.extension)

  switch (extension) {
    case 'stl':
      return parseStl(source.bytes)
    case 'obj':
      return parseObj(source.bytes)
    case 'fbx':
      return parseFbx(source.bytes)
    case '3ds':
      return parse3ds(source.bytes)
    case 'blend':
    case 'skp':
      return parseGlb(await convertWithAssimp(source))
    default:
      throw new Error(
        `.${extension || 'bilinmeyen'} uzantisi su an desteklenmiyor.`,
      )
  }
}

export const loadModelFile = async (
  source: ViewerFileSource,
): Promise<LoadedModel> => {
  const parsed = await parseByExtension(source)
  const root = new Group()
  root.add(parsed)

  ensureRenderableMaterials(root)

  const bounds = centerObject(root)
  const summary = summarizeGeometry(root)

  return {
    bounds,
    hasOriginalTextures: objectHasTextureMaterials(root),
    meshCount: summary.meshCount,
    object: root,
    triangleCount: summary.triangleCount,
    vertexCount: summary.vertexCount,
  }
}
