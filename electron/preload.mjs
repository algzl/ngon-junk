import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktopBridge', {
  openModelDialog: () => ipcRenderer.invoke('model:open'),
  pickExportPath: (payload) => ipcRenderer.invoke('export:pick-path', payload),
  writeExportBinary: (filePath, bytes) =>
    ipcRenderer.invoke('export:write-binary', { bytes, filePath }),
  writeExportText: (filePath, text) =>
    ipcRenderer.invoke('export:write-text', { filePath, text }),
})
