// api/types.ts - 类型定义

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginationResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages?: number;
}

export interface UserInfo {
  _id: string;
  id?: string;
  openid?: string;
  name: string;
  real_name?: string;
  phone: string;
  id_card?: string;
  employee_id?: string;
  employee_no?: string;
  gender?: 0 | 1;
  avatar?: string;
  user_type: 'candidate' | 'employee' | 'admin';
  role?: 'gm' | 'deputy' | 'hr' | 'candidate' | 'external' | 'finance';
  status?: 'normal' | 'disabled';
  bank_name?: string;
  bank_account?: string;
  bank_account_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Company {
  _id: string;
  name: string;
  company_code?: string;
  short_name?: string;
  industry?: string;
  address?: string;
  contact_person?: string;
  contact_phone?: string;
  business_scope?: string;
  status: 'active' | 'paused' | 'terminated';
  tags?: string[];
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

export interface Job {
  _id: string;
  company_id: string;
  company_name: string;
  job_code?: string;
  rate_plan_id?: string;
  rate_plan_name?: string;
  hourly_rate_daily?: number;
  hourly_rate_monthly?: number;
  supports_daily?: boolean;
  salary_display?: string;
  position: string;
  location?: string;
  department?: string;
  work_time?: string;
  shift_type?: 'day' | 'two_shift';
  age_min?: number;
  age_max?: number;
  gender?: 'male' | 'female' | 'any';
  education?: string;
  experience?: string;
  hourly_rate?: number;
  salary_min?: number;
  salary_max?: number;
  salary_remark?: string;
  purchase_hourly_rate?: number;
  bill_hours?: number;
  finance_config_id?: string;
  billing_mode?: 'hourly_included' | 'service_fee_monthly' | 'service_fee_hourly';
  salary_cost_bearing_mode?: 'platform_cost' | 'company_cost';
  client_hourly_rate?: number;
  service_fee_monthly?: number;
  service_fee_hourly?: number;
  bill_hours_rule?: 'actual_hours' | 'fixed_daily_hours';
  fixed_bill_hours?: number;
  finance_effective_from?: string;
  finance_effective_to?: string;
  finance_config_status?: 'active' | 'disabled';
  benefits?: string[];
  vacancies?: number;
  recruited?: number;
  is_recruiting?: boolean;
  status?: 'active' | 'paused' | 'closed';
  description?: string;
  work_content?: string;
  sort_order?: number;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Application {
  _id: string;
  user_id: string;
  job_id: string;
  company_id?: string;
  source: 'miniprogram' | 'import' | 'admin' | 'qrcode';
  recommender_id?: string;
  recommender_name?: string;
  status: 'pending' | 'contacted' | 'interview' | 'arrived' | 'passed' | 'rejected' | 'cancelled';
  resume?: string;
  remark?: string;
  apply_time?: string;
  expected_interview_time?: string;
  contact_time?: string;
  interview_time?: string;
  result_time?: string;
  phone?: string; // 用于显示申请人电话
  created_at: string;
  updated_at: string;
}

export interface CandidateRecord {
  _id: string;
  user_id: string;
  name: string;
  phone?: string;
  source?: string;
  business_status?: 'registered' | 'applied' | 'interviewing' | 'passed' | 'rejected' | 'cancelled' | 'onboarded';
  ownership_status?: 'owned' | 'public';
  owner_type?: 'referrer' | 'hr' | 'public';
  owner_id?: string;
  owner_name?: string;
  source_referrer_id?: string;
  source_referrer_name?: string;
  last_action_at?: string;
  owner_expire_at?: string;
  latest_action_type?: string;
  latest_job_id?: string;
  latest_job_name?: string;
  latest_company_id?: string;
  latest_company_name?: string;
  latest_application_id?: string;
  raw_status?: string;
  created_at?: string;
}

export interface CandidateActionLog {
  _id?: string;
  candidate_id: string;
  action_type: string;
  operator_id?: string;
  operator_name?: string;
  operator_role?: string;
  related_job_id?: string;
  related_company_id?: string;
  related_application_id?: string;
  related_interview_id?: string;
  related_employee_id?: string;
  remark?: string;
  created_at?: string;
  created_at_ts?: number;
}

export interface CandidateRemark {
  _id?: string;
  candidate_id: string;
  category: 'skill' | 'residence_area' | 'target_area' | 'shift_demand';
  content: string;
  created_by?: string;
  created_by_name?: string;
  created_at?: string;
  created_at_ts?: number;
  updated_by?: string;
  updated_by_name?: string;
  updated_at?: string;
  updated_at_ts?: number;
}

export interface CandidateUserInfo {
  gender: string;
  id_card: string;
  birth_date: string;
  education: string;
  work_years: string;
  current_company: string;
  current_position: string;
  expected_salary: string;
  expected_location: string;
  skills: string;
  self_introduction: string;
}

export interface CandidateDetail {
  profile: CandidateRecord;
  user_info?: CandidateUserInfo;
  remarks?: Record<string, CandidateRemark[]>;
  applications: Application[];
  action_logs: CandidateActionLog[];
  owners: any[];
}

export interface Employee {
  _id: string;
  relation_id?: string;
  employee_id?: string;
  user_id: string;
  name: string;
  phone?: string; // 加密，仅显示后4位
  id_card?: string; // 加密，仅显示后4位
  gender: 0 | 1;
  job_id?: string;
  job_name?: string;
  rate_plan_id?: string;
  rate_plan_name?: string;
  company_name?: string;
  company_id?: string;
  referrer_id?: string;
  referrer_name?: string;
  join_date: string;
  leave_date?: string;
  employment_status?: 'active' | 'pending_resign' | 'resigned';
  settlement_mode?: 'daily' | 'monthly';
  contract_status?: 'unsigned' | 'signed';
  contract_no?: string;
  contract_sequence?: number;
  contract_signed_at?: string;
  employee_no: string;
  binding_status?: 'bound' | 'unbound' | 'ambiguous';
  emergency_contact?: string;
  emergency_phone?: string;
  bank_name?: string;
  bank_account?: string; // 加密
  bank_account_name?: string;
  bank_card_last4?: string;
  contract_start?: string;
  contract_end?: string;
  contract_type?: string;
  status: 'probation' | 'regular' | 'resigned';
  departure_date?: string;
  departure_reason?: string;
  is_blacklisted?: boolean;
  blacklist_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface WorktimeRecord {
  _id: string;
  employee_id: string;
  company_id: string;
  job_id?: string;
  rate_plan_id?: string;
  join_date?: string;
  leave_date?: string;
  employee_no?: string;
  employee_name?: string;
  company_name?: string;
  job_name?: string;
  work_date: string;
  shift: 'day' | 'night';
  regular_hours: number;
  overtime_hours: number;
  total_hours: number;
  hourly_rate: number;
  regular_pay: number;
  overtime_pay: number;
  night_allowance?: number;
  insurance_deduct?: number;
  base_pay?: number;
  meal_allowance?: number;
  status: 'pending' | 'approved' | 'rejected';
  review_status?: 'pending' | 'approved' | 'rejected';
  employment_status?: 'active' | 'pending_resign' | 'resigned';
  total_pay?: number;
  remark?: string;
  created_at: string;
  updated_at: string;
}

export interface WorktimeMonthlySummary {
  _id: string;
  employee_id: string;
  company_id: string;
  employee_no?: string;
  employee_name?: string;
  company_name?: string;
  job_name?: string;
  employment_status?: 'active' | 'pending_resign' | 'resigned';
  settlement_mode?: 'daily' | 'monthly';
  year_month: string;
  total_hours: number;
  total_days: number;
  night_hours?: number;
  night_days?: number;
  hourly_rate?: number;
  salary_amount?: number;
  source?: 'import' | 'manual';
  status: 'pending' | 'approved' | 'rejected';
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RatePlan {
  _id: string;
  id?: string;
  company_id?: string;
  company_name?: string;
  name: string;
  // 日结参数
  hourly_rate_daily?: number;
  daily_rate_daily?: number;
  pay_hours_daily?: number;
  night_hourly_rate_daily?: number;
  night_daily_rate_daily?: number;
  // 月结参数
  hourly_rate_monthly?: number;
  daily_rate_monthly?: number;
  pay_hours_monthly?: number;
  night_hourly_rate_monthly?: number;
  night_daily_rate_monthly?: number;
  // 共享参数
  night_hourly_rate?: number;
  night_daily_rate?: number;
  insurance_daily_deduct?: number;
  insurance_monthly_deduct?: number;
  effective_from?: string;
  effective_to?: string;
  status?: 'active' | 'inactive' | 'deleted';
  created_at?: string;
  updated_at?: string;
}

export interface CommissionPlan {
  _id: string;
  name: string;
  scope: 'template' | 'personal';
  company_id?: string;
  company_name?: string;
  job_id?: string;
  job_name?: string;
  employee_id?: string;
  employee_name?: string;
  // mode: 提成方式
  //   - hour_amount: 按员工当期上班时长 * 固定单价
  //   - attendance_prorate: (当月出勤天数 / 当月天数) * 固定月度金额
  mode: 'hour_amount' | 'attendance_prorate';
  hour_amount?: number;      // 元/小时（用于 hour_amount）
  monthly_amount?: number;   // 元/月（用于 attendance_prorate）
  remark?: string;
  status: 'active' | 'inactive' | 'deleted';
  created_at: string;
  updated_at?: string;
}

export interface Interview {
  _id: string;
  application_id?: string;
  user_id?: string;
  job_id?: string;
  company_id?: string;
  candidate_name?: string;
  phone?: string;
  job_name?: string;
  company_name?: string;
  recommender_id?: string;
  recommender_name?: string;
  interview_date?: string;
  interview_time?: string;
  interviewer?: string;
  interview_type?: 'online' | 'offline';
  location?: string;
  result?: 'pending' | 'passed' | 'rejected' | 'noshow' | 'hired';
  checkin_status?: 'not_checked_in' | 'checked_in' | 'onboarded' | 'absent' | string;
  checked_in_at?: string;
  checkin_source?: string;
  onboarded_at?: string;
  application_status?: string;
  application_source?: string;
  application_checkin_time?: string;
  feedback?: string;
  remark?: string;
  status?: 'scheduled' | 'completed' | 'cancelled';
  created_at?: string;
  updated_at?: string;
}

export interface Advance {
  _id: string;
  employee_id: string;
  company_id: string;
  employee_name?: string;
  job_id?: string;
  amount?: number;
  apply_amount?: number;
  amount_approved?: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  approved_by?: string;
  approved_at?: string;
  pay_time?: string;
  pay_operator?: string;
  remark?: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectReimbursement {
  _id: string;
  company_id: string;
  company_name?: string;
  job_id?: string;
  job_name?: string;
  work_date?: string;
  period_start: string;
  period_end: string;
  work_quantity: number;
  reimbursement_amount: number;
  reimbursement_to_user_id: string;
  reimbursement_to_user_name?: string;
  remark?: string;
  status: 'pending' | 'approved' | 'deleted';
  approved_at?: string;
  approved_by?: string;
  approved_by_name?: string;
  deleted_at?: string;
  deleted_by?: string;
  deleted_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Salary {
  _id: string;
  employee_id: string;
  user_id?: string;
  company_id: string;
  job_id?: string;
  employee_name?: string;
  employee_no?: string;
  company_name?: string;
  job_name?: string;
  month: number;
  year: number;
  year_month?: string;
  settlement_mode?: 'daily' | 'monthly';
  regular_hours: number;
  overtime_hours: number;
  total_hours?: number;
  hourly_rate: number;
  regular_pay: number;
  overtime_pay: number;
  total_days?: number;
  gross_pay?: number;
  net_pay?: number;
  insurance_deduct?: number;
  night_allowance?: number;
  meal_allowance?: number;
  bonus?: number;
  tax?: number;
  deductions?: number;
  total_amount: number;
  status: 'calculated' | 'approved' | 'paid';
  pay_date?: string;
  payment_date?: string;
  remark?: string;
  pay_remark?: string;
  source_type?: string;
  source_id?: string;
  created_at: string;
  updated_at: string;
}

export interface SystemConfig {
  key: string;
  value: string;
  category?: string;
  description?: string;
  status?: 'active' | 'inactive';
  created_at?: string;
  updated_at?: string;
}

export interface FinanceBillingConfig {
  _id?: string;
  id?: string;
  company_id: string;
  company_name?: string;
  job_id: string;
  job_name?: string;
  billing_mode: 'hourly_included' | 'service_fee_monthly' | 'service_fee_hourly';
  salary_cost_bearing_mode: 'platform_cost' | 'company_cost';
  client_hourly_rate?: number;
  service_fee_monthly?: number;
  service_fee_hourly?: number;
  bill_hours_rule: 'actual_hours' | 'fixed_daily_hours';
  fixed_bill_hours?: number;
  effective_from: string;
  effective_to?: string;
  status: 'active' | 'disabled';
  remark?: string;
  source_job_purchase_hourly_rate?: number;
  source_job_bill_hours?: number;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface FinanceMonthlyResult {
  _id?: string;
  id?: string;
  company_id: string;
  company_name?: string;
  job_id?: string;
  job_name?: string;
  year: number;
  month: number;
  year_month: string;
  billing_mode: 'hourly_included' | 'service_fee_monthly' | 'service_fee_hourly';
  salary_cost_bearing_mode: 'platform_cost' | 'company_cost';
  billable_hours: number;
  billable_headcount: number;
  service_days: number;
  month_days: number;
  revenue_amount: number;
  salary_cost_amount: number;
  advance_cost_amount: number;
  bonus_cost_amount: number;
  reimbursement_cost_amount: number;
  other_cost_amount: number;
  gross_profit: number;
  net_profit: number;
  source_config_id?: string;
  status?: 'generated' | 'missing_config';
  details?: string;
  calculated_at?: string;
  calculated_by?: string;
  updated_at?: string;
}
