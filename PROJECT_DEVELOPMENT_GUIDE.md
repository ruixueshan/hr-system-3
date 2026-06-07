# 展瑞人力资源管理系统 3.0 - 完整开发文档

> 最后更新: 2026年4月15日
> 
> 本文档为 HR System 3.0 项目的完整技术文档，供所有开发人员和Agent随时查阅使用。

---

## 📋 目录

1. [项目概述](#项目概述)
2. [技术栈](#技术栈)
3. [项目结构](#项目结构)
4. [CloudBase 云环境](#cloudbase-云环境)
5. [数据库设计](#数据库设计)
6. [云函数模块详解](#云函数模块详解)
7. [小程序端 (MiniProgram)](#小程序端-miniprogram)
8. [Web 管理后台](#web-管理后台)
9. [部署流程](#部署流程)
10. [开发规范](#开发规范)
11. [常见问题排查](#常见问题排查)
12. [重要链接和命令](#重要链接和命令)

---

## 项目概述

### 项目简介

展瑞人力资源管理系统 3.0 是一个基于腾讯云 CloudBase 的现代化招聘和薪酬管理系统。该系统整合了微信小程序、Web 管理后台和云函数后端，支持企业招聘、员工管理、薪酬计算、保险管理等核心功能。

### 核心功能模块

| 模块 | 功能描述 | 适用端 |
|------|--------|------|
| **认证系统** | 微信登录、Web登录、Token验证、密码修改 | 小程序/Web |
| **招聘管理** | 岗位发布、报名投递、二维码推荐、面试安排 | 小程序/Web |
| **员工管理** | 入职管理、员工档案、企业关联、黑名单管理 | Web |
| **薪酬引擎** ⭐ | 工时记录、薪资计算、保险扣减、日结/月结 | 后端核心 |
| **提成管理** | 招聘奖励、绩效奖励、提成结算、批次管理 | Web |
| **工时管理** | 工时记录、审核流程、日志追踪 | 小程序/Web |
| **系统配置** | 参数设置、安全规则、数据字典 | Web |

### 关键特性

- ✅ **无服务器架构**: 基于腾讯云 CloudBase（Serverless）
- ✅ **实时数据库**: MongoDB 兼容的 NoSQL 数据库
- ✅ **跨平台**: 支持小程序、Web、移动端
- ✅ **灵活薪酬**: 支持日结/月结、多层级提成、保险扣减
- ✅ **数据安全**: 加密存储、权限控制、审计日志
- ✅ **高性能**: 完整的索引策略、分布式查询优化

---

## 技术栈

### 后端 (Cloud Functions)

```
Runtime: Node.js 18+
Framework: Tencent CloudBase Functions (无框架依赖，原生 Node.js)
Database: CloudBase NoSQL (MongoDB 兼容)
Authentication: JWT + 微信 OAuth
Encryption: Node.js crypto + Base64
```

**核心依赖**:
```json
{
  "@cloudbase/node-sdk": "^3.5.0",     // CloudBase SDK
  "tcb-admin-node": "^1.23.0",         // CloudBase Admin SDK
  "wx-server-sdk": "^0.0.28",          // 微信服务端 SDK
  "crypto": "^1.0.1"                   // 加密模块
}
```

### 小程序端

```
Runtime: WeChat MiniProgram (原生小程序)
Language: TypeScript
Framework: 原生小程序框架
Cloud SDK: @cloudbase/wechat-mp-sdk
Build: 微信开发者工具
```

**技术栈**:
- 原生小程序API
- TypeScript 类型系统
- CloudBase 小程序 SDK
- 页面路由和组件系统

### Web 管理后台

```
Runtime: Node.js + Browser
Framework: Vue 3 + TypeScript
Build Tool: Vite
CSS: Sass/SCSS
UI Framework: Element Plus
Component lib: unplugin-vue-components
```

**核心依赖**:
```json
{
  "vue": "^3.4.21",                    // Vue 3
  "vue-router": "^4.3.0",              // 页面路由
  "@cloudbase/js-sdk": "^2.26.3",     // CloudBase SDK
  "element-plus": "^2.6.0",            // UI 组件库
  "echarts": "^5.4.3",                 // 数据可视化
  "pinia": "^2.1.7",                   // 状态管理
  "axios": "^1.6.8",                   // HTTP 客户端
  "xlsx": "^0.18.5"                    // Excel 导出
}
```

---

## 项目结构

### 完整目录树

```
hr-system-3.0/
│
├── 📦 cloudfunctions/              # 云函数集合（后端核心）
│   ├── 🔐 auth/                    # 认证相关（5个）
│   │   ├── auth/
│   │   ├── auth-login/
│   │   ├── auth-web-login/
│   │   ├── auth-phone-login/
│   │   ├── auth-wechat/
│   │   ├── auth-token-verify/
│   │   └── auth-change-password/
│   │
│   ├── 👥 recruitment/             # 招聘相关（4个）
│   │   ├── companies/              # 企业管理
│   │   ├── jobs/                   # 岗位管理
│   │   ├── applications/           # 报名投递
│   │   ├── interviews/             # 面试管理
│   │   ├── qrcode/                 # 二维码管理
│   │   ├── candidates/             # 候选人管理
│   │   └── blacklist/              # 黑名单管理
│   │
│   ├── 💼 employees/               # 员工相关（2个）
│   │   ├── employees/              # 入职管理
│   │   ├── users/                  # 用户统一表
│   │   └── fix-employee-companies/ # 数据修复
│   │
│   ├── 💰 salary/                  # 薪酬相关（8个）⭐ 核心模块
│   │   ├── salary-engine/          # ⭐ 薪计算统一入口
│   │   ├── salary-engine-v2/       # ⭐ 薪酬引擎v2
│   │   ├── salaries/               # 薪资记录管理
│   │   ├── salaries-v2/            # 薪资v2
│   │   ├── salary-advance/         # 预支模块
│   │   ├── advances/               # 预支单管理
│   │   ├── bonus-config/           # 提成配置
│   │   ├── worktime/               # 工时管理
│   │   ├── stats-report/           # 统计报表
│   │   └── stats/                  # 统计数据
│   │
│   ├── 📢 notification/            # 通知系统（1个）
│   │   └── notification/
│   │
│   ├── 🛠️ system/                   # 系统配置（2个）
│   │   ├── system/                 # 系统参数
│   │   ├── logs/                   # 操作日志
│   │   └── archive/、archives/     # 数据归档
│   │
│   ├── 🧩 common/                  # 公共工具（非云函数）
│   │   ├── auth.js                 # 认证辅助
│   │   ├── response.js             # 响应处理
│   │   ├── date-utils.js           # 日期工具
│   │   ├── salary-query.js         # 薪资查询助手
│   │   ├── candidateOwnership.js   # 所有权检查
│   │   └── pagination.js           # 分页工具
│   │
│   ├── 🧪 test/                    # 测试函数
│   │   ├── test/
│   │   ├── test-simple/
│   │   └── test-bare/
│   │
│   ├── 📊 data-ops/                # 数据操作脚本
│   │   ├── init-collections/       # 初始化集合
│   │   ├── init-data/              # 初始化数据
│   │   ├── seed-data/              # 种子数据
│   │   ├── insert-mock-data/       # 插入模拟数据
│   │   ├── lowcode-automation/     # 低代码自动化
│   │   └── lowcode-automation-preview/
│   │
│   ├── package.json                # 根目录依赖配置
│   ├── project.config.json         # CloudBase 项目配置
│   └── security-rules.json         # 数据库安全规则
│
├── 📱 miniprogram/                 # 小程序端源码
│   ├── pages/                      # 页面
│   │   ├── index/                  # 首页
│   │   ├── home/                   # 主页
│   │   ├── login/                  # 登录
│   │   ├── job-apply/              # 职位浏览和申请
│   │   ├── job-detail/             # 职位详情
│   │   ├── apply/                  # 申请投递
│   │   ├── qrcode-scan/            # 二维码扫描
│   │   ├── webview/                # WebView 页面
│   │   ├── internal-onboard/       # 内部入职
│   │   └── my/                     # 个人中心
│   ├── components/                 # 可复用组件
│   ├── utils/                      # 工具函数
│   ├── assets/                     # 静态资源
│   ├── app.ts                      # 应用入口
│   ├── app.json                    # 应用配置
│   ├── app.wxss                    # 全局样式
│   ├── project.config.json         # 小程序项目配置
│   ├── tsconfig.json               # TypeScript 配置
│   └── sitemap.json                # SEO 配置
│
├── 💻 web/                         # Web 管理后台
│   ├── src/
│   │   ├── views/                  # 页面组件
│   │   │   ├── Dashboard.vue       # 数据看板
│   │   │   ├── Companies/          # 企业管理
│   │   │   ├── Jobs/               # 岗位管理
│   │   │   ├── Applications/       # 报名管理
│   │   │   ├── Employees/         # 员工管理
│   │   │   ├── Salaries/          # 薪资管理
│   │   │   ├── Bonus/             # 提成管理
│   │   │   ├── Worktime/          # 工时管理
│   │   │   ├── System/            # 系统设置
│   │   │   └── ...
│   │   ├── api/                    # API 调用层
│   │   ├── stores/                 # Pinia 状态管理
│   │   ├── router/                 # 路由配置
│   │   ├── components/             # 公共组件
│   │   ├── utils/                  # 工具函数
│   │   ├── assets/                 # 静态资源
│   │   ├── main.ts                 # 应用入口
│   │   └── App.vue                 # 根组件
│   ├── public/                     # 公共文件
│   ├── index.html                  # HTML 模板
│   ├── vite.config.ts              # Vite 配置
│   ├── tsconfig.json               # TypeScript 配置
│   ├── package.json                # 依赖配置
│   └── dist/                       # 构建输出
│
├── 🗄️ database/                    # 数据库设计文档
│   ├── collections.json            # 集合定义和字段说明
│   ├── INDEXES.md                  # 索引清单和创建方法
│   └── ...
│
├── 📚 docs/                        # 设计文档
│   ├── SALARY_INSURANCE_V2_DESIGN.md    # 保险系统 v2 设计
│   ├── SALARY_INSURANCE_V2_LOCK.md      # 保险系统锁机制
│   └── ...
│
├── 📖 rules/                       # 开发规则 (AI 模式定义)
│   ├── auth-nodejs/
│   ├── auth-web/
│   ├── auth-wechat/
│   ├── web-development/
│   ├── miniprogram-development/
│   ├── cloud-functions/
│   ├── http-api/
│   ├── relational-database-tool/
│   └── ...
│
├── 🔧 scripts/                     # 开发脚本
│   ├── deploy.js                   # 部署脚本
│   ├── create-collections.js       # 创建集合
│   ├── backfill-interviews-from-applications.js
│   ├── repair-employee-companies.js
│   ├── export-candidates.js
│   ├── add-test-jobs.js
│   └── ...
│
├── ⚙️ 配置文件
│   ├── cloudbaserc.json            # CloudBase 环境配置
│   ├── package.json                # 根目录 npm 脚本
│   ├── project.config.json         # 项目全局配置
│   └── project.private.config.json # 私密配置
│
└── 📄 文档文件
    ├── README.md                   # 项目介绍
    ├── CLAUDE.md                   # Claude 开发规范
    ├── CLOUDBASE_SETUP.md          # CloudBase 部署指南
    ├── DEPLOYMENT_GUIDE.md         # 完整部署流程
    ├── CLOUDBASE_INTEGRATION_GUIDE.md
    ├── WEB_OPTIMIZATION.md         # Web 优化文档
    ├── BANK_TRANSFER_FEATURE.md    # 银行转账功能
    └── ...
```

### 模块关键统计

| 类别 | 云函数数量 | 说明 |
|------|----------|------|
| 认证 (auth*) | 7 | auth/auth-login/auth-web-login/auth-phone-login/auth-token-verify/auth-wechat/auth-change-password |
| 招聘 (recruitment) | 7 | companies/jobs/applications/interviews/qrcode/candidates/blacklist |
| 员工 (employee*) | 3 | employees/users/fix-employee-companies |
| 薪酬 (salary*) | 8 | salary-engine/salary-engine-v2/salaries/salaries-v2/salary-advance/advances/bonus-config/worktime |
| 系统 (system*) | 4 | system/logs/archive/archives |
| 其他 | 6 | notification/stats/stats-report/init-*/seed-data |
| **总计** | **27+** | 生产部署 |

---

## CloudBase 云环境

### 环境信息

| 字段 | 值 |
|------|-----|
| **环境 ID** | `cloud1-5glojms9a83c3457` |
| **地域** | `ap-shanghai` (上海) |
| **账号** | 腾讯云账户 |
| **状态** | 正常运行 |

### 自动化脚本配置

| 脚本 | 触发时间 | 功能 |
|------|---------|------|
| `stats-report` | 每天 08:00 | 晨间统计报告 |
| `stats-report` | 每天 18:00 | 晚间统计报告 |

---

## 数据库设计

### 数据库概览

**总集合数**: 20个
**存储方式**: CloudBase NoSQL (MongoDB 兼容)
**访问控制**: 基于 CloudBase 安全规则

### 核心集合说明

#### 1. 用户和权限类

##### `users` - 统一用户表
```
用途: 存储所有用户（候选人、员工、管理员）
字段:
  - openid (string, 唯一) - 微信 openid
  - unionid (string) - 微信 unionid
  - name (string) - 用户名
  - phone (string) - 加密存储
  - id_card (string) - 加密存储
  - user_type (enum) - candidate|employee|admin
  - role (enum) - gm|deputy|hr|external|finance
  - status (enum) - normal|disabled
  - last_login (date) - 最后登录时间
  - created_at (date)
  - updated_at (date)
索引: 
  - openid (唯一)
  - user_type
  - created_at
```

#### 2. 招聘相关类

##### `companies` - 甲方企业
```
用途: 存储客户企业信息
字段包含:
  - name (string) - 企业名称
  - status (enum) - active|paused|terminated
  - contact_person (string) - 联系人
  - created_at (date)
索引:
  - name
  - status
  - created_at
```

##### `jobs` - 岗位信息
```
用途: 存储招聘岗位
关键字段:
  - company_id (string) - 关联企业
  - position (string) - 岗位名称
  - hourly_rate (number) - 员工时薪（小程序展示）
  - purchase_hourly_rate (number) - 采购时薪（成本计算）
  - salary_type (enum) - hourly|monthly|piece
  - is_recruiting (boolean) - 是否招聘中
  - status (enum) - active|paused|closed
索引:
  - company_id
  - is_recruiting + status
  - purchase_hourly_rate
  - created_at
```

##### `applications` - 报名投递
```
用途: 候选人报名投递记录
关键字段:
  - user_id (string) - 候选人
  - job_id (string) - 岗位
  - source (enum) - miniprogram|import|admin|qrcode
  - recommender_id (string) - 推荐人（如通过二维码）
  - status (enum) - pending|contacted|interview|passed|rejected|cancelled
  - qr_code (string) - 二维码标识
索引:
  - user_id
  - job_id
  - status
  - qr_code
  - created_at
```

##### `interviews` - 面试记录
```
用途: 面试安排和记录
关键字段:
  - application_id (string) - 关联投递
  - interview_date (date) - 面试日期
  - result (enum) - pending|pass|fail|absent|rescheduled
  - score (number) - 面试分数
  - evaluation (string) - 评价
索引:
  - application_id
  - interview_date
  - result
```

##### `qr_codes` - 推荐二维码
```
用途: 管理员推荐二维码
关键字段:
  - code (string) - 唯一二维码编码
  - job_id (string) - 关联岗位
  - recommender_id (string) - 推荐人
  - used_count (number) - 使用次数
  - max_uses (number) - 最大次数限制
  - status (enum) - active|paused|expired
索引:
  - code (唯一)
  - job_id
  - recommender_id
  - status
```

##### `blacklists` - 黑名单
```
用途: 存储被拒员工、劣迹者
关键字段:
  - user_id (string) - 被黑名单用户
  - reason (string) - 原因
  - expire_time (date) - 过期时间
  - created_by (string) - 操作人
索引:
  - user_id
  - expire_time
```

#### 3. 员工相关类

##### `employees` - 入职员工
```
用途: 已入职员工存档
关键字段:
  - user_id (string) - 关联用户
  - employee_no (string) - 员工编号
  - department (string) - 部门
  - position (string) - 职位
  - entry_date (date) - 入职日期
  - exit_date (date) - 离职日期
  - status (enum) - active|on-leave|terminated
索引:
  - user_id
  - employee_no
  - status
```

##### `employee_companies` - 员工-企业关联
```
用途: 员工与企业多对多关系（一个员工可在多个企业工作）
关键字段:
  - employee_id (string) - 员工
  - company_id (string) - 企业
  - job_id (string) - 岗位
  - status (enum) - active|on-leave|terminated
  - start_date (date) - 开始日期
  - end_date (date) - 结束日期
关键索引:
  - { employee_id: 1, status: 1 } ✅ 查询员工当前企业（核心）
  - { company_id: 1 }
```

#### 4. 薪酬相关类 ⭐ 核心模块

##### `worktime_records` - 工时记录
```
用途: 每日工时打卡
关键字段:
  - employee_id (string) - 员工
  - company_id (string) - 企业
  - work_date (date) - 工作日期
  - hours (number) - 工作小时数
  - overtime_hours (number) - 加班小时数
  - is_holiday (boolean) - 是否节假日
  - status (enum) - draft|submitted|approved|rejected
  - work_type (enum) - normal|overtime|rest|leave
关键索引:
  - { employee_id: 1, company_id: 1, work_date: 1 } ✅ 最常用
  - { company_id: 1, work_date: 1 }
  - { status: 1 }
```

##### `salaries` - 薪资结算记录
```
用途: 生成的薪资数据（日结或月结）
关键字段:
  - employee_id (string) - 员工
  - company_id (string) - 企业
  - year (number) - 年份
  - month (number) - 月份
  - settlement_mode (enum) - daily|monthly - 日结还是月结
  - gross_salary (number) - 应发总额
  - deductions (number) - 扣减（保险、预支等）
  - net_salary (number) - 实发金额
  - status (enum) - draft|submitted|approved|paid
  - source (enum) - manual|engine-v1|engine-v2 - 数据来源
  - source_salary_fields (object) - 保存原始计算字段
关键索引:
  - { employee_id: 1, year: 1, month: 1 } ✅
  - { company_id: 1, year: 1, month: 1 }
  - { status: 1 }
```

##### `salary_advances` - 预支单据
```
用途: 员工预支记录
关键字段:
  - employee_id (string)
  - company_id (string)
  - advance_amount (number) - 预支金额
  - repay_status (enum) - pending|partial|full
  - created_at (date)
关键索引:
  - { employee_id: 1, company_id: 1 }
```

##### `salary_insurance_ledgers` - 保险义务台账 ⭐ 重要
```
用途: 管理员工-企业-月份的保险扣减义务
关键字段:
  - employee_id (string)
  - company_id (string)
  - insurance_month (number) - 保险月份
  - insurance_amount (number) - 保险总金额
  - company_contribution (number) - 企业承担
  - employee_contribution (number) - 员工个人承担
  - status (enum) - pending|partial|full|cancelled
  - first_due_event_month (number) - 首次计算时的月份
  - created_at (date)
关键索引:
  - { employee_id: 1, company_id: 1, insurance_month: 1 } ✅ 唯一定位
  - { employee_id: 1, company_id: 1, status: 1, first_due_event_month: 1 }
```

##### `salary_insurance_deductions` - 保险扣减流水
```
用途: 每次保险扣减操作的详细记录
关键字段:
  - ledger_id (string) - 关联台账
  - employee_id (string)
  - company_id (string)
  - pay_date (date) - 扣减日期
  - deducted_amount (number) - 实际扣减金额
  - source_type (enum) - salary|advance|adjustment
  - source_id (string) - 关联的薪资或预支单 ID
  - remark (string) - 备注
关键索引:
  - { ledger_id: 1, created_at: 1 }
  - { employee_id: 1, company_id: 1, pay_date: 1 }
  - { source_type: 1, source_id: 1 }
```

##### `recruitment_bonuses` - 招聘奖励
```
用途: HR 推荐有奖统计
关键字段:
  - batch_id (string) - 结算批次 ID
  - recommender_id (string) - HR ID
  - employee_id (string) - 被推荐员工
  - year (number)
  - month (number)
  - amount (number) - 奖励金额
  - status (enum) - pending|approved|paid
关键索引:
  - { batch_id: 1 } ✅
  - { recommender_id: 1, year: 1, month: 1 } ✅
  - { employee_id: 1, year: 1, month: 1 }
```

##### `recruitment_bonus_batches` - 提成批次
```
用途: 月度提成结算批次管理
关键字段:
  - batch_key (string) - 唯一键："{recommender_id}_{year}_{month}"
  - recommender_id (string)
  - year (number)
  - month (number)
  - total_amount (number) - 批次总奖励
  - status (enum) - draft|submitted|approved|paid
  - created_at (date)
关键索引:
  - { batch_key: 1 } ✅ 唯一
  - { year: 1, month: 1 }
  - { recommender_id: 1, year: 1, month: 1 }
```

#### 5. 系统相关类

##### `system_config` - 系统配置
```
用途: 系统参数存储（加班倍数、最低在职天数等）
关键字段:
  - category (string) - 分类（salary|hr|system）
  - key (string) - 配置键
  - value (string) - 配置值
  - description (string) - 说明
  - updated_at (date)
索引:
  - { category: 1, key: 1 }
```

##### `notification_templates` - 通知模板
```
用途: 系统消息模板
字段: template_name, content, variables, status
```

##### `audit_logs` - 审计日志
```
用途: 重要操作记录
关键字段:
  - action (string) - 操作类型
  - actor_id (string) - 操作人
  - target_type (string) - 目标类型
  - target_id (string) - 目标 ID
  - changes (object) - 变更内容
  - created_at (date)
索引:
  - { actor_id: 1, created_at: 1 }
  - { target_type: 1, target_id: 1 }
```

### 索引策略 ⭐ 重要

**复合索引清单** (参考 `database/INDEXES.md`):

#### worktime_records 表
```
✅ { employee_id: 1, company_id: 1, work_date: 1 } - 最常用查询
✅ { company_id: 1, work_date: 1 } - 企业维度统计
✅ { status: 1 } - 按状态过滤
✅ { employee_id: 1, status: 1 } - 员工待审核
```

#### salaries 表
```
✅ { employee_id: 1, year: 1, month: 1 } - 员工历史薪资
✅ { company_id: 1, year: 1, month: 1 } - 企业薪资核算
✅ { status: 1 } - 状态过滤
```

#### salary_insurance_ledgers 表
```
✅ { employee_id: 1, company_id: 1, insurance_month: 1 } - 唯一定位
✅ { employee_id: 1, company_id: 1, status: 1, first_due_event_month: 1 }
✅ { company_id: 1, insurance_month: 1, status: 1 }
```

#### employee_companies 表
```
✅ { employee_id: 1, status: 1 } - 查询员工当前企业（核心）
✅ { company_id: 1 } - 企业员工列表
```

---

## 云函数模块详解

### 云函数调用方式

#### 小程序端
```javascript
wx.cloud.callFunction({
  name: 'salary-engine',
  data: {
    action: 'calculate-monthly',
    employee_id: 'emp123',
    year: 2026,
    month: 4
  }
})
  .then(res => console.log(res))
  .catch(err => console.error(err))
```

#### Web 端
```javascript
// 通过 API 层（代理调用）
import { callCloudFunction } from '@/api/cloudbase'

callCloudFunction('salary-engine', {
  action: 'calculate-monthly',
  employee_id: 'emp123',
  year: 2026,
  month: 4
})
```

#### CloudBase CLI
```bash
# 调用指定云函数
tcb fn invoke salary-engine \
  -e cloud1-5glojms9a83c3457 \
  --params '{"action":"calculate-monthly"}'
```

### 认证模块 (auth*)

#### 1. `auth` - 核心认证
```
功能: 通用认证处理
入参:
  - action: "login" | "verify" | "logout"
  - payload: 根据 action 不同
返回:
  - token (string) - JWT Token
  - user (object) - 用户信息
  - expires_in (number) - 过期时间（秒）
```

#### 2. `auth-login` - 微信小程序登录
```
功能: 微信小程序端的登录
流程:
  1. 小程序调用 wx.login() 获取 code
  2. 将 code 发送到此云函数
  3. 函数调用微信服务器交换 session_key
  4. 创建或更新用户记录
  5. 返回 JWT Token 和用户信息
入参:
  - code (string) - 微信授权码
返回:
  - token, user, expires_in
```

#### 3. `auth-web-login` - Web 管理端登录
```
功能: Web 端的登录（通常为账号+密码或微信扫码）
支持:
  - 账号密码登录
  - 微信扫码登录
入参:
  - username (string) 或 wechat_code (string)
  - password (string) 或留空
返回:
  - token, user, expires_in
```

#### 4. `auth-phone-login` - 手机号登录
```
功能: 通过手机号 + 验证码登录
流程:
  1. 用户输入手机号，请求发送验证码
  2. 用户输入验证码
  3. 验证通过，创建用户或更新手机号
入参:
  - phone (string)
  - code (string) - 已在服务端生成和验证
返回:
  - token, user, expires_in
```

#### 5. `auth-token-verify` - Token 验证
```
功能: 验证 JWT Token 的有效性
入参:
  - token (string)
返回:
  - valid (boolean)
  - user (object) - Token 包含的用户信息
  - message (string)
```

#### 6. `auth-wechat` - 微信 OAuth
```
功能: 微信授权（用户信息、头像等）
流程:
  1. 小程序请求用户授权
  2. 获取 encryptedData 和 iv
  3. 此函数解密用户信息
  4. 更新用户档案
入参:
  - encryptedData (string) - 加密后的用户数据
  - iv (string) - 初始化向量
  - session_key (string) - 微信 session_key
返回:
  - user_info (object) - 昵称、头像等
```

#### 7. `auth-change-password` - 修改密码
```
功能: 管理员修改用户密码
限制: 仅限已认证的管理员操作
入参:
  - user_id (string)
  - new_password (string)
返回:
  - success (boolean)
  - message (string)
```

### 招聘模块 (recruitment)

#### `companies` - 企业管理
```
功能: 企业信息管理
方法:
  - create: 创建企业
  - list: 查询企业列表
  - detail: 获取企业详情
  - update: 编辑企业信息
  - delete: 删除企业
参数示例:
{
  action: 'create',
  data: {
    name: '腾讯科技有限公司',
    short_name: '腾讯',
    industry: '互联网',
    contact_person: '张三',
    contact_phone: '13800000000'
  }
}
```

#### `jobs` - 岗位管理
```
功能: 岗位发布和管理
操作:
  - create: 新增岗位
  - list: 查询岗位列表
  - detail: 获取岗位详情
  - update: 编辑岗位
  - delete: 下架岗位
关键参数:
  - company_id (string) - 关联企业
  - position (string) - 岗位名称
  - hourly_rate (number) - 展示时薪
  - purchase_hourly_rate (number) - 采购时薪（成本）
  - salary_type (enum) - hourly | monthly | piece
示例:
{
  action: 'list',
  filters: {
    company_id: 'company123',
    is_recruiting: true,
    status: 'active'
  },
  pagination: { page: 1, limit: 20 }
}
```

#### `applications` - 报名投递
```
功能: 管理候选人报名投递
操作:
  - create: 新的报名投递
  - list: 查询投递列表
  - detail: 获取投递详情
  - update: 更新状态
  - export: 导出候选人
关键状态流:
  pending -> contacted -> interview -> passed/rejected
参数:
{
  action: 'create',
  data: {
    user_id: 'user123',
    job_id: 'job123',
    source: 'miniprogram|qrcode|admin',
    resume: 'Base64 简历内容',
    qr_code: 'qr123' // 如果来自二维码
  }
}
```

#### `interviews` - 面试管理
```
功能: 面试安排和结果记录
操作:
  - create: 新建面试安排
  - list: 查询面试列表
  - update: 更新面试结果
  - calendar: 获取面试日历
```

#### `qrcode` - 二维码管理
```
功能: 推荐二维码生成和管理
操作:
  - generate: 生成新二维码
  - list: 查询现有二维码
  - detail: 获取二维码详情
  - update: 修改二维码设置
  - scan: 记录二维码扫描
  - getByCode: 通过码值查询
```

#### `candidates` - 候选人管理
```
功能: 候选人档案管理
操作:
  - list: 候选人列表
  - detail: 候选人详情
  - search: 搜索候选人
  - export: 导出候选人
```

#### `blacklist` - 黑名单管理
```
功能: 拒绝、黑标记录
操作:
  - create: 加入黑名单
  - list: 黑名单列表
  - check: 检查用户是否在黑名单
  - remove: 移出黑名单
```

### 员工模块

#### `employees` - 入职管理
```
功能: 新员工入职处理
操作:
  - onboard: 入职员工
  - get: 获取员工信息
  - update: 更新员工信息
  - dismiss: 离职处理
参数:
{
  action: 'onboard',
  data: {
    user_id: 'user123',
    employee_no: 'EMP0001',
    job_id: 'job123',
    company_id: 'company123',
    department: '技术部',
    position: '工程师',
    entry_date: '2026-04-15'
  }
}
```

#### `users` - 用户统一管理
```
功能: 用户档案管理
操作:
  - profile: 获取用户档案
  - update: 更新用户信息
  - search: 搜索用户
  - list: 用户列表
```

#### `fix-employee-companies` - 企业关联修复
```
功能: 修复员工与企业的关联关系
用途: 数据修复脚本
```

### 薪酬模块 ⭐ 核心

#### `salary-engine` - 薪酬计算统一入口 ⭐
```
功能: 核心薪酬计算引擎
流程:
  1. 收集工时数据
  2. 应用计薪规则
  3. 计算提成、奖励
  4. 扣减保险、预支
  5. 生成薪资单
操作:
  - calculate-daily: 日结计算
  - calculate-monthly: 月结计算
  - calculate-bonus: 提成计算
  - calculate-all: 全量重算
  - export: 导出薪资数据
参数:
{
  action: 'calculate-monthly',
  data: {
    year: 2026,
    month: 4,
    filters: {
      company_id: 'company123' // 可选
    },
    batch_size: 1000 // 分批处理
  }
}
返回:
{
  success: true,
  processed: 150,
  failed: 2,
  total_salary: 250000,
  summary: {
    total_gross: 250000,
    total_deductions: 25000,
    total_net: 225000
  }
}
```

核心计算逻辑:
```
1. 查询员工关联企业
2. 获取工时记录（按日期区间）
3. 按薪资类型计算:
   - hourly: 工时数 × 小时费率
   - monthly: 直接月薪
   - piece: 计件数量 × 单价
4. 应用加班倍数（1.5倍、2倍）
5. 添加各类奖励（提成、绩效奖）
6. 扣减:
   - 保险缴纳
   - 预支还款
   - 其他扣减
7. 汇总得出应发、扣减、实发
8. 保存到 salaries 集合
```

主要字段追踪:
```javascript
{
  employee_id: 'emp123',
  company_id: 'comp123',
  year: 2026,
  month: 4,
  settlement_mode: 'monthly', // 日结 daily 或 月结 monthly
  
  // 原始数据来源
  normal_hours: 160,           // 正常工时
  overtime_hours: 20,          // 加班工时
  holiday_hours: 0,            // 节假日工时
  
  // 薪资计算
  hourly_rate: 150,            // 员工分摊时薪
  gross_salary: 25000,         // 应发总额
  
  // 扣减明细
  insurance_deduction: 1200,   // 保险扣减
  advance_deduction: 500,      // 预支还款
  bonus_deduction: 0,          // 提成扣减（可能的）
  total_deductions: 1700,
  
  // 实发金额
  net_salary: 23300,
  
  // 状态追踪
  status: 'approved',          // draft|submitted|approved|paid
  
  // 数据溯源（新增）
  source: 'engine-v2',         // manual|engine-v1|engine-v2
  source_salary_fields: {...}, // 保存原始计算数据，用于对账
  
  // 时间戳
  created_at: '2026-05-01T10:00:00Z',
  updated_at: '2026-05-05T15:30:00Z'
}
```

#### `salaries` - 薪资数据管理
```
功能: 薪资单查询、导出、审批
操作:
  - list: 薪资列表
  - detail: 薪资详情
  - export: 导出 Excel
  - approve: 审批通过
  - reject: 驳回
参数:
{
  action: 'list',
  filters: {
    company_id: 'company123',
    year: 2026,
    month: 4,
    status: 'draft|submitted|approved|paid'
  }
}
```

#### `worktime` - 工时管理
```
功能: 工时记录、审核、打卡
操作:
  - record: 记录工时
  - list: 工时列表
  - approve: 审核通过
  - reject: 驳回
  - export: 导出
参数:
{
  action: 'record',
  data: {
    employee_id: 'emp123',
    company_id: 'comp123',
    work_date: '2026-04-15',
    hours: 8,
    overtime_hours: 2,
    work_type: 'normal|overtime|rest|leave',
    remark: '正常班次'
  }
}
```

#### `bonus-config` - 提成配置
```
功能: 设置提成规则（招聘奖、绩效奖等）
操作:
  - create: 新建配置
  - list: 配置列表
  - update: 修改配置
  - delete: 删除配置
示例:
{
  action: 'create',
  data: {
    name: '招聘推荐奖',
    type: 'recruitment',
    amount: 500,          // 固定金额
    percentage: 0,        // 或百分比
    conditions: {
      min_days_worked: 7  // 最少在职天数
    }
  }
}
```

#### `salary-advance` - 预支管理
```
功能: 员工预支申请、审批、还款
操作:
  - apply: 申请预支
  - list: 预支列表
  - approve: 批准预支
  - repay: 还款记录
参数:
{
  action: 'apply',
  data: {
    employee_id: 'emp123',
    company_id: 'comp123',
    amount: 1000,
    reason: '急用',
    expected_repay_date: '2026-05-15'
  }
}
```

#### `advances` - 预支单位管理
```
功能: 预支单据的创建和跟踪
```

### 系统模块

#### `system` - 系统配置
```
功能: 系统参数管理
操作:
  - set-config: 设置参数
  - get-config: 获取参数
  - list: 列表查询
关键参数:
  - salary.overtime_multiplier: 1.5
  - salary.external_min_days: 7
  - hr.min_hires: 3
  - system.encryption_key: (环境变量)
```

#### `logs` - 操作审计日志
```
功能: 记录所有重要操作
```

#### `notification` - 通知系统
```
功能: 消息推送、模板管理
```

### 数据操作脚本

#### `init-collections` - 初始化集合
```
功能: 创建数据库集合
用途: 首次部署
```

#### `seed-data` - 种子数据导入
```
功能: 导入测试数据
用途: 开发和演示
```

---

## 小程序端 (MiniProgram)

### 架构概览

```
小程序端架构:
├── 页面层 (pages/)
├── 业务逻辑层 (utils/ + api/)
├── UI 组件层 (components/)
├── CloudBase SDK
└── WeChat Native APIs
```

### 主要页面

#### 1. `index` - 首页
```
用途: 小程序启动页
展示:
  - 快速登录按钮
  - 推荐岗位
  - 用户引导
路由: /pages/index/index
```

#### 2. `login` - 登录页
```
用途: 用户登录
支持:
  - 微信授权登录
  - 手机号登录
  - 账号密码登录
流程:
  1. 用户选择登录方式
  2. 调用微信或云函数
  3. 保存 token 到本地存储
  4. 重定向到首页
路由: /pages/login/login
```

#### 3. `home` - 首页（登录后）
```
用途: 已登录用户首页
展示:
  - 推荐岗位列表
  - 个人信息卡片
  - 快捷导航
  - 通知消息
```

#### 4. `job-apply` - 岗位浏览
```
用途: 浏览和筛选岗位
功能:
  - 岗位列表
  - 搜索、筛选（地区、薪资等）
  - 排序（最新、热度等）
页面列表:
  - company_id: 按企业筛选
  - location: 工作地点
  - salary_range: 薪资范围
```

#### 5. `job-detail` - 岗位详情
```
用途: 查看岗位详细信息
展示:
  - 岗位描述
  - 薪酬待遇
  - 企业信息
  - 申请按钮
路由参数: id (job_id)
```

#### 6. `apply` - 申请投递
```
用途: 提交职位申请
流程:
  1. 填写或认可个人信息
  2. 上传简历
  3. 提交申请
  4. 显示成功提示
```

#### 7. `qrcode-scan` - 二维码扫描
```
用途: 扫描推荐二维码
流程:
  1. 调用 wx.scanCode()
  2. 解析二维码内容
  3. 获取对应岗位信息
  4. 自动填充推荐人和二维码标识
  5. 跳转到 apply 页面
```

#### 8. `webview` - WebView 容器
```
用途: 加载外部网页或 H5 页面
示例: 隐私 policy、在线题库等
```

#### 9. `internal-onboard` - 内部入职
```
用途: 内部推荐员工的入职页（通常是 Admin 使用）
功能:
  - 选择候选人
  - 确认岗位、企业
  - 设置入职日期
```

#### 10. `my` - 个人中心
```
用途: 用户个人页面
功能:
  - 个人信息编辑
  - 我的投递
  - 面试安排
  - 登出
```

### 核心 TypeScript 类型定义 (miniprogram.d.ts)

```typescript
// 用户类型
interface User {
  _id: string
  openid: string
  unionid?: string
  name: string
  phone: string // 加密存储
  user_type: 'candidate' | 'employee' | 'admin'
  avatar?: string
  created_at: Date
}

// 岗位类型
interface Job {
  _id: string
  company_id: string
  position: string
  location: string
  hourly_rate: number
  purchase_hourly_rate: number
  salary_type: 'hourly' | 'monthly' | 'piece'
  is_recruiting: boolean
  status: 'active' | 'paused' | 'closed'
}

// 报名类型
interface Application {
  _id: string
  user_id: string
  job_id: string
  status: 'pending' | 'contacted' | 'interview' | 'passed' | 'rejected'
  source: 'miniprogram' | 'qrcode' | 'admin'
  created_at: Date
}
```

### 关键工具函数

#### CloudBase 连接
```typescript
// utils/cloudbase.ts
import CCloud from '@cloudbase/wechat-mp-sdk'

export const cloud = CCloud.init({
  env: 'cloud1-5glojms9a83c3457'
})

export async function callFunction(name: string, data: any) {
  try {
    const response = await cloud.callFunction({
      name,
      data
    })
    return response.result
  } catch (error) {
    console.error(`Error calling ${name}:`, error)
    throw error
  }
}
```

#### 认证管理
```typescript
// utils/auth.ts
export class AuthManager {
  static async login() {
    // 1. 微信 login 获取 code
    const { code } = await wx.login()
    
    // 2. 调用 auth-login 云函数
    const { token, user } = await wx.cloud.callFunction({
      name: 'auth-login',
      data: { code }
    })
    
    // 3. 保存 token
    wx.setStorageSync('auth_token', token)
    wx.setStorageSync('user', user)
    
    return { token, user }
  }
  
  static getToken() {
    return wx.getStorageSync('auth_token')
  }
  
  static logout() {
    wx.removeStorageSync('auth_token')
    wx.removeStorageSync('user')
  }
}
```

---

## Web 管理后台

### 架构概览

```
Web 前端架构:
├── src/
│   ├── views/          # 页面组件（Vue 单文件）
│   ├── components/     # 公共组件
│   ├── stores/         # Pinia 状态管理
│   ├── api/            # API 调用层
│   ├── router/         # 路由配置
│   ├── utils/          # 工具函数
│   ├── main.ts         # 应用入口
│   └── App.vue         # 根组件
├── vite.config.ts      # Vite 构建配置
├── tsconfig.json       # TypeScript 配置
└── public/             # 静态资源
```

### 主要路由

| 路由 | 组件 | 功能 | 权限 |
|------|------|------|------|
| `/` | Dashboard | 数据看板 | 登录用户 |
| `/login` | Login | 登录页 | 游客 |
| `/companies` | CompaisonList | 企业管理 | admin/hr |
| `/jobs` | JobsManage | 岗位管理 | admin/hr |
| `/applications` | ApplicationsList | 报名管理 | admin/hr |
| `/applications/:id` | ApplicationDetail | 报名详情 | admin/hr |
| `/interviews` | InterviewList | 面试管理 | admin/hr |
| `/employees` | EmployeeList | 员工管理 | admin/hr |
| `/employees/:id` | EmployeeDetail | 员工详情 | admin/hr |
| `/worktime` | WorktimeList | 工时管理 | admin/hr/finance |
| `/salaries` | SalaryList | 薪资管理 | admin/finance |
| `/salaries/:id` | SalaryDetail | 薪资详情 | admin/finance |
| `/bonuses` | BonusList | 提成管理 | admin/hr |
| `/system` | SystemConfig | 系统设置 | admin |

### 核心业务功能

#### 1. 企业管理 (Companies)
```
路由: /companies
页面:
  - CompanyList: 企业列表（分页、搜索、过滤）
  - CompanyForm: 新建/编辑企业
View 展示:
  - 企业名称、行业、状态
  - 联系人、电话
  - 操作按钮（编辑、删除、查看详情）
```

#### 2. 岗位管理 (Jobs)
```
路由: /jobs
页面:
  - JobsList: 岗位列表
  - JobForm: 新建/编辑岗位
关键字段展示:
  - 企业、岗位名称、工作地
  - 时薪、采购价、招聘状态
  - 操作（编辑、上架/下架）
```

#### 3. 报名管理 (Applications)
```
路由: /applications
页面:
  - ApplicationsList: 报名列表（可按状态、岗位、企业筛选）
  - ApplicationDetail: 申请人详情和联系记录
功能:
  - 查看投递信息
  - 修改状态（contacted、interview、passed、rejected）
  - 安排面试
  - 导出候选人
  - 批量操作
```

#### 4. 面试管理 (Interviews)
```
路由: /interviews
页面:
  - InterviewCalendar: 面试日历视图
  - InterviewList: 面试列表
  - InterviewForm: 新建/编辑面试
功能:
  - 日期/时间安排
  - 评分和评价
  - 面试结果记录
  - 下一轮面试安排
```

#### 5. 员工管理 (Employees) ⭐
```
路由: /employees
核心操作:
  - 员工入职
  - 编辑员工信息
  - 关联企业（一个员工可在多个企业）
  - 离职处理
关键字段:
  - 员工号、姓名、手机（加密）
  - 入职日期、所在企业、部门、岗位
  - 在职状态（active / on-leave / terminated）
```

#### 6. 工时管理 (Worktime) ⭐
```
路由: /worktime
页面:
  - WorktimeList: 工时列表（按企业、日期或员工筛选）
  - WorktimeForm: 手动录入工时
  - WorktimeApproval: 审核待批工时
功能:
  - 记录员工工时（正常班、加班、休息）
  - 审核工时记录
  - 导出工时报表
  - 工时统计
关键指标:
  - 正常工时、加班工时、缺勤
```

#### 7. 薪资管理 (Salaries) ⭐ 核心
```
路由: /salaries
操作:
  1. 触发薪酬计算 (salary-engine)
  2. 查看薪资列表
  3. 审批薪资
  4. 导出薪资条
  5. 发放工资
功能页面:
  - SalaryList: 薪资列表（可按年月、企业、状态筛选）
  - SalaryDetail: 薪资详情
    * 基本工资、加班费、提成等明细
    * 保险扣减、预支还款等扣减明细
    * 应发、扣减、实发总额
  - SalaryBatch: 批量导出和审批
关键操作:
  - 提交审批
  - 批准发放
  - 标记已发放
  - 导出 Excel
显示信息:
  - 员工名、企业名、月份
  - 工时数、薪资
  - 各类奖励、扣减
  - 最终应发金额
```

#### 8. 提成管理 (Bonus) ⭐
```
路由: /bonuses
功能:
  - 设置提成规则 (bonus-config)
  - 生成提成批次
  - 审批提成单
  - 导出提成结算表
关键概念:
  - recruitment_bonus_rules: 表示什么条件下获得多少提成
  - recruitment_bonus_batches: 某 HR 某月的提成批次
  - recruitment_bonuses: 该批次中的具体奖励明细
操作流程:
  1. HR 提交本月提成申请
  2. 系统根据规则自动计算
  3. 管理员审批
  4. 并入下月薪资或单独发放
```

#### 9. 系统设置 (System)
```
路由: /system
配置项:
  1. 薪酬参数
     - overtime_multiplier: 加班倍数（1.5 或 2）
     - external_min_days: 外协人员最少在职天数
  2. HR 参数
     - min_hires: 达标最少入职人数
  3. 系统参数
     - encryption_key: (环境变量，不直接修改)
     - jwt_secret: (环境变量，不直接修改)
操作:
  - 查看当前参数
  - 创建/编辑参数
  - 删除参数
```

### 状态管理 (Pinia)

核心 Store 结构:

```typescript
// stores/userStore.ts
export const useUserStore = defineStore('user', {
  state: () => ({
    user: null,
    token: null,
    permissions: []
  }),
  actions: {
    async login(credentials) { /* 登录 */ },
    async logout() { /* 登出 */ },
    async fetchPermissions() { /* 获取权限 */ }
  }
})

// stores/salaryStore.ts
export const useSalaryStore = defineStore('salary', {
  state: () => ({
    salaries: [],
    loading: false
  }),
  actions: {
    async fetchSalaries(filters) { /* 查询薪资 */ },
    async calculateSalaries(params) { /* 触发计算 */ },
    async approveSalaries(ids) { /* 审批 */ }
  }
})
```

### API 调用层

```typescript
// api/salary.ts
export async function calculateMonthly(year: number, month: number) {
  return callCloudFunction('salary-engine', {
    action: 'calculate-monthly',
    data: { year, month }
  })
}

export async function getSalaries(filters: SalaryFilter) {
  return callCloudFunction('salaries', {
    action: 'list',
    filters
  })
}

export async function getSalaryDetail(salaryId: string) {
  return callCloudFunction('salaries', {
    action: 'detail',
    id: salaryId
  })
}

export async function approveSalary(salaryId: string) {
  return callCloudFunction('salaries', {
    action: 'approve',
    id: salaryId
  })
}
```

### 构建和部署

#### 开发环境
```bash
# 安装依赖
cd web
npm install

# 启动开发服务器
npm run dev
# 访问 http://localhost:5173
```

#### 生产构建
```bash
# 构建
npm run build
# 生成 dist/ 目录

# 分析构建
npm run build:analyze

# 预览生产构建
npm run preview
```

#### CloudBase 部署
```bash
# 部署到 CloudBase（使用 CloudBase CLI）
npm run deploy

# 或手动部署
tcb hosting deploy dist -e cloud1-5glojms9a83c3457
```

---

## 部署流程

### 前置条件

- ✅ 腾讯云账户
- ✅ CloudBase 环境已创建（`cloud1-5glojms9a83c3457`）
- ✅ CloudBase CLI 已安装：`npm install -g @cloudbase/cli`
- ✅ 微信开发者账户（用于小程序）

### 1. 环境配置

#### 1.1 登录腾讯云
```bash
tcb login
# 按提示在浏览器中登录
```

#### 1.2 验证环境
```bash
tcb env list
# 确认看到 cloud1-5glojms9a83c3457
```

### 2. 数据库初始化

#### 2.1 创建集合
通过 CloudBase 控制台或 CLI 创建以下 20 个集合：

```sql
-- 用户系统
users, companies, jobs

-- 招聘流程
qr_codes, applications, interviews

-- 员工管理
employees, employee_companies, blacklists

-- 薪酬系统
worktime_records, salaries, salary_advances
salary_insurance_ledgers, salary_insurance_deductions

-- 提成系统
recruitment_bonuses, recruitment_bonus_batches, recruitment_bonus_rules

-- 系统配置
system_config, notification_templates, audit_logs
```

创建命令（示例）:
```bash
# 通过 CLI 创建（需要 CloudBase 支持）
tcb database createCollection --name users

# 或通过 Web 控制台手动创建
# 进入 CloudBase 控制台 -> 数据库 -> 新建集合
```

#### 2.2 创建索引
参考 `database/INDEXES.md`，为每个表创建必要的索引：

```
worktime_records:
  - { employee_id: 1, company_id: 1, work_date: 1 }
  - { company_id: 1, work_date: 1 }
  - { status: 1 }

salaries:
  - { employee_id: 1, year: 1, month: 1 }
  - { company_id: 1, year: 1, month: 1 }
  
等等...
```

#### 2.3 配置安全规则
将 `cloudfunctions/security-rules.json` 中的规则复制到 CloudBase 控制台：

```
CloudBase 控制台 -> 数据库 -> 安全规则 -> 粘贴规则内容 -> 发布
```

### 3. 环境变量配置

在 CloudBase 控制台 **云函数 → 环境变量** 中设置：

```
ENCRYPTION_KEY = base64:your-secret-key-here
JWT_SECRET = your-jwt-secret
WECHAT_APPID = (微信小程序 AppID)
WECHAT_APPSECRET = (微信小程序 AppSecret)
```

生成密钥示例：
```bash
node -e "console.log(Buffer.from('hr-system-2026-secret-key').toString('base64'))"
```

### 4. 部署云函数

#### 4.1 安装依赖
```bash
cd cloudfunctions
npm install
cd ..
```

#### 4.2 部署所有云函数
```bash
# 使用脚本部署
npm run deploy

# 或逐个部署
tcb functions deploy auth -e cloud1-5glojms9a83c3457
tcb functions deploy salary-engine -e cloud1-5glojms9a83c3457
tcb functions deploy employees -e cloud1-5glojms9a83c3457
# ... 其他函数
```

#### 4.3 验证部署
```bash
# 查看已部署的云函数
tcb functions list -e cloud1-5glojms9a83c3457

# 测试云函数调用
tcb functions invoke auth-login \
  -e cloud1-5glojms9a83c3457 \
  --params '{"code":"test_code"}'
```

### 5. 小程序部署

#### 5.1 配置小程序
编辑 `miniprogram/project.config.json`:
```json
{
  "appid": "your_wechat_appid",
  "projectname": "hr-system-mp",
  "setting": {}
}
```

#### 5.2 构建小程序
在微信开发者工具中：
1. 打开 `miniprogram/` 目录
2. 点击 **上传** 或 **预览**
3. 为了发布，需要通过微信审核

### 6. Web 管理后台部署

#### 6.1 构建
```bash
cd web
npm install
npm run build
```

#### 6.2 部署到 CloudBase
```bash
# 使用 npm 脚本（推荐）
npm run deploy

# 或手动使用 CLI
tcb hosting deploy dist -e cloud1-5glojms9a83c3457 --cloudPath /
```

#### 6.3 访问 Web 应用
部署后，访问 CloudBase 为你分配的域名或自定义域名。

### 7. 初始化系统数据

#### 7.1 调用系统初始化函数
```bash
# 创建默认的系统配置
tcb functions invoke system \
  -e cloud1-5glojms9a83c3457 \
  --params '{
    "action": "set-config",
    "data": {
      "category": "salary",
      "key": "overtime_multiplier",
      "value": "1.5",
      "description": "加班费倍数"
    }
  }'
```

#### 7.2 插入测试数据（可选）
```bash
# 通过 seed-data 函数
tcb functions invoke seed-data \
  -e cloud1-5glojms9a83c3457 \
  --params '{}'
```

### 8. 验证部署成功

```bash
# 1. 检查云函数状态
tcb functions list -e cloud1-5glojms9a83c3457

# 2. 测试关键云函数
tcb functions invoke salary-engine \
  -e cloud1-5glojms9a83c3457 \
  --params '{"action":"ping"}'

# 3. 查看数据库集合
tcb database list -e cloud1-5glojms9a83c3457

# 4. 测试 Web 应用访问
# 打开浏览器，访问 CloudBase 提供的域名

# 5. 测试小程序
# 在微信开发者工具中预览或扫码测试
```

---

## 开发规范

### 代码规范

#### 1. 云函数编码规范

**文件结构**:
```
salary-engine/
├── index.js              # 主入口
├── calculate-monthly.js  # 月结计算逻辑
├── calculate-daily.js    # 日结计算逻辑
├── calculate-bonus.js    # 提成计算逻辑
├── response.js           # 响应处理
└── package.json
```

**响应格式**:
```javascript
// 成功响应
{
  code: 0,
  message: 'Success',
  data: {
    // 业务数据
  }
}

// 错误响应
{
  code: 1,
  message: 'Error message',
  error: {
    type: 'ValidationError | AuthError | NotFoundError',
    details: {}
  }
}
```

**入参验证**:
```javascript
function validateInput(action, data) {
  const rules = {
    'calculate-monthly': {
      year: { required: true, type: 'number' },
      month: { required: true, type: 'number', min: 1, max: 12 }
    }
  }
  
  const rule = rules[action]
  if (!rule) throw new Error(`Unknown action: ${action}`)
  
  for (const [key, constraint] of Object.entries(rule)) {
    if (constraint.required && !data[key]) {
      throw new Error(`Missing required field: ${key}`)
    }
  }
}
```

**错误处理**:
```javascript
exports.main = async (event, context) => {
  try {
    const { action, data } = event
    
    // 验证
    validateInput(action, data)
    
    // 执行
    const result = await handleAction(action, data)
    
    // 返回
    return response.success(result)
  } catch (error) {
    console.error('Error:', error)
    return response.error(error.message)
  }
}
```

#### 2. 小程序编码规范

**TypeScript 类型定义**:
```typescript
// 声明所有接口
interface WeChat {
  login(): Promise<{ code: string }>
  cloud: Cloud
  setStorageSync(key: string, data: any): void
  getStorageSync(key: string): any
}

interface Cloud {
  callFunction(options: {
    name: string
    data: any
  }): Promise<{ result: any }>
  database(): Database
}
```

**页面生命周期**:
```typescript
import { AuthManager } from '../utils/auth'

export default {
  data: () => ({
    loading: false,
    jobList: []
  }),
  
  async onLoad(options) {
    // 页面加载
    await this.checkAuth()
    await this.fetchJobs()
  },
  
  async onShow() {
    // 页面显示（每次都调用）
  },
  
  async onHide() {
    // 页面隐藏
  },
  
  async onUnload() {
    // 页面卸载
  },
  
  methods: {
    async checkAuth() {
      const token = AuthManager.getToken()
      if (!token) {
        wx.navigateTo({ url: '/pages/login/login' })
      }
    }
  }
}
```

#### 3. Web 前端编码规范

**Vue 3 + TypeScript 组件**:
```typescript
<template>
  <div class="container">
    <el-form ref="formRef" :model="form" @submit.prevent="handleSubmit">
      <el-form-item label="岗位名称" prop="position">
        <el-input v-model="form.position" />
      </el-form-item>
    </el-form>
    <el-button type="primary" @click="handleSubmit">保存</el-button>
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { createJob } from '@/api/jobs'

interface JobForm {
  position: string
  hourly_rate: number
}

const formRef = ref()
const form = reactive<JobForm>({
  position: '',
  hourly_rate: 0
})

const handleSubmit = async () => {
  try {
    await formRef.value?.validate()
    await createJob(form)
    ElMessage.success('创建成功')
  } catch (error) {
    ElMessage.error(error.message)
  }
}
</script>

<style scoped lang="scss">
.container {
  padding: 20px;
}
</style>
```

### 数据库操作规范

#### 1. 查询优化
```javascript
// ❌ 不好：全表扫描
db.collection('worktime').get()

// ✅ 好：带索引的精确查询
db.collection('worktime').where({
  employee_id: employeeId,
  company_id: companyId,
  work_date: { $gte: startDate, $lte: endDate }
}).get()
```

#### 2. 数据一致性
```javascript
// 使用事务确保数据一致性
const { transaction } = await cloud.database().startTransaction()

try {
  // 创建工资记录
  await transaction.collection('salaries').add(salaryData)
  
  // 更新员工状态
  await transaction.collection('employees').where({
    _id: employeeId
  }).update({ last_salary_date: new Date() })
  
  // 记录审计日志
  await transaction.collection('audit_logs').add(auditLog)
  
  await transaction.commit()
} catch (error) {
  await transaction.rollback()
  throw error
}
```

#### 3. 加密敏感数据
```javascript
const crypto = require('crypto')

function encryptPhone(phone, encryptionKey) {
  const cipher = crypto.createCipher('aes-256-cbc', encryptionKey)
  let encrypted = cipher.update(phone, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return encrypted
}

function decryptPhone(encrypted, encryptionKey) {
  const decipher = crypto.createDecipher('aes-256-cbc', encryptionKey)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
```

### API 调用规范

#### 1. 请求超时
```javascript
const timeout = 30000 // 30 秒

try {
  const response = await Promise.race([
    callCloudFunction('salary-engine', params),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    )
  ])
} catch (error) {
  console.error('Request failed:', error)
}
```

#### 2. 重试机制
```typescript
async function callFunctionWithRetry(
  name: string,
  data: any,
  maxRetries = 3
): Promise<any> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await cloud.callFunction({ name, data })
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await delay(Math.pow(2, i) * 1000) // 指数退避
    }
  }
}
```

#### 3. 错误处理
```javascript
try {
  const result = await callCloudFunction('jobs', {
    action: 'list',
    filters: { company_id: companyId }
  })
  return result
} catch (error) {
  // 指定错误类型处理
  if (error.code === 'UNAUTHORIZED') {
    // 未授权，跳转登录
    redirectToLogin()
  } else if (error.code === 'NOT_FOUND') {
    // 资源不存在
    showNotification('岗位不存在')
  } else {
    // 其他错误
    logError(error)
    showNotification('操作失败，请稍后重试')
  }
}
```

### 提交规范

#### Git 提交信息格式
```
<type>: <subject>
<blank line>
<body>
<blank line>
<footer>
```

类型:
- **feat**: 新功能
- **fix**: 修复
- **docs**: 文档
- **style**: 代码格式
- **refactor**: 重构
- **perf**: 性能
- **test**: 测试
- **chore**: 构建工具等

示例:
```
feat: 添加保险扣减功能

- 新增 salary_insurance_ledgers 集合
- 实现保险计算逻辑
- 添加保险台账查询 API

Fixes #123
```

---

## 常见问题排查

### 1. 云函数部署失败

**问题**: `Error: Deploy failed`

**排查步骤**:
```bash
# 1. 检查环境
tcb env list

# 2. 检查云函数目录
ls -la cloudfunctions/

# 3. 查看日志
tcb functions logs salary-engine -e cloud1-5glojms9a83c3457

# 4. 重新部署
tcb functions deploy salary-engine -e cloud1-5glojms9a83c3457
```

**常见原因**:
- ❌ 环境 ID 错误
- ❌ package.json 缺失
- ❌ 网络连接问题
- ✅ 检查 cloudbaserc.json 配置

### 2. 数据库查询超时

**问题**: `Database query timeout`

**优化方案**:
```javascript
// ❌ 慢查询：没有索引，全表扫描
db.collection('worktime').where({
  employee_id: empId
}).get()

// ✅ 快查询：使用复合索引
db.collection('worktime').where({
  employee_id: empId,
  company_id: compId,
  work_date: { $gte: startDate }
}).limit(1000).get()
```

**检查索引**:
```bash
# 查看集合的索引
tcb database showIndexes --collection worktime -e cloud1-5glojms9a83c3457
```

### 3. 小程序登录失败

**问题**: 微信登录返回错误

**排查**:
```javascript
// 1. 检查 AppID
console.log('AppID:', cloudbaserc.json 中的应用ID)

// 2. 查看微信返回的错误
wx.login({
  success: res => {
    console.log('Code:', res.code)
    // 调用云函数
    wx.cloud.callFunction({
      name: 'auth-login',
      data: { code: res.code }
    }).then(res => {
      console.log('Result:', res)
    }).catch(err => {
      console.error('Error:', err) // 查看具体错误
    })
  }
})
```

### 4. 薪酬计算不准确

**问题**: 薪资数据错误

**检查流程**:
```
1. 检查工时数据
   - 查询 worktime_records 表
   - 验证 hours、overtime_hours
   - 检查 work_type 是否正确

2. 检查薪资配置
   - hourly_rate 是否正确
   - purchase_hourly_rate 是否正确

3. 检查计算日志
   - 查看 salary-engine 的输出日志
   - 验证计算逻辑

4. 重新计算
   - 删除错误的薪资记录
   - 重新调用 salary-engine
```

**手动查询验证**:
```javascript
// 查询员工的工时
db.collection('worktime_records').where({
  employee_id: 'emp123',
  company_id: 'comp123',
  work_date: { $gte: '2026-04-01', $lte: '2026-04-30' }
}).get()

// 查询生成的薪资
db.collection('salaries').where({
  employee_id: 'emp123',
  year: 2026,
  month: 4
}).get()

// 查询保险扣减
db.collection('salary_insurance_ledgers').where({
  employee_id: 'emp123',
  company_id: 'comp123',
  insurance_month: 202604
}).get()
```

### 5. 数据库安全规则问题

**问题**: `Permission denied` 或 `Unauthorized`

**排查**:
```bash
# 查看当前安全规则
tcb database showRules -e cloud1-5glojms9a83c3457

# 查看用户权限
# 确认用户是否具有正确的角色
```

**修复安全规则**:
```javascript
// 在 cloudfunctions/security-rules.json 中定义
{
  "collections": {
    "salaries": {
      "permission": "rule(doc.uid == auth.uid || auth.role == 'admin')"
    }
  }
}
```

---

## 重要链接和命令

### 常用 CLI 命令

```bash
# 环境管理
tcb env list                                          # 列出环境
tcb env info -e cloud1-5glojms9a83c3457             # 环境详情

# 云函数管理
tcb functions deploy auth -e cloud1-5glojms9a83c3457 # 部署单个函数
tcb functions deploy --all -e cloud1-5glojms9a83c3457 # 部署所有
tcb functions list -e cloud1-5glojms9a83c3457        # 列出函数
tcb functions invoke salary-engine -e cloud1-5glojms9a83c3457 --params '{}' # 调用函数
tcb functions logs salary-engine -e cloud1-5glojms9a83c3457 # 查看日志
tcb functions delete auth -e cloud1-5glojms9a83c3457 # 删除函数

# 数据库管理
tcb database list -e cloud1-5glojms9a83c3457         # 列出集合
tcb database showIndexes --collection worktime -e cloud1-5glojms9a83c3457 # 查看索引

# 托管服务（Web）
tcb hosting deploy dist -e cloud1-5glojms9a83c3457   # 部署 Web
tcb hosting list -e cloud1-5glojms9a83c3457          # 列出托管文件

# 登录和注销
tcb login                                              # 登录
tcb logout                                             # 注销
```

### npm 脚本

```bash
# 根目录 (hr-system-3.0/)
npm run deploy                        # 部署所有云函数
npm run deploy:auth                   # 部署认证模块
npm run deploy:salary-engine          # 部署薪酬引擎
npm run deploy:salaries               # 部署薪资模块
npm run deploy:web                    # 部署 Web 前端
npm run backfill:interviews           # 回填面试数据
npm run setup:bonus-env               # 设置提成环境
npm run repair:employee-companies     # 修复员工企业关联（干运行）
```

### 关键文档链接

| 文档 | 路径 | 用途 |
|------|------|------|
| 项目README | [README.md](README.md) | 项目概述 |
| 开发规范 | [CLAUDE.md](CLAUDE.md) | Claude 开发指南 |
| CloudBase 部署 | [CLOUDBASE_SETUP.md](CLOUDBASE_SETUP.md) | 环境配置 |
| 部署指南 | [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | 完整部署流程 |
| 数据库设计 | [database/collections.json](database/collections.json) | 集合定义 |
| 索引清单 | [database/INDEXES.md](database/INDEXES.md) | 索引策略 |
| 保险系统设计 | [docs/SALARY_INSURANCE_V2_DESIGN.md](docs/SALARY_INSURANCE_V2_DESIGN.md) | 保险计算逻辑 |
| Web 优化 | [WEB_OPTIMIZATION.md](WEB_OPTIMIZATION.md) | 前端性能优化 |

### 外部资源

- **腾讯云 CloudBase 官网**: https://cloud.tencent.com/product/tcb
- **CloudBase 控制台**: https://console.cloud.tencent.com/tcb
- **CloudBase 文档**: https://docs.cloudbase.net
- **微信小程序开发文档**: https://developers.weixin.qq.com/miniprogram
- **Vue 3 文档**: https://vuejs.org/
- **Element Plus 组件库**: https://element-plus.org/

### 系统信息速查

```
项目名称: 展瑞人力资源管理系统 3.0
环境 ID: cloud1-5glojms9a83c3457
云函数数量: 27+
数据库集合: 20
技术栈: Node.js + CloudBase + Vue3 + 小程序
部署状态: 生产版本
```

---

## 开发工作流

### 新增功能流程

1. **需求分析**
   - 确定功能需求
   - 设计数据模型
   - 规划 API 接口

2. **后端开发** (云函数)
   - 创建或修改云函数
   - 定义入参和返回格式
   - 编写业务逻辑
   - local 测试

3. **前端开发** (小程序/Web)
   - 页面设计
   - 组件开发
   - 调用后端 API
   - UI 测试

4. **集成测试**
   - 端到端测试
   - 边界情况测试
   - 性能测试

5. **部署上线**
   - 部署云函数
   - 部署前端
   - 发布上线

### Bug 修复流程

1. 复现 bug
2. 定位问题所在
3. 修复代码
4. 编写测试用例
5. 部署修复版本

---

**END OF DOCUMENT**

本文档最后更新于 2026 年 4 月 15 日，包含了 HR System 3.0 的完整技术信息，可供所有开发人员和 Agent 随时查阅。

