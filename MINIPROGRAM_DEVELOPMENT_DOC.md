# HR System 3.0 全端开发说明与风险扫描

更新时间：2026-04-30

## 1. 项目概览

小程序目录位于 `miniprogram/`，使用微信小程序原生页面结构，业务主要通过 CloudBase 云函数完成。

核心环境：

- 云环境：`cloud1-5glojms9a83c3457`
- 入口配置：`miniprogram/app.json`
- 全局初始化：`miniprogram/app.ts`
- 云函数调用封装：`miniprogram/utils/api.ts`

主要页面：

| 页面 | 路径 | 说明 |
|---|---|---|
| 岗位列表 | `pages/index/index` | 岗位展示、岗位搜索、跳转岗位详情 |
| 岗位详情 | `pages/job-detail/detail` | 岗位详情、普通报名、分享海报 |
| 岗位报名 | `pages/apply/apply` | 从岗位详情进入的报名表单 |
| 招聘之家 | `pages/home/home` | 分销/HR 管理入口、二维码生成 |
| 我的报名 | `pages/home/my-signups/index` | 面试/报名管理，支持办理入职 |
| 内部扫码入职 | `pages/internal-onboard/index` | 员工扫码后提交入职资料 |
| 扫码入口 | `pages/qrcode-scan/scan` | 扫码识别二维码类型并跳转 |
| 二维码报名 | `pages/job-apply/index` | 通过报名码直接报名 |
| 我的 | `pages/my/my` | 个人中心入口 |
| 个人资料 | `pages/my/profile/profile` | 用户资料与银行卡维护 |
| 工时记录 | `pages/my/worktime/worktime` | 员工提交/查看日结工时 |
| 工资条 | `pages/my/salaries/salaries` | 查询个人工资记录 |

## 2. 云函数调用规范

统一封装在 `miniprogram/utils/api.ts`：

- 自动读取本地 `token`
- 根据模块和 action 映射真实云函数名
- 统一处理 loading、错误提示、401 清理登录态

主要映射：

| 模块 | Action | 实际云函数 |
|---|---|---|
| `auth` | `login` / `send-code` | `auth-login` |
| `auth` | `wechat-phone-login` | `auth-phone-login` |
| `auth` | `verify-token` | `auth-token-verify` |
| `users` | 默认 | `users` |
| `qrcode` | 默认 | `qrcode` |
| `worktime` | 默认 | `worktime` |
| `salaries` / `salaries-v2` | 默认 | `salaries-v2` |
| `employees` | 默认 | `employees` |
| `applications` | 默认 | `applications` |
| `interviews` | 默认 | `interviews` |

注意：本轮已将 `pages/home/home.ts` 的核心业务调用迁移到 `utils/api.ts`，高风险路径不再绕过统一 token 和错误处理。

## 3. 登录与用户资料

登录入口：

- `components/login-sheet/login-sheet.ts`
- `pages/login/login.ts`
- `pages/internal-onboard/index.ts`

登录方式：

- 微信手机号快捷登录：`auth/wechat-phone-login`
- 登录成功后写入：
  - `wx.setStorageSync('token', result.token)`
  - `wx.setStorageSync('userInfo', result.userInfo)`
  - `getApp().globalData.userInfo`
  - `getApp().globalData.isLoggedIn`

资料读取：

- `users/get-profile`
- 返回用户基本资料、银行卡信息、员工绑定信息、企业关系、薪资统计等。

资料保存：

- `pages/my/profile/profile.ts` 调用 `users/update-profile`
- 当前后端已支持同步银行卡信息到绑定的 `employees` 主档。

## 4. 员工与在职关系链路

当前模型：

- `employees`：员工主档
- `employee_companies`：员工与企业的入职/在职关系

小程序相关入口：

### 4.1 内部扫码入职

页面：`pages/internal-onboard/index.ts`

流程：

1. 从 `scene` 或 `code` 参数解析入职码。
2. 调用 `qrcode/scan` 验证二维码。
3. 登录后调用 `users/get-profile` 回填姓名、手机号、身份证、银行卡。
4. 提交时调用 `qrcode/internal-onboard`。

后端预期：

- 首次入职：创建 `employees` 主档并创建 `employee_companies`。
- 二次入职：复用 `employees` 主档，新增或更新 `employee_companies`。
- 工号规则统一为 `EP + yyyyMMdd + 4位随机数`。

### 4.2 面试管理入职

