# 月结工资 - 快速参考指南

## 🎯 30秒快速了解

**月结工资流程的5个步骤：**

```
1️⃣ 工时汇总 → 2️⃣ 工时审核 → 3️⃣ 薪资计算 → 4️⃣ 薪资审核 → 5️⃣ 发薪
   (输入)        (待审核)      (自动生成)    (人工确认)      (记账)
```

---

## 📊 关键数据结构

| 表名 | 用途 | 关键字段 |
|-----|------|--------|
| `worktime_monthly_summaries` | 月工时汇总 | `status:'approved'` `total_hours` `total_days` |
| `rate_plans` | 工价方案 | `hourly_rate_monthly` `night_hourly_rate_monthly` `insurance_deduct` |
| `salaries` | 薪资记录 | `status` `settlement_mode:'monthly'` `net_pay` |
| `insurance_ledgers` | 保险账本 | `insurance_month` `obligation_amount` `remaining_amount` |
| `salary_insurance_deductions` | 保险扣减明细 | `ledger_id` `source_type` `deduct_amount` |

---

## 💰 核心计算公式

```javascript
// 1. 基础工资
basePay = totalHours × hourlyRate

// 2. 夜班补贴
nightAllowance = (nightHours × nightHourlyRate) + (nightDays × nightDailyRate)

// 3. 应发工资
grossPay = basePay + nightAllowance

// 4. 保险扣减
insuranceDeduct = 按加入/离职时间计算的月保险额

// 5. 个税（累进税率）
tax = (grossPay - insuranceDeduct - 5000) × 累进税率

// 6. 实发工资
netPay = grossPay - insuranceDeduct - tax
```

---

## 🔍 代码问题速查

| 问题 | 现象 | 原因 | 解决方案 |
|-----|------|------|--------|
| 计算失败 | 报错"未找到已审核的月结工时汇总" | 工时汇总未审核 | 去工时管理审核汇总 |
| 薪资重复 | 同员工生成多条记录 | 并发计算冲突 | 使用业务锁防止并发 |
| 金额不对 | 应发/实发金额偏离 | 浮点数精度丢失/时薪参数错 | 使用roundMoney + 检查参数 |
| 保险不对 | 保险扣减金额异常 | V1/V2版本混用/参数配置 | 统一迁移到V2版本 |
| 个税异常 | 个税计算偏离 | 固定10%税率不符 | 使用累进税率计算 |
| 夜班补贴缺失 | 有夜班但补贴为0 | 夜班参数未从其他源获取 | 完善参数降级逻辑 |

---

## 🛠️ 常见操作

### 场景1：月底计算薪资

```javascript
// Step 1: 检查工时汇总
GET /worktime_monthly_summaries
?employee_id=xxx&company_id=xxx&year_month=2024-10&status=approved

// Step 2: 计算薪资
POST /cloud/salaries
{
  "action": "calculate",
  "company_id": "company-id",
  "year": 2024,
  "month": 10,
  "settlement_mode": "monthly"
}

// Step 3: 审核薪资
POST /cloud/salaries
{
  "action": "approve",
  "id": "salary-record-id"
}

// Step 4: 标记发放
POST /cloud/salaries
{
  "action": "pay",
  "id": "salary-record-id",
  "pay_date": "2024-10-31"
}
```

### 场景2：月中修正工时汇总

```javascript
// 修改汇总数据
PATCH /worktime_monthly_summaries/{id}
{
  "total_hours": 160,
  "total_days": 20,
  "night_hours": 10,
  "night_days": 2,
  "status": "pending"  // 重置为待审核
}

// 重新审核
POST /worktime_monthly_summaries/{id}/approve

// 重新计算薪资（需先清除旧记录）
DELETE /salaries/{salary-id}
POST /cloud/salaries { ... calculate ... }
```

### 场景3：查询薪资数据

```javascript
// 按月份查询
GET /cloud/salaries
?company_id=xxx&month=2024-10&settlement_mode=monthly

// 按员工查询
GET /cloud/salaries
?employee_id=xxx&settlement_mode=monthly

// 按状态查询
GET /cloud/salaries
?status=approved&settlement_mode=monthly&page=1&pageSize=50
```

---

## 📱 Web端操作步骤

### 完整月结操作流程

#### 第一步：审核月工时汇总
```
1. 进入「工时管理」→「月结汇总」
2. 选择企业和月份
3. 查看汇总列表（显示待审核数量）
4. 点击「审核通过」批准工时汇总
5. 状态变为「已审核」（绿色标签）
```

#### 第二步：计算月结薪资
```
1. 进入「薪资管理」→「月结发薪」
2. 选择企业和月份
3. 检查工时汇总状态（应显示已审核）
4. 点击「计算薪资」按钮
5. 等待计算完成（显示"计算完成"提示）
6. 薪资列表更新，状态为「calculated」
```

#### 第三步：审核月结薪资
```
1. 在薪资列表中查看生成的记录
2. 检查薪资金额是否正确
3. 点击「审核通过」按钮
4. 状态变为「approved」（绿色标签）
```

#### 第四步：标记发薪
```
1. 在薪资列表中选择已审核的记录
2. 点击「标记发放」按钮
3. 确认发放日期
4. 状态变为「paid」
5. 显示发放日期和操作人
```

---

## 🐛 排查步骤

### 问题：薪资计算失败

