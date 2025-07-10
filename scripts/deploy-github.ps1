# GitHub Pages 部署脚本 (PowerShell版本)

Write-Host "🚀 开始 GitHub Pages 部署流程..." -ForegroundColor Green

# 检查是否在git仓库中
if (!(Test-Path ".git")) {
    Write-Host "❌ 错误：当前目录不是git仓库" -ForegroundColor Red
    Write-Host "请先运行：git init" -ForegroundColor Yellow
    exit 1
}

# 检查是否有远程仓库
try {
    git remote get-url origin | Out-Null
} catch {
    Write-Host "❌ 错误：没有配置远程仓库" -ForegroundColor Red
    Write-Host "请先运行：git remote add origin https://github.com/你的用户名/zos.git" -ForegroundColor Yellow
    exit 1
}

# 检查是否有未提交的更改
$status = git status --porcelain
if ($status) {
    Write-Host "⚠️  发现未提交的更改，正在提交..." -ForegroundColor Yellow
    git add .
    $commit_message = Read-Host "请输入提交信息（直接回车使用默认信息）"
    if ([string]::IsNullOrEmpty($commit_message)) {
        $commit_message = "Update for GitHub Pages deployment"
    }
    git commit -m $commit_message
}

# 推送到GitHub
Write-Host "📤 推送代码到 GitHub..." -ForegroundColor Blue
git push origin main

Write-Host "✅ 代码已推送到 GitHub！" -ForegroundColor Green
Write-Host ""
Write-Host "📋 接下来的步骤：" -ForegroundColor Cyan
Write-Host "1. 访问你的 GitHub 仓库页面"
Write-Host "2. 进入 Settings > Pages"
Write-Host "3. 在 Source 部分选择 'GitHub Actions'"
Write-Host "4. 等待自动部署完成"
Write-Host ""
Write-Host "🌐 部署完成后，你的网站将在以下地址可用：" -ForegroundColor Magenta
Write-Host "https://你的用户名.github.io/zos/"
Write-Host ""
Write-Host "📊 你可以在 Actions 标签页查看部署进度" -ForegroundColor Blue 