页面：`pages/home/my-signups/index.ts`

流程：

1. HR 在“我的报名/面试管理”中选择候选人。
2. 结果设为 `hired` 时调用 `employees/onboard`。
3. 后端负责创建或复用员工主档及在职关系。

### 4.3 员工工时企业选择

页面：`pages/my/worktime/worktime.ts`

当前逻辑：

- 先调用 `users/get-profile` 获取 `employee_id/phone`。
- 再调用 `worktime/list-companies` 获取可填报企业。
- 前端只使用 `employee_companies` 返回的企业关系，不再回退 `profile.companies`。
- 填报时提交：
  - `employee_id`
  - `phone`
  - `company_id`
  - `work_date`
  - `shift`
  - `regular_hours`

## 5. 工时与薪资链路

### 5.1 工时记录

页面：`pages/my/worktime/worktime.ts`

接口：

- 查询企业：`worktime/list-companies`
- 查询工时：`worktime/list`
- 提交工时：`worktime/submit`

前端校验：

- 必须登录。
- 必须存在可填报企业。
- 工时必须大于 0。
- 工作日期不能早于入职日期。
- 工作日期不能晚于离职日期。
- 工作日期不能晚于今天。

### 5.2 工资条

页面：`pages/my/salaries/salaries.ts`

接口：

- `salaries-v2/my-list`

展示字段：

- 月份/日期
- 状态
- 实发金额
- 明细展开

## 6. 二维码链路

二维码类型：

| 类型 | 入口 | 目标页面 |
|---|---|---|
| `agent_referral` | 分销推广 | `pages/home/home` |
| `internal_onboard` | 内部入职 | `pages/internal-onboard/index` |
| `job_apply` | 扫码报名 | `pages/job-apply/index` |
| 普通岗位推荐 | 岗位详情/报名 | `pages/apply/apply` |

扫码入口：`pages/qrcode-scan/scan.ts`

流程：

1. 调用 `wx.scanCode`。
2. 将扫描结果作为 `code` 调用 `qrcode/scan`。
3. 根据 `scanResult.type` 跳转到入职、报名或岗位报名。

## 7. 权限与管理端入口

招聘之家：`pages/home/home.ts`

主要能力：

- 分销代理申请。
- 分销二维码生成。
- HR/管理角色进入管理视图。
- 内部入职二维码生成。
- 报名二维码生成。
- 面试管理入口。

权限来源：

- 用户资料中的 `role/user_type`
- `utils/permissions.ts` 加载角色权限

## 8. 风险清单

以下为扫描结果和本轮处理状态。

### 高优先级风险

状态更新：以下高优先级风险已在 2026-04-29 修复。

1. `pages/home/home.ts` 多处直接调用 `wx.cloud.callFunction`，绕过统一 `utils/api.ts`。

影响：

- 不会自动携带 `token`。
- 401/403 错误不会统一清理登录态。
- 错误提示格式与其它页面不一致。

当前看起来有些接口依赖 OpenID 或公开权限，短期未必报错，但后续如果云函数权限收紧，容易出现“某些页面正常、招聘之家异常”的不一致。

修复结果：

- 已将 `pages/home/home.ts` 中登录校验、用户资料、代理申请状态、代理统计、企业列表、岗位列表、代理申请等调用迁移到 `utils/api.ts`。
- 保留二维码生成等原有业务参数，降低行为变化风险。

2. `pages/qrcode-scan/scan.ts` 对扫码结果的兼容性偏弱。

当前逻辑直接把 `wx.scanCode().result` 当作 `code` 传给 `qrcode/scan`。如果扫描到的是完整 URL、带 `scene=xxx` 的链接、或其它包装格式，就可能提示“二维码无效”。

已有页面 `internal-onboard` / `job-apply` 支持从 `scene` 或 `code` 参数解析，但通用扫码页没有统一解析。

修复结果：

- 新增 `miniprogram/utils/qrcode.ts`。
- `pages/qrcode-scan/scan.ts`、`pages/internal-onboard/index.ts`、`pages/job-apply/index.ts`、`pages/home/home.ts` 已统一使用二维码解析工具。
- 支持裸 code、URL query、`scene`、`code`、`ref_code`。

3. 内部扫码入职银行卡校验与个人资料页不一致。

`pages/my/profile/profile.ts` 使用 Luhn 算法校验银行卡号；`pages/internal-onboard/index.ts` 只校验银行卡信息是否填写完整，没有校验卡号格式。

