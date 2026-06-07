# 数据库同步记录

同步时间：2026-05-14  
环境：`cloud1-5glojms9a83c3457`  
执行方式：CloudBase MCP  
同步范围：仅处理 dry-run 中“强匹配、无明显争议”的员工-用户双向绑定  
未执行：删除、合并员工主档、关闭在职关系、清理冗余字段、部署云函数

## 1. 执行前校验

执行前只读校验：

| 员工 | employee_id | 员工手机号 | 员工 user_id | 用户 | user_id | 用户手机号 | 用户 employee_id | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 孙跃 | `399cd1a569f07784000997be452e5821` | `15850912448` | 空 | 候选人2448 | `948392db69fbee9d0142ab371f65d580` | `15850912448` | 空 | 可同步 |
| 夏娟 | `d967c8d469fca77d015b9ebf6e7b2df6` | `15151138980` | 空 | 候选人8980 | `8d2e20b369c67c9f01d8cdcf196950a0` | `15151138980` | 空 | 可同步 |

## 2. 实际写入

### 2.1 孙跃

`employees`：

- 集合：`employees`
- 条件：`_id=399cd1a569f07784000997be452e5821` 且 `user_id=""`
- 写入：
  - `user_id = 948392db69fbee9d0142ab371f65d580`
- 结果：`matchedCount=1`，`modifiedCount=1`

`users`：

- 集合：`users`
- 条件：`_id=948392db69fbee9d0142ab371f65d580` 且 `employee_id` 不存在
- 写入：
  - `employee_id = 399cd1a569f07784000997be452e5821`
  - `employee_no = E1777366916784`
  - `name = 孙跃`
  - `real_name = 孙跃`
  - `user_type = employee`
  - `role = employee`
- 结果：`matchedCount=1`，`modifiedCount=1`

### 2.2 夏娟

`employees`：

- 集合：`employees`
- 条件：`_id=d967c8d469fca77d015b9ebf6e7b2df6` 且 `user_id=""`
- 写入：
  - `user_id = 8d2e20b369c67c9f01d8cdcf196950a0`
- 结果：`matchedCount=1`，`modifiedCount=1`

`users`：

- 集合：`users`
- 条件：`_id=8d2e20b369c67c9f01d8cdcf196950a0` 且 `employee_id` 不存在
- 写入：
  - `employee_id = d967c8d469fca77d015b9ebf6e7b2df6`
  - `employee_no = EP202605078815`
  - `name = 夏娟`
  - `real_name = 夏娟`
  - `user_type = employee`
  - `role = employee`
- 结果：`matchedCount=1`，`modifiedCount=1`

## 3. 执行后复查

复查结果：

| 指标 | 同步前 | 同步后 |
| --- | ---: | ---: |
| 活跃员工无有效用户绑定 | 151 | 149 |
| 可按手机号/身份证找到候选用户 | 2 | 0 |
| 员工反向绑定不一致 | 1 | 1 |

同步后确认：

- 孙跃 `employees.user_id` 已指向 `948392db69fbee9d0142ab371f65d580`。
- 孙跃 `users.employee_id` 已指向 `399cd1a569f07784000997be452e5821`。
- 夏娟 `employees.user_id` 已指向 `8d2e20b369c67c9f01d8cdcf196950a0`。
- 夏娟 `users.employee_id` 已指向 `d967c8d469fca77d015b9ebf6e7b2df6`。

## 4. 未处理项

以下问题仍保留，原因是存在争议或需要进一步依赖检查：

- 龚诗辰重复员工主档：仍需人工确认。
- 员工反向绑定不一致：仍为 1 条。
- 活跃员工无有效用户绑定：剩余 149 条，没有可匹配候选用户。
- `users` 身份证重复、手机号重复：涉及报名/面试链路，需执行级 dry-run 后再处理。
- 多 active 在职关系：涉及工时和薪资，需人工确认当前有效关系。
- active 关系带历史离职日期：需逐条检查工时、薪资、保险后再同步。
