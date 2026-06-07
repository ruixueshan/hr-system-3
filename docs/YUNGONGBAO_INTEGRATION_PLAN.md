# 云工保保险系统接入计划

> 目标：把云工保的加保、减保、保单人员同步能力接入 HR 系统 3.0，实现员工入职自动投保、离职自动减保、每日状态核对，并与现有薪资保险扣费台账保持边界清晰。

## 1. 接入结论

云工保当前已确认的接口能力足够支撑第一版上线：

- 登录获取 `token`：`POST /api/passport/login`，参数为 `user_name + password`
- 客户状态检查：`GET /api/customer/check`
- 保单列表与详情：`GET /api/policy/lists`、`GET /api/policy/detail`
- 保单人员列表：`POST /api/policy_person/lists`
- 派遣单位与可投保工种白名单：`GET /api/work_company/lists`
- 工种库：`POST /api/Occupation/listsAll`
- 加保：`POST /api/policy_change/add`
- 减保：`POST /api/policy_change/off`

第一版不要依赖“回调”或“保费预计算”，因为接口文档明确标记为尚待探索。投保结果以接口返回 + 定时同步双确认。

`/api/customer/check` 必须作为登录后的前置检查：

- `status = 0`：账户可正常使用
- `status = 1`：待认证
- `status = 2`：待签约咨询服务协议
- `status = 3`：待签约企业开户承诺书

只有 `status = 0` 时允许同步保单、加保和减保。其他状态应进入账号配置异常，不允许继续自动任务。

## 2. 系统边界

现有 `salary_insurance_ledgers` 和 `salary_insurance_deductions` 负责工资扣费，不直接等于外部投保状态。

新增“外部保险接入”模块负责：

- 云工保账号、token 缓存与接口调用
- 保单、派遣单位、工种基础数据同步
- 员工投保记录与加减保申请记录
- 入职/离职业务触发投保或减保
- 每日同步外部保单人员，发现差异并告警

薪资扣费和外部投保可以通过 `employee_id + company_id + insurance_month` 做核对，但不要混用同一张表承载两种含义。

## 3. 数据模型设计

建议新增集合：

### `insurance_provider_configs`

保存云工保账号配置和运行状态。

- `provider`: 固定 `yungongbao`
- `base_url`: 默认 `https://www.langongbao.top`
- `user_name`
- `password_secret_key`: 密码不要明文入库，优先使用云函数环境变量或密钥名
- `token`
- `token_updated_at`
- `customer_status`: `/api/customer/check` 返回的账户状态
- `contract_id`
- `enabled`
- `last_checked_at`
- `created_at`
- `updated_at`

### `insurance_policies`

同步云工保保单。

- `provider`
- `policy_id`
- `plan_id`
- `plan_name`
- `policy_no`
- `status`
- `price`
- `start_date`
- `end_date`
- `total_person`
- `raw_data`
- `synced_at`

### `insurance_work_companies`

同步云工保派遣单位与工种白名单。

- `provider`
- `external_company_id`
- `name`
- `occupation_ids`
- `occupation_category_list`
- `insurance_company_ids`
- `suggest_plan_id`
- `convention`
- `raw_data`
- `synced_at`

### `insurance_occupations`

同步工种库，供入职/后台选择。

- `provider`
- `policy_id`
- `occupation_id`
- `name`
- `category`
- `series`
- `series_name`
- `level`
- `merger_name`
- `is_disable`
- `raw_data`
- `synced_at`

### `insurance_job_mappings`

维护 HR 系统岗位/工种与云工保工种的匹配关系。这是自动加保的前置条件。

- `company_id`: HR 企业 ID，可为空表示全局默认映射
- `job_id`: HR 岗位 ID
- `job_name_snapshot`
- `rate_plan_id`: 工价方案 ID，可选
- `provider`: 固定 `yungongbao`
- `policy_id`: 默认投保保单
- `work_company_id`: 云工保派遣单位 ID
- `work_company_name`: 云工保派遣单位全称，加保时传这个字段
- `occupation_id`: 云工保工种 ID
- `occupation_name`
- `occupation_category`
- `series`
- `series_name`
- `mapping_status`: `draft` / `active` / `disabled` / `invalid`
- `match_rule`: `manual` / `name_exact` / `name_keyword` / `default_by_company`
- `confidence`: 自动匹配置信度，人工确认后为 `1`
- `remark`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

