# 数据库修复 Dry-Run 计划

生成时间：2026-05-14  
环境：`cloud1-5glojms9a83c3457`  
操作性质：只读分析，未写入数据库，未迁移数据，未删除数据，未部署云函数

## 1. 输入来源

本计划基于以下只读结果：

- `audit-employee-chain` / `precision-audit`
  - RequestId：`bcb46364-0575-47f4-9386-7fcc4d181440`
- `audit-employee-chain` / 默认链路检查
  - RequestId：`069a3d8f-4f36-4150-89e6-a4f353fa9ca6`
- MCP 只读查询：
  - `applications`
  - `interviews`
  - `employee_companies`
  - `worktimes`
  - `salaries`
  - `users`
  - `employees`

## 2. Dry-Run 总览

| 编号 | 问题域 | 涉及数量 | 依赖命中 | 建议策略 | 自动级别 |
| --- | --- | ---: | --- | --- | --- |
| DRY-EMP-001 | `employees.user_id` 重复 | 1 组 / 2 员工 | 命中 `employee_companies`、`worktimes` | 人工选主档后迁移/合并 | 人工确认 |
| DRY-USR-001 | `users.id_card` 重复 | 5 组 / 10 用户 | 命中 `applications`、`interviews` | employee/candidate 归并或清理候选快照 | 部分可自动 |
| DRY-USR-002 | `users.phone` 重复 | 2 组 / 4 用户 | 命中 `applications`、`interviews` | 合并候选链路或人工确认 | 部分可自动 |
| DRY-REL-001 | 活跃关系按员工重复 | 2 组 / 4 关系 | 命中 `worktimes`、`salaries` | 判断当前有效企业，关闭旧关系 | 人工确认 |
| DRY-REL-002 | active 且有离职日期 | 49 条 | 待逐条查工时/薪资/保险 | 改 resigned 或清空 leave_date 二选一 | 需二次 dry-run |
| DRY-BIND-001 | 活跃员工无用户绑定 | 151 人 | 其中 2 人可按候选用户匹配 | 只对强匹配生成绑定候选 | 部分可自动 |
| DRY-CLEAN-001 | `employees` 存在关系类冗余字段 | 367 条 | 需比对 `employee_companies` | 关系字段迁移确认后清理 | 需二次 dry-run |

## 3. 依赖查询结果

### 3.1 重复用户相关业务依赖

对重复 `users` 样本查询：

| 集合 | 命中数量 | 说明 |
| --- | ---: | --- |
| `applications` | 11 | 重复用户中存在报名记录，不能直接删除用户 |
| `interviews` | 11 | 重复用户中存在面试记录，清理前必须迁移引用或保留历史 |

结论：账号重复修复不能以删除为第一动作，应先做业务链路归并或仅清理敏感快照字段。

### 3.2 重复员工/多 active 关系依赖

对重复员工和多 active 员工查询：

| 集合 | 命中数量 | 说明 |
| --- | ---: | --- |
| `employee_companies` | 8 | 重复员工和候选绑定员工都有在职关系 |
| `worktimes` | 39 | 多 active 关系中已有工时记录 |
| `salaries` | 41 | 多 active 关系中已有已发薪资记录 |
| `worktime_monthly_summaries` | 0 | 暂未命中月汇总 |

结论：员工主档和关系修复必须保留工时、薪资、在职关系的可追溯性，不能直接删除旧关系。

## 4. 具体 Dry-Run 动作

### DRY-EMP-001：龚诗辰重复员工主档

现状：

| employee_id | employee_no | 姓名 | 手机号 | 身份证 | user_id | 关系 | 工时 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `611e990a6a013c6e01d84cbd63c5825a` | `EP202605110783` | 龚诗辰 | `19215146841` | 空 | `611e990a69fedd21019a25b91546cd6c` | 有 active 关系 | 有 3 条工时 |
| `9756e7616a013c6e01d243b916f47e36` | `EP202605119053` | 龚诗辰 | `19215146843` | `32130220081205281X` | `611e990a69fedd21019a25b91546cd6c` | 有 active 关系 | 未命中工时 |

dry-run 建议：