影响：

- 用户首次扫码入职时可能提交格式错误的银行卡。
- 后续报送银行/薪资发放数据质量可能受影响。

修复结果：

- 新增 `miniprogram/utils/bank.ts`。
- `pages/internal-onboard/index.ts` 已补充银行卡 Luhn 校验。
- 提交前会对银行卡号去空格，避免用户输入空格导致后端保存脏数据。

### 中优先级风险

状态更新：以下中优先级风险中的可落地项已在 2026-04-29 修复；`users/get-profile` 聚合较重属于后端接口设计优化，暂不在本轮调整，避免影响多页面依赖。

4. 登录态字段存在 `_id/id/employee_id` 多种写法。

不同页面分别使用：

- `userInfo.id`
- `userInfo._id`
- `profile.employee_id`
- `employeeInfo._id || employeeInfo.employee_id`

目前后端和前端做了不少兼容，但后续新增页面时容易拿错 ID。建议后续逐步抽一个 `getUserId()` / `getEmployeeId()` 工具函数。

修复结果：

- 新增 `miniprogram/utils/identity.ts`。
- 已在高风险相关页面和工时页使用 `getUserId()` / `getEmployeeId()`，减少新增链路继续扩散多种 ID 写法。

5. 工时页 `onShow` 只有在 `records.length > 0` 时刷新。

页面：`pages/my/worktime/worktime.ts`

如果用户首次进入没有记录，切到其它页面完成入职/关系变化后再返回，可能不会自动刷新。虽然 `onLoad` 会加载，但返回场景可能需要手动下拉刷新。

修复结果：

- `pages/my/worktime/worktime.ts` 已改为初始化完成后，返回页面时基于登录态重新加载用户资料、企业关系和工时记录。
- 不再依赖 `records.length > 0` 判断是否刷新。

6. `users/get-profile` 当前承担过多职责。

它同时返回用户资料、员工绑定、企业关系、薪资统计。页面调用方便，但任何一个聚合查询变慢或异常，都可能影响“我的/资料/工时预加载”等多个页面。

### 低优先级风险

7. 小程序代码里保留较多 `console.log`。

例如 `job-detail/detail.ts`、`internal-onboard/index.ts`、`utils/api.ts`。开发期有帮助，但生产环境可能暴露 token 携带状态、用户资料结构、业务细节。

8. 薪资列表默认 `onLoad` 和 `onShow` 都调用 `loadSalaries()`。

页面：`pages/my/salaries/salaries.ts`

首次打开时可能重复请求一次。影响不大，但如果薪资列表变重，会增加云函数调用量。

9. 部分页面提示语和错误兜底不统一。

统一 API 封装已有 `sanitizeErrorMessage`，但直接 `wx.cloud.callFunction` 的页面仍然自行处理错误。

## 9. 建议后续优化顺序

1. 评估是否拆分 `users/get-profile`，降低个人资料、我的、工时等页面对同一个重接口的耦合。
2. 生产环境收敛调试日志。
3. 薪资列表避免 `onLoad` 和 `onShow` 首次重复请求。

## 10. 本轮结论

本轮未发现小程序端在 `employee_companies` 迁移后仍明显把“在职关系 ID”误当作“员工主档 ID”的问题。

工时页面已经按 `worktime/list-companies` 从在职关系取企业，并提交 `employee_id + company_id` 给后端。扫码入职也由后端处理首次/二次入职逻辑。

高优先级风险已完成修复：二维码解析兼容性、招聘之家统一 API 调用、内部扫码入职银行卡校验一致性。

中优先级风险中，身份 ID 工具和工时页返回刷新已完成修复；`users/get-profile` 聚合较重暂不调整，建议后续作为后端接口拆分专项处理。

---

# Web 端开发说明与风险扫描

扫描日期：2026-04-30

## 11. Web 项目概览

Web 端目录位于 `web/`，是基于 Vue 3 + Vite + TypeScript + Pinia + Vue Router + Element Plus 的后台管理端。部署目标为 CloudBase 静态托管，构建产物目录为 `web/dist`。

核心入口：