### `insurance_company_mappings`

维护 HR 企业与云工保派遣单位之间的关系。

- `company_id`
- `company_name_snapshot`
- `provider`
- `work_company_id`
- `work_company_name`
- `suggest_policy_id`
- `enabled`
- `created_at`
- `updated_at`

### `employee_insurance_records`

HR 员工与云工保投保状态映射。

- `employee_id`
- `employee_company_id`
- `company_id`
- `provider`
- `policy_id`
- `policy_person_id`
- `external_employee_id`
- `name_snapshot`
- `idcard_masked`
- `work_company`
- `occupation_id`
- `occupation_name`
- `start_date`
- `end_date`
- `status`: `pending_add` / `active` / `pending_off` / `offed` / `failed` / `mismatch`
- `last_error`
- `last_synced_at`
- `created_at`
- `updated_at`

### `insurance_batch_tasks`

人工批量加保/减保任务主表。

- `task_no`
- `type`: `batch_add` / `batch_off`
- `source`: `manual_select` / `excel_import` / `exception_retry`
- `policy_id`
- `work_company_name`
- `total_count`
- `success_count`
- `failed_count`
- `skipped_count`
- `status`: `draft` / `prechecking` / `ready` / `processing` / `partial_success` / `success` / `failed` / `cancelled`
- `precheck_summary`
- `operator_id`
- `operator_name`
- `created_at`
- `updated_at`
- `finished_at`

### `insurance_batch_task_items`

人工批量加保/减保任务明细。

- `task_id`
- `row_no`
- `employee_id`
- `employee_company_id`
- `company_id`
- `name_snapshot`
- `idcard_masked`
- `policy_id`
- `work_company`
- `occupation_id`
- `operation_start_date`
- `item_status`: `pending` / `precheck_failed` / `ready` / `processing` / `success` / `failed` / `skipped`
- `precheck_errors`
- `provider_response`
- `change_request_id`
- `created_at`
- `updated_at`

### `insurance_change_requests`

加保/减保请求流水，保证幂等和可追溯。

- `request_no`
- `type`: `add` / `off`
- `employee_id`
- `employee_company_id`
- `company_id`
- `policy_id`
- `start_date`
- `persons_payload`
- `status`: `pending` / `success` / `failed` / `confirmed`
- `provider_response`
- `error_message`
- `operator_id`
- `batch_task_id`
- `batch_item_id`
- `created_at`
- `updated_at`

### `insurance_sync_logs`

同步任务日志与差异报告。

- `sync_type`: `policies` / `work_companies` / `occupations` / `policy_persons`
- `policy_id`
- `status`
- `summary`
- `diffs`
- `started_at`
- `finished_at`

## 4. 云函数设计

建议新增一个云函数：`insurance-yungongbao`。

所有前端和小程序都只调用这个云函数，不直接访问云工保，避免账号密码、token、完整身份证泄露到客户端。

### Action 设计

- `login`
  - 内部使用，刷新 token
- `checkCustomerStatus`
  - 调用 `/api/customer/check`，确认账号是否已认证、已签约
- `syncBaseData`
  - 一键同步保单、派遣单位、工种基础数据
- `syncPolicies`
  - 拉取 `/api/policy/lists` 和必要的 `/api/policy/detail`
- `syncWorkCompanies`
  - 拉取 `/api/work_company/lists`
- `syncOccupations`
  - 按保单拉取 `/api/Occupation/listsAll`
- `syncPolicyPersons`
  - 按保单分页拉取 `/api/policy_person/lists`
- `precheckAddInsurance`
  - 校验员工身份证、派遣单位、工种白名单、保单 series、是否重复投保
- `precheckOffInsurance`
  - 校验员工是否存在有效投保记录、减保日期是否合法
- `addInsurance`
  - 调用 `/api/policy_change/add`
- `offInsurance`
  - 调用 `/api/policy_change/off`
- `createBatchTask`
  - 创建人工批量加保/减保任务
- `precheckBatchTask`
  - 批量预校验，逐行输出可提交/不可提交原因
- `submitBatchTask`
  - 批量提交云工保加保/减保
- `retryBatchFailedItems`
  - 重试批量任务失败项
