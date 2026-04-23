import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isDev = process.argv.includes('--dev')

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

ipcMain.handle('export:write-binary', async (_, payload) => {
  if (!payload?.filePath || !payload?.bytes) {
    throw new Error('Binary export payload gecersiz.')
  }

  await writeFile(payload.filePath, Buffer.from(payload.bytes))
  return payload.filePath
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