| 动作 | 目标 | 修复前 | 修复后 | 风险 |
| --- | --- | --- | --- | --- |
| 人工确认主档 | 两条 `employees` | 同名、同 user、不同手机号，一条缺身份证 | 确认保留哪条为主档 | 高 |
| 如确认同一人 | 业务链路 | 两条 active 关系并存 | 将非主档关系、后续业务引用迁移到主档或标记 merged | 高 |
| 如保留 `611...` | `employees.611...` | 缺身份证 | 可补身份证 `32130220081205281X` | 需人工确认 |
| 如保留 `975...` | `worktimes` | 工时在 `611...` 下 | 工时引用迁到 `975...` | 高 |

当前结论：不自动修。必须人工确认手机号、身份证和实际入职记录。

### DRY-USR-001：身份证重复账号

共 5 组：

| 身份证 | 用户组合 | 业务依赖 | dry-run 建议 |
| --- | --- | --- | --- |
| `321321198703143164` | 白小娟 admin/employee + 候选人 | employee 用户有 cancelled 报名 | 候选人无明显链路时，可候选清理；admin 账号不自动动 |
| `370827198910082513` | 张志阳 employee + candidate，同手机号 | 同时命中手机号重复 | 将 candidate 链路归并到 employee 后清理 candidate 敏感字段 |
| `142702197305203630` | 李晓军 employee + 陈爱军 employee | 不同姓名 | 必须人工核实，禁止自动修 |
| `320381200712030087` | 陈菲琳 candidate + employee，手机号不同 | candidate 有报名/面试并有 passed 记录 | 需判断是否同一人，不能只按身份证自动合并 |
| `522401200711284512` | 唐苏楠 employee + candidate，手机号不同 | 两边均有报名/面试历史 | 保留历史，人工确认是否归并 |

候选自动动作模板：

| 动作 | 适用条件 | 目标集合 | 修复方式 |
| --- | --- | --- | --- |
| 迁移报名引用 | employee + candidate 且姓名/手机号/身份证强一致 | `applications` | `user_id: candidate -> employee` |
| 迁移面试引用 | employee + candidate 且姓名/手机号/身份证强一致 | `interviews` | `user_id: candidate -> employee` |
| 清理候选敏感字段 | 业务链路迁移完成，candidate 无员工绑定 | `users` | 清空 `id_card`、`bank_*`，保留审计标记 |
| 标记重复账号 | 业务链路迁移完成 | `users` | `status=merged/archived` 或增加 `merged_into_user_id` |

当前结论：只有强一致组可进入下一轮自动脚本 dry-run；不同姓名、不同手机号且有业务历史的组必须人工确认。

### DRY-USR-002：手机号重复账号

共 2 组：

| 手机号 | 用户组合 | 业务依赖 | dry-run 建议 |
| --- | --- | --- | --- |
| `19927404435` | 两个 candidate，无身份证、无员工绑定 | 两边各有报名/面试 | 可按最近有效报名选择主账号，但需要先列出全部业务链路 |
| `17030375888` | 张志阳 employee + candidate | 与身份证重复重叠 | 合并到 employee 账号候选 |

当前结论：`17030375888` 可并入 DRY-USR-001 处理；`19927404435` 需要先完整列出两个 candidate 的报名、面试、推荐来源再决定主账号。

### DRY-REL-001：同员工多条 active 关系

共 2 组：

| employee_id | active 关系 | 依赖命中 | dry-run 建议 |
| --- | --- | --- | --- |
| `c3459b2a69ccd52d027b84cf795573d7` | `c25002a969cccfe0027b73f900f22abd` / `1fa8f55169c2003d015a3f4e31dc8690` | `1fa8...` 命中大量工时和薪资，`c250...` 暂未在样本依赖中命中 | 倾向保留 `1fa8...` active，人工确认是否关闭 `c250...` |
| `f81188ba69fcade10086851f06824d80` | `1fa8f55169c2003d015a3f4e31dc8690` / `dde8ef4869c3763f0180160b258d9b82` | `1fa8...` 命中 2026-05-04 至 2026-05-10 工时和薪资；`dde8...` 是 2026-05-12 新关系 | 可能是转场，需确认是否给旧关系补 `leave_date=2026-05-11` |

当前结论：不能自动关闭。下一轮应只读列出两组员工在两个企业下的完整工时、薪资、保险、入离职记录。

