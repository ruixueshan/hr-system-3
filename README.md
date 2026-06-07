# 展瑞人力资源管理系统 3.0

> 展瑞招聘项目（CloudBase + 小程序 + Web）

全新人力系统，腾讯云开发 + 小程序 + Vue3

## 技术栈

- **小程序端**: 原生小程序 + 云开发 SDK
- **Web端**: Vue3 + Vite + TypeScript + Element Plus
- **后端**: Tencent CloudBase Functions (Serverless Node.js)
- **数据库**: CloudBase NoSQL (MongoDB)
- **部署**: CloudBase CLI

## 项目结构

```
hr-system-3.0/
├── cloudfunctions/          # 云函数
│   ├── auth/               # 认证模块
│   ├── companies/          # 企业模块
│   ├── jobs/               # 岗位模块
│   ├── applications/       # 报名模块
│   ├── interviews/         # 面试模块
│   ├── employees/          # 入职模块
│   ├── worktime/           # 工时模块
│   ├── salary-engine/      # ⭐ 薪酬引擎（统一入口）
│   ├── bonus-config/       # 提成配置
│   ├── salary-advance/     # 预支模块
│   ├── qrcode/             # 二维码管理
│   ├── notification/       # 通知模块
│   ├── archive/            # 数据归档
│   ├── system/             # 系统配置
│   └── common/             # 公共工具
├── database/
│   └── collections.json    # 数据库集合定义
├── cloudfunctions/
│   ├── security-rules.json # CloudBase 安全规则
├── miniprogram/            # 小程序源码
├── web/                    # Web管理端源码
└── README.md
```

## 快速开始

### 1. 环境准备

```bash
# 安装 CloudBase CLI
npm install -g @cloudbase/cli

# 登录腾讯云
tcb login

# 创建 CloudBase 环境（个人版）
# 在控制台 https://console.cloud.tencent.com/tcb 创建环境
```

### 2. 初始化数据库

