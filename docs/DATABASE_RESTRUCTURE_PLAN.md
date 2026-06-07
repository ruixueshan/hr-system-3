# 数据库主数据重构计划

更新时间：2026-05-13

配套设计文档：

- [用户、员工、在职关系数据库设计图](./DATABASE_MODEL_DIAGRAM.md)
- [核心用户与员工数据模型边界设计](./DATABASE_MODEL_BOUNDARIES.md)
- [小程序端个人敏感信息写入扫描](./MINIPROGRAM_PERSONAL_DATA_WRITE_AUDIT.md)
- [数据库只读审计报告](./DATABASE_AUDIT_REPORT_2026-05-13.md)
- [数据库精确聚合审计报告](./DATABASE_PRECISION_AUDIT_REPORT_2026-05-13.md)

## 目标

当前 `users`、`employees`、`employee_companies` 中存在姓名、手机号、身份证、企业、岗位、推荐人等多处重复字段。重构目标是明确主数据归属，减少冗余写入和脏数据来源，同时保持小程序、Web 后台、薪资、工时、保险、提成等现有业务可以平滑迁移。

## 当前问题

线上环境 `cloud1-5glojms9a83c3457` 当前样本与结构显示：

- `users` 共 1773 条，保存登录身份、`name/real_name/phone/id_card`，部分还保存 `employee_id/employee_no`。
- `employees` 共 367 条，保存员工主档，但仍保存 `company_id/company_name/job_id/job_name/referrer_id/referrer_name` 等关系字段。
- `employee_companies` 共 383 条，作为员工-企业关系表，但也保存 `company_name/job_name/referrer_name/source_referrer_name/recommender_name` 等快照字段。
- `employees` 与 `users` 均保存 `name/phone/id_card`，员工绑定逻辑还会互相补写身份字段。
- 代码中仍有大量路径读取 `employee.company_id`、`employee.company_name`、`employee.job_name`，说明需要兼容期，不能直接删字段。

## 新模型边界

### users：统一登录用户表

定位：小程序和 Web 端的账号、登录、权限、候选人身份入口。

保留字段：

- 登录标识：`openid`、`unionid`、`phone`
- 展示身份：`name`、`real_name`、`avatar`
- 账号类型：`user_type`、`role`、`status`
- 员工绑定：`employee_id`、`employee_no`
- 登录审计：`last_login`、`created_at`、`updated_at`

建议调整：

- `id_card` 只作为历史兼容字段，新增写入应转向 `employees.id_card`。
- 候选人阶段如必须采集身份证，应在转员工时迁入 `employees`，不要长期在 `users` 和 `employees` 双写。
- 推荐来源字段不应继续散落在 `users.referrer_name/source_referrer_name`，候选人归属建议保留在 `candidate_ownerships` 或报名/面试业务记录中。

### employees：员工主档

定位：自然人维度的员工档案，一人一档，不跟企业强绑定。

保留字段：

- 身份字段：`user_id`、`name`、`phone`、`id_card`、`gender`
- 员工编号：`employee_no`
- 银行与紧急联系人：`bank_name`、`bank_account`、`bank_account_name`、`bank_card_last4`、`emergency_contact`、`emergency_phone`
- 风控：`is_blacklisted`、`blacklist_reason`
- 合并治理：`merged_into_employee_id`、`merge_reason`
- 审计字段：`created_at`、`updated_at`

建议移出：

- `company_id/company_name`
- `job_id/job_name`
- `join_date/leave_date/departure_date/departure_reason`
- `referrer_id/referrer_name/source_referrer_id/source_referrer_name/recommender_id/recommender_name`
- `hourly_rate/salary_type/settlement_mode/rate_plan_id`

这些字段都属于某一次入职关系、岗位关系或薪酬关系，应进入 `employee_companies` 或薪酬配置表。

### employee_companies：员工在职关系表

定位：员工在某个企业、岗位、工价、推荐来源下的一段雇佣关系。允许同一员工多企业、多次入职。

保留字段：

- 关联键：`employee_id`、`company_id`
- 岗位与工价：`job_id`、`rate_plan_id`、`salary_type`、`settlement_mode`、`hourly_rate`
- 入离职：`join_date`、`leave_date`、`status`
- 推荐归属：`source_referrer_id` 或 `referrer_id`
- 合同签约：`contract_status`、`contract_no`、`contract_sequence`、`contract_signed_at`、`contract_start`、`contract_end`、`contract_type`
- 保险联动：`insurance_policy_id`、`insurance_mapping_id`、`insurance_status`（如业务需要）
- 审计字段：`created_by`、`created_at`、`updated_at`

建议调整：

- `company_name/job_name/referrer_name` 原则上不作为主字段，只作为可选展示快照。
- 如果保留快照，只允许后端统一生成，不允许前端自由传入，字段命名统一为 `company_name_snapshot/job_name_snapshot/referrer_name_snapshot`。
- 推荐字段统一为一个概念，建议主字段使用 `referrer_id`，历史字段 `source_referrer_id/recommender_id` 做兼容映射。
- 合同编号按企业独立递增，未签约 `contract_status=unsigned` 且 `contract_no` 为空，已签约格式为 `HT-{企业编码}-{5位流水}`。

### companies：企业主档

定位：甲方企业信息，只保存企业自身属性。

不应承担员工姓名、手机号、身份证等自然人信息。

## 关联读取规则

标准读取链路：

```text
users.employee_id -> employees._id -> employee_companies.employee_id -> companies/jobs/rate_plans
```

常见页面应按以下方式取数：

