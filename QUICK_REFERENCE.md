# HR System 3.0 - 快速参考指南

> 为 Agent 设计的快速查阅手册，包含关键信息、常用命令和故障排查

---

## 🚀 快速启动

### 项目基本信息
```
项目名称:      展瑞人力资源管理系统 3.0
环境 ID:       cloud1-5glojms9a83c3457
地域:          ap-shanghai (上海)
技术栈:        Node.js + CloudBase + Vue3 + 小程序
云函数数量:    27+
数据库集合:    20 个
```

### 关键目录
```
cloudfunctions/   # 后端云函数 (27+ 个)
miniprogram/      # 小程序端 (WeChat)
web/              # Web 管理后台 (Vue3)
database/         # 数据库设计和索引
docs/             # 设计文档
scripts/          # 部署脚本
```

---

## 📚 核心概念速查

### 架构四层

| 层级 | 技术 | 职责 |
|------|------|------|
| **表现层** | Vue3 + Element Plus | Web 管理界面 |
| **小程序端** | WeChat Native | 候选人和员工应用 |
| **API 层** | CloudBase Functions | 业务逻辑处理 |
| **数据层** | CloudBase NoSQL | MongoDB 兼容数据库 |

### 云函数分类

| 分类 | 函数 | 说明 |
|------|------|------|
| 🔐 **认证** (7) | auth* | 登录、Token、密码管理 |
| 👥 **招聘** (7) | companies, jobs, applications, interviews, qrcode, candidates, blacklist | 招聘流程管理 |
| 💼 **员工** (3) | employees, users, fix-* | 员工档案和关联 |
| 💰 **薪酬** ⭐ (8) | salary-engine, salaries, worktime, bonus-config, advances | **核心薪酬系统** |
| 📢 **系统** (4) | system, logs, notification, archive | 配置和通知 |

---

## ⚡ 最常用命令

### 部署
```bash
# 部署所有云函数
npm run deploy

# 部署特定模块
npm run deploy:auth
npm run deploy:salary-engine

# 部署 Web 前端
npm run deploy:web
```

### 查看状态
```bash
# 列出已部署的云函数
tcb functions list -e cloud1-5glojms9a83c3457

# 查看函数日志
tcb functions logs salary-engine -e cloud1-5glojms9a83c3457 --limit 50

# 列出数据库集合
tcb database list -e cloud1-5glojms9a83c3457
```

### 测试调用
```bash
# 测试云函数
tcb functions invoke salary-engine \
  -e cloud1-5glojms9a83c3457 \
  --params '{"action":"ping"}'
```

### 开发运行
```bash
# Web 前端开发服务器
cd web && npm run dev

# 小程序
# 在微信开发者工具中打开 miniprogram/ 目录
```

---

## 🗄️ 数据库速查

### 核心集合 (20 个)

#### 用户和招聘
```
users              # 统一用户表 (候选人/员工/管理员)
companies          # 企业信息
jobs               # 岗位信息
qr_codes           # 推荐二维码
applications       # 报名投递
interviews         # 面试记录
candidates         # 候选人档案
blacklists         # 黑名单
```

#### 员工管理
```
employees          # 入职员工
employee_companies # 员工-企业关联 ⭐ 重要（一个员工多企业）
```

#### 薪酬系统 ⭐
```
worktime_records   # 工时记录
salaries           # 薪资单
salary_advances    # 预支单据
salary_insurance_ledgers      # 保险义务台账 ⭐ 重要
salary_insurance_deductions   # 保险扣减流水
```

#### 提成系统
```
recruitment_bonuses      # 招聘奖励
recruitment_bonus_batches # 批次管理
recruitment_bonus_rules  # 提成规则
```

#### 系统配置
```
system_config      # 系统参数
notification_templates # 通知模板
audit_logs         # 审计日志
```

### 关键索引 ⭐

```javascript
// worktime_records (工时查询最常用)
{ employee_id: 1, company_id: 1, work_date: 1 }

// salaries (薪资查询)
{ employee_id: 1, year: 1, month: 1 }

// employee_companies (查员工当前企业)
{ employee_id: 1, status: 1 }

// salary_insurance_ledgers (保险台账)
{ employee_id: 1, company_id: 1, insurance_month: 1 }

// recruitment_bonus_batches (提成批次)
{ batch_key: 1 }  // 唯一
```