1. 登录 [腾讯云开发控制台](https://console.cloud.tencent.com/tcb)
2. 选择你的环境（如 `cloud1-5glojms9a83c3457`）
3. 进入 **数据库**
4. 逐个创建以下 20 个集合：
   - `users`, `companies`, `jobs`, `qr_codes`, `applications`
   - `interviews`, `employees`, `employee_companies`
   - `worktime_records`, `salaries`, `salary_advances`
   - `company_salary_configs`, `personal_rewards`
   - `recruitment_bonus_rules`, `recruitment_bonuses`, `hr_performance`
   - `blacklists`, `notification_templates`, `audit_logs`, `system_config`

5. 为每个集合创建索引（参考 `database/INDEXES.md`）

### 3. 配置安全规则

在 **数据库 → 安全规则** 页面，粘贴 `cloudfunctions/security-rules.json` 的内容并保存。

### 4. 部署云函数

```bash
# 进入项目目录
cd ~/.openclaw/workspace/hr-system-3.0

# 安装依赖（可选，云函数会自动处理）
cd cloudfunctions
npm install

# 部署所有云函数
cd ..
tcb functions deploy --all

# 或者单独部署某个模块
tcb functions deploy auth
tcb functions deploy salary-engine
```

**注意**：
- 需要先在 CloudBase 控制台创建云函数目录结构，再部署
- salary-engine 是核心薪酬计算模块，请确保依赖正确

### 5. 初始化系统配置

调用 `system` 模块的 `set-config` 接口，配置以下基础数据：

```javascript
// 示例：设置加班倍数
{
  category: "salary",
  key: "overtime_multiplier",
  value: "1.5",
  description: "加班费倍数"
}

// 外协人员最低在职天数
{
  category: "salary",
  key: "external_min_days",
  value: "7",
  description: "外协人员提成最低在职天数"
}

// HR最低有效入职数
{
  category: "hr",
  key: "hr_min_hires",
  value: "3",
  description: "HR达标最低有效入职人数"
}
```

### 6. 加密密钥配置

在 CloudBase 控制台 **云函数 → 环境变量** 中设置：

```
ENCRYPTION_KEY = base64:your-secret-key-here
JWT_SECRET = your-jwt-secret
```

生成密钥：

```bash
node -e "console.log(Buffer.from('hr-system-2026-secret-key').toString('base64'))"
```

### 7. 开发小程序/Web端

- 小程序：使用微信开发者工具，导入 `miniprogram/` 目录
- Web端：使用 VSCode，运行 `npm install && npm run dev`

## 核心流程演示

### 1. 用户登录小程序

```
wx.cloud.callFunction({
  name: 'auth',
  data: { code: 'xxx', encryptedData: 'xxx', iv: 'xxx' }
})
```

返回 `token`，后续请求带上 `Authorization: Bearer <token>`

### 2. HR发布岗位

```
cloudfunctions/jobs → create
```

### 3. 生成二维码

```
cloudfunctions/qrcode → generate (绑定岗位+推荐人)
```

### 4. 候选人扫码报名

```
cloudfunctions/applications → apply-by-qr
```

### 5. 面试安排

```
cloudfunctions/interviews → create
面试通过 → 入职
```

### 6. 办理入职

```
cloudfunctions/employees → create (同时创建 employee_companies 关联)
```

### 7. 工时录入

- 员工自录入：`cloudfunctions/worktime → submit`
- Excel 批量导入：`cloudfunctions/worktime → batch-import`

### 8. 工时审核

```
cloudfunctions/worktime → batch-approve / batch-reject
```

### 9. 薪资计算

**单独计算**：
```
cloudfunctions/salary-engine (type: 'salary')
{
  type: 'salary',
  data: { employee_id, company_id, year, month }
}
```

**批量计算**（推荐）：
```
cloudfunctions/salary-engine (type: 'all')
{
  type: 'all',
  data: { company_id, year, month }
}
```

会自动触发：
- 所有员工薪资
- 外协人员提成
- 利润核算

### 10. 提成计算

- HR提成：定时任务每天 00:00 自动计算
- 外协提成：实时计算（工时审核通过后）

### 11. 导出银行发薪模板

调用 `salary-engine` 的 `export` 类型：

```
{
  type: 'export',
  data: { type: 'salary', company_id, year, month }
}
```

返回 JSON 数据，可用 Excel 打开。

## 定时任务配置

在 CloudBase 控制台 **云函数 → 定时触发器** 配置：

| 云函数 | Cron 表达式 | 说明 |
|--------|-------------|------|
| `salary-engine` | `0 0 0 * * *` | 每天 00:00 触发 HR 提成计算 |
| `archive` | `0 0 2 1 * *` | 每月1号 02:00 触发数据归档 |

**触发参数**：

- HR提成计算：
  ```json
  { "type": "bonus", "data": { "year": 2026, "month": 2 } }
  ```

- 归档：
  ```json
  { "action": "run-all" }
  ```

## 注意事项

### 安全
- **严禁**前端直接操作 `salaries`, `recruitment_bonuses` 等敏感集合
- 所有薪资、提成必须通过 `salary-engine` 统一入口
- 敏感数据（手机号、身份证、银行卡）在云函数内加密存储

### 性能
- 批量操作（导入、审核）限制 500 条/批次
- 重要查询路径加了索引（参考 `database/INDEXES.md`）
- 数据归档：工时 >6个月、薪资>12个月自动迁移

### 扩展
- 通知模板支持变量渲染，可配置富文本
- 黑名单机制：3次未到面自动拉黑6个月
- 一人多企业：通过 `employee_companies` 实现灵活关联

## 文档

- **需求文档**: 📒项目草稿/需求文档.md
- **数据库设计**: 📒项目草稿/数据库设计.md
- **综合设计**: 📒项目草稿/3.0系统综合设计文档.md
- **原型图**: 📒项目草稿/原型图/小程序端原型.html + Web管理端原型.html

## License

MIT

---

**创建日期**: 2026-03-14
**状态**: 需求已确认，开发待启动
