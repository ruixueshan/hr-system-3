# 月结工资 - 代码修复方案

## 优先修复方案

### 修复1：完善个税计算逻辑

**问题位置：** `cloudfunctions/salary-engine-v2/calculate-salary.js` 第 62-64 行

**修复前代码：**
```javascript
function calculateTax(grossPay, insuranceDeduct, threshold = 5000) {
  const taxableIncome = Math.max(0, Number(grossPay || 0) - Number(insuranceDeduct || 0) - Number(threshold || 5000));
  return roundMoney(taxableIncome * 0.1);  // ❌ 固定10%税率
}
```

**修复后代码：**
```javascript
/**
 * 计算个人所得税
 * 按照 2024 年税率：
 * - 0-3000：3%
 * - 3000-12000：10%
 * - 12000-25000：20%
 * - 25000-35000：25%
 * - 35000-55000：30%
 * - 55000-80000：35%
 * - 80000+：45%
 */
function calculateTax(grossPay, insuranceDeduct, threshold = 5000) {
  const taxableIncome = Math.max(0, Number(grossPay || 0) - Number(insuranceDeduct || 0) - Number(threshold || 5000));
  
  if (taxableIncome <= 0) return 0;

  // 使用累进税率表
  const brackets = [
    { max: 3000, rate: 0.03 },
    { max: 12000, rate: 0.1 },
    { max: 25000, rate: 0.2 },
    { max: 35000, rate: 0.25 },
    { max: 55000, rate: 0.3 },
    { max: 80000, rate: 0.35 },
    { max: Infinity, rate: 0.45 }
  ];

  let tax = 0;
  let previousMax = 0;

  for (const bracket of brackets) {
    if (taxableIncome > previousMax) {
      const amountInBracket = Math.min(taxableIncome, bracket.max) - previousMax;
      tax += amountInBracket * bracket.rate;
      previousMax = bracket.max;
    }
    if (taxableIncome <= bracket.max) break;
  }

  return roundMoney(tax);
}
```

---

### 修复2：添加月结汇总缺失容错

**问题位置：** `cloudfunctions/salary-engine-v2/calculate-salary.js` 第 213-217 行

**修复前代码：**
```javascript
const summaryRes = await db.collection('worktime_monthly_summaries')
  .where({ employee_id, company_id, year_month: yearMonth, status: 'approved' })
  .limit(1)
  .get();

if (!summaryRes.data?.length) throw new Error('未找到已审核的月结工时汇总');
```

**修复后代码：**
```javascript
const summaryRes = await db.collection('worktime_monthly_summaries')
  .where({ employee_id, company_id, year_month: yearMonth, status: 'approved' })
  .limit(1)
  .get();

let summary;
if (!summaryRes.data?.length) {
  // 容错处理：汇总不存在时，返回结构化错误信息而不是抛出异常
  console.warn(`[calculate-salary] 员工 ${employee_id}(${employee.name}) 在企业 ${company_id} 的 ${yearMonth} 无已审核工时汇总`);
  
  return {
    ...error(400, `员工 ${employee.name} 缺少 ${yearMonth} 的已审核工时汇总`),
    data: {
      employee_id,
      employee_name: employee.name,
      company_id,
      reason: 'MISSING_MONTHLY_SUMMARY',
      year_month: yearMonth
    }
  };
} else {
  summary = summaryRes.data[0];
}
```

