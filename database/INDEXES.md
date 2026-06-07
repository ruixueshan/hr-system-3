# 数据库索引清单（生产版）

参考：3.0系统综合设计文档.md - "性能优化：索引策略"

---

## 必加复合索引（核心查询路径）

### 1. worktime_records 表

| 索引字段 | 用途 | 说明 |
|---------|------|------|
| `{ employee_id: 1, company_id: 1, work_date: 1 }` | 查询员工+企业+月份（最常用） | 薪资计算、个人查询 |
| `{ company_id: 1, work_date: 1 }` | 企业维度统计 | 管理看板、营收统计 |
| `{ status: 1 }` | 按状态过滤 | 待审核列表 |
| `{ employee_id: 1, status: 1 }` | 员工待审核工时 | 小程序查询 |

### 2. salaries 表

| 索引字段 | 用途 | 说明 |
|---------|------|------|
| `{ employee_id: 1, year: 1, month: 1 }` | 查询员工历史薪资 | 工资条、个人查询 ✅ |
| `{ company_id: 1, year: 1, month: 1 }` | 企业薪资核算 | 财务导出 |
| `{ status: 1 }` | 状态过滤 | 待审批/已发放列表 |

### 3. salary_insurance_ledgers 表

| 索引字段 | 用途 | 说明 |
|---------|------|------|
| `{ employee_id: 1, company_id: 1, insurance_month: 1 }` | 唯一定位员工企业月份保险义务 | 台账幂等创建 |
| `{ employee_id: 1, company_id: 1, status: 1, first_due_event_month: 1 }` | 查员工待扣保险 | 日结补扣、押金补扣 |
| `{ company_id: 1, insurance_month: 1, status: 1 }` | 企业维度核对月度义务 | 灰度校验、财务排查 |

### 4. salary_insurance_deductions 表

| 索引字段 | 用途 | 说明 |
|---------|------|------|
| `{ ledger_id: 1, created_at: 1 }` | 查询单条台账的扣减流水 | 审计回溯 |
| `{ employee_id: 1, company_id: 1, pay_date: 1 }` | 员工维度扣减历史 | 对账、客服排查 |
| `{ source_type: 1, source_id: 1 }` | 反查某次工资/押金的保险扣减 | 发薪联查 |

### 5. recruitment_bonuses 表

| 索引字段 | 用途 | 说明 |
|---------|------|------|
| `{ batch_id: 1 }` | 查询结算批次明细 | 提成批次详情 ✅ |
| `{ recommender_id: 1, year: 1, month: 1 }` | 查询推荐人提成（统计+个人） | 推荐有奖功能 ✅ |
| `{ employee_id: 1, year: 1, month: 1 }` | 查询被推荐人提成 | 管理员查看 |
| `{ company_id: 1, year: 1, month: 1 }` | 企业维度提成统计 | 成本分析 |

### 6. recruitment_bonus_batches 表

| 索引字段 | 用途 | 说明 |
|---------|------|------|
| `{ batch_key: 1 }` | 唯一定位推荐人月份结算批次 | 幂等重算 ✅ |
| `{ year: 1, month: 1 }` | 月度批次列表 | 提成管理页 ✅ |
| `{ recommender_id: 1, year: 1, month: 1 }` | 某 HR 月度批次查询 | HR 维度查看 |
| `{ status: 1, year: 1, month: 1 }` | 按状态筛选批次 | 待审核/已发放 |

---

## 其他索引建议

| 集合 | 索引字段 | 说明 |
|------|---------|------|
| `applications` | `{ user_id: 1 }` | 我的报名 |
| `applications` | `{ job_id: 1 }` | 岗位报名统计 |
| `applications` | `{ status: 1 }` | 状态筛选 |
| `interviews` | `{ company_id: 1, interview_date: 1 }` | 面试日历 |
| `interviews` | `{ application_id: 1 }` | 获取面试记录 |
| `employee_companies` | `{ employee_id: 1, status: 1 }` ✅ | 查询员工当前企业（核心） |
| `employee_companies` | `{ company_id: 1 }` | 企业员工列表 |
| `employee_companies` | `{ referrer_id: 1, join_date: 1 }` | 按推荐人统计入职关系 |
| `employee_companies` | `{ source_referrer_id: 1, status: 1 }` | 按推荐来源统计在职关系 |
| `salary_insurance_ledgers` | `{ ledger_key: 1 }` | 保险台账唯一键 |
| `qr_codes` | `{ code: 1 }` ✅ | 二维码扫码查询（唯一） |
| `qr_codes` | `{ job_id: 1, status: 1 }` | 岗位二维码管理 |
| `blacklists` | `{ user_id: 1, expire_time: 1 }` | 黑名单检查 |
| `recruitment_bonus_rules` | `{ recommender_id: 1, priority: -1 }` | 规则匹配 |

---

## 索引创建方法（CloudBase）

### 控制台手动创建

1. 进入 CloudBase 控制台 → 数据库
2. 选择集合 → 索引管理
3. 添加复合索引，字段按上述顺序

### CLI 方式（推荐：使用 tcb 命令或 REST API）

```bash
# 示例：为 worktime_records 创建索引
tcb database createIndex --collection worktime_records \
  --keys '{"employee_id":1,"company_id":1,"work_date":1}'
```

**注意**：CloudBase CLI 的 createIndex 命令可能需要特定选项，请参考官方文档。

---

## 索引数量限制

- 单集合最多支持 64 个索引（MongoDB 限制）
- 索引过多影响写入性能，按需创建
- 建议优先创建 **必加复合索引**（7个）

---

## 性能验证

### 关键查询路径

1. **薪资计算** → 查 `worktime_records` (emp+comp+date) → 写 `salaries`
2. **工资条查询** → 查 `salaries` (emp+year+month)
3. **提成计算** → 查 `worktime_records` (emp+comp+date) → 写 `recruitment_bonuses`
4. **推荐有奖** → 查 `recruitment_bonuses` (recommender+company+date)
5. **工时列表** → 查 `worktime_records` (emp+status)

确保这些路径 **explain()** 走索引。

---

## 索引命名规范（建议）

CloudBase 自动生成名称，但建议按如下命名便于管理：

- `idx_emp_comp_date` - worktime_records 员工企业日期
- `idx_comp_date` - worktime_records 企业日期
- `idx_emp_year_month` - salaries 员工年月
- `idx_comp_year_month` - salaries 企业年月
- `idx_bonus_batch_id` - recruitment_bonuses 批次明细
- `idx_recommender_month_bonus` - recruitment_bonuses 推荐人员工年月
- `idx_emp_year_month_bonus` - recruitment_bonuses 员工年月
- `idx_bonus_batch_key` - recruitment_bonus_batches 结算批次幂等键
- `idx_emp_status_ec` - employee_companies 员工状态

---

**更新日期**: 2026-03-14  
**维护者**: 小瑞