| 文件 | 说明 |
|---|---|
| `web/src/main.ts` | 创建 Vue 应用、注册 Pinia/Router、加载全局样式 |
| `web/src/App.vue` | 应用根组件，启动时恢复登录态和权限 |
| `web/src/router/index.ts` | Hash 路由、菜单路由、登录守卫、权限守卫 |
| `web/src/stores/auth.store.ts` | 登录态、token、用户信息、退出登录 |
| `web/src/stores/user.store.ts` | 角色权限加载和 `hasPermission` 判断 |
| `web/src/api/cloud.ts` | CloudBase 初始化、云函数调用、数据库实例获取 |
| `web/src/api/modules/*` | 各业务模块 API |

运行命令：

| 命令 | 说明 |
|---|---|
| `npm run dev` | 本地开发服务，默认端口 `3000` |
| `npm run build` | 生产构建 |
| `npm run preview` | 预览构建产物 |
| `npm run deploy` | 构建后部署到 CloudBase 静态托管 |

环境变量：

| 变量 | 说明 |
|---|---|
| `VITE_CLOUDBASE_ENV` | CloudBase 环境 ID，默认 `cloud1-5glojms9a83c3457` |
| `VITE_CLOUDBASE_REGION` | CloudBase 地域，默认 `ap-shanghai` |
| `VITE_APP_TITLE` | 页面标题后缀 |
| `VITE_API_BASE_URL` | Axios HTTP API baseURL；当前主业务以 CloudBase 调用为主 |

## 12. Web 路由与页面模块

Web 端路由由 `web/src/router/index.ts` 统一维护。除 `/login` 和 `/404` 外，业务页面均挂在 `Layout` 下，默认需要登录。

| 路由 | 页面 | 权限 | 功能说明 |
|---|---|---|---|
| `/dashboard` | `Dashboard` | `dashboard:view` | 经营概览、报名趋势、待处理候选人、最近报名 |
| `/companies` | `Companies` | `companies:manage` | 企业列表、新增/编辑企业、批量删除、状态维护 |
| `/jobs` | `Jobs` | `jobs:manage` | 岗位发布、编辑、上下架、关联工价方案和财务计费配置 |
| `/candidates` | `Candidates` | `candidates:view` | 候选人库、归属领取/释放、跟进记录、安排面试、批量导入 |
| `/interviews` | `Interviews` | `interviews:manage` | 面试安排、结果更新、批量通过/拒绝/未到场/录用 |
| `/employees` | `EmployeeProfiles` | `employees:manage` | 员工主档资料查询与编辑 |
| `/employment` | `Employees` | `employees:manage` | 在职关系、入职登记、离职、导入导出、推荐人维护 |
| `/worktime` | `Worktime` | `worktime:manage` | 日结/月结工时审核、押金标记、月结工时导入 |
| `/salary` | `Salary` | `salary:manage` | 日结工资计算发放、月结预览保存、工资查询导出 |
| `/bank-transfer` | `BankTransfer` | `salary:manage` | 银行代发数据查询与导出 |
| `/project-reimbursements` | `ProjectReimbursements` | `salary:manage` | 项目报销登记、审批、删除 |
| `/bonus` | `Bonus` | `bonus:manage` | 招聘提成计算、审批、规则管理 |
| `/rate-plans` | `RatePlans` | `salary:manage` | 工价方案维护 |
| `/reports` | `Reports` | `reports:view` | 招聘、员工、薪资、财务报表与导出 |
| `/finance-reports` | `Finance` | `reports:view` | 财务计费配置、月度利润核算 |
| `/profile` | `Profile` | 无 | 个人信息、修改密码 |
| `/settings` | `Settings` | `settings:manage` | 用户、角色、通知、系统配置、操作日志、员工绑定、报表配置 |
| `/devtools` | `DevTools` | `devtools:access` | 开发造数与诊断；仅开发环境注册 |

权限说明：

- 登录后 `auth.store.ts` 调用 `authApi.verifyToken()` 验证 token，再通过 `rolesApi.getList()` 加载角色权限。
- 路由守卫会等待 token 验证和权限加载完成后再判断 `meta.permission`。
- 拥有 `*` 权限的角色可访问所有受权限保护页面。
- 生产环境不注册 `/devtools`，避免误暴露造数入口。

## 13. API 模块职责

Web 端 API 主要分两类：

- `getDatabase()`：前端直接访问 CloudBase 数据库，常用于列表、详情、基础 CRUD。
- `callFunction()` / `cloud.callFunction()`：调用云函数，常用于认证、薪资、工时批量审批、统计、提成等需要后端规则的操作。

主要模块：

