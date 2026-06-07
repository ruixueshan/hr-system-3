# HR System 3.0 文档索引导航

> 本页面为 Agent 提供完整的文档导航，快速定位所需信息

---

## 📚 文档体系

```
💯 开发必读（按顺序）
├─ 📄 README.md                        ← 项目概述
├─ 📄 CLAUDE.md                        ← AI 开发规范
├─ 📄 PROJECT_DEVELOPMENT_GUIDE.md     ← 完整技术文档 ⭐
└─ 📄 QUICK_REFERENCE.md               ← 快速参考手册 ⭐

🚀 部署相关
├─ 📄 CLOUDBASE_SETUP.md               ← 环境配置
├─ 📄 DEPLOYMENT_GUIDE.md              ← 部署流程
├─ 📄 CLOUDBASE_INTEGRATION_GUIDE.md   ← 集成指南
├─ 📄 CLOUDBASE_ASYNC_FIX_REPORT.md    ← 异步修复报告
└─ 📄 API_MODULES_FIX_REPORT.md        ← API 修复报告

💾 数据库相关
├─ 📄 database/collections.json        ← 集合定义
├─ 📄 database/INDEXES.md              ← 索引清单
└─ 📄 docs/SALARY_INSURANCE_V2_DESIGN.md ← 保险系统设计

📖 特性文档
├─ 📄 BANK_TRANSFER_FEATURE.md         ← 银行转账功能
├─ 📄 WEB_OPTIMIZATION.md              ← Web 性能优化
└─ 📄 CODEBUDDY.md                     ← CodeBuddy 说明

📋 源码目录
├─ 📁 cloudfunctions/                  ← 云函数后端 (27+ 个)
│   ├─ auth/                           ← 认证系统
│   ├─ salary-engine/                  ← 薪酬计算 ⭐
│   ├─ worktime/                       ← 工时管理
│   ├─ salaries/                       ← 薪资管理
│   └─ ... (其他模块)
├─ 📁 miniprogram/                     ← 小程序端
├─ 📁 web/                             ← Web 管理后台
└─ 📁 scripts/                         ← 部署脚本和工具
```

---

## 🎯 按用途查找文档

### 我想要... → 查看这个文档

#### 快速上手
```
1️⃣  第一次在这个项目工作？
    → 先读: README.md (2min)
    → 再读: QUICK_REFERENCE.md (5min)
    → 最后: PROJECT_DEVELOPMENT_GUIDE.md (详细参考)

2️⃣  需要部署项目？
    → CLOUDBASE_SETUP.md (环境配置)
    → DEPLOYMENT_GUIDE.md (完整流程)
    → cloudbaserc.json (配置文件示例)

3️⃣  理解项目架构？
    → PROJECT_DEVELOPMENT_GUIDE.md → 项目结构 章节
    → README.md → 技术栈 章节
```

#### 后端开发 (云函数)
```
📝 开始开发云函数？
   → PROJECT_DEVELOPMENT_GUIDE.md → 云函数模块详解
   → CLAUDE.md → 代码规范

💰 开发薪酬模块？
   → PROJECT_DEVELOPMENT_GUIDE.md → 薪酬模块详解
   → docs/SALARY_INSURANCE_V2_DESIGN.md (保险系统)
   → cloudfunctions/salary-engine/ (参考代码)

🔐 开发认证模块？
   → PROJECT_DEVELOPMENT_GUIDE.md → 认证模块
   → cloudfunctions/auth/ (参考实现)

🐛 调试云函数？
   → QUICK_REFERENCE.md → 快速故障排查
   → 使用: tcb functions logs
```

#### 前端开发 (Web)
```
🎨 Web 前端开发？
   → PROJECT_DEVELOPMENT_GUIDE.md → Web 管理后台
   → web/package.json (技术栈)
   → web/src/ (源代码)

🌟 性能优化？
   → WEB_OPTIMIZATION.md
   → PROJECT_DEVELOPMENT_GUIDE.md → 性能优化建议

📱 小程序开发？
   → PROJECT_DEVELOPMENT_GUIDE.md → 小程序端
   → miniprogram/ (源码)
```

