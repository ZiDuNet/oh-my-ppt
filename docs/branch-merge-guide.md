# 分支合并指南：main vs CXNEWAPI

## 分支定位

- **main** — 跟随上游（arcsin1/oh-my-ppt），保持与上游同步，不含 NewAPI 功能
- **CXNEWAPI** — 基于 main，额外集成 NewAPI 潮汐平台（登录/模型/计费/会员）

## 合并方向

```
upstream/main → 本地 main → CXNEWAPI
```

1. 先将 `upstream/main` 合并到本地 `main`
2. 再将本地 `main` 合并到 `CXNEWAPI`

## CXNEWAPI 独有功能（合并时必须保留）

### 1. NewAPI 后端服务

**文件：`src/main/services/newapi.ts`**（+441 行）
- NewAPI HTTP 客户端（`https://new-api.chaoxi.live`）
- 登录/注册/登出、获取用户信息
- 令牌管理（search/create/getKey/delete）
- 模型列表获取、用量查询、调用日志、订阅查询
- 空 body 防御（text()+JSON.parse）

**文件：`src/main/ipc/config/settings-handlers.ts`**（+311 行）
- `newapi:login` — 登录，自动创建 group_ppt 令牌
- `newapi:register` — 注册
- `newapi:getStatus` — 检查登录态
- `newapi:getModels` — 获取可用模型列表
- `newapi:setModel` — 切换模型（写入 settings）
- `newapi:logout` — 登出
- `newapi:refreshUser` — 刷新用户信息
- `newapi:getLogs` — 获取调用日志
- `newapi:getTokenUsage` — 获取令牌用量
- `newapi:getSubscription` — 获取订阅/套餐信息

### 2. NewAPI 前端组件

**文件：`src/renderer/src/components/LoginDialog.tsx`**（+108 行，新文件）
- 登录弹窗组件（用户名/密码表单 + 注册链接）

**文件：`src/renderer/src/components/layout/Sidebar.tsx`**（+175 行）
- 登录状态显示（已登录/未登录）
- 会员卡 UI（订阅套餐信息、余额、到期时间）
- 用户头像 + 名称 + 订阅状态标签
- 主模型/视觉模型名称显示
- 登录/登出按钮
- `formatQuota()` 配额格式化显示
- 字体管理页导航（`/fonts`）

### 3. NewAPI 状态管理

**文件：`src/renderer/src/store/settingsStore.ts`**（+212 行）
- NewAPI 状态：`newapiUser`、`newapiLoggedIn`、`newapiModels`、`newapiLoading`
- 日志/用量/订阅状态：`newapiLogs`、`newapiTokenUsage`、`newapiSubscription`、`newapiPlans`
- 方法：`newapiLogin`、`newapiLogout`、`newapiFetchStatus`、`newapiFetchModels`、`newapiSetModel`、`newapiRefreshUser`、`newapiFetchLogs(page, pageSize)`（单页分页）、`newapiFetchTokenUsage`、`newapiFetchSubscription`

### 4. NewAPI IPC 客户端

**文件：`src/renderer/src/lib/ipc.ts`**（+132 行）
- `NewApiUserInfo`、`ModelInfo`、`NewApiLogItem` 类型定义
- `formatQuota()` 配额动态格式化（亿/千万/万）
- IPC 方法：`newapiLogin`、`newapiRegister`、`newapiGetStatus`、`newapiGetModels`、`newapiSetModel`、`newapiLogout`、`newapiRefreshUser`、`newapiGetLogs`、`newapiGetTokenUsage`、`newapiGetSubscription`

### 5. 设置页 NewAPI 面板

**文件：`src/renderer/src/pages/settings.tsx`**（+1146/-525 行）
- 账户信息面板（用户名/邮箱/角色/额度/已用）
- 令牌用量面板（总额度/已用/剩余）
- 订阅/套餐卡片（套餐名/总额度/已用/到期时间）
- 模型接入区（模型选择下拉 + 拉取模型按钮）
- 调用日志表格（令牌名/模型/额度/tokens/耗时/时间）
- 格式化配额显示（`formatQuota`）

### 6. 视觉模型增强

**文件：`src/main/ipc/config/model-config-utils.ts`**（+18 行）
- 视觉模型按 model name 查找逻辑（复用 active model 的 apiKey/baseUrl，替换 model 名）
- 兼容旧的 model_config id 查找方式

### 7. CI/CD Workflow

**文件：`.github/workflows/build.yml`**
- CXNEWAPI 分支 push 触发 prerelease 构建
- tag push 发布正式 Release
- pnpm → npm 切换（解决 OOM）
- GitHub API 手动创建 Release + 上传安装包

## 合并冲突处理原则

