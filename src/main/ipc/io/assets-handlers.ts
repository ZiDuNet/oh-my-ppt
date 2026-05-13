import { BrowserWindow, dialog, ipcMain, protocol } from 'electron'
import fs from 'fs'
import path from 'path'
import type { IpcContext } from '../context'

const ASSET_MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  ogv: 'video/ogg'
}

export function registerLocalAssetProtocol(): void {
  protocol.handle('local-asset', (request) => {
    const filePath = decodeURIComponent(request.url.replace('local-asset://', ''))
    try {
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) return new Response('Not found', { status: 404 })
      const ext = filePath.split('.').pop()?.toLowerCase() || ''
      const mime = ASSET_MIME_MAP[ext] || 'application/octet-stream'
      const fileSize = stat.size

      const range = request.headers.get('range')
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        if (!m) return new Response('Invalid range', { status: 416 })
        const start = m[1] ? parseInt(m[1], 10) : 0
        const end = m[2] ? Math.min(parseInt(m[2], 10), fileSize - 1) : fileSize - 1
        if (start > end || start >= fileSize) {
          return new Response('Range not satisfiable', { status: 416 })
        }
        const len = end - start + 1
        const fd = fs.openSync(filePath, 'r')
        const buf = Buffer.alloc(len)
        fs.readSync(fd, buf, 0, len, start)
        fs.closeSync(fd)
        return new Response(buf, {
          status: 206,
          headers: {
            'content-type': mime,
            'content-range': `bytes ${start}-${end}/${fileSize}`,
            'content-length': String(len),
            'accept-ranges': 'bytes'
          }
        })
      }

      const data = fs.readFileSync(filePath)
      return new Response(data, {
        headers: {
          'content-type': mime,
          'accept-ranges': 'bytes',
          'content-length': String(fileSize)
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

export function registerAssetHandlers(ctx: IpcContext): void {
  const { mainWindow, uploadMediaAssets, resolveSessionProjectDir } = ctx

  ipcMain.handle('assets:upload', async (_event, payload: unknown) => {
    const record =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''
    const files = Array.isArray(record.files)
      ? (record.files as Array<Record<string, unknown>>)
      : []
    return { assets: await uploadMediaAssets(sessionId, files) }
  })

  ipcMain.handle('assets:chooseAndUpload', async (event, payload: unknown) => {
    const record =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''
    const assetType =
      record.assetType === 'video' ? 'video' : record.assetType === 'image' ? 'image' : 'image'
    if (!sessionId) throw new Error('sessionId 不能为空')

    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow
    const result = await dialog.showOpenDialog(win, {
      title: assetType === 'video' ? '选择视频素材' : '选择图片素材',
      properties: ['openFile', 'multiSelections'],
      filters:
        assetType === 'video'
          ? [{ name: 'Videos', extensions: ['mp4', 'webm', 'ogg'] }]
          : [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { assets: [], cancelled: true }
    }
    const assets = await uploadMediaAssets(
      sessionId,
      result.filePaths.map((filePath) => ({
        path: filePath,
        name: path.basename(filePath)
      }))
    )
    return { assets, cancelled: false }
  })

  ipcMain.handle('assets:list', async (_event, payload: unknown) => {
    const record =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''
    const assetType =
      record.assetType === 'video' ? 'video' : record.assetType === 'image' ? 'image' : 'image'
    if (!sessionId) throw new Error('sessionId 不能为空')

    const projectDir = await resolveSessionProjectDir(sessionId)
    const dirName = assetType === 'video' ? 'videos' : 'images'
    const targetDir = path.join(projectDir, dirName)
    if (!fs.existsSync(targetDir)) return { assets: [] }

    const files = await fs.promises.readdir(targetDir)
    const assets = files
      .filter((f) => !f.startsWith('.'))
      .map((f) => ({
        fileName: f,
        relativePath: `./${dirName}/${f}`,
        absolutePath: path.join(targetDir, f)
      }))
    return { assets }
  })
}