**修复后批量计算 `calculate-all.js`：**
```javascript
const BATCH_SIZE = 5;
for (let i = 0; i < employeeIds.length; i += BATCH_SIZE) {
  const batch = employeeIds.slice(i, i + BATCH_SIZE);
  const batchResults = await Promise.all(batch.map((empId) =>
    salaryCalc.calculateSalary({ employee_id: empId, company_id, year, month, settlement_mode }, operator)
      .catch((err) => ({ 
        _error: true, 
        employee_id: empId, 
        message: err.message,
        code: err.code 
      }))
  ));
  
  for (const result of batchResults) {
    if (result._error) {
      // 区分不同的错误类型
      if (result.code === 400) {
        console.warn(`[calculate-all] 员工 ${result.employee_id} 跳过: ${result.message}`);
        salaryErrors.push({ 
          employee_id: result.employee_id, 
          error: result.message,
          type: 'skipped'
        });
      } else {
        // 其他类型的错误应该被记录
        console.error(`[calculate-all] 员工 ${result.employee_id} 计算失败: ${result.message}`);
        salaryErrors.push({ 
          employee_id: result.employee_id, 
          error: result.message,
          type: 'failed'
        });
      }
    } else {
      salaryResults.push(result);
    }
  }
}
```

---

### 修复3：完善夜班参数获取逻辑

**问题位置：** `cloudfunctions/salary-engine-v2/calculate-salary.js` 第 53-56 行

**修复前代码：**
```javascript
function resolveNightRates(plan, settlementMode) {
  const suffix = settlementMode === 'monthly' ? '_monthly' : '_daily';
  return {
    nightHourlyRate: Number(plan?.[`night_hourly_rate${suffix}`] ?? plan?.night_hourly_rate ?? 0),
    nightDailyRate: Number(plan?.[`night_daily_rate${suffix}`] ?? plan?.night_daily_rate ?? 0)
  };
}
```

**修复后代码：**
```javascript
function resolveNightRates(plan, settlementMode, employeeCompany, job, employee) {
  const suffix = settlementMode === 'monthly' ? '_monthly' : '_daily';

  // 时薪模式的夜班时薪
  let nightHourlyRate = Number(plan?.[`night_hourly_rate${suffix}`] ?? 0);
  if (!nightHourlyRate) {
    nightHourlyRate = Number(
      plan?.night_hourly_rate ??
      employeeCompany?.night_hourly_rate ??
      job?.night_hourly_rate ??
      employee?.night_hourly_rate ??
      0
    );
  }

  // 日薪模式的夜班补贴
  let nightDailyRate = Number(plan?.[`night_daily_rate${suffix}`] ?? 0);
  if (!nightDailyRate) {
    nightDailyRate = Number(
      plan?.night_daily_rate ??
      employeeCompany?.night_daily_rate ??
      job?.night_daily_rate ??
      employee?.night_daily_rate ??
      0
    );
  }

  return { nightHourlyRate, nightDailyRate };
}
```

**调用处修改：**
```javascript
// 修改前
const { nightHourlyRate, nightDailyRate } = resolveNightRates(plan, settlementMode);

// 修改后
const { nightHourlyRate, nightDailyRate } = resolveNightRates(plan, settlementMode, employeeCompany, job, employee);
```

---

### 修复4：修复浮点数精度问题

**问题位置：** `cloudfunctions/salary-engine-v2/calculate-salary.js` 第 250-270 行（日结计算）

**修复前代码：**
```javascript
let totalHours = 0, workDays = 0, nightHours = 0, nightDays = 0;
const salaryDetails = [];

records.forEach((record) => {
  const hours = Number(record.total_hours || record.regular_hours || 0);
  totalHours += hours;  // ⚠️ 累加没有精度控制
  workDays += 1;
  if (record.shift === 'night') { 
    nightHours += hours;  // ⚠️ 同样问题
    nightDays += 1; 
  }
  salaryDetails.push({ 
    work_date: record.work_date, 
    hours, 
    shift: record.shift, 
    hourly_rate: hourlyRate 
  });
});
```

