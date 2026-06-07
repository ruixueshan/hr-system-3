/**
 * export.js (v2) - 导出薪资/提成数据
 * 去除重复的 normalizeCalculationMode / getRuleValueField，复用 bonus-rules
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { success, error } = require('./response');
const { normalizeCalculationMode, getRuleValueField } = require('./bonus-rules');

function getCalculationModeLabel(mode) {
  const map = { hourly: '按小时计提', service_fee: '按管理费/在职时长计提', gross_salary: '按应发工资比例计提' };
  return map[mode] || map.hourly;
}

function formatRuleValue(mode, value) {
  const numeric = Number(value || 0);
  if (mode === 'gross_salary') return `${numeric}%`;
  return numeric;
}

exports.exportData = async (params, operator) => {
  const { type, company_id, year, month } = params;

  try {
    if (type === 'salary') {
      const docs = await db.collection('salaries').where({ company_id, year, month }).get();
      const exportData = docs.data.map((s) => ({
        员工ID: s.employee_id, 员工姓名: s.employee_name || '', 企业: s.company_name || '',
        年份: s.year, 月份: s.month,
        正常工时: s.regular_hours, 加班工时: s.overtime_hours, 总工时: s.total_hours,
        基本工资: s.base_pay, 加班费: s.overtime_pay, 夜班补贴: s.night_allowance,
        餐补: s.meal_allowance, 个人奖惩: s.personal_reward, 意外险: s.accident_insurance,
        预支扣除: s.advance_deduct, 个税: s.tax, 应发工资: s.gross_pay, 实发工资: s.net_pay,
        状态: s.status, 生成时间: s.created_at
      }));
      return { ...success(null, '导出完成'), data: { type: 'salary', total: exportData.length, columns: Object.keys(exportData[0] || {}), rows: exportData } };

    } else if (type === 'bonus') {
      const docs = await db.collection('recruitment_bonuses').where({ company_id, year, month }).get();
      const exportData = docs.data.map((b) => {
        const mode = normalizeCalculationMode(b.calculation_mode);
        return {
          计提方式: getCalculationModeLabel(mode),
          推荐人ID: b.recommender_id, 推荐人姓名: b.recommender_name, 被推荐人: b.candidate_name,
          企业: b.company_name || '', 入职日期: b.join_date, 当月工时: b.total_hours,
          规则值: formatRuleValue(mode, b[getRuleValueField(mode)] || b.rule_value || 0),
          计提基数: b.calculation_base_amount || 0, 提成金额: b.bonus_amount,
          年份: b.year, 月份: b.month, 状态: b.status, 生成时间: b.created_at
        };
      });
      return { ...success(null, '导出完成'), data: { type: 'bonus', total: exportData.length, columns: Object.keys(exportData[0] || {}), rows: exportData } };

    } else {
      return error(400, '不支持的导出类型');
    }
  } catch (err) {
    console.error('导出数据失败:', err);
    return error(500, `导出失败: ${err.message}`);
  }
};
