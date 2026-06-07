# 小程序端个人敏感信息写入扫描

更新时间：2026-05-14

## 1. 扫描范围

扫描目录：

- `miniprogram/pages`
- `miniprogram/components`
- `miniprogram/utils`

关注字段：

- 姓名：`name`、`real_name`
- 手机号：`phone`
- 身份证：`id_card`
- 银行卡：`bank_name`、`bank_account`、`bank_account_name`
- 紧急联系人：`emergency_contact`、`emergency_phone`

## 2. 小程序写入入口

| 页面 | 提交字段 | 调用云函数 | 新边界归属 |
| --- | --- | --- | --- |
| `pages/job-apply/index.ts` | `real_name`、`phone`、`id_card` | `qrcode.job-apply` | 报名表 `applications`，不长期主写 `users.id_card` |
| `pages/apply/apply.ts` | `name`、`phone`、简历字段 | `applications.create` | 报名表 `applications`，账号表只保留必要账号快照 |
| `pages/interview-checkin/index.ts` | `real_name`、`phone` | `qrcode.interview-checkin` | 面试表 `interviews` / 报名链路 |
| `pages/internal-onboard/index.ts` | `real_name`、`phone`、`id_card`、`join_date` | `qrcode.internal-onboard` | 自然人字段进 `employees`，关系字段进 `employee_companies` |
| `pages/my/profile/profile.ts` | 姓名、手机号、身份证、银行卡 | `users.update-profile` | 已绑定员工时写 `employees`；未绑定时保留为用户/候选人快照 |
| `pages/home/my-signups/index.ts` | 候选人姓名、手机号；入职动作 | `interviews.create/update`、`employees.onboard` | 候选人信息进面试/报名；入职后主档进 `employees` |

## 3. 本次已调整的后端分流

### 3.1 `users.update-profile`

调整后：

- 已绑定员工时：
  - `real_name -> employees.name`
  - `phone -> employees.phone`
  - `id_card -> employees.id_card`
  - `gender -> employees.gender`
  - `birth_date -> employees.birth_date`
  - `bank_name -> employees.bank_name`
  - `bank_account -> employees.bank_account`
  - `bank_account_name -> employees.bank_account_name`
  - `bank_card_last4` 自动从银行卡号生成
- `users` 只继续保存候选人/账号侧展示字段：
  - `education`
  - `work_years`
  - `current_company`
  - `current_position`
  - `expected_salary`
  - `expected_location`
  - `skills`
  - `self_introduction`
  - `avatar`

未绑定员工时，仍允许把表单数据保存到 `users`，作为候选人资料快照。

### 3.2 `users.get-profile`

调整后：

- 如果账号已绑定员工，个人资料页优先展示 `employees` 中的实名、手机号、身份证、出生日期、银行卡信息。
- 如果没有员工主档，则回退展示 `users` 中的候选人资料快照。
- 保持小程序既有读取字段兼容：
  - `phone`
  - `account_phone`
  - `real_name`
  - `id_card`
  - `bank_name`
  - `bank_account`
  - `bank_account_name`
  - `employee_id`
  - `employee_no`
  - `companies`
  - `company_id`
  - `agent_status`
  - `email`

### 3.3 `applications.create/apply`

调整后：

- 报名提交时不再把身份证主写到 `users.id_card`。
- 报名表保存：
  - `applicant_name`
  - `applicant_phone`
  - `applicant_id_card`
- `users` 只保留账号侧姓名/手机号快照，方便联系和展示。

### 3.4 `qrcode.job-apply`

调整后：

- 扫码报名创建/更新候选人账号时，不再写：
  - `users.id_card`
  - `users.gender`
  - `users.birth_date`
  - `users.employee_phone`
- 身份证仍会传入 `applications.create`，由报名记录保存。

### 3.5 `qrcode.interview-checkin`

调整后：

- 面试签到创建/更新候选人账号时，不再写：
  - `users.id_card`
  - `users.employee_phone`
- 姓名和手机号只作为候选人账号联系快照。
- 面试签到的业务事实继续保存在 `interviews` / 报名链路中。

### 3.6 `qrcode.internal-onboard`

调整后：

- 创建或复用员工时，实名字段写入 `employees`：
  - `name`
  - `phone`
  - `id_card`
  - `gender`
  - `birth_date`
  - `employee_no`
- 企业、岗位、入职日期、推荐人、工价写入 `employee_companies`。
- `users` 只保留：
  - `account_phone`
  - `phone`
  - `name`
  - `real_name`
  - `user_type`
  - `role`
  - `employee_id`
  - `employee_no`

### 3.7 `employees.onboard`

调整后：

- 优先使用入参里的 `real_name/name`、`phone`、`id_card`、`gender`、`birth_date` 创建或更新员工主档。
- 旧 `users` 字段只作为历史兼容兜底，不再作为新的主档边界。
- 员工主档只写自然人字段：
  - `user_id`
  - `name`
  - `phone`
  - `id_card`
  - `gender`
  - `birth_date`
  - `employee_no`
- 企业、岗位、推荐人、入职日期、工价继续写入 `employee_companies`。

### 3.8 登录绑定同步

调整后：

- `users/employeeBinding`
- `auth-login/employeeBinding`
- `auth-phone-login/employeeBinding`

以上三个绑定路径只同步：

- `users.employee_id`
- `users.employee_no`
- `users.user_type`
- 必要的展示姓名

不再从 `employees.id_card` 回填 `users.id_card`，避免登录或资料查询时把已分离的数据重新写回账号表。

## 4. 小程序引用兼容 review

本轮检查了小程序页面中对 `users.get-profile` 返回值的引用：

| 页面 | 读取字段 | 结论 |
| --- | --- | --- |
| `pages/job-apply/index.ts` | `real_name`、`phone`、`id_card` | 兼容。字段仍由 `get-profile` 返回，绑定员工时来自 `employees`。 |
| `pages/internal-onboard/index.ts` | `real_name`、`phone`、`id_card` | 兼容。字段仍可预填，提交后写入员工主档/在职关系。 |
| `pages/interview-checkin/index.ts` | `real_name`、`phone`、`account_phone` | 兼容。已补回 `account_phone`。 |
| `pages/my/profile/profile.ts` | 实名、手机号、身份证、银行卡 | 兼容。绑定员工时展示/保存到 `employees`，未绑定时使用用户快照。 |
| `pages/my/worktime/worktime.ts` | `employee_id`、`companies`、`company_id` | 兼容。`get-profile` 仍返回员工与企业关系列表。 |
| `pages/home/home.ts` | `agent_status`、`real_name`、`name` | 兼容。已补回 `agent_status`。 |
| `pages/apply/apply.ts` | `real_name`、`phone`、`email` | 兼容。已补回 `email`。 |

## 5. 仍需下一轮处理

下一轮建议继续处理以下点：

1. 小程序个人资料页的“银行卡信息”对候选人是否展示，需要产品确认。未绑定员工时保存到 `users` 只是兼容策略。
2. `users` 中历史已有的 `id_card`、`bank_*` 字段后续需要迁移或清理。
3. `employee_companies` 里的 `company_name/job_name/referrer_name` 仍是兼容字段，后续应改为 `_snapshot` 或查询时关联。
4. 云函数部署前需要确认当前工作区存在大量既有未提交改动，避免把无关改动一起发布。