**修复后代码：**
```javascript
let totalHours = 0, workDays = 0, nightHours = 0, nightDays = 0;
const salaryDetails = [];

records.forEach((record) => {
  const hours = roundMoney(Number(record.total_hours || record.regular_hours || 0));
  totalHours = roundMoney(totalHours + hours);  // ✓ 每次累加都进行精度控制
  workDays += 1;
  if (record.shift === 'night') { 
    nightHours = roundMoney(nightHours + hours);  // ✓ 夜班工时也进行精度控制
    nightDays += 1; 
  }
  salaryDetails.push({ 
    work_date: record.work_date, 
    hours: roundMoney(hours),  // ✓ 存储精度控制后的值
    shift: record.shift, 
    hourly_rate: roundMoney(hourlyRate) 
  });
});
```

---

### 修复5：添加批量计算事务保证

**问题位置：** `cloudfunctions/salary-engine-v2/calculate-all.js` 第 30-45 行

**修复前代码：**
```javascript
exports.calculateAll = async (params, operator) => {
  const { company_id, year, month, settlement_mode = 'monthly' } = params;

  try {
    // ... 查询员工列表

    const salaryResults = [];
    const salaryErrors = [];

    // 小批量并发（每批 5 个）
    const BATCH_SIZE = 5;
    for (let i = 0; i < employeeIds.length; i += BATCH_SIZE) {
      // ... 执行计算（无事务保护）
    }

    return { ...success(null, '批量计算完成'), data: {...} };
  } catch (err) {
    console.error('批量计算失败:', err);
    return error(500, `批量计算失败: ${err.message}`);
  }
};
```

**修复后代码：**
```javascript
exports.calculateAll = async (params, operator) => {
  const { company_id, year, month, settlement_mode = 'monthly' } = params;

  const salaryResults = [];
  const salaryErrors = [];

  try {
    // ... 查询员工列表

    // 添加业务锁，防止并发计算
    const lockKey = `salary_calculation:${company_id}:${year}:${month}:${settlement_mode}`;
    const existingLock = await db.collection('system_locks')
      .where({ 
        lock_key: lockKey, 
        expires_at: db.command.gt(db.serverDate()) 
      })
      .limit(1)
      .get();

    if (existingLock.data?.length) {
      return error(409, '该企业该月份薪资正在计算中，请勿重复操作');
    }

    // 创建锁
    const lockId = (await db.collection('system_locks').add({
      lock_key: lockKey,
      company_id,
      year,
      month,
      settlement_mode,
      operator_id: operator?.uid,
      created_at: db.serverDate(),
      expires_at: new Date(Date.now() + 10 * 60 * 1000)  // 10分钟过期
    })).id;

    try {
      // 小批量并发（每批 5 个）
      const BATCH_SIZE = 5;
      for (let i = 0; i < employeeIds.length; i += BATCH_SIZE) {
        const batch = employeeIds.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map((empId) =>
          salaryCalc.calculateSalary({ employee_id: empId, company_id, year, month, settlement_mode }, operator)
            .catch((err) => ({ 
              _error: true, 
              employee_id: empId, 
              message: err.message 
            }))
        ));
        for (const result of batchResults) {
          if (result._error) salaryErrors.push({ 
            employee_id: result.employee_id, 
            error: result.message 
          });
          else salaryResults.push(result);
        }
      }

      return {
        ...success(null, '批量计算完成'),
        data: {
          salary: { total: salaryResults.length, errors: salaryErrors.length, details: salaryErrors },
          bonus: {},
          profit: {}
        }
      };
    } finally {
      // 释放锁
      await db.collection('system_locks').doc(lockId).remove().catch(() => {});
    }
  } catch (err) {
    console.error('批量计算失败:', err);
    return error(500, `批量计算失败: ${err.message}`);
  }
};
```

**数据库设计 - system_locks 表：**
```json
{
  "_id": "lock-id",
  "lock_key": "salary_calculation:company:year:month:mode",
  "company_id": "company-id",
  "year": 2024,
  "month": 10,
  "settlement_mode": "monthly",
  "operator_id": "user-id",
  "created_at": "2024-10-15T10:00:00Z",
  "expires_at": "2024-10-15T10:10:00Z"
}
```

---

### 修复6：完善保险版本处理

