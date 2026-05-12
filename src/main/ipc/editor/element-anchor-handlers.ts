import { ipcMain } from 'electron'
import * as cheerio from 'cheerio'
import fs from 'fs'
import { nanoid } from 'nanoid'
import type { AnyNode } from 'domhandler'
import type { IpcContext } from '../context'

const SCAFFOLD_BLOCK_IDS = new Set(['content', 'page', 'root'])
const BLOCKED_TAGS = new Set(['html', 'head', 'body', 'script', 'style', 'link', 'meta', 'title'])

const htmlWriteLocks = new Map<string, Promise<void>>()

async function withHtmlFileLock<T>(htmlPath: string, fn: () => Promise<T>): Promise<T> {
  const previous = htmlWriteLocks.get(htmlPath) || Promise.resolve()
  const run = previous.then(fn, fn)
  const next = run.then(
    () => undefined,
    () => undefined
  )
  htmlWriteLocks.set(htmlPath, next)
  return run.finally(() => {
    if (htmlWriteLocks.get(htmlPath) === next) {
      htmlWriteLocks.delete(htmlPath)
    }
  })
}

const attrEscape = (value: string): string => value.replace(/"/g, '\\"')

const stableSelectorFor = (pageId: string, blockId: string): string =>
  `body[data-page-id="${attrEscape(pageId)}"] [data-block-id="${attrEscape(blockId)}"]`

function allocateBlockId(): string {
  return 'select-arcsin1-' + nanoid(8)
}

function assertAnchorableElement(target: cheerio.Cheerio<AnyNode>): void {
  const node = target.get(0)
  const tagName = String((node as { tagName?: string })?.tagName || '').toLowerCase()
  if (!tagName || BLOCKED_TAGS.has(tagName)) {
    throw new Error(`当前元素不能锚定：<${tagName || 'unknown'}>`)
  }
  const role = (target.attr('data-role') || '').trim()
  const blockId = (target.attr('data-block-id') || '').trim()
  const classRaw = target.attr('class') || ''
  const guardRoot = target.attr('data-ppt-guard-root') === '1'
  if (
    role === 'content' ||
    SCAFFOLD_BLOCK_IDS.has(blockId) ||
    guardRoot ||
    /\bppt-page-(?:root|content|fit-scope)\b/.test(classRaw)
  ) {
    throw new Error('页面骨架元素不能锚定，请选择页面内容里的具体元素')
  }
}

function ensureElementAnchorInHtml(
  html: string,
  args: {
    pageId: string
    selector: string
    elementTag?: string
  }
): { html: string; selector: string; blockId: string; changed: boolean } {
  const $ = cheerio.load(html, { scriptingEnabled: false })
  let target: cheerio.Cheerio<AnyNode>
  try {
    target = $(args.selector).first()
  } catch {
    throw new Error('无法锚定元素：selector 无效')
  }
  if (!target || target.length === 0) {
    throw new Error('无法锚定元素：页面内容可能已经变化')
  }
  assertAnchorableElement(target)
  const existingBlockId = (target.attr('data-block-id') || '').trim()
  if (existingBlockId) {
    return {
      html,
      selector: stableSelectorFor(args.pageId, existingBlockId),
      blockId: existingBlockId,
      changed: false
    }
  }
  const blockId = allocateBlockId()
  target.attr('data-block-id', blockId)
  return {
    html: $.html(),
    selector: stableSelectorFor(args.pageId, blockId),
    blockId,
    changed: true
  }
}

export function registerElementAnchorHandlers(ctx: IpcContext): void {
  const { normalizeSessionId, assertPathInAllowedRoots } = ctx

  ipcMain.handle('element-anchor:ensure', async (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('元素锚定参数无效')
    }
    const record = payload as {
      sessionId?: unknown
      htmlPath?: unknown
      pageId?: unknown
      selector?: unknown
      elementTag?: unknown
    }
    const sessionId = normalizeSessionId(record.sessionId)
    const htmlPath = typeof record.htmlPath === 'string' ? record.htmlPath : ''
    const pageId = typeof record.pageId === 'string' ? record.pageId.trim() : ''
    const selector = typeof record.selector === 'string' ? record.selector.trim() : ''
    const elementTag = typeof record.elementTag === 'string' ? record.elementTag.trim() : ''
    if (!htmlPath) throw new Error('页面路径不能为空')
    if (!pageId) throw new Error('pageId 不能为空')
    if (!selector) throw new Error('元素 selector 不能为空')

    const safeHtmlPath = await assertPathInAllowedRoots({
      filePath: htmlPath,
      mode: 'write',
      sessionId,
      htmlOnly: true
    })
    return await withHtmlFileLock(safeHtmlPath, async () => {
      const html = await fs.promises.readFile(safeHtmlPath, 'utf-8')
      const result = ensureElementAnchorInHtml(html, { pageId, selector, elementTag })
      if (result.changed) {
        await fs.promises.writeFile(safeHtmlPath, result.html, 'utf-8')
      }
      return {
        success: true,
        selector: result.selector,
        blockId: result.blockId,
        changed: result.changed
      }
    })
  })
}