| 模块 | 文件 | 职责 |
|---|---|---|
| 认证 | `auth.ts` | 登录、退出、token 服务端验证、读取本地用户信息 |
| 用户 | `users.ts` | 用户列表、创建、更新、禁用、重置密码、同步银行卡到员工 |
| 角色 | `roles.ts` | 角色列表、创建、更新、删除、权限集合 |
| 企业 | `companies.ts` | 企业 CRUD、状态切换、批量删除、统计 |
| 岗位 | `jobs.ts` | 岗位 CRUD、发布/停止招聘、岗位统计 |
| 候选人 | `candidates.ts` | 候选人列表、详情、领取、释放、跟进、导入 |
| 报名 | `applications.ts` | 报名列表、创建、历史、状态更新、统计 |
| 面试 | `interviews.ts` | 面试列表、创建、更新、结果流转 |
| 员工 | `employees.ts` | 员工主档、在职关系、入职、离职、绑定用户 |
| 工时 | `worktime.ts` / `worktime-enhanced.ts` | 日结/月结工时、审批驳回、押金、月结汇总 |
| 薪资 | `salaries.ts` | 工资列表、计算、审批、发薪、银行报送、月结预览 |
| 工价 | `ratePlans.ts` | 企业工价方案维护 |
| 提成 | `commissionPlans.ts` / `bonus.ts` | 企业提成方案、招聘提成计算审批、规则管理 |
| 财务 | `finance.ts` | 计费配置、月度核算、财务汇总 |
| 项目报销 | `projectReimbursements.ts` | 报销 CRUD、审批、软删除 |
| 借支 | `advances.ts` | 借支申请、审批、驳回、付款 |
| 档案 | `archives.ts` | 档案列表与创建 |
| 二维码 | `qrcode.ts` | 二维码列表、生成内部入职码 |
| 统计 | `stats.ts` | 仪表盘、招聘/员工/薪资/财务统计、导出 |
| 系统配置 | `system.ts` | 系统配置读取保存、薪资保险配置 |
| 操作日志 | `operationLogs.ts` | 操作日志列表、业务日志写入 |

## 14. 核心业务链路

### 14.1 登录与权限

1. 登录页提交手机号和密码。
2. `auth.store.ts` 调用 `authApi.login()`。
3. `authApi.login()` 通过 `auth-web-login` 云函数认证。
4. 成功后写入 `hr3_token` 和 `hr3_user`。
5. `user.store.ts` 根据用户角色从 `roles` 集合加载权限。
6. 路由守卫按页面 `meta.permission` 放行或拦截。

本轮已移除 Web 前端直接查询 `users` 集合校验密码、前端模拟 token、本地硬编码测试账号降级登录。

### 14.2 招聘到入职

1. `Jobs` 维护岗位和工价/财务配置。
2. 小程序或 Web 后台创建报名数据。
3. `Candidates` 汇总候选人资料、归属和跟进。
4. `Interviews` 安排面试并更新结果。
5. 面试录用或后台手工入职后进入 `Employees` 在职关系。
6. 员工主档和企业关系用于后续工时、薪资、财务、提成。

### 14.3 工时到薪资

1. 小程序员工提交日结工时，或 Web 端导入月结工时。
2. `Worktime` 审核日结/月结工时，支持批量审批和驳回。
3. `Salary` 基于已审核工时做日结工资预览、批量发薪；月结工资由月结预览组件保存。
4. `BankTransfer` 查询待报送银行数据并导出。
5. `Reports` 与 `Finance` 用薪资和工时数据做报表/利润统计。

### 14.4 财务和提成

1. `RatePlans` 定义工价方案。
2. `Jobs` 关联工价，并同步默认财务计费配置。
3. `Finance` 按企业/岗位保存计费规则，计算月度结果。
4. `Bonus` 根据候选人/入职链路和规则生成招聘提成批次，支持审批和发放标记。

### 14.5 Excel 导入导出

本轮已将原 `xlsx` 依赖替换为 `exceljs`，通过 `web/src/utils/loadXlsx.ts` 提供兼容适配层：

- 导入仅接受 `.xlsx`。
- 单文件最大 2MB。
- 单次最多解析 2000 行。
- 解析时过滤危险表头：`__proto__`、`prototype`、`constructor`。
- `.xls` 导出文件名会自动转为 `.xlsx`，避免继续依赖高危 SheetJS 包。

涉及导入入口：

- `Employees` 入职导入
- `Candidates` 候选人导入
- `Worktime` 月结工时导入

