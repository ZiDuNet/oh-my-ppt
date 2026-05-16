# Agent.md

> 不要跑 `npm run lint`。

## Project

Electron 桌面应用，主进程 (`src/main/`) + 渲染进程 (`src/renderer/`) + 共享类型 (`src/shared/`)。
GitHub 仓库: `ZiDuNet/oh-my-ppt`。

## Code Style

- `singleQuote`, `no semi`, `printWidth: 100`, `trailingComma: none`
- 路径别名: `@shared/*`, `@renderer/*`

## Constraints

1. **pageNumber**: 读写 metadata 必须用 `derivePageNumber(pageId, fallback)`，不能直接用存储值
2. **retry 模式**: 不持久化用户消息，不更新 session status，userMessage 中英双语
3. **类型安全**: 禁止 `as any`
4. **运行态保护**: `startingSessionIds` / `beginSessionRunState` / `finalizeGenerationFailure` / `agentManager.removeSession` 不可删

## File Conventions

```
src/main/ipc/generation/xxx-flow.ts  → 每个 flow = resolveXxxContext + executeXxxGeneration
src/main/ipc/generation/types.ts     → 所有生成类型定义
src/main/ipc/generation/metadata-parser.ts → derivePageNumber
src/main/utils/style-skills.ts       → 风格 CRUD + 来源类型 (builtin/custom/override/cloud)
src/main/ipc/config/style-handlers.ts → 风格 IPC handlers + 云端同步
src/main/ipc/config/settings-handlers.ts → 设置 IPC + 云端风格地址
src/renderer/lib/ipc.ts              → 前端 IPC 封装
src/renderer/store/                   → Zustand stores
src/renderer/pages/styles.tsx         → 风格管理页 (筛选/删除/云端同步)
src/renderer/pages/home.tsx           → 首页 (风格选择器按来源分组)
src/renderer/components/ParticleTextCanvas.tsx → 生成进度粒子动画
```

## Style System

- 来源类型: `builtin` | `custom` | `override` | `cloud`
- 内置: 不可删除，编辑后变 override，删除时恢复原版
- 云端: 从远程 JSON 同步，编辑时新建 custom 记录不覆盖原云端
- 云端同步地址配置在设置→高级 tab
- 示例云端风格: `resources/pptstyles.example.json`

## CI/CD

- `.github/workflows/build.yml` — push tag `v*` 触发
- 并行构建 Windows (NSIS) + macOS (DMG)
- electron-builder `--publish always` 自动创建 GitHub Release