---

## 🔐 环境变量

在 CloudBase 控制台 **云函数 → 环境变量** 中设置：

```
ENCRYPTION_KEY      = base64:your-secret-key
JWT_SECRET          = your-jwt-secret
WECHAT_APPID        = (微信小程序 AppID)
WECHAT_APPSECRET    = (微信小程序 AppSecret)
```

生成密钥:
```bash
node -e "console.log(Buffer.from('hr-system-2026-secret-key').toString('base64'))"
```

---

## 🎯 核心业务流程

### 招聘流程
```
1. 发布岗位 (companies → jobs)
   ↓
2. 生成推荐码 (qrcode)
   ↓
3. 候选人投递 (applications)
   ↓
4. 安排面试 (interviews)
   ↓
5. 通知结果 (notification)
   ↓
6. 入职处理 (employees + employee_companies)
```

### 薪酬流程 ⭐
```
1. 记录工时
   wx.cloud.callFunction({
     name: 'worktime',
     data: { action: 'record', work_date: '2026-04-15', hours: 8 }
   })
   ↓
2. 计算薪资 (salary-engine 是统一入口)
   tcb functions invoke salary-engine \
     --params '{"action":"calculate-monthly","year":2026,"month":4}'
   ↓
3. 审批薪资
   云函数: salaries
   操作: approve
   ↓
4. 发放工资
   状态: marked as 'paid'
```

### 保险扣减流程 ⭐
```
1. 创建保险台账 (salary_insurance_ledgers)
   - 定位: employee_id + company_id + insurance_month
   - 金额: 保险应缴金额

2. 扣减保险 (salary_insurance_deductions)
   - 从薪资中扣减
   - 可能分多次扣减（预支补扣等）

3. 查询和对账
   - 查询待扣保险
   - 查询历史扣减
   - 验证完整性
```

---

## 🔍 快速故障排查

### 云函数部署失败
```bash
# 检查环境
tcb env list

# 查看日志
tcb functions logs <function-name> -e cloud1-5glojms9a83c3457

# 重新部署
tcb functions deploy <function-name> -e cloud1-5glojms9a83c3457
```

### 数据库查询超时
```javascript
// ❌ 不好：全表扫描
db.collection('worktime').where({ employee_id: empId }).get()

// ✅ 好：使用复合索引
db.collection('worktime').where({
  employee_id: empId,
  company_id: compId,
  work_date: { $gte: startDate }
}).limit(1000).get()
```

### 小程序登录失败
```javascript
// 检查 code 是否正确获取
wx.login({
  success: res => console.log('Code:', res.code)
})

// 检查云函数返回
wx.cloud.callFunction({
  name: 'auth-login',
  data: { code: code }
}).catch(err => console.error('Error:', err))
```

### 薪酬计算不准确
```javascript
// 1. 检查工时数据
db.collection('worktime_records').where({
  employee_id: empId,
  company_id: compId,
  work_date: { $gte: '2026-04-01', $lte: '2026-04-30' }
}).get()

// 2. 检查生成的薪资
db.collection('salaries').where({
  employee_id: empId,
  year: 2026,
  month: 4
}).get()

// 3. 检查保险扣减
db.collection('salary_insurance_ledgers').where({
  employee_id: empId,
  company_id: compId,
  insurance_month: 202604
}).get()
```

---

## 📖 重要文档导航

| 文档 | 位置 | 用途 |
|------|------|------|
| **完整开发指南** | [PROJECT_DEVELOPMENT_GUIDE.md](PROJECT_DEVELOPMENT_GUIDE.md) | 详细技术文档 |
| 项目 README | [README.md](README.md) | 项目概述 |
| Claude 规范 | [CLAUDE.md](CLAUDE.md) | 开发指南 |
| 数据库设计 | [database/collections.json](database/collections.json) | 集合定义 |
| 索引清单 | [database/INDEXES.md](database/INDEXES.md) | 索引策略 |
| CloudBase 部署 | [CLOUDBASE_SETUP.md](CLOUDBASE_SETUP.md) | 环境配置 |
| 保险系统设计 | [docs/SALARY_INSURANCE_V2_DESIGN.md](docs/SALARY_INSURANCE_V2_DESIGN.md) | 保险逻辑 |

---

## 🎓 常见 API 调用示例

