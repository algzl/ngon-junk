export {}

declare global {
  type DesktopModelFile = {
    bytes: ArrayBuffer
    extension: string
    name: string
    path: string
  }

  type DesktopExportFilter = {
    extensions: string[]
    name: string
  }

  type DesktopExportPathRequest = {
    defaultName: string
    filters: DesktopExportFilter[]
    title?: string
  }

  type DesktopExportPathResult = {
    extension: string
    filePath: string
  }

  type DesktopExportPayload = {
    defaultName: string
    kind: 'binary' | 'text'
    bytes?: ArrayBuffer
    text?: string
  }

  interface Window {
    desktopBridge?: {
      openModelDialog: () => Promise<DesktopModelFile | null>
      pickExportPath: (
        payload: DesktopExportPathRequest,
      ) => Promise<DesktopExportPathResult | null>
      writeExportBinary: (
        filePath: string,
        bytes: ArrayBuffer,
      ) => Promise<string | null>
      writeExportText: (filePath: string, text: string) => Promise<string | null>
    }
  }
}