**排查树：**
```
❓ 错误信息是什么？
├─ "未找到已审核的月结工时汇总"
│  └─ → 去工时管理审核汇总数据
├─ "员工不存在"
│  └─ → 检查 employees 表
├─ "无 employee_companies 关联"
│  └─ → 添加员工与企业的关联
└─ "其他错误"
   └─ → 查看云函数日志
```

### 问题：薪资金额不对

**排查树：**
```
❓ 是哪个部分不对？
├─ 应发工资异常
│  ├─ 检查工时是否正确（总工时 = 汇总中的 total_hours）
│  ├─ 检查时薪是否正确（rate_plans.hourly_rate_monthly）
│  └─ 检查夜班是否正确（night_hours 和 night_hourly_rate）
├─ 保险扣减异常
│  ├─ 检查加入/离职时间是否准确
│  ├─ 检查 rate_plans 中的 insurance_deduct 配置
│  └─ 查看 insurance_ledgers 是否创建
├─ 个税异常
│  ├─ 使用公式手算验证
│  └─ 检查保险扣减是否影响了应税收入
└─ 实发工资异常
   └─ = 应发 - 保险 - 个税
```

### 问题：保险账本与薪资不匹配

**排查树：**
```
❓ 版本是哪个？
├─ V1(Legacy)版本
│  └─ → 直接使用 rate_plans.insurance_deduct 值
├─ V2版本
│  ├─ 检查 insurance_ledgers 表
│  ├─ 检查 salary_insurance_deductions 表
│  ├─ 验证 deduction.deduct_amount = 薪资.insurance_deduct
│  └─ 如果不匹配，查看云函数日志中的警告
└─ 混用版本
   └─ → 迁移到统一的V2版本
```

---

## 📈 性能优化建议

### 建立数据库索引

```javascript
// 1. worktime_monthly_summaries 查询优化
db.createIndex({
  'employee_id': 1,
  'company_id': 1,
  'year_month': 1,
  'status': 1
})

// 2. salaries 查询优化
db.createIndex({
  'company_id': 1,
  'settlement_mode': 1,
  'year': 1,
  'month': 1,
  'status': 1
})

// 3. insurance_ledgers 查询优化
db.createIndex({
  'employee_id': 1,
  'company_id': 1,
  'insurance_month': 1
})
```

### 查询优化

```javascript
// ❌ 不好：逐个查询
for (let empId of employeeIds) {
  const emp = await db.collection('employees').doc(empId).get();
  // ...
}

// ✅ 好：批量查询
const employees = await db.collection('employees')
  .where({ _id: db.command.in(employeeIds) })
  .get();
```

---

## 📋 操作检查清单

### 每月月底前

- [ ] 工时数据已全部录入
- [ ] 工时汇总已手动生成或导入
- [ ] 工时汇总已全部审核为 `approved`
- [ ] 工价方案已配置完整
  - [ ] `hourly_rate_monthly` 已设置
  - [ ] `insurance_deduct` 已设置（如需要）
  - [ ] 夜班参数已配置（如有夜班）

### 薪资计算时

- [ ] 确认企业和月份正确
- [ ] 检查工时汇总状态（应为已审核）
- [ ] 计算薪资后检查是否有异常
- [ ] 随机抽样 3-5 人验证金额准确性

### 薪资发放前

- [ ] 所有薪资记录已审核
- [ ] 保险和个税金额已验证
- [ ] 实发金额与银行转账清单一致
- [ ] 保存发放日期和操作记录

### 月末关账

- [ ] 所有员工薪资已标记发放
- [ ] 生成月度薪资统计报告
- [ ] 备份薪资数据
- [ ] 记录本月特殊情况（漏打、补打等）

---

## 🔗 相关文档

- [MONTHLY_SETTLEMENT_PROCESS.md](MONTHLY_SETTLEMENT_PROCESS.md) - 完整流程和问题分析
- [MONTHLY_SETTLEMENT_CODE_FIXES.md](MONTHLY_SETTLEMENT_CODE_FIXES.md) - 代码修复方案
- [SALARY_INSURANCE_V2_DESIGN.md](docs/SALARY_INSURANCE_V2_DESIGN.md) - 保险V2版本设计

---

## 📞 常见问题解答

**Q: 怎么知道工时汇总是否审核了？**
A: 
```
1. Web端：月结发薪页面会显示"工时汇总进度"
2. 直接查询数据库：
   db.collection('worktime_monthly_summaries')
     .where({company_id, year_month, status: 'approved'})
     .count()
```

**Q: 如果计算中断了怎么办？**
A:
```
1. 检查是否有其他人在并发计算（看 system_locks 表）
2. 如果锁已过期，可以手动删除
3. 重新执行计算（会覆盖之前的记录）
```

**Q: 能不能修改已发放的薪资？**
A:
```
❌ 不建议直接修改 salaries 表
✅ 建议：
1. 生成一条调整记录（单独计算）
2. 或者删除后重新计算
3. 每笔变动都记录在案
```

**Q: 批量计算时如果部分员工失败了？**
A:
```
1. 查看错误日志，确认失败原因
2. 修复该员工的数据问题
3. 重新计算（只会覆盖已有的记录）
4. 其他成功的员工不会重新计算
```

**Q: 怎么导出薪资数据给财务？**
A:
```
1. Web端月结发薪页面点击"导出"按钮
2. 或API: GET /cloud/salaries?action=export
3. 返回 Excel 格式数据，包含：
   - 应发工资
   - 保险扣减
   - 个税
   - 实发工资
```