#### 数据库
```
🗄️ 数据模型设计？
   → database/collections.json (集合定义)
   → PROJECT_DEVELOPMENT_GUIDE.md → 数据库设计

⚡ 性能优化 (索引)？
   → database/INDEXES.md (详细索引清单)
   → PROJECT_DEVELOPMENT_GUIDE.md → 索引策略

💾 数据操作？
   → PROJECT_DEVELOPMENT_GUIDE.md → 数据库操作规范
```

#### 故障排查
```
❌ 部署失败？
   → QUICK_REFERENCE.md → 快速故障排查
   → CLOUDBASE_SETUP.md

❌ 数据库查询慢？
   → QUICK_REFERENCE.md → 数据库查询超时
   → database/INDEXES.md (确认索引)

❌ 小程序登录失败？
   → QUICK_REFERENCE.md → 小程序登录失败
   → PROJECT_DEVELOPMENT_GUIDE.md → 认证模块

❌ 薪资计算错误？
   → QUICK_REFERENCE.md → 薪酬计算不准确
   → PROJECT_DEVELOPMENT_GUIDE.md → 薪酬模块
   → docs/SALARY_INSURANCE_V2_DESIGN.md
```

---

## 🔗 快速链接表

### 核心文档 (必读)

| 文档 | 大小 | 用时 | 核心内容 |
|------|------|------|---------|
| [PROJECT_DEVELOPMENT_GUIDE.md](PROJECT_DEVELOPMENT_GUIDE.md) | 📖 超大 | 30-60min | 完整技术文档，包含所有模块 |
| [QUICK_REFERENCE.md](QUICK_REFERENCE.md) | 📄 中等 | 10-15min | 快速查阅，关键命令和故障排查 |
| [README.md](README.md) | 📄 小 | 5-10min | 项目概述和快速开始 |
| [CLAUDE.md](CLAUDE.md) | 📄 小 | 3-5min | AI 开发规范 |

### 部署和配置

| 文档 | 用途 |
|------|------|
| [CLOUDBASE_SETUP.md](CLOUDBASE_SETUP.md) | CloudBase 环境初始化 |
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | 完整部署步骤 |
| [CLOUDBASE_INTEGRATION_GUIDE.md](CLOUDBASE_INTEGRATION_GUIDE.md) | 集成指南 |
| [cloudbaserc.json](cloudbaserc.json) | CloudBase 配置文件 |

### 数据库

| 文档 | 用途 |
|------|------|
| [database/collections.json](database/collections.json) | 20 个集合定义 |
| [database/INDEXES.md](database/INDEXES.md) | 索引创建和优化 |

### 功能特性

| 文档 | 用途 |
|------|------|
| [docs/SALARY_INSURANCE_V2_DESIGN.md](docs/SALARY_INSURANCE_V2_DESIGN.md) | 保险扣减系统设计 |
| [docs/SALARY_INSURANCE_V2_LOCK.md](docs/SALARY_INSURANCE_V2_LOCK.md) | 保险系统并发控制 |
| [BANK_TRANSFER_FEATURE.md](BANK_TRANSFER_FEATURE.md) | 银行转账功能 |
| [WEB_OPTIMIZATION.md](WEB_OPTIMIZATION.md) | Web 性能优化 |

---

## 📊 项目结构速查

### 云函数 (27+)

**认证系统 (7)**
```
auth/                    # 通用认证
auth-login/              # 小程序微信登录
auth-web-login/          # Web 登录
auth-phone-login/        # 手机号登录
auth-token-verify/       # Token 验证
auth-wechat/             # 微信 OAuth
auth-change-password/    # 密码修改
```

