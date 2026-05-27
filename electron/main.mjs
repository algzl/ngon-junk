import { open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isDev = process.argv.includes('--dev')
const closeAllowedWindows = new WeakSet()
const closeRequestFallbackTimers = new WeakMap()
const binaryExportSessions = new Map()

const createExportSessionId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2)}`

const createTempExportPath = (filePath, sessionId) => {
  const directory = path.dirname(filePath)
  const extension = path.extname(filePath)
  const baseName = path.basename(filePath, extension)
  return path.join(directory, `.${baseName}.${sessionId}.tmp${extension}`)
}

const closeBinaryExportSession = async (session) => {
  try {
    await session.handle.close()
  } catch {
    // The export may already be closed after a write failure.
  }
}

const abortBinaryExportSession = async (sessionId) => {
  const session = binaryExportSessions.get(sessionId)
  if (!session) {
    return null
  }

  binaryExportSessions.delete(sessionId)
  await closeBinaryExportSession(session)

  try {
    await unlink(session.tempPath)
  } catch {
    // Best-effort cleanup; a failed write should not mask the original error.
  }

  return null
}

const writeBinaryExportFile = async (filePath, bytes) => {
  const sessionId = createExportSessionId()
  const tempPath = createTempExportPath(filePath, sessionId)

  try {
    await writeFile(tempPath, Buffer.from(bytes))
    await rename(tempPath, filePath)
    return filePath
  } catch (error) {
    try {
      await unlink(tempPath)
    } catch {
      // Best-effort cleanup.
    }

    throw error
  }
}

const clearCloseRequestFallback = (window) => {
  const timer = closeRequestFallbackTimers.get(window)
  if (!timer) {
    return
  }

  clearTimeout(timer)
  closeRequestFallbackTimers.delete(window)
}

const allowWindowClose = (window) => {
  clearCloseRequestFallback(window)
  closeAllowedWindows.add(window)
  window.close()
}

const createWindow = async () => {
  const window = new BrowserWindow({
    title: 'ngon-junk',
    width: 1480,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#071019',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  window.on('close', (event) => {
    if (closeAllowedWindows.has(window) || window.webContents.isDestroyed()) {
      return
    }

    event.preventDefault()
    window.webContents.send('app:close-requested')
    clearCloseRequestFallback(window)

    const fallbackTimer = setTimeout(async () => {
      closeRequestFallbackTimers.delete(window)

      if (window.isDestroyed()) {
        return
      }

      const { response } = await dialog.showMessageBox(window, {
        type: 'question',
        buttons: ['kapat', 'vazgec'],
        defaultId: 0,
        cancelId: 1,
        message: 'ngon-junk kapatilsin mi?',
        detail:
          'Kapatma paneli yanit vermedi. Kaydetmeden cikmak icin kapat secenegini kullan.',
      })

      if (response === 0 && !window.isDestroyed()) {
        allowWindowClose(window)
      }
    }, 2000)

    closeRequestFallbackTimers.set(window, fallbackTimer)
  })

  window.on('closed', () => {
    clearCloseRequestFallback(window)
  })

  if (isDev) {
    await window.loadURL('http://127.0.0.1:5173')
    return
  }

  await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

ipcMain.handle('model:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '3D model sec',
    properties: ['openFile'],
    filters: [
      {
        name: '3D Models',
        extensions: ['obj', 'fbx', '3ds', 'stl', 'blend', 'skp'],
      },
    ],
  })

  const filePath = filePaths[0]

  if (canceled || !filePath) {
    return null
  }

  const fileBuffer = await readFile(filePath)
  const bytes = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength,
  )

  return {
    bytes,
    extension: path.extname(filePath).replace('.', '').toLowerCase(),
    name: path.basename(filePath),
    path: filePath,
  }
})

ipcMain.handle('app:close-now', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    return false
  }

  allowWindowClose(window)
  return true
})

ipcMain.handle('app:close-request-visible', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    return false
  }

  clearCloseRequestFallback(window)
  return true
})

ipcMain.handle('export:pick-path', async (_, payload) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: payload.title ?? 'export kaydet',
    defaultPath: payload.defaultName,
    filters: payload.filters,
  })

  if (canceled || !filePath) {
    return null
  }

  const selectedExtension = path.extname(filePath).replace('.', '').toLowerCase()
  const fallbackExtension =
    payload.filters?.find((entry) => entry.extensions?.length)?.extensions?.[0] ?? ''
  const normalizedExtension = (selectedExtension || fallbackExtension).toLowerCase()
  const normalizedPath =
    selectedExtension || !normalizedExtension
      ? filePath
      : `${filePath}.${normalizedExtension}`

  return {
    extension: normalizedExtension,
    filePath: normalizedPath,
  }
})

ipcMain.handle('export:write-binary-begin', async (_, payload) => {
  if (!payload?.filePath) {
    throw new Error('Binary export yolu gecersiz.')
  }

  const sessionId = createExportSessionId()
  const tempPath = createTempExportPath(payload.filePath, sessionId)
  const handle = await open(tempPath, 'w')
  binaryExportSessions.set(sessionId, {
    filePath: payload.filePath,
    handle,
    tempPath,
  })

  return sessionId
})

ipcMain.handle('export:write-binary-chunk', async (_, payload) => {
  const session = binaryExportSessions.get(payload?.id)
  if (!session || !payload?.bytes) {
    throw new Error('Binary export parcasi gecersiz.')
  }

  const chunk = Buffer.from(payload.bytes)
  await session.handle.write(chunk, 0, chunk.byteLength)
  return chunk.byteLength
})

ipcMain.handle('export:write-binary-end', async (_, payload) => {
  const session = binaryExportSessions.get(payload?.id)
  if (!session) {
    throw new Error('Binary export oturumu bulunamadi.')
  }

  binaryExportSessions.delete(payload.id)
  await closeBinaryExportSession(session)
  await rename(session.tempPath, session.filePath)
  return session.filePath
})

ipcMain.handle('export:write-binary-abort', async (_, payload) =>
  abortBinaryExportSession(payload?.id),
)

ipcMain.handle('export:write-binary', async (_, payload) => {
  if (!payload?.filePath || !payload?.bytes) {
    throw new Error('Binary export payload gecersiz.')
  }

  return writeBinaryExportFile(payload.filePath, payload.bytes)
})

ipcMain.handle('export:write-text', async (_, payload) => {
  if (!payload?.filePath || typeof payload?.text !== 'string') {
    throw new Error('Text export payload gecersiz.')
  }

  await writeFile(payload.filePath, payload.text, 'utf8')
  return payload.filePath
})

app.whenReady().then(async () => {
  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