### 登录
```javascript
wx.cloud.callFunction({
  name: 'auth-login',
  data: { code: 'xxx' }
}).then(res => {
  console.log('Token:', res.result.token)
  console.log('User:', res.result.user)
})
```

### 查询岗位
```javascript
wx.cloud.callFunction({
  name: 'jobs',
  data: {
    action: 'list',
    filters: { company_id: 'comp123', is_recruiting: true },
    pagination: { page: 1, limit: 20 }
  }
})
```

### 投递岗位
```javascript
wx.cloud.callFunction({
  name: 'applications',
  data: {
    action: 'create',
    data: {
      user_id: 'user123',
      job_id: 'job456',
      source: 'miniprogram',
      resume: 'Base64数据'
    }
  }
})
```

### 计算月度薪资
```javascript
tcb functions invoke salary-engine \
  -e cloud1-5glojms9a83c3457 \
  --params '{
    "action": "calculate-monthly",
    "data": {
      "year": 2026,
      "month": 4,
      "batch_size": 1000
    }
  }'
```

### 查询薪资
```javascript
wx.cloud.callFunction({
  name: 'salaries',
  data: {
    action: 'list',
    filters: {
      employee_id: 'emp123',
      year: 2026,
      month: 4
    }
  }
})
```

---

## 🛠️ 开发工具链

### 必需工具
- **Node.js** ≥ 18.0
- **CloudBase CLI**: `npm install -g @cloudbase/cli`
- **微信开发者工具** (小程序开发)
- **VS Code** (推荐) 或其他编辑器

### 安装 CloudBase CLI
```bash
npm install -g @cloudbase/cli
tcb login  # 登录腾讯云
```

### 初始化项目环境
```bash
# 根目录
npm install

# 云函数依赖
cd cloudfunctions && npm install

# Web 前端依赖
cd ../web && npm install
```

---

## 💡 性能优化建议

### 数据库优化
1. ✅ 为所有常用查询字段创建索引
2. ✅ 使用复合索引优化多字段查询
3. ✅ 限制查询返回字段: `project({ _id: true, name: true })`
4. ✅ 使用分页: `limit(100).skip(pageNum * 100)`

### 云函数优化
1. ✅ 批量操作减少函数调用次数
2. ✅ 使用缓存存储常用数据
3. ✅ 异步处理长流程 (job queue)
4. ✅ 添加超时控制

### 前端优化
1. ✅ 启用代码分割 (Code Splitting)
2. ✅ 使用虚拟滚动加载大列表
3. ✅ 启用 gzip 压缩
4. ✅ 懒加载非关键模块

---

## 📞 支持和资源

### CloudBase 官方
- 官网: https://cloud.tencent.com/product/tcb
- 控制台: https://console.cloud.tencent.com/tcb
- 文档: https://docs.cloudbase.net

### 微信小程序
- 开发文档: https://developers.weixin.qq.com/miniprogram
- 文档 API: https://developers.weixin.qq.com/miniprogram/dev/api/

### 前端框架
- Vue 3: https://vuejs.org/
- Element Plus: https://element-plus.org/
- Vite: https://vitejs.dev/

---

## 📋 快速检查清单

部署前检查:
- [ ] 环境 ID 已配置: `cloud1-5glojms9a83c3457`
- [ ] 数据库 20 个集合已创建
- [ ] 索引已创建 (见 INDEXES.md)
- [ ] 环境变量已设置
- [ ] 安全规则已应用
- [ ] 云函数代码审查完成
- [ ] 测试用例通过

上线前检查:
- [ ] 所有云函数已部署
- [ ] Web 前端已构建和部署
- [ ] 小程序已发布到开发版
- [ ] 核心流程测试通过
- [ ] 性能测试通过 (QPS > 100)
- [ ] 数据备份已完成
- [ ] 灾备方案已制定

---

**关键快速查询代码**

```bash
# 查看状态
tcb env info -e cloud1-5glojms9a83c3457

# 部署
npm run deploy

# 开发
cd web && npm run dev

# 查询日志
tcb functions logs salary-engine -e cloud1-5glojms9a83c3457 --limit 100

# 调用函数
tcb functions invoke salary-engine -e cloud1-5glojms9a83c3457
```

---

**最后更新**: 2026 年 4 月 15 日
**版本**: 3.0 (生产版本)