**招聘模块 (7)**
```
companies/               # 企业管理
jobs/                    # 岗位管理
applications/            # 报名投递
interviews/              # 面试管理
qrcode/                  # 推荐二维码
candidates/              # 候选人
blacklist/               # 黑名单
```

**员工模块 (3)**
```
employees/               # 入职管理
users/                   # 用户档案
fix-employee-companies/  # 数据修复
```

**薪酬模块 ⭐ (8)**
```
salary-engine/           # ⭐ 核心薪酬计算入口
salary-engine-v2/        # ⭐ 薪酬引擎 v2
salaries/                # 薪资管理
salaries-v2/             # 薪资 v2
worktime/                # 工时管理
salary-advance/          # 预支管理
advances/                # 预支单据
bonus-config/            # 提成配置
```

**系统模块 (4)**
```
system/                  # 系统配置
logs/                    # 操作日志
notification/            # 消息通知
archive/、archives/      # 数据归档
```

**其他**
```
stats/                   # 统计数据
stats-report/            # 统计报表 (定时器)
common/                  # 公共工具 (非云函数)
test*/                   # 测试函数
init-*/                  # 初始化函数
seed-data/               # 种子数据
```

### 前端 (2 个端)

**小程序 (miniprogram/)**
```
pages/
  ├─ index/              # 首页
  ├─ home/               # 主页
  ├─ login/              # 登录
  ├─ job-apply/          # 职位浏览
  ├─ job-detail/         # 职位详情
  ├─ apply/              # 投递
  ├─ qrcode-scan/        # 二维码扫描
  ├─ internal-onboard/   # 内部入职
  ├─ webview/            # WebView
  └─ my/                 # 个人中心
components/              # 组件库
utils/                   # 工具函数
assets/                  # 静态资源
```

**Web (web/)**
```
src/
  ├─ views/              # 页面
  │   ├─ Dashboard/      # 看板
  │   ├─ Companies/      # 企业管理
  │   ├─ Jobs/           # 岗位管理
  │   ├─ Applications/   # 报名管理
  │   ├─ Employees/      # 员工管理
  │   ├─ Worktime/       # 工时管理
  │   ├─ Salaries/       # 薪资管理 ⭐
  │   ├─ Bonus/          # 提成管理
  │   └─ System/         # 系统设置
  ├─ api/                # API 调用
  ├─ stores/             # 状态管理 (Pinia)
  ├─ router/             # 路由
  ├─ components/         # 公共组件
  └─ utils/              # 工具函数
```

---

## 💻 API 速查表

### 核心 API 接口

| 功能 | 云函数 | 操作 |
|------|--------|------|
| 小程序登录 | `auth-login` | `data: { code }` |
| Web 登录 | `auth-web-login` | `data: { username, password }` |
| Token 验证 | `auth-token-verify` | `data: { token }` |
| 查询岗位 | `jobs` | `{ action: 'list', filters: {...} }` |
| 投递应聘 | `applications` | `{ action: 'create', data: {...} }` |
| 查询工时 | `worktime` | `{ action: 'list', filters: {...} }` |
| **计算薪资** | **`salary-engine`** ⭐ | `{ action: 'calculate-monthly', data: {...} }` |
| 查询薪资 | `salaries` | `{ action: 'list', filters: {...} }` |
| 入职员工 | `employees` | `{ action: 'onboard', data: {...} }` |
| 系统配置 | `system` | `{ action: 'set-config', data: {...} }` |

---

## 🎓 学习路径

### 新开发者入门路线

