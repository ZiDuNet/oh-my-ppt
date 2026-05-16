# NewAPI 接口文档

Base URL: `https://new-api.chaoxi.live`
Version: v0.12.9

## 认证方式

两种方式二选一：

1. **Session Cookie** — 登录后服务端返回 `Set-Cookie: session=xxx`，后续请求携带即可
2. **Access Token** — `Authorization: Bearer {token}`（个人设置中生成）

部分接口还需要 header: `New-Api-User: {user_id}`

---

## 接口列表

### 1. 用户注册

```
POST /api/user/register
🔓 无需鉴权
```

**Request Body:**
```json
{
  "username": "string",
  "password": "string",
  "email": "string (optional)"
}
```

**Response:**
```json
{
  "message": "",
  "success": true
}
```

### 2. 用户登录

```
POST /api/user/login
🔓 无需鉴权
```

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "data": {
    "display_name": "testuser_cx",
    "group": "default",
    "id": 3,
    "role": 1,
    "status": 1,
    "username": "testuser_cx"
  },
  "message": "",
  "success": true
}
```

**Response Headers:**
```
Set-Cookie: session=xxx; Path=/; Expires=xxx; Max-Age=2592000; HttpOnly; SameSite=Strict
```

> Session 有效期 30 天（Max-Age=2592000）

### 3. 获取当前用户信息

```
GET /api/user/self
🔐 需要登录
```

**Required Headers:**
```
Cookie: session=xxx
New-Api-User: {user_id}
```

**Response:**
```json
{
  "data": {
    "id": 3,
    "username": "testuser_cx",
    "display_name": "testuser_cx",
    "email": "",
    "group": "default",
    "role": 1,
    "status": 1,
    "quota": 0,
    "used_quota": 0,
    "request_count": 0,
    "aff_code": "jO4H",
    "aff_count": 0,
    "aff_quota": 0,
    "aff_history_quota": 0,
    "inviter_id": 0
  },
  "message": "",
  "success": true
}
```

**关键字段说明:**

| 字段 | 类型 | 说明 |
|------|------|------|
| `quota` | number | 总额度（单位：内部货币） |
| `used_quota` | number | 已用额度 |
| `status` | number | 账号状态（1=正常） |
| `role` | number | 角色（1=普通用户） |
| `group` | string | 用户组（控制可用模型范围） |

### 4. 用户登出

```
GET /api/user/logout
🔓 无需鉴权
```

**Required Headers:**
```
Cookie: session=xxx
New-Api-User: {user_id}
```

**Response:**
```json
{
  "message": "",
  "success": true
}
```

### 5. 获取个人额度数据

```
GET /api/data/self
🔐 需要登录（User 权限）
```

**Required Headers:**
```
Cookie: session=xxx
New-Api-User: {user_id}
```

**Query Parameters:**
```
start_timestamp: unix 时间戳（必填）
end_timestamp: unix 时间戳（必填，与 start 跨度不超过 1 个月）
```

**Response:**
```json
{
  "data": [
    {
      "id": 48,
      "user_id": 1,
      "username": "yunjianxin",
      "model_name": "MiniMax-M2.5",
      "created_at": 1776880800,
      "token_used": 6944,
      "count": 2,
      "quota": 1518
    }
  ],
  "message": "",
  "success": true
}
```

> 必须带日期范围参数，且跨度不超过 1 个月。无消费时返回空数组。

---

## 测试结果（2026-05-16）

| 接口 | 状态 | 备注 |
|------|------|------|
| POST /api/user/register | ✅ | 测试账号 testuser_cx 注册成功 |
| POST /api/user/login | ✅ | 返回 session cookie + 用户基本信息（含 id） |
| GET /api/user/self | ✅ | 需 session + New-Api-User header，返回完整用户信息含余额 |
| GET /api/user/logout | ✅ | 登出成功 |
| GET /api/models | ✅ | 返回 { channelId: [model1, model2, ...] }，34 个渠道 |
| POST /api/token/ | ✅ | 创建令牌，返回 success（无 key/id） |
| GET /api/token/ | ✅ | 令牌列表，key 脱敏 |
| GET /api/token/{id} | ✅ | 单个令牌详情，key 脱敏 |
| GET /api/token/search?keyword= | ✅ | 按名称搜索令牌 |
| **POST /api/token/{id}/key** | ✅ | **获取完整 key（隐藏接口），需加 sk- 前缀** |
| DELETE /api/token/{id} | ✅ | 删除令牌 |
| GET /api/data/self | ✅ | 个人消费记录（需 start_timestamp + end_timestamp） |
| v1/models (Bearer) | ✅ | 用 sk-key 调用成功，返回可用模型 |

## 令牌管理接口

### 创建令牌

```
POST /api/token/
🔐 需要登录
```

**Request Body:**
```json
{
  "name": "潮汐PPT客户端",
  "remain_quota": 0,
  "unlimited_quota": true,
  "expired_time": -1,
  "group": "group_ppt"
}
```

**Response:** `{"message":"","success":true}` （不返回 key 和 id）

### 搜索令牌

```
GET /api/token/search?keyword={name}
🔐 需要登录
```

### 获取令牌完整 Key（隐藏接口）

```
POST /api/token/{id}/key
🔐 需要登录
```

**Response:**
```json
{
  "data": { "key": "0X1PjnUSRQi1sU25pARFRx6mXlnm8FMtFdMsGa4xsTwCButA" },
  "message": "",
  "success": true
}
```

> 完整 API Key = `sk-` + 返回的 key 值

### 删除令牌

```
DELETE /api/token/{id}
🔐 需要登录
```

### App 内完整流程

```
登录 → POST /api/user/login → session + user_id
→ GET /api/token/search?keyword=潮汐PPT客户端
  → 有 → 拿 id → POST /api/token/{id}/key → 拿完整 key → sk-{key}
  → 无 → POST /api/token/ 创建 → GET /api/token/ 列表拿 id → POST /api/token/{id}/key → sk-{key}
→ 用 sk-{key} 作为 LLM API key 调用 v1/chat/completions
→ 退出登录 → DELETE /api/token/{id} → GET /api/user/logout
```

## 测试账号

| 账号 | 用途 | role |
|------|------|------|
| testuser_cx / Test123456 | 普通用户测试 | 1 |
| yunjianxin / ilove4dbim | 管理员测试 | 100 |

## 用户信息字段总结（App 需要关注的）

| 字段 | 说明 | App 用途 |
|------|------|----------|
| `id` | 用户 ID | 鉴权 header `New-Api-User` |
| `username` | 用户名 | 显示 |
| `display_name` | 显示名 | 显示 |
| `quota` | 总额度 | 余额判断 |
| `used_quota` | 已用额度 | 余额判断，剩余 = quota - used_quota |
| `status` | 账号状态 | 1=正常，否则提示账号异常 |
| `group` | 用户组 | 决定可用模型范围 |
