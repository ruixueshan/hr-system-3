# Web/云端薪资保险统一方案设计（V2）

## 背景

当前仓库里，日结和月结的保险扣除口径并不一致：

- `web/src/api/modules/salaries.ts`
  日结发薪预览把 `insurance_deduct` 直接置为 `0`
- `web/src/api/modules/worktime.ts`
  日结工时汇总又按“在职天数 * 日保险 + 月保险”计算，口径错误
- `cloudfunctions/salary-engine/calculate-salary.js`
  云端薪资引擎已有一套更合理的月度保险规则，但没有覆盖 web 端全部链路

因此需要先统一业务规则，再统一实现入口。

本设计的要求是：

1. 统一所有保险扣费口径
2. 满足以下业务规则
   - 入职首月：实际在职天数 * 日保险
   - 首月扣费最高不超过月保险上限
   - 从次月开始直到离职月：按月保险上限扣除
3. 日结工保险不在当月逐笔日薪中扣，而是在次月第一次产生工资时补扣上月保险
4. 离职员工若未及时扣到上月保险，需要从押金中补扣
5. 在正式启用前，不影响线上现有业务

## 统一业务规则

### 1. 保险归属周期

保险按“月”形成应扣义务，不按单笔工资形成应扣义务。

统一定义：

- `insurance_month`：保险归属月份，格式 `YYYY-MM`
- 某员工在某企业、某月份，最多只形成一笔保险应扣义务

### 2. 保险应扣金额规则

对每个 `employee_id + company_id + insurance_month`：

- 首月
  - `应扣 = min(实际在职天数 * insurance_daily_deduct, insurance_monthly_deduct)`
- 次月及之后，直到离职月
  - `应扣 = insurance_monthly_deduct`

说明：

- “离职月”不做按天折算，仍按整月保险扣除
- 只有“入职首月”允许按天折算
- 如果工价方案中日保险或月保险为空，则按 `0` 处理

### 3. 月结工扣费时点

月结工在计算当月工资时，直接扣当月 `insurance_month` 的应扣金额。

例如：

- 2026-04 的月结工资
  扣 2026-04 的保险

### 4. 日结工扣费时点

日结工不在当月每笔日薪里扣保险。

统一规则：

- 某月形成的保险义务，在“次月第一次产生可发薪资”时补扣
- 扣费对象优先级：
  1. 次月第一笔正常日结工资
  2. 若次月没有正常工资，但有押金结算，则从押金结算中扣
  3. 若仍无可扣对象，则该保险义务继续保持“待扣”，滚动到后续第一笔可发薪资

例如：

- 2026-03 的保险
  - 正常情况：在 2026-04 第一笔日结工资时扣
  - 若 4 月无工资，但有押金发放：从押金里扣
  - 若 4 月也没有押金发放：继续待扣，直到未来首次可扣事件

### 5. 离职员工押金补扣规则

若员工已离职，且仍存在未扣的上月保险义务，则：

- 在押金结算时优先补扣最早未结清的保险义务
- 押金不足时：
  - 本次押金全部用于冲减保险
  - 剩余保险义务继续保持待扣

不新增自动追偿逻辑，只记录待扣余额。

## 统一技术口径

### 原则

所有保险金额都由同一套“月度保险义务计算器”得出，禁止在不同页面/模块各自重写公式。

统一的计算入口应当有两层：

1. 纯函数层
   - 只负责根据入职/离职日期、工价方案、目标月份计算“该月应扣保险”
2. 台账层
   - 负责判断“这笔保险什么时候扣、从哪一笔工资/押金扣、还剩多少没扣”

### 统一纯函数

建议新增共享逻辑：

- 云端：
  `cloudfunctions/salary-engine/insurance-v2.js`
- web 端：
  `web/src/utils/salaryInsuranceV2.ts`

纯函数建议：

- `calculateMonthlyInsuranceObligation({ year, month, joinDate, leaveDate, insuranceDailyDeduct, insuranceMonthlyDeduct })`
- `isEntryMonth({ targetMonth, joinDate })`
- `getInsuranceMonthKey({ year, month })`

### 统一台账模型

建议新增集合：

- `salary_insurance_ledgers`

一条记录表示“某员工在某企业某个月形成的一笔保险应扣义务及其扣费进度”。

建议字段：

- `employee_id`
- `company_id`
- `insurance_month`
- `settlement_mode_snapshot`
- `join_date_snapshot`
- `leave_date_snapshot`
- `rate_plan_id_snapshot`
- `insurance_daily_deduct_snapshot`
- `insurance_monthly_deduct_snapshot`
- `obligation_amount`
- `deducted_amount`
- `remaining_amount`
- `status`
  - `pending`
  - `partial`
  - `settled`
  - `cancelled`
- `first_due_event_month`
  - 对月结工：等于 `insurance_month`
  - 对日结工：等于 `insurance_month + 1 month`
- `last_deduct_source_type`
  - `salary_daily`
  - `salary_monthly`
  - `deposit`
- `last_deduct_source_id`
- `created_at`
- `updated_at`

### 扣费分摊记录

为了审计和回溯，建议新增集合：

- `salary_insurance_deductions`

建议字段：

- `ledger_id`
- `employee_id`
- `company_id`
- `insurance_month`
- `source_type`
  - `salary_daily`
  - `salary_monthly`
  - `deposit`
