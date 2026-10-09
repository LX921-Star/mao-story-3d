# AGENTS.md —— AI 编码助手项目规范

> 本文件供 AI 编码助手（CodeBuddy / Cursor / Copilot 等）自动读取。
> 任何 AI 在本项目中修改代码前，必须遵守以下规则。

## 项目概述

全屏电影级沉浸式 3D 网页：毛泽东生平时空叙事（React 19 + TypeScript + Vite + Three.js）。
前端主工程在 `frontend/`，六幕叙事逻辑在 `frontend/src/three/`。

## 修改守则

1. **最小改动原则**：只修改与任务直接相关的代码，不要顺手重构、重排版、改无关注释。
2. **禁止改动的文件**（除非明确要求）：
   - `frontend/src/data/chinaGeo.ts`（中国地图 GeoJSON，134KB 生成数据）
   - `vite.config.ts` 的 `build.target: 'es2015'`（旧浏览器兼容，必须保留）
   - `frontend/index.html` 顶部的 `window.onerror` 兜底脚本（必须保留）
3. **数据文件结构**：`frontend/src/data/eventPoints.ts` 中每个事件字段固定为
   `year/name/location/lat/lng/title/brief/bgDesc`，增删事件只需增删数组元素。
4. **主题色**：只改 `frontend/src/styles/epic.css` 顶部 `:root` 内的 `--epic-*` 变量，
   不要在别处硬编码颜色值。
5. **相机动画**：时长统一走 `NarrativeController` 的 `PACES` 与 `_scale()`，
   不要在 `ChinaMapScene` 里写死时长。
6. **中文文案**保持庄重、史诗感；不要引入表情符号和口语化表达。

## 验证要求

AI 完成修改后必须指导用户执行：

```bash
cd frontend && npm run dev     # 本地预览确认效果
npm run build                  # 提交前确认构建通过
```

构建报 TypeScript 错误时必须修复，不得用 `any` 或 `@ts-ignore` 糊弄。

## 提交规范

- 一次任务一个 commit，信息格式：`<做了什么>`（中文，如"调整 1935 遵义会议简介"）。
- 不要提交 `node_modules/`、`dist/`、`mao-story.html`（已在 .gitignore）。
