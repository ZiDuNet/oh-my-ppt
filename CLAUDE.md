# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Oh My PPT — 本地优先的 AI 幻灯片生成与编辑工具。Electron + React + TypeScript。
生成 HTML 幻灯片，支持 AI 对话修改、可视化拖拽编辑、多格式导出（PDF/PNG/PPTX）。

## Commands

```bash
pnpm dev          # 开发模式（electron-vite dev）
pnpm build        # 生产构建（electron-vite build）
pnpm typecheck    # 完整类型检查（node + web）
pnpm run typecheck:node  # 仅 main/preload 类型检查
pnpm run typecheck:web   # 仅 renderer 类型检查
pnpm db:generate  # Drizzle 生成 migration
pnpm db:migrate   # Drizzle 执行 migration
```

**注意**: 不要运行 `pnpm lint` 和 `pnpm format`。
**注意**: 项目没有自动化测试。

## Code Style

- Prettier: `singleQuote`, `no semi`, `printWidth: 100`, `trailingComma: none`
- 路径别名: `@shared/*` → `src/shared/*`, `@renderer/*` → `src/renderer/src/*`
- ES Module（`"type": "module"`）
- UI 组件使用 Radix UI + Tailwind CSS + CVA

## Architecture

### 进程架构

```
Main Process (Node.js)  ←→  Preload  ←→  Renderer (React)
     src/main/              src/preload/    src/renderer/src/
```

- **Main**: 业务逻辑、数据库、AI Agent、文件系统操作
- **Renderer**: React UI、Zustand 状态管理、IPC 客户端调用
- **Preload**: 安全桥接，暴露 `contextBridge` API
- **Shared**: 跨进程共享的 TypeScript 类型定义

### Main Process 核心模块

- `ipc/context.ts` — IPC 上下文工厂，提供数据库、加密、文件操作、进度推送等依赖
- `agent.ts` — AgentManager，管理多个并发生成会话的 Agent 生命周期和 AbortController
- `ipc/generation/` — 生成流程编排（deck-flow、edit-flow、retry-flow、add-page-flow 等）
- `ipc/engine/` — LLM 集成和 HTML 生成引擎
- `tools/` — LangChain Tool 定义（页面操作、HTML 处理）
- `prompt/` — LLM Prompt 模板
- `db/` — Drizzle ORM + SQLite schema

### Renderer Process 核心模块

- `store/` — Zustand stores（sessionStore、generateStore、sessionDetailStore 等）
- `lib/ipc.ts` — 类型安全的 IPC 客户端封装，所有主进程调用都经过这里
- `components/` — UI 组件（layout、preview iframe、session-detail、ui、ParticleTextCanvas）

### PPT 生成流水线

1. **Planning** — LLM 生成大纲（layout intent）
2. **Design Contract** — 根据风格生成视觉系统
3. **Page Generation** — DeepAgents 并发生成各页 HTML
4. **Finalization** — HTML 组装、校验、写入数据库

### IPC 通信模式

- Renderer → Main: `ipcRenderer.invoke()` 请求/响应
- Main → Renderer: `event.sender.send()` 推送进度（`generate:chunk`）
- 频道命名: `session:create`, `generate:start`, `drag-editor:update-element-layout`

### 数据库

- Drizzle ORM + libSQL (SQLite)
- 双表设计: `generation_pages`（生成运行时）vs `session_pages`（当前状态）
- `session_operations` 表实现版本控制/回滚
- API Key 使用 Electron `safeStorage` 加密存储

### 风格系统

- 风格来源类型: `"builtin" | "custom" | "override" | "cloud"`（定义在 `src/main/utils/style-skills.ts`）
- **内置(builtin)**: 种子数据，不可删除。编辑后变为 `override`，删除时恢复原版
- **云端(cloud)**: 从远程 JSON 同步（`styles:syncFromCloud`），增量写入。编辑时新建一条 `custom` 记录，原云端保持不变
- **自定义(custom/override)**: 用户创建或编辑生成，可删除
- 风格管理页（`src/renderer/src/pages/styles.tsx`）支持 All/Built-in/Cloud/Custom 筛选
- 首页风格选择器按来源分组显示（自定义→内置→云端），带彩色来源标签
- 云端同步地址配置在设置→高级 tab，默认 `https://wushuo.oss-cn-beijing.aliyuncs.com/PPTStyle/pptstyles.json`
- 示例云端风格文件: `resources/pptstyles.example.json`

### 更新检测

- 通过 GitHub Releases API 手动检查（`src/main/index.ts` 的 `fetchLatestRelease`）
- 不使用 electron-updater 自动下载安装，仅通知+跳转下载页
- GitHub 仓库地址: `ZiDuNet/oh-my-ppt`

### CI/CD

- GitHub Actions workflow: `.github/workflows/build.yml`
- 触发条件: push tag `v*`
- 自动构建 Windows NSIS 安装包并发布到 GitHub Release
- electron-builder publish provider: `github`（配置在 `electron-builder.yml`）

## Key Constraints

- **pageNumber 一致性**: metadata 读写必须通过 `derivePageNumber(pageId, fallback)` 从 pageId 提取，不能直接使用存储值
- **retry 模式**: 不持久化用户消息，不调用 `updateSessionStatus('active')`，userMessage 保持中英双语
- **类型安全**: 禁止 `as any`，使用对应 flow context 类型
- **运行态保护**: `startingSessionIds` / `beginSessionRunState` / `finalizeGenerationFailure` / `agentManager.removeSession` 不能删除
- **路径安全**: 文件操作必须经过 `assertPathInAllowedRoots()` 校验
