const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { success, error } = require('./response');
const salaryCalc = require('./calculate-salary');

function isMissingSystemLocksError(err) {
  const text = String(err?.message || err || '');
  return text.includes('system_locks')
    && (text.includes('collection not exists') || text.includes('Db or Table not exist') || text.includes('ResourceNotFound'));
}

async function acquireLock(company_id, year, month, settlement_mode, operator) {
  const lockKey = `salary_calculation:${company_id}:${year}:${month}:${settlement_mode}`;
  const now = new Date();
  const lockExpireTime = new Date(now.getTime() + 10 * 60 * 1000);

  let existingLock;
  try {
    existingLock = await db.collection('system_locks')
      .where({
        lock_key: lockKey,
        expires_at: db.command.gt(now)
      })
      .limit(1)
      .get();
  } catch (err) {
    if (isMissingSystemLocksError(err)) {
      console.warn('[acquireLock] system_locks 集合不存在，跳过并发锁保护');
      return {
        acquired: true,
        lockId: null,
        error: null,
        lockDisabled: true
      };
    }
    throw err;
  }

  if (existingLock.data?.length) {
    return {
      acquired: false,
      lockId: null,
      error: '该企业该月份薪资正在计算中，请勿重复操作'
    };
  }

  let lockRes;
  try {
    lockRes = await db.collection('system_locks').add({
      lock_key: lockKey,
      company_id,
      year,
      month,
      settlement_mode,
      operator_id: operator?.uid,
      operator_name: operator?.name,
      created_at: now,
      expires_at: lockExpireTime
    });
  } catch (err) {
    if (isMissingSystemLocksError(err)) {
      console.warn('[acquireLock] system_locks 集合不存在，跳过并发锁创建');
      return {
        acquired: true,
        lockId: null,
        error: null,
        lockDisabled: true
      };
    }
    throw err;
  }

  return {
    acquired: true,
    lockId: lockRes.id,
    error: null
  };
}

async function releaseLock(lockId) {
  if (!lockId) return;
  try {
    await db.collection('system_locks').doc(lockId).remove();
  } catch (err) {
    if (isMissingSystemLocksError(err)) {
      return;
    }
    console.warn('[releaseLock] 释放锁失败:', err);
  }
}

async function writeOpsMetric(payload = {}) {
  try {
    await db.collection('operation_metrics').add({
      metric_type: 'salary_monthly_pipeline',
      created_at: new Date(),
      ...payload
    });
  } catch (err) {
    const text = String(err?.message || err || '');
    if (text.includes('collection not exists') || text.includes('Db or Table not exist') || text.includes('ResourceNotFound')) {
      return;
    }
    console.warn('[writeOpsMetric] 写入失败:', err?.message || err);
  }
}

function normalizeDate(value) {
  if (!value) return '';
  const text = String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function isRelationOverlappingMonth(relation, year, month) {
  if (!relation) return false;
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  const monthStart = `${yearMonth}-01`;
  const monthEnd = `${yearMonth}-${String(new Date(Number(year), Number(month), 0).getDate()).padStart(2, '0')}`;
  const joinDate = normalizeDate(relation.join_date);
  const leaveDate = normalizeDate(relation.leave_date);
  if (joinDate && joinDate > monthEnd) return false;
  if (leaveDate && leaveDate < monthStart) return false;
  return true;
}

exports.calculateAll = async (params, operator) => {
  const { company_id, year, month, settlement_mode = 'monthly' } = params;
  let lockId = null;

  try {
    const lockResult = await acquireLock(company_id, year, month, settlement_mode, operator);
    if (!lockResult.acquired) {
      return error(409, lockResult.error);
    }
    lockId = lockResult.lockId;

    let employeeIds = [];
    if (settlement_mode === 'monthly') {
      const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
      const [summaryRes, relationsRes] = await Promise.all([
        db.collection('worktime_monthly_summaries')
          .where({ company_id, year_month: yearMonth, status: 'approved' })
          .get(),
        db.collection('employee_companies')
          .where({ company_id, settlement_mode })
          .get()
      ]);

      employeeIds = [...new Set([
        ...(summaryRes.data || []).map((item) => item.employee_id).filter(Boolean),
        ...(relationsRes.data || []).filter((item) => isRelationOverlappingMonth(item, year, month)).map((item) => item.employee_id).filter(Boolean)
      ])];
    } else {
      const relationsRes = await db.collection('employee_companies')
        .where({ company_id, settlement_mode })
        .get();
      employeeIds = [...new Set((relationsRes.data || []).filter((item) => isRelationOverlappingMonth(item, year, month)).map((item) => item.employee_id).filter(Boolean))];
    }

    if (!employeeIds.length) {
      await writeOpsMetric({
        company_id,
        year,
        month,
        settlement_mode,
        total_candidates: 0,
        success_count: 0,
        skipped_count: 0,
        failed_count: 0,
        reason_topn: []
      });
      return success({
        salary: {
          total: 0,
          skipped: 0,
          failed: 0,
          successDetails: [],
          skippedDetails: [],
          failedDetails: []
        }
      }, '该企业暂无匹配结算方式的员工');
    }

    const salaryResults = [];
    const salarySkipped = [];
    const salaryFailed = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < employeeIds.length; i += BATCH_SIZE) {
      const batch = employeeIds.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map((empId) =>
        salaryCalc.calculateSalary({ employee_id: empId, company_id, year, month, settlement_mode }, operator)
          .then((result) => {
            if (result && typeof result.code === 'number' && result.code !== 0) {
              return {
                _error: true,
                employee_id: empId,
                message: result.message || '薪资计算失败',
                code: result.code,
                data: result.data || null
              };
            }
            return result;
          })
          .catch((err) => ({
            _error: true,
            employee_id: empId,
            message: err.message,
            code: err.code || 500,
            data: err.data || null
          }))
      ));

      for (const result of batchResults) {
        if (result._error) {
          if (result.code === 400) {
            salarySkipped.push({
              employee_id: result.employee_id,
              reason: result.message,
              data: result.data || null,
              type: 'skipped'
            });
          } else {
            salaryFailed.push({
              employee_id: result.employee_id,
              error: result.message,
              data: result.data || null,
              type: 'failed'
            });
          }
        } else {
          salaryResults.push(result);
        }
      }
    }

    const reasonTopN = salarySkipped
      .map((item) => String(item.reason || '').trim())
      .filter(Boolean)
      .reduce((acc, cur) => {
        acc[cur] = (acc[cur] || 0) + 1;
        return acc;
      }, {});
    const topReasons = Object.entries(reasonTopN)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));

    await writeOpsMetric({
      company_id,
      year,
      month,
      settlement_mode,
      total_candidates: employeeIds.length,
      success_count: salaryResults.length,
      skipped_count: salarySkipped.length,
      failed_count: salaryFailed.length,
      reason_topn: topReasons
    });

    return success({
      salary: {
        total: salaryResults.length,
        skipped: salarySkipped.length,
        failed: salaryFailed.length,
        successDetails: salaryResults.slice(0, 10),
        skippedDetails: salarySkipped,
        failedDetails: salaryFailed
      }
    }, '批量计算完成');
  } catch (err) {
    console.error('[salaries-v2/calculate-all] 批量计算失败:', err);
    return error(500, `批量计算失败: ${err.message}`);
  } finally {
    if (lockId) {
      await releaseLock(lockId);
    }
  }
};
