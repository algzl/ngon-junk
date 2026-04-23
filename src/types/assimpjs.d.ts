declare module 'assimpjs' {
  export type AssimpResultFile = {
    GetContent: () => Uint8Array
  }

  export type AssimpResult = {
    FileCount: () => number
    GetErrorCode: () => string
    GetFile: (index: number) => AssimpResultFile
    IsSuccess: () => boolean
  }

  export type AssimpFileList = {
    AddFile: (name: string, content: Uint8Array) => void
  }

  export type AssimpModule = {
    ConvertFileList: (files: AssimpFileList, format: string) => AssimpResult
    FileList: new () => AssimpFileList
  }

  type AssimpFactory = (options?: {
    locateFile?: (fileName: string) => string
  }) => Promise<AssimpModule>

  const assimpFactory: AssimpFactory
  export default assimpFactory
}

declare module 'assimpjs/dist/assimpjs.wasm?url' {
  const wasmUrl: string
  export default wasmUrl
}
