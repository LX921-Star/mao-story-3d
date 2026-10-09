# 部署到 GitHub + 团队协作：分步操作手册

> 给负责人的操作手册。做完第 1–3 步，组员就能开始协作；第 4 步是自动部署。
> 全程只需一台电脑操作一次。

---

## 第 1 步：注册 GitHub 账号（5 分钟）

1. 打开 https://github.com
2. 点右上角 **Sign up**，用邮箱注册一个账号（建议用团队共用邮箱，如 `team@你的域名`）
3. 记下账号、密码、邮箱

> 国内访问 GitHub 若慢，可改用 **Gitee（码云）** https://gitee.com，流程几乎一致，界面中文。

---

## 第 2 步：创建一个空仓库（3 分钟）

1. 登录后点右上角 **+** → **New repository**
2. 填写：
   - **Repository name**：`mao-life-story-3d`
   - **Description**：毛泽东生平时空叙事 3D 地图
   - 选择 **Private**（私有，只有团队成员能看）或 Public（公开）
   - **不要**勾选 "Add a README file"（我们已有代码）
3. 点 **Create repository**
4. 创建后页面会显示仓库地址，形如：
   ```
   https://github.com/你的用户名/mao-life-story-3d.git
   ```
   复制它，第 4 步要用。

---

## 第 3 步：把本地项目推送上去（5 分钟）

项目已经在本地初始化好 Git 仓库并完成首次提交（123 个文件），你只需把它推到刚才创建的仓库。

在项目根目录打开终端，执行（把地址换成你自己的）：

```bash
# 1. 关联远程仓库
git remote add origin https://github.com/你的用户名/mao-life-story-3d.git

# 2. 把主分支命名为 main
git branch -M main

# 3. 推送
git push -u origin main
```

首次推送会要求登录：
- **用户名**：你的 GitHub 用户名
- **密码**：不能用账号密码，需要用 **Personal Access Token（令牌）**
  - 生成方法：GitHub 右上角头像 → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token → 勾选 **repo** 权限 → 生成后复制那串字符，当作密码粘贴。

推送成功后刷新仓库页面，就能看到所有代码了。

---

## 第 4 步：开启自动部署（3 分钟）

代码推上去后，配置 GitHub Pages 自动发布：

1. 进入仓库 → **Settings** → 左侧 **Pages**
2. **Source** 选择 **GitHub Actions**（不要选 Deploy from a branch）
3. 保存

之后每次有代码合并进 `main`，`.github/workflows/deploy.yml` 会自动：
- 安装依赖 → 构建 → 发布

**线上网址**（构建完成后在 Actions 页面可见）：
```
https://你的用户名.github.io/mao-life-story-3d/
```
把这个网址发给所有人，任何设备直接打开即可。

> 首次部署可能需要 1–2 分钟，可在仓库 **Actions** 标签页看进度（绿色 ✅ 表示成功）。

---

## 第 5 步：邀请组员（2 分钟）

1. 仓库 → **Settings** → **Collaborators**（或 Collaborators and teams）
2. 点 **Add people**，输入组员 GitHub 用户名或邮箱
3. 组员会收到邀请邮件，接受后即可拉取、推送代码

组员拿到仓库地址后，按照 **`README-协作指南.md`** 里的「第一次上手」操作即可开始改代码。

---

## 快速回顾：整个协作闭环

```
组员 A 电脑                          主仓库(main)                   线上网站
─────────                          ─────────────                  ─────────
git clone  ───────────────────────▶
改代码
git checkout -b a/xxx
git commit
git push ────────────────────────▶  分支 a/xxx
                                   发起 Pull Request
                                   负责人审核 & 合并 ────────────▶ 自动部署
                                                                  网站更新 ✅
git pull origin main ◀──────────── 同步最新
```

---

## 常见问题

| 问题 | 解决 |
|---|---|
| `git push` 提示权限拒绝 | 再生成一次 Personal Access Token，确认勾选了 `repo` |
| 推送很慢 / 超时 | 改用 Gitee，或配置代理；也可换用 SSH 方式推送 |
| 误把密码提交进代码 | 立刻去 GitHub 撤销该 Token，并从代码里删除敏感信息 |
| 想撤销刚才的提交 | `git reset --soft HEAD~1`（保留改动）或 `git checkout -- 文件`（丢弃改动） |
| 不确定改了什么 | `git status` 和 `git diff` 看改动明细 |
