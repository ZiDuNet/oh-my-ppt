import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export function registerPresentationHandlers(): void {
  ipcMain.handle('presentation:open', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return { success: false }
    const record = payload as { sessionId?: unknown; startIndex?: unknown }
    const sessionId = typeof record.sessionId === 'string' ? record.sessionId : ''
    const startIndex = typeof record.startIndex === 'number' ? record.startIndex : 0
    if (!sessionId) return { success: false }

    const preloadPath = join(__dirname, '../preload/index.mjs')
    const win = new BrowserWindow({
      fullscreen: true,
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      show: false,
    //   titleBarStyle: 'hidden',
      webPreferences: {
        preload: preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        webviewTag: true
      }
    })

    const hash = `#/present?sessionId=${encodeURIComponent(sessionId)}&startIndex=${startIndex}`

    win.on('ready-to-show', () => {
      win.show()
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${hash}`)
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), { hash: hash.slice(1) })
    }

    return { success: true }
  })
}