- `resolveJobMapping`
  - 根据员工企业关系、岗位、工价方案解析默认保单、派遣单位和云工保工种
- `saveJobMapping`
  - 人工维护岗位映射
- `getEmployeeInsuranceStatus`
  - 查询员工当前投保状态
- `listInsuranceExceptions`
  - 给后台展示差异和失败记录

### Token 策略

- 云函数启动时优先读取数据库中缓存的 token
- 接口返回未授权或 token 失效时，自动登录刷新并重试一次
- 登录失败要写入 `insurance_sync_logs`，并触发后台异常提示
- 登录参数字段使用 `user_name`，不要使用 `username`
- 登录成功后立即调用 `checkCustomerStatus`
- `customer_status` 不等于 `0` 时，禁止执行同步、加保、减保和批量任务

### 幂等策略

- 加保幂等键：`employee_company_id + policy_id + start_date + type=add`
- 减保幂等键：`employee_company_id + policy_id + start_date + type=off`
- 如果云工保返回“员工已投保该保司方案，无法重复投保”，应转为同步人员列表确认；确认已在保后把本地记录置为 `active`
- 如果减保返回“未投保或已经减保”，应同步人员列表确认；确认不在保后把本地记录置为 `offed`

## 5. 岗位与保险工种匹配

这是自动投保的第一道门。HR 系统里的“岗位”不能直接拿去加保，必须先匹配到云工保的 `occupation_id`，并且要同时满足派遣单位白名单和保单方案 series。

### 5.1 匹配对象

HR 侧：

- `jobs._id`
- `jobs.position`
- `jobs.company_id`
- `jobs.rate_plan_id`
- `employee_companies.rate_plan_id`

云工保侧：

- `insurance_work_companies.name`
- `insurance_work_companies.occupation_ids`
- `insurance_work_companies.suggest_plan_id`
- `insurance_occupations.occupation_id`
- `insurance_occupations.name`
- `insurance_occupations.category`
- `insurance_occupations.series`
- `insurance_policies.policy_id`
- `insurance_policies.plan_name`

### 5.2 匹配规则

优先级从高到低：

1. 人工确认映射
   - `company_id + job_id + rate_plan_id` 精确匹配
   - 命中后直接使用 `policy_id + work_company_name + occupation_id`
2. 企业默认映射
   - `company_id + job_id` 匹配
   - 适用于同岗位固定投同一个云工保工种
3. 工价方案映射
   - `company_id + rate_plan_id` 匹配
   - 适用于同一工价方案绑定同一保险方案
4. 名称候选匹配
   - 用 `jobs.position` 与云工保 `occupation.name`、`merger_name` 做关键词候选
   - 只生成候选，不自动投保，必须人工确认

第一版建议只允许人工确认后的 `mapping_status = active` 参与自动加保。自动候选只用于提高录入效率。

### 5.3 映射校验

保存映射时必须校验：

- HR 企业已经绑定云工保派遣单位
- `occupation_id` 在该派遣单位 `occupation_ids` 白名单内
- `occupation.category` 是可投保类别，优先 `3`
- `occupation.series` 与保单方案匹配
- `policy_id` 是生效中的保单，`status = 10`

若云工保基础数据更新后映射失效，应把 `insurance_job_mappings.mapping_status` 标记为 `invalid`，自动加保停止，进入异常队列。

### 5.4 后台交互

“岗位保险映射”页面需要支持：

- 按企业查看岗位映射状态
- 显示 HR 岗位、工价方案、默认保单、派遣单位、云工保工种
- 对未映射岗位显示云工保候选工种
- 支持批量设置同企业岗位的默认保单和派遣单位
- 支持启用/停用映射
- 显示映射失效原因

## 6. 入职/离职自动同步加减保

### 6.1 自动投保触发条件

员工入职后，满足以下条件才自动创建加保任务：

- `employee_companies.status = active`
- 员工姓名和完整身份证可用
- 员工企业关系有关联岗位或工价方案
- HR 企业已绑定云工保派遣单位
- 岗位映射为 `active`
- 目标保单处于生效状态
- 员工当前没有同保单 `active` 或 `pending_add` 的投保记录

不满足条件时，不要静默失败，应写入异常队列：

