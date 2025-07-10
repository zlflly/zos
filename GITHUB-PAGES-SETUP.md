# GitHub Pages 快速设置指南

## 🎯 一键部署

我已经为你的项目配置好了GitHub Pages部署，你只需要按照以下步骤操作：

### 1. 创建GitHub仓库
1. 访问 [GitHub](https://github.com)
2. 点击 "New repository"
3. 仓库名称：`zos`
4. 设置为 **Public**（GitHub Pages免费版要求）
5. 点击 "Create repository"

### 2. 连接本地仓库到GitHub

在你的项目目录中运行：

```bash
# 初始化git仓库（如果还没有）
git init

# 添加远程仓库（替换成你的用户名）
git remote add origin https://github.com/zlflly/zos.git

# 推送代码
git add .
git commit -m "Initial commit"
git push -u origin main
```

### 3. 启用GitHub Pages

1. 进入你的GitHub仓库页面
2. 点击 **Settings** 标签
3. 在左侧菜单中找到 **Pages**
4. 在 **Source** 部分选择 **GitHub Actions**
5. 保存设置

### 4. 等待部署完成

- GitHub Actions会自动开始构建和部署
- 在仓库的 **Actions** 标签页可以查看进度
- 部署完成后，网站地址为：`https://你的用户名.github.io/zos/`

## 🚀 便捷脚本

我已经创建了自动化脚本来简化部署流程：

```bash
# Windows用户
npm run deploy:github

# 或直接运行PowerShell脚本
powershell -ExecutionPolicy Bypass -File scripts/deploy-github.ps1
```

## 📋 已配置的文件

以下文件已经为GitHub Pages部署进行了配置：

- ✅ `.github/workflows/deploy.yml` - 自动部署工作流
- ✅ `vite.config.ts` - 添加了GitHub Pages的base路径
- ✅ `public/.nojekyll` - 禁用Jekyll处理
- ✅ `src/config/environment.ts` - 环境配置和功能开关
- ✅ `scripts/deploy-github.ps1` - Windows部署脚本
- ✅ `scripts/deploy-github.sh` - Linux/Mac部署脚本

## ⚠️ 重要提醒

### 服务器端功能限制

GitHub Pages只支持静态文件，以下功能在GitHub Pages版本中将被禁用：

- 🚫 AI聊天功能
- 🚫 用户认证
- 🚫 实时同步
- 🚫 API端点

### 解决方案

1. **演示版本**: GitHub Pages作为功能展示
2. **完整版本**: 继续使用Vercel部署所有功能
3. **功能切换**: 通过环境变量自动禁用不支持的功能

## 🔧 自定义配置

### 修改仓库名称

如果你的仓库名称不是 `zos`，请更新 `vite.config.ts` 中的base路径：

```typescript
base: process.env.NODE_ENV === 'production' ? '/你的仓库名/' : '/',
```

### 自定义域名

如果你有自己的域名：

1. 在 `public` 目录创建 `CNAME` 文件
2. 文件内容为你的域名：`yourdomain.com`
3. 在域名提供商处设置DNS指向GitHub Pages

## 🎉 完成！

按照以上步骤，你的网站就会自动部署到GitHub Pages了！

每次推送代码到main分支，GitHub Actions都会自动重新构建和部署你的网站。 