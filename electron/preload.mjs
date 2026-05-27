import { contextBridge, ipcRenderer } from 'electron'

const BINARY_EXPORT_CHUNK_SIZE = 8 * 1024 * 1024

const normalizeBinaryBytes = (bytes) => {
  if (bytes instanceof ArrayBuffer) {
    return new Uint8Array(bytes)
  }

  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  throw new Error('Binary export payload gecersiz.')
}

contextBridge.exposeInMainWorld('desktopBridge', {
  openModelDialog: () => ipcRenderer.invoke('model:open'),
  pickExportPath: (payload) => ipcRenderer.invoke('export:pick-path', payload),
  writeExportBinary: async (filePath, bytes) => {
    const view = normalizeBinaryBytes(bytes)
    const sessionId = await ipcRenderer.invoke('export:write-binary-begin', {
      filePath,
    })
    let completed = false

    try {
      for (
        let offset = 0;
        offset < view.byteLength;
        offset += BINARY_EXPORT_CHUNK_SIZE
      ) {
        const end = Math.min(offset + BINARY_EXPORT_CHUNK_SIZE, view.byteLength)
        const chunk = view.buffer.slice(
          view.byteOffset + offset,
          view.byteOffset + end,
        )
        await ipcRenderer.invoke('export:write-binary-chunk', {
          bytes: chunk,
          id: sessionId,
        })
      }

      const writtenPath = await ipcRenderer.invoke('export:write-binary-end', {
        id: sessionId,
      })
      completed = true
      return writtenPath
    } finally {
      if (!completed) {
        await ipcRenderer
          .invoke('export:write-binary-abort', { id: sessionId })
          .catch(() => null)
      }
    }
  },
  writeExportText: (filePath, text) =>
    ipcRenderer.invoke('export:write-text', { filePath, text }),
  onCloseRequest: (callback) => {
    const listener = () => {
      ipcRenderer.invoke('app:close-request-visible').catch(() => null)
      callback()
    }
    ipcRenderer.on('app:close-requested', listener)
    return () => ipcRenderer.removeListener('app:close-requested', listener)
  },
  closeWindow: () => ipcRenderer.invoke('app:close-now'),
})
