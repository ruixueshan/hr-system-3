# HR 系统 3.0 - 部署指南

## 📋 当前状态

- ✅ Web 前端已启动: http://localhost:3000
- ⏳ 云函数待部署 (19个模块)
- ⏳ 数据库待创建 (20个集合)

---

## 🚀 云函数部署

### 方法一：使用 CloudBase CLI (推荐)

```bash
# 1. 登录腾讯云
tcb login

# 2. 逐个部署云函数（在项目根目录）
cd /Users/zhanrui/Documents/hr-system-3.0

# 部署单个云函数示例
tcb fn deploy auth -e cloud1-5glojms9a83c3457 --yes --path /api

# 需要部署的完整列表：
# auth, companies, jobs, applications, interviews, employees,
# worktime, salary-engine, salaries, advances, blacklist, archives,
# logs, stats, bonus-config, notification, qrcode, system, archive
```

### 方法二：使用微信开发者工具 (更简单)

1. 打开微信开发者工具
2. 导入项目：`/Users/zhanrui/Documents/hr-system-3.0/miniprogram`
3. 右键点击 `cloudfunctions` 目录
4. 选择"上传并部署：云端安装依赖"
5. 等待所有函数部署完成

---

## 🗄️ 数据库创建

### 在云开发控制台创建集合

1. 访问 CloudBase 控制台：https://console.cloud.tencent.com/tcb
2. 选择环境：`cloud1-5glojms9a83c3457`
3. 进入"数据库"模块
4. 创建以下集合（共20个）：

```
 companies      # 企业管理
 jobs           # 岗位管理
 applications   # 报名/候选人
 interviews     # 面试管理
 employees      # 员工管理
 worktime       # 工时记录
 salaries       # 薪资记录
 advances       # 预支记录
 archives       # 档案管理
 logs           # 操作日志
 stats          # 统计数据
 qrcode         # 二维码记录
 notification   # 通知记录
 bonus-config   # 提成配置
 blacklist      # 黑名单
 system         # 系统配置
 salary-engine  # 薪资引擎临时数据
 archive        # 归档专用（如果需要）
```

### 创建索引（可选，提高查询性能）

为常用查询字段添加索引，例如：
- `applications`: `{ status: 1, created_at: -1 }`
- `employees`: `{ company_id: 1, status: 1 }`
- `worktime`: `{ employee_id: 1, work_date: -1 }`

---

## 🔧 Web 端 API 配置

Web 端目前代理到云函数路径 `/api`，请确保：

1. `web/src/request.ts` 中的 baseURL 正确：
```typescript
// 开发环境使用代理（已在 vite.config.ts 配置）
// 生产环境需要设置为云函数域名：
// baseURL: 'https://cloud1-5glojms9a83c3457.tcb-api.tencentcloudapi.com'
```

2. `vite.config.ts` 代理配置已生效：
```typescript
proxy: {
  '/api': {
    target: 'https://tcb-api.tencentcloudapi.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, '')
  }
}
```

---

## ✅ 验证部署

### 1. 云函数验证
```bash
# 查看已部署的函数
tcb fn list -e cloud1-5glojms9a83c3457
```

### 2. API 测试
访问：`http://localhost:3000/api/health` 或云函数真实URL

### 3. 数据库验证
在云开发控制台查看集合是否创建成功

---

## 📝 常见问题

### Q1: tcb 命令提示环境不存在？
A: 确保已登录：`tcb login`，并使用正确的环境ID

### Q2: 云函数部署失败？
A: 检查函数目录结构：
```
cloudfunctions/
  ├── auth/
  │   ├── index.js        # 主入口文件
  │   ├── package.json    # 依赖（可选）
  │   └── config.json     # 函数配置（可选）
```

### Q3: Vite 代理不生效？
A: 重启开发服务器，确保 `vite.config.ts` 配置正确

### Q4: 数据库集合创建？
A: 云开发控制台手动创建，或通过 API 动态创建（建议先手动创建）

---

## 📞 下一步

完成以上步骤后：
1. Web 端可正常访问（前端页面已就绪）
2. 云函数提供 API 接口
3. 数据库存储业务数据
4. 开始填充业务逻辑（替换 TODO 部分）

---

**需要帮助**: 随时告诉我部署过程中的具体错误信息。
