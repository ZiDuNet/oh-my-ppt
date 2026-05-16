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
  remain_quota: number
  unlimited_quota: boolean
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
  const text = await resp.text()
  if (!text) {
    throw new Error(`NewAPI ${method} ${path} returned empty response (status ${resp.status})`)
  }
  const json = JSON.parse(text)
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
    group: opts?.group || 'group_ppt'
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
  const text = await resp.text()
  if (!text) {
    log.warn('[newapi] /v1/models returned empty response', { status: resp.status })
    return []
  }
  let json: { data?: Array<{ id?: string; owned_by?: string }> }
  try {
    json = JSON.parse(text)
  } catch {
    log.warn('[newapi] /v1/models returned invalid JSON', { status: resp.status, body: text.slice(0, 200) })
    return []
  }
  if (!json.data || !Array.isArray(json.data)) {
    log.warn('[newapi] /v1/models returned unexpected format', { status: resp.status })
    return []
  }
  return json.data
    .map((m) => ({
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

// ---------- token usage & logs ----------

export interface SubscriptionInfo {
  id: number
  planId: number
  status: string
  amountTotal: number
  amountUsed: number
  startTime: number
  endTime: number
}

export interface SubscriptionSelf {
  subscriptions: SubscriptionInfo[]
  billingPreference: string
}

/** 获取当前用户订阅信息 */
export async function getSubscriptionSelf(
  session: { cookie: string; userId: number }
): Promise<SubscriptionSelf> {
  const json = await request<{
    data: {
      subscriptions: Array<{
        subscription: {
          id: number
          plan_id: number
          status: string
          amount_total: number
          amount_used: number
          start_time: number
          end_time: number
        }
      }>
      billing_preference: string
    }
  }>('GET', '/api/subscription/self', session)
  return {
    subscriptions: (json.data?.subscriptions || []).map((s) => ({
      id: s.subscription.id,
      planId: s.subscription.plan_id,
      status: s.subscription.status,
      amountTotal: s.subscription.amount_total,
      amountUsed: s.subscription.amount_used,
      startTime: s.subscription.start_time,
      endTime: s.subscription.end_time
    })),
    billingPreference: json.data?.billing_preference || ''
  }
}

export interface SubscriptionPlan {
  id: number
  title: string
  subtitle: string
  priceAmount: number
  currency: string
  durationUnit: string
  durationValue: number
  totalAmount: number
  enabled: boolean
}

/** 获取可用套餐列表 */
export async function getSubscriptionPlans(
  session: { cookie: string; userId: number }
): Promise<SubscriptionPlan[]> {
  const json = await request<{
    data: Array<{
      plan: {
        id: number
        title: string
        subtitle: string
        price_amount: number
        currency: string
        duration_unit: string
        duration_value: number
        total_amount: number
        enabled: boolean
      }
    }>
  }>('GET', '/api/subscription/plans', session)
  return (json.data || []).map((p) => ({
    id: p.plan.id,
    title: p.plan.title,
    subtitle: p.plan.subtitle,
    priceAmount: p.plan.price_amount,
    currency: p.plan.currency,
    durationUnit: p.plan.duration_unit,
    durationValue: p.plan.duration_value,
    totalAmount: p.plan.total_amount,
    enabled: p.plan.enabled
  }))
}

export interface TokenUsage {
  name: string
  usedQuota: number
  remainQuota: number
  unlimitedQuota: boolean
  status: number
  accessedTime: number
}

/** 通过令牌名称获取令牌用量 */
export async function getTokenUsage(
  session: { cookie: string; userId: number },
  tokenName: string
): Promise<TokenUsage | null> {
  const tokens = await searchToken(session, tokenName)
  if (tokens.length === 0) return null
  const t = tokens[0]
  return {
    name: t.name,
    usedQuota: t.used_quota,
    remainQuota: t.remain_quota,
    unlimitedQuota: t.unlimited_quota,
    status: t.status,
    accessedTime: t.accessed_time
  }
}

export interface LogItem {
  id: number
  tokenName: string
  modelName: string
  quota: number
  promptTokens: number
  completionTokens: number
  useTime: number
  isStream: boolean
  createdAt: number
  billingSource: string
  requestPath: string
}

/** 获取当前用户调用日志 */
export async function getSelfLogs(
  session: { cookie: string; userId: number },
  page?: number,
  pageSize?: number
): Promise<{ items: LogItem[]; total: number }> {
  const p = page ?? 0
  const ps = pageSize ?? 50
  const json = await request<{
    data: {
      total: number
      items: Array<{
        id: number
        token_name: string
        model_name: string
        quota: number
        prompt_tokens: number
        completion_tokens: number
        use_time: number
        is_stream: boolean
        created_at: number
        other: string
      }>
    }
  }>('GET', `/api/log/self?p=${p}&page_size=${ps}`, session)
  const items: LogItem[] = (json.data?.items || []).map((item) => {
    let billingSource = ''
    let requestPath = ''
    try {
      const other = JSON.parse(item.other || '{}')
      billingSource = other.billing_source || ''
      requestPath = other.request_path || ''
    } catch {}
    return {
      id: item.id,
      tokenName: item.token_name,
      modelName: item.model_name,
      quota: item.quota,
      promptTokens: item.prompt_tokens,
      completionTokens: item.completion_tokens,
      useTime: item.use_time,
      isStream: item.is_stream,
      createdAt: item.created_at,
      billingSource,
      requestPath
    }
  })
  return { items, total: json.data?.total || 0 }
}