- `missing_idcard`
- `missing_company_mapping`
- `missing_job_mapping`
- `invalid_job_mapping`
- `policy_not_active`
- `already_active`

### 6.2 自动投保流程

触发点建议接在内部入职成功后，也就是创建或更新 `employee_companies` 的链路。

当前相关位置：

- `cloudfunctions/qrcode/index.js`
- `miniprogram/pages/internal-onboard/index.ts`
- `web/src/views/Employees/Index.vue`

流程：

1. 员工入职生成 `employees` 与 `employee_companies`
2. 根据 HR 企业映射找到云工保 `work_company` 全称
3. 根据岗位/工价/后台选择确定 `policy_id` 和 `occupation_id`
4. 调用 `precheckAddInsurance`
5. 通过后创建 `insurance_change_requests`
6. 调用云工保加保接口
7. 成功后先把 `employee_insurance_records.status` 置为 `pending_add` 或 `active`
8. 再调用 `syncPolicyPersons` 确认 `policy_person_id`
9. 后台显示投保状态、保障周期和失败原因

加保请求关键点：

- `persons` 必须是 JSON 字符串，不是数组
- `persons` 支持多人，格式为序列化后的数组字符串
- `work_company` 必须传云工保派遣单位全称
- `idcard` 必须是完整身份证号
- `occupation_id` 必须在该派遣单位白名单内
- `occupation_id.series` 必须匹配保单方案
- 成功响应可能只有 `{ code: 1, msg: "success" }`，不一定返回 `data`
- 失败响应可能通过 `data.list_str` 返回总体错误，例如“保单不存在”

### 6.3 自动减保触发条件

员工离职后，满足以下条件才自动创建减保任务：

- `employee_companies.status = left` 或存在 `leave_date`
- 本地存在 `active` 或 `pending_add` 的 `employee_insurance_records`
- 能取得完整身份证号
- 目标减保日期不早于今天

如果本地投保记录缺失，但云工保同步发现该员工在保，应进入异常队列，由工作人员确认后减保。

### 6.4 自动减保流程

触发点建议接在员工企业关系离职时，即 `employee_companies.status = left` 或写入 `leave_date` 的地方。

流程：

1. HR 操作员工离职，写入 `leave_date`
2. 查询 `employee_insurance_records` 中当前 `active` 的记录
3. 如果本地没有 `policy_person_id`，先按保单同步人员列表
4. 减保 `start_date` 优先取云工保当前保障周期 `end_date` 的日期部分
5. 调用云工保减保接口
6. 成功后记录 `pending_off`
7. 每日同步确认员工已移除或保障结束后置为 `offed`

减保请求关键点：

- `start_date` 不能早于今天
- 文档建议设为当前保障周期最后一天
- `persons` 只需要 `name + idcard`
- 当前已确认单人示例，是否稳定支持多人减保仍需联调确认

### 6.5 自动化开关

建议提供两级开关：

- 企业级：是否允许该企业自动加保/减保
- 全局级：自动提交云工保 / 只创建待审核任务

上线初期推荐：

- 自动加保：先设为“只创建待审核任务”
- 自动减保：可以先设为“只创建待审核任务”
- 人工确认稳定后，再打开自动提交

## 7. 工作人员手动加减保与批量操作

人工操作是必须能力，用于处理补投保、批量入职、异常重试和接口不可用后的补偿。

### 7.1 手动单人加保

入口：

- 员工详情页
- 员工列表批量操作
- 保险异常队列

表单字段：

- 员工
- 保单
- 派遣单位
- 云工保工种
- 生效日期

提交前执行 `precheckAddInsurance`，通过后创建 `insurance_change_requests` 并调用 `addInsurance`。

### 7.2 手动单人减保

入口：

- 员工详情页
- 员工离职流程
- 保险异常队列

表单字段：

- 员工
- 保单
- 减保日期

提交前执行 `precheckOffInsurance`。如果员工有多个在保保单，必须让工作人员选择要减保的保单。

### 7.3 批量加保

批量来源：

- 员工列表勾选
- 异常队列勾选
- Excel 导入

批量流程：