| 冲突文件 | 处理方式 |
|---|---|
| `.github/workflows/build.yml` | **保留 CXNEWAPI**（main 已删除） |
| `src/main/services/newapi.ts` | **保留 CXNEWAPI**（main 无此文件） |
| `src/main/ipc/config/settings-handlers.ts` | **合并**：取上游基础 + 保留 NewAPI handlers |
| `src/renderer/src/components/LoginDialog.tsx` | **保留 CXNEWAPI**（main 无此文件） |
| `src/renderer/src/components/layout/Sidebar.tsx` | **合并**：保留 NewAPI UI + 加入上游新导航项（字体页等） |
| `src/renderer/src/lib/ipc.ts` | **合并**：保留 NewAPI 类型/方法 + 加入上游新 IPC（字体等） |
| `src/renderer/src/store/settingsStore.ts` | **合并**：保留 NewAPI 状态/方法 + 加入上游新字段 |
| `src/renderer/src/pages/settings.tsx` | **合并**：保留 NewAPI 面板 + 加入上游新设置项（max_token 等） |
| `src/main/ipc/config/model-config-utils.ts` | **合并**：保留视觉模型 name 查找 + 加入上游 maxTokens |
| `electron-builder.yml` | **取 main**（上游有更新，我们只需确保 asar:false） |
| `package.json` | **取 main** 基础 + 确认无需额外依赖 |
| `pnpm-lock.yaml` | **取 main** |

## 配额格式化规则

`formatQuota()` 在 `src/renderer/src/lib/ipc.ts` 中：
- 除以 10000，最多 3 位小数，去掉末尾 0
- 拼接 " 万" 后缀
- `1250000` → `125 万`，`1251111` → `125.111 万`
- 值为 0 显示 `0`，null/undefined 显示 `-`
- 调用日志的 `quota` 字段**不格式化**，保持原始值

## 合并踩坑记录（v2.0.10 合并实战）

### 坑 1：上游合并覆盖了 CXNEWAPI 自定义页面

**现象**：合并上游 v2.0.10 后，`settings.tsx` 和 `settingsStore.ts` 被上游版本完全覆盖，NewAPI 登录/模型接入/账户信息面板全部消失。

**根因**：上游对这两个文件做了大量重构（新增 tab、改 UI），合并时文件内容差异过大，git 自动选择了上游版本（因为上游改动更多）。

**修复**：从合并前的最后一个 CXNEWAPI commit 恢复：
```bash
git checkout 8f4b4ad -- src/renderer/src/pages/settings.tsx
git checkout 8f4b4ad -- src/renderer/src/store/settingsStore.ts
```
然后手动补上上游新增的字段（如 `maxTokens` 参数）。

**预防**：合并前先记录 CXNEWAPI 的最后一个 commit hash，合并后立即 diff 检查关键文件。

### 坑 2：`local-asset://` 协议在 Windows 上路径解析失败

**现象**：风格预览 iframe 空白，字体加载失败，资源图片不显示。

**根因**：Windows 路径 `C:\Users\...` 中 `C:` 被 Chromium URL 解析器当作 `host:port` 分隔符。`local-asset://C%3A%2F...` 变成 host=`C`, port=`2F...`，路径完全错误。

**修复**：URL 格式使用 dummy host `f`：
```typescript
// src/renderer/src/lib/ipc.ts
export function localAssetUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return `local-asset://f/${encodeURIComponent(normalized)}`
}
```

协议处理器解析：
```typescript
const url = new URL(request.url)
// local-asset://f/C%3A%2FUsers%2F... → host='f', pathname='/C%3A%2FUsers%2F...'
// decodeURIComponent(pathname.slice(1)) = 'C:/Users/...'
```

**涉及文件**：
- `src/renderer/src/lib/ipc.ts` — `localAssetUrl()` 函数
- `src/main/ipc/config/font-handlers.ts` — Google 字体和用户字体 URL
- `src/renderer/src/pages/styles.tsx` — 风格预览
- `src/renderer/src/components/session-detail/AssetPickerDialog.tsx` — 资源选择器

**关键**：所有使用 `local-asset://` 协议的地方必须统一使用 `local-asset://f/` 格式，搜索 `local-asset:///` 和 `local-asset://` (不带 host) 确保无遗漏。

### 坑 3：`newapiSubscription` 类型访问错误

**现象**：侧边栏会员卡始终显示「未订阅」，即使订阅状态为 active。

**根因**：`newapiSubscription` 类型是 `{ subscriptions: [...], billingPreference: string }`，不是数组。代码中错误地用 `newapiSubscription?.[0]` 访问。

**修复**：统一使用 `newapiSubscription?.subscriptions?.[0]`。

