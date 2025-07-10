// 环境配置
export const ENV = {
  // 判断是否为GitHub Pages部署
  isGitHubPages: import.meta.env.VITE_DEPLOYMENT_TARGET === 'github-pages',
  
  // 判断是否为生产环境
  isProduction: import.meta.env.PROD,
  
  // 判断是否为开发环境
  isDevelopment: import.meta.env.DEV,
} as const;

// 功能开关配置
export const FEATURES = {
  // AI聊天功能（需要服务器端支持）
  enableAI: !ENV.isGitHubPages && (
    import.meta.env.VITE_ANTHROPIC_API_KEY || 
    import.meta.env.VITE_OPENAI_API_KEY
  ),
  
  // 用户认证功能（需要服务器端支持）
  enableAuth: !ENV.isGitHubPages,
  
  // 速率限制功能（需要Redis）
  enableRateLimit: !ENV.isGitHubPages && import.meta.env.VITE_REDIS_URL,
  
  // 实时功能（需要Pusher）
  enableRealtime: !ENV.isGitHubPages && import.meta.env.VITE_PUSHER_KEY,
  
  // 分析功能
  enableAnalytics: ENV.isProduction,
} as const;

// API 端点配置
export const API_CONFIG = {
  baseUrl: ENV.isGitHubPages 
    ? '' // GitHub Pages不支持API
    : import.meta.env.VITE_API_BASE_URL || '/api',
} as const;

// 提示信息
export const MESSAGES = {
  // 当功能在GitHub Pages上不可用时显示的消息
  featureUnavailable: '此功能在演示版本中不可用，请访问完整版本体验所有功能。',
  
  // GitHub Pages特定的欢迎消息
  githubPagesWelcome: '欢迎访问演示版本！某些需要服务器支持的功能已被禁用。',
} as const; 