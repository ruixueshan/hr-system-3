/**
 * 招聘提成模块 API
 *
 * 计算、汇总、审核统一通过 salary-engine-v2 的 bonus 动作执行。
 */

import { callFunction } from '../cloud';

export type BonusBatchStatus = 'calculated' | 'approved' | 'partially_paid' | 'paid' | 'cancelled';
export type RecruitmentBonusStatus = 'pending' | 'approved' | 'paid' | 'cancelled';
export type BonusCalculationMode = 'hourly' | 'service_fee' | 'gross_salary';
export type BonusPeriodType = 'long_term' | 'fixed_months';

export const BONUS_CALCULATION_MODE_OPTIONS: Array<{ label: string; value: BonusCalculationMode }> = [
  { label: '按小时计提', value: 'hourly' },
  { label: '按管理费/在职时长计提', value: 'service_fee' }
];

export function getBonusCalculationModeLabel(mode?: BonusCalculationMode | string) {
  const labels: Record<string, string> = {
    hourly: '按小时计提',
    service_fee: '按管理费/在职时长计提',
    gross_salary: '按应发工资比例计提'
  };
  return labels[String(mode || '')] || '按小时计提';
}

export function getBonusRuleValueField(mode?: BonusCalculationMode | string) {
  if (mode === 'service_fee') return 'service_fee_rate';
  if (mode === 'gross_salary') return 'gross_salary_rate';
  return 'hourly_coefficient';
}

export function getBonusRuleValue(rule: Partial<BonusRule>) {
  const field = getBonusRuleValueField(rule.calculation_mode);
  return Number((rule as any)?.[field] || 0);
}

export const BONUS_PERIOD_OPTIONS: Array<{ label: string; value: BonusPeriodType; months: number }> = [
  { label: '长期', value: 'long_term', months: 0 },
  { label: '3个月', value: 'fixed_months', months: 3 },
  { label: '6个月', value: 'fixed_months', months: 6 },
  { label: '12个月', value: 'fixed_months', months: 12 }
];

export function getBonusPeriodLabel(rule: Pick<BonusRule, 'bonus_period_type' | 'bonus_period_months'> | Partial<BonusRule>) {
  if (rule.bonus_period_type === 'fixed_months' && Number(rule.bonus_period_months) > 0) {
    return `${Number(rule.bonus_period_months)}个月`;
  }
  return '长期';
}