- 员工列表：以 `employees` 为主，补充当前优先关系 `employee_companies`，再映射企业名、岗位名。
- 员工详情：展示 `employees` 主档 + 全部 `employee_companies` 历史。
- 工时/薪资：以 `employee_id + company_id + work_date` 定位对应关系，禁止回退到 `employees.company_id`。
- 保险：以 `employee_companies` 的当前有效关系作为加保/减保入口，身份证从 `employees` 读取。
- 提成：推荐人归属从 `employee_companies.referrer_id` 读取，推荐人名称从 `users` 映射。

## 分阶段实施

### 第 0 阶段：冻结与审计

不改数据，只输出审计报告：

- `employees` 中重复身份证、重复手机号+姓名、重复 `user_id`。
- `employee_companies` 中同一 `employee_id + company_id` 的重复有效关系。
- `users.employee_id` 与 `employees.user_id` 不一致的绑定。
- `employees.company_id/job_id/referrer_id` 与当前有效 `employee_companies` 不一致的数据。

产物：

- 新增一个只读审计云函数或本地 MCP 审计脚本。
- 报告包含：可自动修复、需人工确认、不可修复三类。

### 第 1 阶段：统一写入口

先改代码写入路径，防止继续产生冗余。

- 入职只创建或复用 `employees` 主档，并创建 `employee_companies` 关系。
- 新增员工时，姓名、手机、身份证只写入 `employees`。
- `users` 只保存登录身份和 `employee_id` 绑定，不再从员工档案反向补写身份证。
- `employee_companies` 只写 ID 字段，名称由后端查询补全。
- 前端表单允许选择企业、岗位、推荐人，但提交 payload 只传对应 ID。

必须优先改的代码区域：

- `cloudfunctions/employees/index.js`
- `cloudfunctions/auth-login/employeeBinding.js`
- `cloudfunctions/auth-phone-login/employeeBinding.js`
- `cloudfunctions/qrcode/index.js`
- `web/src/api/modules/employees.ts`

### 第 2 阶段：读模型兼容层

建立统一的员工聚合查询，不让页面直接依赖旧字段。

建议新增后端方法：

- `getEmployeeProfile(employee_id)`：返回员工主档、当前关系、历史关系。
- `listEmployeesWithCurrentRelation(filters)`：员工列表专用。
- `resolveEmployeeIdentity({ user_id, employee_id, phone, id_card })`：登录和绑定专用。

返回值可以继续带 `company_name/job_name/referrer_name` 供前端展示，但这些字段由查询时组装，不再是 `employees` 主数据。

### 第 3 阶段：数据迁移

迁移原则：先补关系，再合并员工，再清理字段。

1. 以 `employees.company_id/job_id/referrer_id` 补齐缺失的 `employee_companies`。
2. 以身份证优先、其次 `user_id`、最后手机号+姓名识别重复员工。
3. 为重复员工选择 canonical employee：
   - 已绑定 `user_id` 优先；
   - 有有效 `employee_companies` 优先；
   - 资料完整度高优先；
   - 创建时间较早优先。
4. 更新所有引用集合的 `employee_id` 到 canonical。
5. 被合并员工标记 `merged_into_employee_id`，暂不物理删除。
6. 清理或停止使用 `employees.company_id/company_name/job_id/job_name/referrer_name`。

引用集合至少包括：

- `users`
- `employee_companies`
- `worktime_records` / `worktimes`
- `worktime_monthly_summaries`
- `salaries`
- `salary_advances`
- `salary_insurance_ledgers`
- `salary_insurance_deductions`
- `personal_rewards`
- `recruitment_bonuses`
- `archives`
- `candidate_action_logs`

### 第 4 阶段：索引与约束

建议补充索引：

- `users`: `phone`、`employee_id`、`openid`
- `employees`: `user_id`、`id_card`、`phone`、`employee_no`、`merged_into_employee_id`
- `employee_companies`: `employee_id + status`、`company_id + status`、`employee_id + company_id + status`、`referrer_id + join_date`

唯一约束建议谨慎：

- `employees.id_card` 可作为逻辑唯一，但要先清理空值和重复值。
- `employees.user_id` 可唯一。
- `employee_companies` 不建议简单唯一 `employee_id + company_id`，因为同一员工可能离职后再入职同一企业；可以用业务唯一键 `employee_id + company_id + join_date` 或只限制同一员工企业只能有一条 active 关系。

### 第 5 阶段：删除兼容字段

只有在连续一段时间没有代码读取旧字段后，再执行字段清理。

候选删除字段：

- `employees.company_id`
- `employees.company_name`
- `employees.job_id`
- `employees.job_name`
- `employees.referrer_name`
- `employees.join_date`
- `employee_companies.company_name`
- `employee_companies.job_name`
- `employee_companies.referrer_name/recommender_name/source_referrer_name` 中的重复别名
- `users.id_card`（如确认不再用于候选人身份）

## 风险点

- 保险模块当前需要 `employee.name/id_card` 和关系企业、岗位映射，迁移时必须保证聚合查询返回一致。
- 工时旧逻辑存在 `employee.company_id` 回退判断，必须先改为 `employee_companies` 判定。
- Web 员工页面、保险页面、报表页面仍大量展示 `company_name/job_name/referrer_name`，需要后端或 API 层统一补充展示字段。
- 历史工资、工时、提成记录可以保留名称快照，因为这些属于历史凭证，不建议强行清理。

## 推荐落地顺序

1. 写一个只读审计工具，生成重复和不一致报告。
2. 改造入职、二维码入职、员工编辑三个写入口。
3. 新增员工聚合查询，替换员工列表和详情页。
4. 用 MCP dry-run 方式迁移重复员工和在职关系。
5. 灰度运行一周，仅停止写旧字段，不删除旧字段。
6. 确认无回退依赖后，再清理历史兼容字段和索引。