**问题位置：** `cloudfunctions/salary-engine-v2/calculate-salary.js` 第 307-340 行

**修复前代码：**
```javascript
let finalInsuranceDeduct = monthlyPayload.legacy_insurance_deduct;
let insuranceDeductDetail = {
  mode: insuranceV2Enabled ? 'v2' : 'legacy',
  insurance_month: yearMonth,
  legacy_insurance_deduct: roundMoney(monthlyPayload.legacy_insurance_deduct)
};

if (insuranceV2Enabled) {
  // ... V2 处理
}
```

**修复后代码：**
```javascript
let finalInsuranceDeduct = 0;
let insuranceLedgerId = '';
let insuranceMonth = yearMonth;
let insuranceDeductDetail = {};

try {
  if (insuranceV2Enabled) {
    console.log(`[calculate-salary] 使用 Insurance V2 处理 ${employee_id} 的保险`);
    
    const insuranceSettlement = await prepareMonthlyInsuranceSettlement({
      transaction, employee_id, company_id, yearMonth,
      joinDate: employeeCompany?.join_date, 
      leaveDate: employeeCompany?.leave_date,
      ratePlanId: monthlyPayload.rate_plan_id,
      insuranceDailyDeduct: Number(plan?.insurance_daily_deduct || 0),
      insuranceMonthlyDeduct: Number(plan?.insurance_monthly_deduct || 0),
      createdBy: operator.uid
    });

    finalInsuranceDeduct = roundMoney(insuranceSettlement.insuranceDeduct);
    insuranceLedgerId = insuranceSettlement.ledger?._id || '';
    insuranceMonth = insuranceSettlement.ledger?.insurance_month || yearMonth;
    
    insuranceDeductDetail = {
      mode: 'v2',
      version: '2024-10',
      insurance_month: insuranceMonth,
      ledger_id: insuranceLedgerId,
      obligation_amount: roundMoney(Number(insuranceSettlement.ledger?.obligation_amount || 0)),
      deducted_amount: roundMoney(Number(insuranceSettlement.ledger?.deducted_amount || 0)),
      remaining_amount: roundMoney(Number(insuranceSettlement.ledger?.remaining_amount || 0)),
      deduction_id: insuranceSettlement.deduction?._id || '',
      reused_deduction: Boolean(insuranceSettlement.reused)
    };
  } else {
    console.log(`[calculate-salary] 使用 Legacy 保险扣减处理 ${employee_id}`);
    
    finalInsuranceDeduct = calculateInsuranceDeduct(
      plan, year, month, 
      employeeCompany?.join_date, 
      employeeCompany?.leave_date
    );
    
    insuranceDeductDetail = {
      mode: 'legacy',
      version: '2024-09-legacy',
      insurance_month: yearMonth,
      deduct_amount: finalInsuranceDeduct,
      note: 'V2未启用，使用简化扣减'
    };
  }
} catch (insuranceErr) {
  console.error(`[calculate-salary] 保险处理失败 ${employee_id}:`, insuranceErr);
  // 保险处理失败时，回退到 Legacy 逻辑
  finalInsuranceDeduct = calculateInsuranceDeduct(
    plan, year, month,
    employeeCompany?.join_date,
    employeeCompany?.leave_date
  );
  
  insuranceDeductDetail = {
    mode: 'legacy_fallback',
    insurance_month: yearMonth,
    deduct_amount: finalInsuranceDeduct,
    error: insuranceErr.message,
    note: 'V2处理失败，已回退'
  };
}
```

---

### 修复7：Web 端改进月结操作流程

**文件：** `web/src/views/Salary/Index.vue`

