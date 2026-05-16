import log from 'electron-log/main.js'

const DEFAULT_BASE_URL = 'https://new-api.chaoxi.live'
const TOKEN_NAME = 'chaoxi-ppt'

// ---------- types ----------

export interface NewApiUserInfo {
  id: number
  username: string
  display_name: string
  email: string
  group: string
  role: number
  status: number
  quota: number
  used_quota: number
  request_count: number
}

export interface NewApiToken {
  id: number
  user_id: number
  name: string
  key: string
  status: number
  expired_time: number
  remain_quota: number
  unlimited_quota: boolean
  created_time: number
  accessed_time: number
  used_quota: number
  group: string
}

export interface NewApiSession {
  sessionCookie: string
  userId: number
  userInfo: NewApiUserInfo
}

// ---------- helpers ----------

function buildHeaders(session: { cookie: string; userId: number }) {
  return {
    'Content-Type': 'application/json',
    Cookie: session.cookie,
    'New-Api-User': String(session.userId)
  }
}

async function request<T>(
  method: string,
  path: string,
  session?: { cookie: string; userId: number },
  body?: unknown
): Promise<T> {
  const url = `${DEFAULT_BASE_URL}${path}`
  const opts: RequestInit = {
    method,
    headers: session ? buildHeaders(session) : { 'Content-Type': 'application/json' }
  }
  if (body !== undefined) {
    opts.body = JSON.stringify(body)
  }
  const resp = await fetch(url, opts)
  const json = await resp.json()
  if (!json.success) {
    throw new Error(json.message || 'NewAPI request failed')
  }
  return json as T
}

// ---------- public API ----------

/** 登录，返回 session cookie + 基本信息 */
export async function login(
  username: string,
  password: string
): Promise<{ cookie: string; userId: number; username: string; displayName: string }> {
  const url = `${DEFAULT_BASE_URL}/api/user/login`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const json = await resp.json()
  if (!json.success) {
    throw new Error(json.message || 'Login failed')
  }
  const setCookie = resp.headers.get('set-cookie') || ''
  const match = setCookie.match(/session=([^;]+)/)
  if (!match) {
    throw new Error('Login succeeded but no session cookie returned')
  }
  return {
    cookie: `session=${match[1]}`,
    userId: json.data.id,
    username: json.data.username,
    displayName: json.data.display_name
  }
}

/** 注册 */
export async function register(username: string, password: string, email?: string): Promise<void> {
  await request('POST', '/api/user/register', undefined, { username, password, email: email || '' })
}

/** 获取当前用户信息 */
export async function getUserInfo(session: {
  cookie: string
  userId: number
}): Promise<NewApiUserInfo> {
  const json = await request<{ data: NewApiUserInfo }>('GET', '/api/user/self', session)
  return json.data
}

/** 登出 */
export async function logout(session: { cookie: string; userId: number }): Promise<void> {
  await request('GET', '/api/user/logout', session)
}

/** 搜索令牌 */
export async function searchToken(
  session: { cookie: string; userId: number },
  keyword: string
): Promise<NewApiToken[]> {
  const json = await request<{ data: { items: NewApiToken[]; total: number } }>(
    'GET',
    `/api/token/search?keyword=${encodeURIComponent(keyword)}`,
    session
  )
  return json.data.items || []
}

/** 获取令牌列表 */
export async function listTokens(session: {
  cookie: string
  userId: number
}): Promise<NewApiToken[]> {
  const json = await request<{ data: { items: NewApiToken[] } }>('GET', '/api/token/', session)
  return json.data.items || []
}

/** 创建令牌 */
export async function createToken(
  session: { cookie: string; userId: number },
  opts?: { group?: string }
): Promise<void> {
  await request('POST', '/api/token/', session, {
    name: TOKEN_NAME,
    remain_quota: 0,
    unlimited_quota: true,
    expired_time: -1,
    group: opts?.group || ''
  })
}

/** 获取令牌完整 key */
export async function getTokenKey(
  session: { cookie: string; userId: number },
  tokenId: number
): Promise<string> {
  const json = await request<{ data: { key: string } }>(
    'POST',
    `/api/token/${tokenId}/key`,
    session
  )
  return json.data.key
}

/** 删除令牌 */
export async function deleteToken(
  session: { cookie: string; userId: number },
  tokenId: number
): Promise<void> {
  await request('DELETE', `/api/token/${tokenId}`, session)
}

export interface ModelInfo {
  id: string
  ownedBy: string
}

/** 通过 OpenAI 兼容接口获取可用模型列表 */
export async function getModelsByApiKey(apiKey: string): Promise<ModelInfo[]> {
  const url = `${DEFAULT_BASE_URL}/v1/models`
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  })
  const json = await resp.json()
  if (!json.data || !Array.isArray(json.data)) {
    log.warn('[newapi] /v1/models returned unexpected format', { json })
    return []
  }
  return json.data
    .map((m: { id?: string; owned_by?: string }) => ({
      id: m.id || '',
      ownedBy: m.owned_by || ''
    }))
    .filter((m) => m.id)
    .sort((a, b) => a.id.localeCompare(b.id))
}

// ---------- high-level: ensure token ----------

/** 登录后确保令牌存在，返回完整 API key (sk-xxx) */
export async function ensureToken(session: {
  cookie: string
  userId: number
}): Promise<{ tokenId: number; apiKey: string }> {
  // 1. 搜索已有令牌
  const tokens = await searchToken(session, TOKEN_NAME)
  let token = tokens.length > 0 ? tokens[0] : null

  // 2. 没有则创建
  if (!token) {
    log.info('[newapi] token not found, creating...')
    await createToken(session)
    const newTokens = await searchToken(session, TOKEN_NAME)
    token = newTokens.length > 0 ? newTokens[0] : null
  }

  if (!token) {
    throw new Error('Token creation succeeded but search returned nothing')
  }

  // 3. 获取完整 key
  const rawKey = await getTokenKey(session, token.id)
  return {
    tokenId: token.id,
    apiKey: `sk-${rawKey}`
  }
}