```
第 1 天: 理解项目
├─ 读 README.md (5min)
├─ 读 PROJECT_DEVELOPMENT_GUIDE.md - 前半部分 (30min)
└─ 在本地配置环境

第 2 天: 学习后端
├─ 学习云函数调用流程 (PROJECT_DEVELOPMENT_GUIDE.md)
├─ 查看 cloudfunctions/ 中的示例代码 (1h)
└─ 部署和测试一个简单函数

第 3 天: 学习前端
├─ 理解 Vue3 + Element Plus (30min)
├─ 阅读 web/ 源代码 (1h)
└─ 启动开发服务器并本地调试

第 4 天: 学习数据库
├─ 理解 20 个集合的作用 (30min)
├─ 查看 database/collections.json (15min)
├─ 学习索引优化 (database/INDEXES.md) (30min)
└─ 在 CloudBase 控制台创建索引

第 5 天: 实战
├─ 选择一个小功能开发 (可选)
├─ 熟悉部署流程 (DEPLOYMENT_GUIDE.md)
└─ 学会故障排查 (QUICK_REFERENCE.md)
```

### 特定领域学习

**薪酬系统 ⭐**
```
1. PROJECT_DEVELOPMENT_GUIDE.md → 薪酬模块详解
2. docs/SALARY_INSURANCE_V2_DESIGN.md → 保险系统
3. cloudfunctions/salary-engine/ → 代码实现
4. database/INDEXES.md → 性能优化
5. 实际测试: 创建测试数据并计算薪资
```

**招聘系统**
```
1. PROJECT_DEVELOPMENT_GUIDE.md → 招聘模块
2. 流程: companies → jobs → applications → interviews
3. miniprogram/pages/job-apply → 前端实现
4. web/src/views/Applications → 管理后台
```

---

## 🚀 常用命令速记

```bash
# === 部署 ===
npm run deploy              # 部署所有云函数
npm run deploy:salary-engine  # 部署薪酬模块
npm run deploy:web          # 部署 Web 前端

# === 查询状态 ===
tcb functions list -e cloud1-5glojms9a83c3457
tcb functions logs salary-engine -e cloud1-5glojms9a83c3457

# === 开发 ===
cd web && npm run dev       # 启动 Web 开发服务

# === 测试调用 ===
tcb functions invoke salary-engine \
  -e cloud1-5glojms9a83c3457 \
  --params '{}'
```

---

## 📞 获取帮助

### 查找信息的建议

1. **快速查找** 
   → QUICK_REFERENCE.md (按关键词搜索)

2. **详细理解**
   → PROJECT_DEVELOPMENT_GUIDE.md (按一级标题导航)

3. **代码实现**
   → 对应的 cloudfunctions/ 目录 (参考源代码)

4. **故障排查**
   → QUICK_REFERENCE.md → 故障排查章节

### 文档内定位

在 PROJECT_DEVELOPMENT_GUIDE.md 中搜索:
- `## ` (一级标题) - 主章节导航
- `### ` (二级标题) - 子章节导航  
- `####` (三级标题) - 小节导航
- 使用 Ctrl+F (⌘+F) 快速搜索关键词

---

## 📋 完整清单

### 文件列表
```
根目录文档:
├─ README.md                         ✅
├─ CLAUDE.md                         ✅
├─ PROJECT_DEVELOPMENT_GUIDE.md      ✅ (新增)
├─ QUICK_REFERENCE.md                ✅ (新增)
├─ DOCUMENTATION_INDEX.md            ✅ (本文件)
├─ CLOUDBASE_SETUP.md               ✅
├─ DEPLOYMENT_GUIDE.md              ✅
├─ CLOUDBASE_INTEGRATION_GUIDE.md    ✅
├─ WEB_OPTIMIZATION.md              ✅
├─ BANK_TRANSFER_FEATURE.md         ✅
├─ CODEBUDDY.md                     ✅
├─ API_MODULES_FIX_REPORT.md        ✅
├─ CLOUDBASE_ASYNC_FIX_REPORT.md    ✅
└─ cloudbaserc.json                 ✅

database/:
├─ collections.json                 ✅
└─ INDEXES.md                       ✅

docs/:
├─ SALARY_INSURANCE_V2_DESIGN.md    ✅
└─ SALARY_INSURANCE_V2_LOCK.md      ✅
```

---

**最后更新**: 2026 年 4 月 15 日
**版本**: 3.0
**状态**: 完整文档体系就绪 ✅