1. 创建 `insurance_batch_tasks`
2. 逐个员工解析岗位映射
3. 执行批量预校验
4. 前端展示每行结果：可提交、跳过、错误原因
5. 工作人员确认后提交
6. 云函数按同一 `policy_id + start_date + work_company + occupation_id` 分组提交云工保加保接口
7. 每条写入 `insurance_change_requests`
8. 更新批量任务统计
9. 成功项同步保单人员确认，失败项支持重试

批量加保预校验必须覆盖：

- 姓名不能为空
- 身份证不能为空且格式合法
- HR 企业已绑定云工保派遣单位
- 岗位映射存在且有效
- 工种在派遣单位白名单内
- 保单方案与工种 `series` 匹配
- 本地不存在同保单在保记录
- 云工保人员列表中不存在同身份证在保记录

### 7.4 批量减保

批量来源：

- 员工列表勾选
- 离职员工列表
- 异常队列勾选
- Excel 导入

批量流程：

1. 创建 `insurance_batch_tasks`
2. 查找每个员工当前在保记录
3. 执行批量预校验
4. 前端展示每行结果
5. 工作人员确认后提交
6. 云函数逐条调用云工保减保接口
7. 每条写入 `insurance_change_requests`
8. 更新批量任务统计
9. 成功项置为 `pending_off`，后续同步确认

批量减保预校验必须覆盖：

- 本地或云工保存在有效在保记录
- 减保日期不早于今天
- 员工姓名和完整身份证可用
- 如果员工存在多个保单，需要指定 `policy_id`

### 7.5 批量提交策略

加保接口示例已确认 `persons` 可以传多人 JSON 字符串，因此批量加保可以按小批量提交。

第一版建议策略：

- 批量加保：按同一保单、同一生效日期、同一派遣单位、同一工种分组，每组最多 10 人提交一次
- 批量减保：接口示例目前只有单人，第一版先逐条提交；待确认多人减保稳定后再升级为小批量
- 每个批次提交前仍要保留逐行预校验结果
- 批次成功后，通过 `syncPolicyPersons` 回查确认每个人的最终状态
- 批次失败且返回 `data.list` 时，按 `list[].idcard/list[].name/msg` 回填到对应明细
- 批次失败但没有逐人错误明细时，把该批所有人员标记为 `failed`，允许拆分后重试

这样做的好处：

- 每个员工都有独立成功/失败状态
- 大部分正常员工可以批量提交，减少接口调用次数
- 批次失败时仍能拆分重试
- 方便重试失败项
- 便于审计和追踪

待联调确认减保也稳定支持多人 `persons` 后，再把批量减保从逐条提交升级为小批量提交。

### 7.6 权限与审计

手动加减保需要单独权限：

- `insurance:add`
- `insurance:off`
- `insurance:batch_add`
- `insurance:batch_off`
- `insurance:mapping_manage`
- `insurance:sync`

所有手动操作必须记录：

- 操作人
- 操作时间
- 操作来源
- 提交参数脱敏快照
- 云工保响应
- 成功/失败原因

## 8. 后台管理页面

建议在 Web 管理后台新增“保险接入”页面，或放入设置/员工模块下。

第一版页面能力：

- 云工保账号配置状态：是否可登录、最后同步时间
- 保单列表：方案、单价、保障周期、在保人数
- 派遣单位映射：HR 企业 ↔ 云工保派遣单位全称
- 工种映射：HR 岗位/工种 ↔ 云工保 `occupation_id`
- 员工投保状态：未投保、投保中、在保、减保中、已减保、失败
- 异常队列：身份证错误、工种不匹配、重复投保、未投保无法减保
- 手动操作：重试加保、重试减保、同步保单人员

建议拆成 5 个 Tab：

- 保单同步
- 企业/派遣单位映射
- 岗位保险映射
- 员工投保状态
- 批量任务与异常队列

## 9. 定时同步与告警

建议创建定时触发器：

- 每天 01:30：同步保单、派遣单位、工种基础数据
- 每天 02:00：同步所有生效保单人员
- 每天 02:30：生成差异报告

差异规则：

- HR 在职且应投保，但云工保不在保：标记 `mismatch`，进入补投保队列
- HR 已离职但云工保仍在保：标记 `mismatch`，进入减保队列
- 云工保在保但 HR 无员工关系：标记外部孤儿记录，人工确认
- 工种不在白名单：禁止自动加保，要求 HR 修正映射

## 10. 与薪资保险 V2 的关系

现有文件：

