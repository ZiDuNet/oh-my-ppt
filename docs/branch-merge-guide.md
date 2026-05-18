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
- 方法：`newapiLogin`、`newapiLogout`、`newapiFetchStatus`、`newapiFetchModels`、`newapiSetModel`、`newapiRefreshUser`、`newapiFetchLogs`（并发5页+3天过滤）、`newapiFetchTokenUsage`、`newapiFetchSubscription`

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
