# 腾讯云 CloudBase 部署优化指南

## 📋 总体优化方案

本文档介绍如何将 HR 系统 3.0 Web 应用优化后部署到腾讯云 CloudBase 静态页面托管。

---

## 🎯 优化内容

### 1. **Vite 构建优化**

#### ✅ 已实现的优化：

| 优化项 | 说明 |
|-----|-----|
| **代码分割** | 将大型库（Vue、Element Plus、工具库）分离为独立chunk |
| **Gzip压缩** | 自动生成`.gz`文件，CloudBase可直接分发 |
| **Tree Shaking** | 移除未使用的代码，减小包体积 |
| **资源分类** | JS/CSS/图片/字体分类存储，便于CDN缓存 |
| **Minify优化** | 使用Terser压缩，移除console和debugger |
| **缓存策略** | 使用hash命名，充分利用浏览器缓存 |
| **Sourcemap关闭** | 生产环境不生成sourcemap，减小构建产物 |

---

## 🚀 快速部署指南

### 第一步：环境准备

```bash
# 1. 安装腾讯云CLI工具
npm install -g @cloudbase/cli

# 2. 进入项目根目录
cd /path/to/hr-system-3.0

# 3. 初始化CloudBase
tcb init
```

### 第二步：安装依赖并构建

```bash
# 安装依赖（包括新增的gzip压缩插件）
npm install

# 类型检查 + 构建（推荐）
npm run build

# 或单独构建
npm run build
```

构建完成后的输出结构：
```
dist/
├── assets/
│   ├── js/          # JS chunks (main, vendor等)
│   ├── css/         # CSS文件
│   ├── img/         # 图片资源
│   └── fonts/       # 字体文件
├── .gz文件          # Gzip压缩版本（自动生成）
└── index.html       # 入口文件
```

### 第三步：部署到 CloudBase

#### 方式A：使用npm脚本（推荐）

```bash
# 部署（有确认提示）
npm run deploy

# 生产部署
npm run deploy:prod
```

#### 方式B：手动使用CLI

```bash
# 上传整个 dist 目录
tcb hosting deploy dist -e cloud1-5glojms9a83c3457

# 观看实时日志
tcb hosting detail -e cloud1-5glojms9a83c3457
```

---

## 📊 构建产物分析

### 推荐的目标大小

| 指标 | 目标值 | 说明 |
|-----|------|------|
| **总包体积** | < 800KB | 包括所有JS/CSS |
| **主chunk体积** | < 200KB | main.js |
| **第一次加载时间** | < 3s | 依赖网络质量 |
| **Gzip后体积** | < 250KB | 部分浏览器会自动解压 |

查看构建大小：

```bash
# 使用Vite的报告功能
npm run build:analyze
```

---

## 🔒 生产环境配置

已创建 `.env.production` 文件，包含以下配置：

```env
# CloudBase API 端点
VITE_API_BASE_URL=https://cloud1-5glojms9a83c3457.service.tcloudbase.com/HTTP

# 禁用调试模式
VITE_DEBUG=false

# 启用错误上报
VITE_ENABLE_ERROR_REPORT=true
```

---

## 🧪 本地预览

构建完成后，可在本地预览生产版本：

```bash
npm run preview
```

访问 `http://localhost:4173`，预览结果与生产环境完全一致。

---

## 🔧 高级优化

### 1. CDN 缓存策略

CloudBase自动为所有静态资源配置CDN缓存。在 `web/dist` 中：

- `index.html` → 无缓存（每次检查更新）
- `assets/js/*.js` → 永久缓存（使用hash，变化时自动更新）
- `assets/css/*.css` → 永久缓存
- 图片/字体 → 永久缓存

### 2. 启用 Brotli 压缩（可选）

若CloudBase支持，可在vite.config中启用Brotli：

```typescript
// 在compression插件中添加
algorithm: 'brotli'  // 比gzip压缩率更高
```

### 3. 预加载关键资源

在 `index.html` 中添加：

```html
<link rel="preload" href="/assets/js/vue-ecosystem-[hash].js" as="script">
<link rel="preload" href="/assets/css/main-[hash].css" as="stylesheet">
```

### 4. 启用 HTTP/2 Server Push（CloudBase自动支持）

无需配置，CloudBase 会自动优化资源分发。

---

## 📈 性能监控

### 构建后检查点

```bash
# 1. 检查dist目录大小
du -sh dist/

# 2. 查看chunk详情
ls -lh dist/assets/js/

# 3. 检查gzip压缩率
ls -lh dist/**/*.gz

# 4. 对比压缩前后
# 如: main.js vs main.js.gz
```

### 运行时性能

可在生产环境使用以下工具：
- Chrome DevTools → Lighthouse
- WebPageTest
- Pingdom

---

## ❌ 常见问题

### Q1: 部署失败，提示权限不足？

```bash
# 重新认证
tcb login
# 或使用环境变量
export TCB_ACCESS_TOKEN=<your-token>
tcb hosting deploy dist -e cloud1-5glojms9a83c3457
```

### Q2: 部署后访问显示白屏？

1. 检查 `index.html` 是否在 `dist/` 根目录
2. 检查路由配置（Vue Router base path）
3. 检查CloudBase控制台的静态资源列表

### Q3: API 请求返回 CORS 错误？

CloudBase 已配置CORS，需确保：
1. 云函数返回正确的CORS头
2. 或使用CloudBase HTTP API（推荐）

### Q4: 构建后bundle体积过大？

```bash
# 分析bundle构成
npm run build:analyze

# 查看哪些库占用空间最大
# 考虑动态导入或按需加载
```

---

## 📦 生成部署清单

运行以下命令生成部署清单：

```bash
# 列出所有将被部署的文件
find dist -type f -exec ls -lh {} \; | awk '{print $5, $9}' | sort -k2

# 统计文件数量
find dist -type f | wc -l

# 计算总大小
du -sh dist/
```

---

## ✅ 部署检查清单

在执行部署前，请确认：

- [ ] 依赖已安装：`npm install`
- [ ] 类型检查通过：`npm run build` 无错误
- [ ] 构建产物完整：`dist/` 目录存在
- [ ] 本地预览正常：`npm run preview`
- [ ] 环境变量正确：`.env.production` 已配置
- [ ] CloudBase CLI 已认证：`tcb login`
- [ ] 环境 ID 正确：`cloud1-5glojms9a83c3457`

---

## 🎉 部署完成

部署成功后，访问：

```
https://cloud1-5glojms9a83c3457.cloudbaseapp.com
```

若配置了自定义域名，使用自定义域名访问。

---

## 📞 后续维护

### 更新应用

```bash
# 修改代码后
npm run build
npm run deploy:prod
```

### 查看部署历史

```bash
tcb hosting:list -e cloud1-5glojms9a83c3457
```

### 回滚上一个版本

```bash
tcb hosting:rollback -e cloud1-5glojms9a83c3457
```

---

## 📚 相关资源

- [Vite 官方文档](https://vitejs.dev/)
- [腾讯云 CloudBase 文档](https://docs.cloudbase.net/)
- [Vue 3 生产部署指南](https://vuejs.org/guide/best-practices/performance.html)