**添加提示和工时汇总检查：**
```vue
<template>
  <div class="salary-page">
    <el-tabs v-model="activeTab" type="card">
      <el-tab-pane label="月结发薪" name="monthly">
        <!-- 添加重要提示 -->
        <el-alert
          v-if="!monthlySummaryApprovedCount"
          type="warning"
          title="⚠️ 工时汇总未审核"
          :description="`本月有 ${monthlySummaryTotalCount} 条工时汇总记录，其中 ${monthlySummaryApprovedCount} 条已审核。请先完成工时汇总审核！`"
          closable
          show-icon
        />
        
        <el-alert
          v-else-if="monthlySummaryApprovedCount < monthlySummaryTotalCount"
          type="info"
          :title="`✓ 本月工时汇总进度: ${monthlySummaryApprovedCount}/${monthlySummaryTotalCount}`"
          description="部分工时汇总未审核，计算时这些员工会被跳过"
          closable
          show-icon
        />

        <el-card class="filter-card">
          <el-form :model="monthlyForm" inline>
            <el-form-item label="企业">
              <el-select v-model="monthlyForm.company_id" placeholder="选择企业" clearable style="width: 240px;" @change="handleCompanyChange">
                <el-option v-for="c in companies" :key="c._id" :label="c.name" :value="c._id" />
              </el-select>
            </el-form-item>
            <el-form-item label="年月">
              <el-date-picker
                v-model="monthlyForm.year_month"
                type="month"
                placeholder="选择月份"
                format="YYYY年MM月"
                value-format="YYYY-MM"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="monthlyCalculating" @click="handleCalculateMonthly">
                计算薪资
              </el-button>
              <el-button @click="loadMonthlyData">刷新</el-button>
              <el-button @click="handleCheckMonthlySummary" :loading="checkingSummary">
                检查工时汇总
              </el-button>
              <el-button :icon="Download" @click="handleExportMonthly" :disabled="!monthlyRows.length">导出</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 工时汇总状态卡片 -->
        <el-card v-if="monthlySummaryStats" title="本月工时汇总状态" style="margin-bottom: 20px;">
          <el-row :gutter="20">
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-label">总数</div>
                <div class="stat-value">{{ monthlySummaryStats.total }}</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-label">已审核</div>
                <div class="stat-value text-success">{{ monthlySummaryStats.approved }}</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-label">待审核</div>
                <div class="stat-value text-warning">{{ monthlySummaryStats.pending }}</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-label">进度</div>
                <el-progress 
                  :percentage="Math.round((monthlySummaryStats.approved / monthlySummaryStats.total) * 100)"
                  :color="monthlySummaryStats.approved === monthlySummaryStats.total ? '#67c23a' : '#e6a23c'"
                />
              </div>
            </el-col>
          </el-row>
        </el-card>

        <!-- 工时汇总详情 -->
        <el-card v-if="showMonthlySummaryDetail" title="工时汇总详情">
          <el-table :data="monthlySummaryList" v-loading="checkingSummary" stripe max-height="400">
            <el-table-column prop="employee_name" label="员工" width="120" />
            <el-table-column prop="total_hours" label="工时" width="100" />
            <el-table-column prop="total_days" label="天数" width="100" />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'approved' ? 'success' : row.status === 'pending' ? 'warning' : 'danger'">
                  {{ row.status === 'approved' ? '已审核' : row.status === 'pending' ? '待审核' : '已拒绝' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- 薪资列表（保持不变） -->
        <el-card>
          <el-table v-loading="monthlyLoading" :data="monthlyRows" stripe>
            <!-- ... 原有的表列 ... -->
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- ... 其他 Tab ... -->
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
// ... 原有的导入 ...

const checkingSummary = ref(false);
const showMonthlySummaryDetail = ref(false);
const monthlySummaryList = ref<any[]>([]);
const monthlySummaryStats = ref<any>(null);
const monthlySummaryApprovedCount = computed(() => monthlySummaryStats.value?.approved || 0);
const monthlySummaryTotalCount = computed(() => monthlySummaryStats.value?.total || 0);

async function handleCompanyChange() {
  // 企业变化时重新检查工时汇总
  await handleCheckMonthlySummary();
}

async function handleCheckMonthlySummary() {
  if (!monthlyForm.company_id || !monthlyForm.year_month) {
    ElMessage.warning('请先选择企业和月份');
    return;
  }

  checkingSummary.value = true;
  try {
    const [y, m] = monthlyForm.year_month.split('-').map(Number);
    const result = await worktimeApi.getMonthlySummaryStats({
      company_id: monthlyForm.company_id,
      year: y,
      month: m
    });

    monthlySummaryStats.value = result.stats;
    monthlySummaryList.value = result.list || [];
    showMonthlySummaryDetail.value = true;

    if (result.stats.approved === 0) {
      ElMessage.warning('本月工时汇总尚未审核，请先审核再进行薪资计算');
    } else if (result.stats.approved < result.stats.total) {
      ElMessage.info(`本月工时汇总审核进度: ${result.stats.approved}/${result.stats.total}`);
    } else {
      ElMessage.success('本月工时汇总已全部审核');
    }
  } catch (err: any) {
    ElMessage.error(err?.message || '检查工时汇总失败');
  } finally {
    checkingSummary.value = false;
  }
}

// 修改原有的计算函数，添加错误处理
async function handleCalculateMonthly() {
  if (!monthlyForm.company_id || !monthlyForm.year_month) {
    ElMessage.warning('请选择企业和月份');
    return;
  }

  // 先检查工时汇总
  if (!monthlySummaryStats.value || monthlySummaryStats.value.approved === 0) {
    ElMessage.warning('工时汇总未审核，无法进行薪资计算。请先检查工时汇总！');
    return;
  }

  monthlyCalculating.value = true;
  try {
    await salariesApi.calculate({
      company_id: monthlyForm.company_id,
      month: monthlyForm.year_month,
      settlement_mode: 'monthly'
    });
    ElMessage.success('月结薪资计算完成');
    await loadMonthlyData();
  } catch (err: any) {
    const message = err?.message || '计算失败';
    if (message.includes('未找到已审核')) {
      ElMessage.error('工时汇总未审核，请先在工时管理中审核汇总数据');
    } else {
      ElMessage.error(message);
    }
  } finally {
    monthlyCalculating.value = false;
  }
}

// 在 onMounted 中添加初始检查
onMounted(async () => {
  await loadCompanies();
  await handleCheckMonthlySummary();
});
</script>

<style scoped>
.stat-item {
  text-align: center;
  padding: 10px;
}

.stat-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 5px;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
}

.text-success {
  color: #67c23a;
}

.text-warning {
  color: #e6a23c;
}
</style>
```

