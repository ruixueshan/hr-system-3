/**
 * calculate-all.js (v2)
 * 批量计算（按企业+月份） - 薪资 + 提成 + 利润
 * 特性：
 * - 并发锁防止重复计算
 * - 容错机制，单人失败不影响其他员工
 * - 详细的错误分类报告
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { success, error } = require('./response');

const salaryCalc = require('./calculate-salary');
const bonusCalc = require('./calculate-bonus');
const profitCalc = require('./calculate-profit');

function isMissingSystemLocksError(err) {
  const text = String(err?.message || err || '');
  return text.includes('system_locks')
    && (text.includes('collection not exists') || text.includes('Db or Table not exist') || text.includes('ResourceNotFound'));
}

/**
 * 获取或创建计算锁，防止并发计算
 */
async function acquireLock(company_id, year, month, settlement_mode, operator) {
  const lockKey = `salary_calculation:${company_id}:${year}:${month}:${settlement_mode}`;
  const now = new Date();
  const lockExpireTime = new Date(now.getTime() + 10 * 60 * 1000); // 10分钟过期

  // 检查现有锁
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

  // 创建锁
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

/**
 * 释放计算锁
 */
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

exports.calculateAll = async (params, operator) => {
  const { company_id, year, month, settlement_mode = 'monthly' } = params;

  let lockId = null;

  try {
    // 第一步：获取计算锁
    const lockResult = await acquireLock(company_id, year, month, settlement_mode, operator);
    if (!lockResult.acquired) {
      return error(409, lockResult.error);
    }
    lockId = lockResult.lockId;
    console.log(`[calculateAll] 已获取计算锁: ${lockId}`);

    // 第二步：查询员工列表
    // 月结优先以"当月已审核工时汇总"作为计算来源，避免因 employee_companies 缺失或未同步而漏算
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
        ...(relationsRes.data || []).map((item) => item.employee_id).filter(Boolean)
      ])];
    } else {
      const relationsRes = await db.collection('employee_companies')
        .where({ company_id, settlement_mode })
        .get();
      employeeIds = [...new Set((relationsRes.data || []).map((item) => item.employee_id).filter(Boolean))];
    }

    if (employeeIds.length === 0) {
      return success(null, '该企业暂无匹配结算方式的员工');
    }

    // 第三步：并发计算薪资
    const salaryResults = [];
    const salarySkipped = [];  // 缺少工时汇总等可跳过的错误
    const salaryFailed = [];   // 真正的计算失败

    console.log(`[calculateAll] 开始计算 ${employeeIds.length} 名员工的薪资`);

    // 小批量并发（每批 5 个）避免超出云函数并发限制
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
          // 区分错误类型：400是业务级容错，500才是真正失败
          if (result.code === 400) {
            console.warn(`[calculateAll] 员工 ${result.employee_id} 跳过: ${result.message}`);
            salarySkipped.push({
              employee_id: result.employee_id,
              reason: result.message,
              data: result.data || null,
              type: 'skipped'
            });
          } else {
            console.error(`[calculateAll] 员工 ${result.employee_id} 计算失败: ${result.message}`);
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

    // 第四步：计算提成和利润（并行）
    const [bonusResult, profitResult] = await Promise.all([
      bonusCalc.calculateBonusBatch({ year, month }, operator).catch((err) => ({
        _error: true,
        message: err.message
      })),
      profitCalc.calculateProfit({ company_id, year, month }, operator).catch((err) => ({
        _error: true,
        message: err.message
      }))
    ]);

    console.log(`[calculateAll] 计算完成 - 成功:${salaryResults.length} 跳过:${salarySkipped.length} 失败:${salaryFailed.length}`);

    return {
      ...success(null, '批量计算完成'),
      data: {
        salary: {
          total: salaryResults.length,
          skipped: salarySkipped.length,
          failed: salaryFailed.length,
          successDetails: salaryResults.slice(0, 10),  // 返回前10条示例
          skippedDetails: salarySkipped,
          failedDetails: salaryFailed
        },
        bonus: bonusResult._error ? { error: bonusResult.message } : bonusResult,
        profit: profitResult._error ? { error: profitResult.message } : profitResult
      }
    };
  } catch (err) {
    console.error('[calculateAll] 批量计算失败:', err);
    return error(500, `批量计算失败: ${err.message}`);
  } finally {
    // 释放锁
    if (lockId) {
      await releaseLock(lockId);
    }
  }
};