- `source_id`
- `deduct_amount`
- `pay_date`
- `remark`
- `created_at`

## 各业务链路应如何改造

### 1. 月结发薪

当前入口：

- `cloudfunctions/salary-engine/calculate-salary.js`

改造目标：

- 月结计算时不直接临时算保险
- 先读取/生成 `salary_insurance_ledgers`
- 取出当月应扣义务
- 将 `remaining_amount` 作为本次月结保险扣除
- 生成工资记录后写入 `salary_insurance_deductions`
- 更新 `ledger.remaining_amount`

### 2. 日结发薪预览

当前入口：

- `web/src/api/modules/salaries.ts`
- `web/src/views/Salary/Index.vue`

改造目标：

- web 端不再本地算保险
- 改为调用云函数统一返回“本次待发记录 + 是否命中上月保险补扣”
- 对日结工，只有“次月第一笔工资”或“满足补扣条件的工资”才显示保险

也就是说，未来需要废弃：

- `web/src/api/modules/salaries.ts` 中本地 `calculateDailyPreview()`
- `web/src/api/modules/worktime.ts` 中自算保险的 `getComputedDailySalaryRows()` 公式

### 3. 押金结算

当前现状：

- `worktimes.is_deposit` 仅标记押金工时
- 尚未形成“押金作为保险补扣来源”的完整结算模型

改造目标：

- 押金发放前，检查该员工在该企业是否存在已到期未扣的保险义务
- 若存在，则从本次押金结算金额中优先扣减
- 生成一条 `source_type = deposit` 的 `salary_insurance_deductions`

建议押金相关工资记录继续落在 `salaries` 集合中，但补充：

- `source_type = 'deposit'`
- `deposit_gross_amount`
- `insurance_deduct`
- `net_pay`

### 4. 项目报销

`project_reimbursements` 当前也是写成 `settlement_mode = daily` 的工资记录。

设计上建议：

- 项目报销不参与保险补扣
- 即 `source_type = project_reimbursement` 的记录不作为保险补扣来源

原因：

- 项目报销不是工资性质的正常用工结算
- 若把项目报销也作为保险扣费来源，业务上容易引发争议

## 线上无影响的实施方式

### 开关策略

使用 `system_config` 增加总开关，默认关闭：

- `salary_insurance_v2_enabled = false`

可选增加子开关：

- `salary_insurance_v2_shadow_mode = true`

建议行为：

- `enabled = false`
  - 所有线上逻辑保持现状
- `enabled = false + shadow_mode = true`
  - 新规则只做影子计算、日志记录，不参与实际发薪
- `enabled = true`
  - 新规则正式生效

### 推荐灰度顺序

1. 先上线纯函数和台账生成逻辑，默认不开启
2. 开启 `shadow_mode`
   - 对比旧逻辑和新逻辑差异
   - 校验月结、日结、离职押金样本
3. 仅对测试企业开启
   - 可扩展为按 `company_id` 白名单
4. 再全量启用

## 数据兼容策略

本轮不修历史记录。

因此 V2 只处理“开关开启后的新增发薪/押金结算行为”：

- 不回写旧 `salaries`
- 不追溯修正旧 `insurance_deduct`
- 新增台账从启用月份开始生成

这样能保证：

- 线上当前已发薪记录不变
- 财务对账不会因历史重算而波动

## 建议新增字段

### `salaries`

建议补充：

- `source_type`
  - `salary_daily`
  - `salary_monthly`
  - `deposit`
  - `project_reimbursement`
- `insurance_month`
- `insurance_ledger_id`
- `insurance_deduct_detail`

### `worktimes`

可选补充：

- `deposit_batch_id`
- `deposit_settlement_status`

### `employee_companies`

沿用现有：

- `join_date`
- `leave_date`
- `settlement_mode`
- `rate_plan_id`

这些字段已经足够支撑 V2 保险规则，不强制新增。

## 实施阶段拆分

### Phase 1

只做基础设施，不改线上结果：

- 新增保险 V2 纯函数
- 新增台账集合设计
- 新增系统开关读取
- 新增影子计算日志

### Phase 2

只接入月结：

- 月结薪资改为走台账扣费
- 日结仍保持旧逻辑

### Phase 3

接入日结：

- 日结预览和发薪改为调用云端统一计算
- 次月首次工资补扣上月保险

### Phase 4

接入押金：

- 押金结算前自动检查并补扣未收保险

## 本次确认后的业务口径

最终确认如下：

1. 首月保险
   - `min(实际在职天数 * 日保险, 月保险上限)`
2. 次月到离职月
   - 一律按月保险上限
3. 月结工
   - 在当月工资中直接扣当月保险
4. 日结工
   - 在次月第一次产生工资时补扣上月保险
5. 离职员工
   - 如仍有待扣保险，优先从押金中扣
6. 历史记录
   - 本轮不修
7. 上线策略
   - 全部通过 `system_config` 开关控制，默认关闭

## 下一步建议

按风险最低顺序，下一步只做以下代码改造：

1. 新增 `salary_insurance_v2_enabled` / `salary_insurance_v2_shadow_mode` 开关读取
2. 抽出统一保险纯函数
3. 新增 `salary_insurance_ledgers` 与 `salary_insurance_deductions` 的数据定义
4. 在不启用开关的情况下，把月结、日结、押金三条链路接入“影子计算”

这样我们先完成“统一口径 + 不影响线上”的目标，再进入正式切换。