- `docs/SALARY_INSURANCE_V2_DESIGN.md`
- `cloudfunctions/salary-engine-v2/insurance-v2.js`
- `cloudfunctions/salaries/insurance-ledger.js`
- `cloudfunctions/salaries-v2/calculate-salary.js`

这些模块继续负责“员工工资里扣多少钱、什么时候扣”。云工保接入负责“员工是否真实被投保/减保”。

后续可以增加月度核对报表：

- 薪资台账应扣人数
- 云工保实际在保人数
- 差异员工清单
- 保单 `price` 与内部工价方案 `insurance_monthly_deduct` 的差额

## 11. 实施阶段

### 阶段一：基础接入与同步

- 新增 `insurance-yungongbao` 云函数
- 完成登录、token 缓存、统一请求封装
- 新增集合和索引
- 同步保单、派遣单位、工种、保单人员
- 后台可查看同步结果

验收标准：

- 能登录云工保
- 能看到保单列表和在保人员
- 能建立 HR 企业与云工保派遣单位映射

### 阶段二：岗位映射

- 新增 `insurance_company_mappings`
- 新增 `insurance_job_mappings`
- 后台支持企业映射、岗位映射、工种候选选择
- 保存映射时校验派遣单位白名单、工种 category、series、保单状态

验收标准：

- 每个需要投保的 HR 岗位都能绑定云工保工种
- 无映射或映射失效的岗位不能自动投保
- 工作人员能看到清晰的失效原因

### 阶段三：手动加保/减保闭环

- 实现 `precheckAddInsurance`
- 实现 `precheckOffInsurance`
- 实现单员工加保、减保
- 写入 `insurance_change_requests`
- 同步确认 `employee_insurance_records`
- 后台支持失败重试

验收标准：

- 单个员工可从后台完成加保
- 单个员工可从后台完成减保
- 常见错误能展示到具体员工

### 阶段四：批量加保/减保

- 新增 `insurance_batch_tasks`
- 新增 `insurance_batch_task_items`
- 支持员工列表勾选批量加保/减保
- 支持 Excel 导入批量加保/减保
- 支持预校验、逐条提交、失败重试

验收标准：

- 批量任务能逐行展示校验结果
- 部分失败不影响成功项
- 失败项能单独重试

### 阶段五：入职/离职自动触发

- 入职成功后自动创建加保任务
- 离职后自动创建减保任务
- 支持“自动提交”与“人工审核后提交”开关
- 定时同步生成差异告警

验收标准：

- 员工入职后自动进入投保流程
- 员工离职后自动进入减保流程
- 每日同步能发现并展示差异

### 阶段六：财务核对

- 增加保单费用与薪资保险扣费对账
- 增加按月导出
- 增加异常处理闭环

验收标准：

- 财务可查看某月应扣、已扣、实际在保、外部保费
- 能定位员工级差异原因

## 12. 风险与待确认事项

上线前必须确认：

- 云工保正式账号、密码、是否有测试环境
- token 有效期和失效响应格式
- 减保是否支持多人批量提交
- 是否存在接口频率限制
- 是否能提供投保结果回调
- 身份证完整号码在 HR 系统中的解密/读取方式
- HR 企业名称与云工保派遣单位名称是否一一对应
- 不同保单方案与工种 `series` 的映射规则
- HR 岗位与云工保工种是否有官方推荐映射表
- 批量加保一批建议最大人数
- 批量减保接口是否真实支持多人一次提交
- 批量提交时一人失败是否导致整批失败

当前最大风险：

- 文档里的测试账号均不可用，无法立即联调
- 没有回调，只能靠同步确认最终状态
- 加保接口要求完整身份证，需要严格控制数据权限和日志脱敏
- 岗位映射错误会导致投保失败或错误工种投保，必须先人工确认映射

## 13. 推荐优先级

优先顺序建议调整为：

1. 基础数据同步
2. 企业/派遣单位映射
3. 岗位/保险工种映射
4. 手动单人加减保
5. 人工批量加减保
6. 入职/离职自动创建任务
7. 自动提交云工保
8. 财务核对

原因是云工保有较多业务校验依赖派遣单位、工种白名单、方案 series、身份证真实性。先把映射和人工批量闭环做好，再接入入职/离职自动化，会更稳。
