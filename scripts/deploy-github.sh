#!/bin/bash

# GitHub Pages 部署脚本

echo "🚀 开始 GitHub Pages 部署流程..."

# 检查是否在git仓库中
if [ ! -d ".git" ]; then
  echo "❌ 错误：当前目录不是git仓库"
  echo "请先运行：git init"
  exit 1
fi

# 检查是否有远程仓库
if ! git remote get-url origin > /dev/null 2>&1; then
  echo "❌ 错误：没有配置远程仓库"
  echo "请先运行：git remote add origin https://github.com/你的用户名/zos.git"
  exit 1
fi

# 检查是否有未提交的更改
if ! git diff-index --quiet HEAD --; then
  echo "⚠️  发现未提交的更改，正在提交..."
  git add .
  echo "请输入提交信息（直接回车使用默认信息）："
  read commit_message
  if [ -z "$commit_message" ]; then
    commit_message="Update for GitHub Pages deployment"
  fi
  git commit -m "$commit_message"
fi

# 推送到GitHub
echo "📤 推送代码到 GitHub..."
git push origin main

echo "✅ 代码已推送到 GitHub！"
echo ""
echo "📋 接下来的步骤："
echo "1. 访问你的 GitHub 仓库页面"
echo "2. 进入 Settings > Pages"
echo "3. 在 Source 部分选择 'GitHub Actions'"
echo "4. 等待自动部署完成"
echo ""
echo "🌐 部署完成后，你的网站将在以下地址可用："
echo "https://你的用户名.github.io/zos/"
echo ""
echo "📊 你可以在 Actions 标签页查看部署进度" 