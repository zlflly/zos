# GitHub Pages 部署指南

## 步骤1: 创建GitHub仓库

1. 在GitHub上创建一个新的仓库，名称为 `zos`
2. 将仓库设置为公开（GitHub Pages免费版需要公开仓库）

## 步骤2: 推送代码到GitHub

```bash
# 如果还没有初始化git仓库
git init

# 添加远程仓库
git remote add origin https://github.com/zlflly/zos.git

# 添加所有文件
git add .

# 提交
git commit -m "Initial commit"

# 推送到main分支
git push -u origin main
```

## 步骤3: 启用GitHub Pages

1. 进入你的GitHub仓库页面
2. 点击 "Settings" 标签页
3. 在左侧菜单中找到 "Pages"
4. 在 "Source" 部分选择 "GitHub Actions"
5. 保存设置

## 步骤4: 等待自动部署

- 推送代码后，GitHub Actions会自动触发构建和部署流程
- 你可以在仓库的 "Actions" 标签页查看部署进度
- 部署完成后，你的网站将可以通过以下地址访问：
  `https://你的用户名.github.io/zos/`

## 注意事项

1. **仓库名称**: 我在配置中假设你的仓库名称是 `zos`。如果不同，请修改 `vite.config.ts` 中的 base 路径
2. **分支**: 部署配置设置为监听 `main` 分支的推送
3. **构建产物**: Vite会将构建产物输出到 `dist` 目录
4. **依赖安装**: 使用 `npm ci` 确保依赖安装的一致性

## 自定义域名（可选）

如果你有自己的域名，可以：

1. 在 `public` 目录下创建 `CNAME` 文件
2. 在文件中写入你的域名，例如：`yourdomain.com`
3. 在你的域名提供商处设置DNS记录指向GitHub Pages

## 重要说明：服务器端功能

你的项目包含一些服务器端功能（`api/` 目录中的文件），这些在GitHub Pages上不会工作，因为GitHub Pages只支持静态文件托管。

**受影响的功能：**
- AI聊天功能（需要API密钥）
- 用户认证和速率限制
- Redis数据库连接

**解决方案：**
1. **仅静态功能**: 禁用需要服务器的功能，只部署静态内容
2. **Vercel部署**: 继续使用Vercel部署完整功能
3. **混合方案**: GitHub Pages用于演示，Vercel用于生产

如果你想同时支持两种部署方式，可以通过环境变量来控制功能开关。

## 故障排除

如果部署失败：

1. 检查 Actions 页面的错误日志
2. 确保所有依赖都在 `package.json` 中正确声明
3. 检查构建脚本是否正常工作：`npm run build`
4. 确保没有使用服务器端功能（GitHub Pages只支持静态文件）
5. 如果有环境变量依赖，确保在GitHub Actions中设置了相应的secrets 