### DRY-BIND-001：活跃员工无用户绑定

链路检查结果：

| 指标 | 数量 |
| --- | ---: |
| 活跃员工无有效用户绑定 | 151 |
| 可按手机号/身份证找到候选用户 | 2 |

可匹配样本：

| employee_id | 员工 | 手机号 | 身份证 | candidate_user_id | candidate 名称 | dry-run 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| `399cd1a569f07784000997be452e5821` | 孙跃 | `15850912448` | `321321199408185630` | `948392db69fbee9d0142ab371f65d580` | 候选人2448 | 可作为自动绑定候选，但先查 candidate 业务链路 |
| `d967c8d469fca77d015b9ebf6e7b2df6` | 夏娟 | `15151138980` | `411402198103135820` | `8d2e20b369c67c9f01d8cdcf196950a0` | 候选人8980 | 可作为自动绑定候选，但先查 candidate 业务链路 |

dry-run 动作模板：

| 动作 | 目标集合 | 修复前 | 修复后 | 风险 |
| --- | --- | --- | --- | --- |
| 建立双向绑定 | `employees` / `users` | `employee.user_id` 空，`user.employee_id` 空 | 双向写入对方 `_id` | 中 |
| 更新账号类型 | `users` | `candidate` | `employee` | 中 |
| 清理候选占位名 | `users` | `候选人xxxx` | 员工真实姓名 | 中 |

当前结论：这 2 条可以进入下一轮自动修复候选；剩余 149 条没有候选用户，不应自动创建或绑定。

### DRY-REL-002：active 关系但有离职日期

现状：

| 问题 | 数量 |
| --- | ---: |
| `status=active` 但存在 `leave_date` | 49 |
| `status=active` 且 `leave_date` 已过去 | 48 |

dry-run 判断规则：

| 条件 | 建议动作 | 自动级别 |
| --- | --- | --- |
| `leave_date < today` 且之后无工时、薪资、保险 | 改 `status=resigned` | 可自动候选 |
| `leave_date < today` 但之后有工时/薪资/保险 | 人工确认是否清空 `leave_date` 或补后续关系 | 人工确认 |
| `leave_date >= today` | 保持 active，等待日期到达或排班结束 | 暂不修 |

当前结论：需要对 49 条逐条补充工时、薪资、保险依赖后，才能生成执行级 dry-run。

### DRY-CLEAN-001：`employees` 关系类冗余字段

现状：367 条 `employees` 仍存在关系类字段，例如：

- `company_id`
- `job_id`
- `company_name`
- `job_name`
- `join_date`
- `leave_date`
- `referrer_id`
- `referrer_name`

dry-run 判断规则：

| 条件 | 建议动作 | 自动级别 |
| --- | --- | --- |
| `employee_companies` 中已有对应关系字段，且值一致 | 清理 `employees` 冗余字段 | 可自动候选 |
| `employee_companies` 缺字段，但 `employees` 有值 | 先补关系表，再清理员工表 | 需二阶段 |
| 两边字段冲突 | 人工确认 | 人工确认 |

当前结论：不能直接清理 367 条。下一步应生成逐字段比对表。

## 5. 建议执行顺序

1. 先处理 `users` 重复账号 dry-run：
   - 输出每组主账号、候选账号、待迁移 `applications/interviews` 明细。
   - 只生成计划，不执行。
2. 再处理 `DRY-BIND-001` 两个强匹配员工用户绑定：
   - 孙跃、夏娟两条可单独生成审批清单。
3. 再处理 `employee_companies` active/leave_date 冲突：
   - 逐条补工时、薪资、保险依赖。
4. 最后处理 `employees` 冗余字段：
   - 先做 `employees` vs `employee_companies` 字段比对，再决定迁移/清理。

## 6. 当前禁止自动执行的动作

以下动作在人工确认前禁止执行：

- 删除任何 `users`、`employees`、`employee_companies` 记录。
- 自动合并龚诗辰两条员工主档。
- 自动处理 `142702197305203630` 两个不同姓名员工账号。
- 自动关闭多 active 企业关系。
- 自动清理 367 条 `employees` 关系类字段。
- 自动把缺用户绑定的 149 名员工创建新用户。