## 15. Web 开发约定

1. 新增页面应先在 `router/index.ts` 配置 `meta.title`、`meta.icon`、`meta.permission`。
2. 新增业务接口优先复用 `web/src/api/modules/*`，不要在页面里散落数据库和云函数细节。
3. 涉及认证、薪资、权限、批量审批、跨集合写入的逻辑应优先放到云函数。
4. 页面只做输入校验、状态管理和展示，不应在前端保存敏感默认口令或绕过权限判断。
5. Excel 导入统一使用 `readExcelRows()`，不要直接引入第三方解析库。
6. 生产环境调试工具必须使用 `import.meta.env.DEV` 包裹。
7. 权限守卫只能作为前端体验控制，CloudBase 数据库规则和云函数仍需做服务端权限校验。

## 16. Web 风险清单与处理结果

### 已处理的高/中风险

1. 前端直接查询 `users` 集合校验密码。

风险：密码校验逻辑和用户表读取能力暴露在浏览器端，一旦数据库规则配置过宽，会扩大账号数据暴露面。

处理结果：

- `web/src/api/modules/auth.ts` 改为调用 `auth-web-login` 云函数登录。
- `web/src/api/cloud.ts` 移除 `loginDirect()`、本地模拟 token、硬编码测试账号降级登录。
- token 验证改为调用服务端云函数，不再只信本地 `localStorage`。

2. 刷新后权限未加载完成时路由先放行。

风险：`permissions.length === 0` 时原逻辑跳过权限判断，刷新受限路由可能先进入页面。

处理结果：

- `web/src/router/index.ts` 改为异步守卫。
- 受保护路由会先执行 `authStore.init()`，完成 token 验证和权限加载后再判断 `meta.permission`。

3. 生产包暴露诊断/造数工具。

风险：`seed-test-data` 和 `diagnose-cloudbase` 原先在应用启动时直接导入并挂到 `window`，生产环境可能被误用。

处理结果：

- `web/src/main.ts` 使用 `import.meta.env.DEV` 动态加载诊断/造数工具。
- `/devtools` 路由仅开发环境注册。
- `DevTools` 统计查询漏 `await getDatabase()` 的问题已修复。

4. `xlsx` 依赖存在无修复高危漏洞。

风险：SheetJS `xlsx` 存在原型污染和 ReDoS 风险，npm audit 标记 high 且无可用修复版本。

处理结果：

- 移除 `xlsx`，替换为 `exceljs`。
- 新增统一适配和安全读取入口 `web/src/utils/loadXlsx.ts`。
- 导入限制为 `.xlsx`、2MB、2000 行，并清理危险表头。
- `npm audit --audit-level=moderate` 已通过。

5. 依赖中高危漏洞。

处理结果：

- `npm audit fix` 更新了 `axios`、`follow-redirects`、`lodash/lodash-es`、`postcss` 等传递依赖。
- Vite 升级到 `^6.4.2`，esbuild 升级到 `0.25.12`。
- `exceljs` 的 `uuid` 传递依赖通过 npm `overrides` 固定为 `14.0.0`。

### 仍建议后续专项处理

1. 后端认证云函数仍存在明文密码兼容逻辑。

当前 Web 前端已不再直接校验密码，但 `auth-web-login` 云函数仍兼容读取 `users.password` 或 `users.data.password` 明文字段。建议后续做密码哈希迁移、登录限流、失败次数锁定和统一 token 存储。

2. Web 端仍有较多直接数据库 CRUD。

这依赖 CloudBase 数据库安全规则兜底。建议对用户、员工、薪资、财务、银行卡等敏感模块逐步迁移到云函数，并在云函数内做角色和字段级权限校验。

3. 用户创建和重置密码仍是弱流程。

`usersApi.create()` 和 `resetPassword()` 仍围绕默认/临时密码写入用户表。建议迁移到后端：生成一次性临时密码或重置链接，服务端保存哈希值，并强制首次登录修改密码。

4. 构建体积偏大。

`element-plus`、`echarts`、`exceljs` 均为大 chunk。当前已做懒加载和分包，但如首屏性能受影响，可进一步按页面拆分 Excel 导出能力或改为后端导出。

## 17. Web 本轮验证

已执行：

```bash
cd web
npm run build
npm audit --audit-level=moderate
```

结果：

- `npm run build` 通过。
- `npm audit --audit-level=moderate` 显示 `found 0 vulnerabilities`。
