# 毛泽东生平时空叙事 · 3D 地图 — 团队协作指南

> 面向所有组员。照着做即可在自己的电脑上修改项目，并把改动合并进主分支。

---

## 一、项目是什么

一个全屏电影级沉浸式 3D 网页，用 Three.js 讲述毛泽东生平时空叙事，共 6 个阶段：

1. 片头（恰同学少年 · 橘子洲头）
2. 凝视转场（人像 → 竖版中国地图 → 横版地图，星火依次点亮）
3. 全自动时空漫游（相机按年份飞往各地，背景切换年代氛围）
4. 史诗终章（星火燎原，红遍九州）
5. 解锁自由交互（拖拽旋转、滚轮缩放、悬停预览）
6. 下滑展开纵向生平时间轴，点击节点自动飞回地图对应点

**技术栈**：React 19 + TypeScript + Vite + Three.js

---

## 二、目录结构

```
.
├── frontend/                  ← 前端主工程（主要改这里）
│   ├── src/
│   │   ├── pages/
│   │   │   └── MaoLifeStoryPage.tsx   ← 页面入口，挂载画布、管理阶段与时间轴
│   │   ├── three/                      ← 3D 核心
│   │   │   ├── ChinaMapScene.ts        ← 场景引擎：渲染器、灯光、地图、粒子、相机
│   │   │   ├── NarrativeController.ts   ← 六幕叙事的编排与控制
│   │   │   └── NarrativeUI.ts           ← 所有 DOM 覆盖层（片头、卡片、时间轴 UI）
│   │   ├── data/
│   │   │   ├── eventPoints.ts           ← 【重要】18 个历史事件数据，改内容看这里
│   │   │   └── chinaGeo.ts              ← 中国省份 GeoJSON（一般不用动）
│   │   └── styles/
│   │       └── epic.css                 ← 全部视觉样式
│   ├── index.html
│   └── vite.config.ts
├── backend/                   ← 后端（当前故事页不需要，可忽略）
├── docs/                      ← 产品文档
└── README-协作指南.md          ← 本文件
```

---

## 三、第一次上手（每个组员必做）

### 1. 安装基础环境

| 软件 | 版本 | 说明 |
|---|---|---|
| Node.js | 18 或以上（推荐 20） | https://nodejs.org 下载 LTS 版 |
| Git | 任意较新版本 | https://git-scm.com 下载 |
| VS Code | 最新 | 推荐编辑器 |

安装后打开终端（Windows 用 PowerShell / Git Bash），验证：

```bash
node -v      # 应输出 v18.x 或更高
npm -v
git --version
```

### 2. 克隆仓库

把 `<仓库地址>` 换成团队给你的地址：

```bash
git clone <仓库地址>
cd <项目目录>
```

### 3. 安装依赖

```bash
cd frontend
npm install
```

### 4. 本地启动，实时预览

```bash
npm run dev
```

终端会给出一个地址（默认 `http://localhost:5173`），浏览器打开即可看到效果。
**改代码保存后，页面会自动刷新**，非常适合调样式。

---

## 四、日常协作流程（重点）

> 核心原则：**永远不要直接在 main 分支上改**。每次改动都新建一个分支。

### 1. 开始改之前，先同步最新代码

```bash
git checkout main
git pull origin main
```

### 2. 新建自己的分支

分支名用「你的名字/改什么」，例如：

```bash
git checkout -b lixiang/adjust-color
```

### 3. 改代码并本地预览

```bash
cd frontend
npm run dev
```

### 4. 提交自己的改动

```bash
git add .
git commit -m "调整了片头颜色，改为深红"
```

> commit 信息写清楚「改了什么」，方便别人看懂。

### 5. 推送到远程

```bash
git push origin lixiang/adjust-color
```

### 6. 发起合并请求（Pull Request）

推送后，Git 平台会给出一个创建 **Pull Request / 合并请求** 的链接。
点进去 → 填写说明 → 交给负责人审核 → 审核通过后合并进 main。

合并进 main 后，网站会**自动重新部署**（见第六节）。

---

## 五、常见改动应该改哪个文件

| 想改什么 | 改哪个文件 |
|---|---|
| 增加/删除历史事件、改年份、改简介、改年代氛围 | `frontend/src/data/eventPoints.ts` |
| 改颜色、字体、卡片样式、时间轴样式 | `frontend/src/styles/epic.css` |
| 改 3D 场景：灯光、地图厚度、粒子效果、相机运动 | `frontend/src/three/ChinaMapScene.ts` |
| 改叙事节奏、各阶段时长、镜头路径 | `frontend/src/three/NarrativeController.ts` |
| 改片头文字、卡片文案、UI 结构 | `frontend/src/three/NarrativeUI.ts` |
| 改页面整体结构、滚动联动 | `frontend/src/pages/MaoLifeStoryPage.tsx` |

---

## 六、自动部署是怎么工作的

仓库里已配置好 **GitHub Actions**（见 `.github/workflows/deploy.yml`）。

只要你把改动合并进 `main` 分支：
1. GitHub 自动安装依赖 → 构建 → 生成成品；
2. 自动发布到线上网址。

**组员不需要做任何部署操作**，push 完等 1–2 分钟刷新网站即可看到更新。

> 首次配置自动部署时，需要负责人到 GitHub 仓库 Settings → Pages 里把 Source 选为 **GitHub Actions**（只需做一次）。

---

## 七、提交前自查清单

- [ ] `npm run dev` 能正常打开，没有报错
- [ ] 改动只涉及自己负责的部分，没有误删别人的代码
- [ ] `git status` 里没有多余的临时文件（`.gitignore` 已排除常见临时文件）
- [ ] commit 信息写清楚了改了什么

---

## 八、遇到问题怎么办

| 问题 | 解决 |
|---|---|
| `npm install` 报错 | 确认 Node 版本 ≥ 18；删掉 `node_modules` 重试 |
| 页面白屏 | 按 F12 看 Console 红字；确认用的是 Chrome/Edge 最新版 |
| `git push` 被拒绝 | 先 `git pull origin main` 合并最新代码，再 push |
| 端口 5173 被占用 | 终端会给出新端口号，用新端口访问即可 |
| 合并时冲突 | 找到冲突文件里的 `<<<<<<<` 标记，手动保留正确内容后 `git add` 再 commit |

---

有任何技术问题，在群里问负责人，或把你的报错信息（含截图）发出来。