**涉及位置**：
- `Sidebar.tsx` 会员卡状态标签和订阅详情（2 处）
- `settings.tsx` UsagePanel 订阅信息（1 处）

### 坑 4：`verifyApiKey` 参数数量变更

**现象**：合并后 TypeScript 报错，`verifyApiKey` 调用参数不足。

**根因**：上游新增了 `maxTokens` 参数（第 5 个参数），CXNEWAPI 恢复的旧代码只有 4 个参数。

**修复**：调用时补上 `config.maxTokens || 4096`。

### 坑 5：React duplicate key 警告

**现象**：UsagePanel 日志表格报 `Warning: Each child in a list should have a unique "key" prop`。

**根因**：`newapiLogs` 数据中 `log.id` 可能重复（跨页拉取或后端 ID 不唯一）。

**修复**：使用复合 key `${log.id}-${idx}`。

### 坑 6：`newapiFetchLogs` 参数丢失

**现象**：UsagePanel 翻页不生效。

**根因**：store 中 `newapiFetchLogs` 类型签名是 `(page?, pageSize?)` 但实现是 `async ()` 硬编码拉取多页，忽略了传入的分页参数。

**修复**：改为单页拉取，透传参数：
```typescript
newapiFetchLogs: async (page = 0, pageSize = 20) => {
  const result = await ipc.newapiGetLogs({ page, pageSize })
  // ...
}
```

### 坑 7：`asar: false` vs `app.asar.unpacked` 路径

**现象**：生产环境报 `缺少资源文件 anime.v4.js`。

**根因**：`asar: false` 时不存在 `app.asar.unpacked` 目录，但代码硬编码了该路径。Electron-builder 设置改为 `asar: true` 后已修复。

**涉及文件**：`assets-handlers.ts` 中 `getResourcesRoot()` 使用 `app.asar.unpacked` 是正确的（因为上游已改回 `asar: true`）。

**注意**：如果未来改回 `asar: false`，需要统一创建 `resolveAppResourcesPath()` 工具函数，检测 `app.asar.unpacked` 是否存在来动态选择基础路径。

### 坑 8：`I18nKey` 类型不兼容

**现象**：`LoggedInPanel` 组件 prop `t: (key: string) => string` 与实际 `(key: I18nKey) => string` 类型不兼容。

**修复**：import `I18nKey` 类型并更新 prop 类型。

## 合并检查清单

每次从 main 合并到 CXNEWAPI 后，逐一检查：

1. [ ] `pnpm typecheck` 无错误
2. [ ] `settings.tsx` 保留 NewAPI 登录面板 + 模型选择 + UsagePanel
3. [ ] `settingsStore.ts` 保留 NewAPI 全部状态和方法
4. [ ] `Sidebar.tsx` 保留会员卡 + 登录/登出按钮
5. [ ] `localAssetUrl()` 使用 `local-asset://f/` 格式
6. [ ] `font-handlers.ts` 使用 `local-asset://f/` 格式
7. [ ] `newapiSubscription?.subscriptions?.[0]` 不是 `?.[0]`
8. [ ] `verifyApiKey` 调用传 6 个参数
9. [ ] `newapiFetchLogs(page, pageSize)` 透传分页参数
10. [ ] `LoginDialog.tsx` 存在且完整
11. [ ] 风格管理页有「云端」筛选 Tab + 同步按钮
12. [ ] `src/main/services/newapi.ts` 存在且完整

## main 分支相对上游保留的功能

本地 main 跟随 upstream/main 的同时，主动保留了以下增强：

- **云端风格同步**：`styles:syncFromCloud` handler + 设置页云端 URL 配置
- **风格管理页分类筛选**：全部/内置/云端/自定义 Tab
- **视觉模型独立配置**：`resolveVisionModelConfig()` + 设置页选择器
- **粒子文字动画**：`ParticleTextCanvas.tsx` 组件
- **会话状态优化**：加载动画 + 生成任务实时追踪（`generatingIds`）
- **Windows 文件打开修复**：中文路径处理
- **DevTools 内嵌模式**：开发时 `openDevTools()` 不 detach
- **仓库地址**：`ZiDuNet/oh-my-ppt`（更新检测 + CI/CD）
- **asar: false**：解决 ESM 模块打包后加载失败

## CI/CD 技术说明

- **包管理器**：npm（非 pnpm，解决 OOM）
- **Node.js 版本**：24
- **触发方式**：
  - CXNEWAPI 分支 push → 创建 prerelease
  - tag push `v*` → 创建正式 Release
- **构建产物**：Windows `.exe` + Mac `.dmg`
- **发布目标**：GitHub Releases（`ZiDuNet/oh-my-ppt`）