export interface RecruitmentBonusDetail {
  _id: string;
  batch_id: string;
  batch_no: string;
  recommender_id: string;
  recommender_name: string;
  employee_id: string;
  candidate_name: string;
  company_id: string;
  company_name?: string;
  join_date?: string;
  bonus_period_type?: BonusPeriodType;
  bonus_period_months?: number;
  bonus_period_end_date?: string;
  eligible_start_date?: string;
  eligible_end_date?: string;
  rule_id?: string;
  calculation_mode: BonusCalculationMode;
  hourly_coefficient: number;
  service_fee_rate: number;
  gross_salary_rate: number;
  calculation_base_amount: number;
  service_fee_amount: number;
  gross_salary_amount: number;
  rule_value: number;
  total_hours: number;
  bonus_amount: number;
  year: number;
  month: number;
  year_month: string;
  status: RecruitmentBonusStatus;
  approved_at?: string;
  paid_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BonusBatchSummary {
  _id: string;
  batch_key: string;
  batch_no: string;
  recommender_id: string;
  recommender_name: string;
  year: number;
  month: number;
  year_month: string;
  candidate_count: number;
  detail_count: number;
  total_hours: number;
  total_bonus: number;
  approved_count: number;
  paid_count: number;
  status: BonusBatchStatus;
  calculated_at?: string;
  approved_at?: string;
  paid_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BonusRule {
  _id?: string;
  recommender_id: string;
  recommender_name?: string;
  company_id: string;
  company_name?: string;
  calculation_mode: BonusCalculationMode;
  hourly_coefficient: number;
  service_fee_rate: number;
  gross_salary_rate: number;
  rule_value?: number;
  bonus_period_type: BonusPeriodType;
  bonus_period_months: number;
  start_date: string;
  end_date?: string;
  start_month: string;
  end_month?: string;
  priority: number;
  scope?: 'global' | 'company' | 'recommender' | 'recommender_company';
  status: 'active' | 'disabled';
  remark?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

function normalizeId(value: any) {
  return String(value || '').trim();
}

async function invokeBonusAction<T>(action: string, payload: Record<string, any> = {}) {
  return callFunction('salary-engine-v2', 'bonus', {
    type: 'bonus',
    data: {
      action,
      ...payload
    }
  }) as Promise<T>;
}

async function invokeBonusConfigAction<T>(action: string, payload: Record<string, any> = {}) {
  return callFunction('bonus-config', action, payload) as Promise<T>;
}

function normalizeRule(item: any): BonusRule {
  const calculationMode = (['hourly', 'service_fee', 'gross_salary'].includes(String(item?.calculation_mode))
    ? item?.calculation_mode
    : 'hourly') as BonusCalculationMode;
  const normalizedRuleValue = item?.rule_value !== undefined && item?.rule_value !== null
    ? item.rule_value
    : item?.[getBonusRuleValueField(calculationMode)];
  return {
    ...item,
    _id: normalizeId(item?._id || item?.id),
    recommender_id: normalizeId(item?.recommender_id),
    recommender_name: String(item?.recommender_name || ''),
    company_id: normalizeId(item?.company_id),
    company_name: String(item?.company_name || ''),
    calculation_mode: calculationMode,
    hourly_coefficient: Number(item?.hourly_coefficient || 0),
    service_fee_rate: Number(item?.service_fee_rate || 0),
    gross_salary_rate: Number(item?.gross_salary_rate || 0),
    rule_value: Number(normalizedRuleValue || 0),
    bonus_period_type: item?.bonus_period_type === 'fixed_months' ? 'fixed_months' : 'long_term',
    bonus_period_months: Number(item?.bonus_period_months || 0),
    start_date: String(item?.start_date || (item?.start_month ? `${item.start_month}-01` : '')),
    end_date: item?.end_date ? String(item.end_date) : '',
    start_month: String(item?.start_month || ''),
    end_month: item?.end_month ? String(item.end_month) : '',
    priority: Number(item?.priority || 0),
    scope: item?.scope,
    status: item?.status || 'active',
    remark: String(item?.remark || ''),
    created_by: String(item?.created_by || ''),
    created_at: item?.created_at,
    updated_at: item?.updated_at
  } as BonusRule;
}

export const bonusApi = {
  async calculateBatch(params: { year: number; month: number; recommender_id?: string; force_recalculate?: boolean }) {
    return invokeBonusAction<{
      year: number;
      month: number;
      year_month: string;
      worktime_source: string;
      batch_count: number;
      detail_count: number;
      created_batches: number;
      updated_batches: number;
      skipped_finalized_batches: number;
      skipped_employees: Array<{ employee_id: string; reason: string }>;
      errors: Array<{ employee_id: string; employee_name: string; reason: string }>;
      results: Array<{ batch_id: string; batch_no: string; recommender_id: string; recommender_name: string; detail_count: number; total_bonus: number; total_hours: number; status: string }>;
    }>('calculateBatch', params);
  },

  async getList(params?: {
    page?: number;
    pageSize?: number;
    hr_id?: string;
    recommender_id?: string;
    year_month?: string;
    status?: BonusBatchStatus;
  }): Promise<{ list: BonusBatchSummary[]; total: number; page: number; pageSize: number }> {
    return invokeBonusAction('getSummary', {
      ...params,
      recommender_id: params?.recommender_id || params?.hr_id || undefined
    });
  },

  async getDetail(batchId: string): Promise<{ batch: BonusBatchSummary; details: RecruitmentBonusDetail[] }> {
    return invokeBonusAction('getDetail', { batch_id: batchId });
  },

  async approveBatch(batchId: string) {
    return invokeBonusAction<{ batch_id: string; approved_count: number }>('approveBatch', { batch_id: batchId });
  },

  async batchApprove(batchIds: string[]) {
    return invokeBonusAction<{ batch_ids: string[]; results: Array<{ batch_id: string; approved_count: number }> }>('batchApprove', {
      batch_ids: Array.from(new Set(batchIds.map((item) => normalizeId(item)).filter(Boolean)))
    });
  },

  async markBatchPaid(batchId: string) {
    return invokeBonusAction<{ batch_id: string; paid_count: number }>('markBatchPaid', { batch_id: batchId });
  },

  async listRules(params?: { recommender_id?: string; company_id?: string; status?: BonusRule['status'] }): Promise<BonusRule[]> {
    const result = await invokeBonusConfigAction<any[]>('list-rules', params || {});
    return (result || []).map((item: any) => normalizeRule(item));
  },

  async saveRule(rule: Partial<BonusRule> & { _id?: string }): Promise<BonusRule> {
    const payload: Record<string, any> = {
      recommender_id: rule.recommender_id || '',
      recommender_name: rule.recommender_name || '',
      company_id: rule.company_id || '',
      company_name: rule.company_name || '',
      calculation_mode: rule.calculation_mode || 'hourly',
      hourly_coefficient: rule.hourly_coefficient || 0,
      service_fee_rate: rule.service_fee_rate || 0,
      gross_salary_rate: rule.gross_salary_rate || 0,
      bonus_period_type: rule.bonus_period_type || 'long_term',
      bonus_period_months: rule.bonus_period_type === 'fixed_months' ? Number(rule.bonus_period_months || 0) : 0,
      start_date: rule.start_date || '',
      end_date: rule.end_date || null,
      start_month: rule.start_month || '',
      end_month: rule.end_month || null,
      priority: rule.priority ?? 0,
      status: rule.status || 'active',
      scope: rule.scope,
      remark: rule.remark || ''
    };

    if (rule._id) {
      await invokeBonusConfigAction('update-rule', { id: rule._id, ...payload });
      return normalizeRule({ _id: rule._id, ...payload });
    }

    const res = await invokeBonusConfigAction<{ id: string }>('create-rule', payload);
    const finalId = normalizeId((res as any)?.id || (res as any)?._id);
    return normalizeRule({ _id: finalId, ...payload });
  },

  async deleteRule(ruleId: string) {
    await invokeBonusConfigAction('delete-rule', { id: ruleId });
  },

  async copyRules(params: {
    rule_ids: string[];
    start_date: string;
    end_date?: string;
    replace_existing?: boolean;
    remark?: string;
  }) {
    return invokeBonusConfigAction<{
      created: number;
      updated: number;
      skipped: number;
      source_count: number;
    }>('copy-rules', params);
  },

  async batchUpdateCoefficient(params: {
    rule_ids: string[];
    calculation_mode?: BonusCalculationMode;
    rule_value: number;
    remark?: string;
  }) {
    return invokeBonusConfigAction<{
      updated: number;
      calculation_mode: BonusCalculationMode;
      rule_value: number;
    }>('batch-update-coefficient', params);
  },

  async renewRules(params: {
    rule_ids: string[];
    start_date: string;
    end_date?: string;
    replace_existing?: boolean;
    remark?: string;
  }) {
    return invokeBonusConfigAction<{
      created: number;
      updated: number;
      skipped: number;
      source_count: number;
    }>('renew-rules', params);
  },

  async generateFormalRules(params: {
    start_date: string;
    end_date?: string;
    calculation_mode: BonusCalculationMode;
    hourly_coefficient?: number;
    service_fee_rate?: number;
    gross_salary_rate?: number;
    bonus_period_type?: BonusPeriodType;
    bonus_period_months?: number;
    recommender_ids?: string[];
    company_ids?: string[];
    replace_existing?: boolean;
    delete_fallback?: boolean;
  }) {
    return invokeBonusConfigAction<{
      created: number;
      updated: number;
      deleted_fallback: number;
      pair_count: number;
      skipped: number;
      calculation_mode: BonusCalculationMode;
      rule_value: number;
      start_date: string;
      end_date: string;
    }>('generate-formal-rules', params);
  }
};