---

## 实施步骤

### 第一阶段：紧急修复（立即）
1. ✅ 修复1：个税计算累进税率
2. ✅ 修复2：月结汇总容错处理
3. ✅ 修复4：浮点数精度问题

### 第二阶段：功能完善（本周）
4. ✅ 修复3：夜班参数获取完善
5. ✅ 修复5：批量计算事务和并发锁
6. ✅ 修复7：Web 端流程改进

### 第三阶段：深层优化（下周）
7. ✅ 修复6：保险版本处理完善
8. 数据库索引建立
9. 监控和告警机制

---

## 测试清单

修复后需要执行以下测试：

- [ ] **单人月结计算**
  - [ ] 正常情况下薪资是否正确计算？
  - [ ] 缺少工时汇总时是否正确报错？
  - [ ] 有夜班时补贴是否正确？

- [ ] **批量计算**
  - [ ] 100人以上企业是否能快速计算？
  - [ ] 部分员工失败时其他员工是否继续计算？
  - [ ] 并发计算是否有冲突？

- [ ] **税务计算**
  - [ ] 不同金额的个税是否准确？
  - [ ] 保险扣减后的税务是否正确？

- [ ] **Web 操作流程**
  - [ ] 工时汇总状态是否正确显示？
  - [ ] 计算前提示是否清晰？
  - [ ] 错误提示是否有帮助？

