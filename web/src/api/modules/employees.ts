/**
 * 员工模块 API
 */

import { getDatabase } from '../cloud';
import type { PaginationParams, PaginationResult, Employee, UserInfo } from '../types';
import { insuranceApi } from './insurance';
import { logAction } from './operationLogs';
import { normalizeDate, normalizeText, normalizePhone, normalizeIdCard, chunkArray, fetchAllQueryDocs, pickFields } from '@/utils/db-helper';

function getTodayStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNextDateStr(date = new Date()) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, '0');
  const day = String(next.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateEmployeeNo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000);
  return `EP${year}${month}${day}${String(random).padStart(4, '0')}`;
}

async function generateUniqueEmployeeNo(db: any) {
  for (let i = 0; i < 10; i += 1) {
    const employeeNo = generateEmployeeNo();
    const existing = await db.collection('employees').where({ employee_no: employeeNo }).limit(1).get();
    if (!existing.data?.length) return employeeNo;
  }
  return `EP${Date.now()}`;
}

function deriveEmploymentStatusFromLeaveDate(leaveDateInput?: string, today = getTodayStr()): 'active' | 'pending_resign' | 'resigned' {
  const leaveDate = normalizeDate(leaveDateInput);
  if (!leaveDate) return 'active';
  if (leaveDate < today) return 'resigned';
  return 'pending_resign';
}

function normalizeEmploymentStatus(statusInput?: string, leaveDateInput?: string, today = getTodayStr()): 'active' | 'pending_resign' | 'resigned' {
  const status = normalizeText(statusInput).toLowerCase();
  if (status === 'resigned' || status === 'left') return 'resigned';
  if (status === 'pending_resign') return 'pending_resign';
  if (status === 'active') return 'active';
  return deriveEmploymentStatusFromLeaveDate(leaveDateInput, today);
}

function getSettlementMode(data: Partial<Employee> & { salary_type?: string }) {
  if (data.settlement_mode === 'monthly') return 'monthly';
  if (data.settlement_mode === 'daily') return 'daily';
  return data.salary_type === 'monthly' ? 'monthly' : 'daily';
}

function compareRelationPriority(a: any, b: any, today = getTodayStr()) {
  const rank = (item: any) => {
    const leaveDate = normalizeDate(item?.leave_date);
    const employmentStatus = normalizeEmploymentStatus(item?.status, leaveDate, today);
    const statusScore = employmentStatus === 'active' ? 300 : (employmentStatus === 'pending_resign' ? 200 : 100);
    const joinScore = new Date(item?.join_date || item?.updated_at || item?.created_at || 0).getTime() || 0;
    const updateScore = new Date(item?.updated_at || item?.created_at || 0).getTime() || 0;
    return statusScore * 1e16 + joinScore * 1e3 + updateScore;
  };

  return rank(b) - rank(a);
}

function pickDisplayRelation(relations: any[] = [], today = getTodayStr()) {
  const list = (Array.isArray(relations) ? relations : []).filter(Boolean);
  if (!list.length) return null;
  return [...list].sort((a, b) => compareRelationPriority(a, b, today))[0];
}

function normalizeContractStatus(relation: Record<string, any> | null | undefined): 'unsigned' | 'signed' {
  return normalizeText(relation?.contract_status) === 'signed' || !!normalizeText(relation?.contract_no)
    ? 'signed'
    : 'unsigned';
}

function normalizeContractCodePart(value?: string | null) {
  const text = normalizeText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return text || 'COMPANY';
}

function pickFirstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return '';
}

function normalizeName(value?: string | null) {
  return normalizeText(value).replace(/\s+/g, '');
}

function isPlaceholderUserName(value?: string | null) {
  return /^候选人\d{4}$/.test(normalizeText(value));
}

function maskIdCard(value?: string | null) {
  const text = normalizeIdCard(value);
  if (text.length < 10) return text ? '***' : '';
  return `${text.slice(0, 3)}***********${text.slice(-4)}`;
}

function getRecordId(item: any) {
  return String(item?._id || item?.id || '');
}

function getDocData(res: any) {
  return res?.data?.[0] || res?.data || null;
}

function buildMissingEmployeeBankPayload(employee: any = {}, user: any = {}) {
  const payload: Record<string, any> = {};
  const userBankName = normalizeText(user.bank_name || user.bank);
  const userBankAccount = normalizeText(user.bank_account || user.bankCard || user.bank_card);
  const userBankAccountName = normalizeText(user.bank_account_name);

  if (!normalizeText(employee.bank_name) && userBankName) {
    payload.bank_name = userBankName;
  }
  if (!normalizeText(employee.bank_account) && userBankAccount) {
    payload.bank_account = userBankAccount;
    payload.bank_card_last4 = userBankAccount.slice(-4);
  }
  if (!normalizeText(employee.bank_account_name) && userBankAccountName) {
    payload.bank_account_name = userBankAccountName;
  }

  return payload;
}

function buildEmployeeMasterPayload(data: Record<string, any>, extra: Record<string, any> = {}) {
  const payload = pickFields(data, [
    'user_id',
    'employee_no',
    'name',
    'phone',
    'id_card',
    'gender',
    'birth_date',
    'status',
    'source',
    'emergency_contact',
    'emergency_phone',
    'bank_name',
    'bank_account',
    'bank_account_name',
    'bank_card_last4',
    'is_blacklisted',
    'blacklist_reason'
  ]);

  if (payload.name !== undefined) payload.name = normalizeText(payload.name);
  if (payload.phone !== undefined) payload.phone = normalizePhone(payload.phone);
  if (payload.id_card !== undefined) payload.id_card = normalizeIdCard(payload.id_card);
  if (payload.employee_no !== undefined) payload.employee_no = normalizeText(payload.employee_no);
  if (payload.bank_account !== undefined) {
    payload.bank_account = normalizeText(payload.bank_account);
    payload.bank_card_last4 = payload.bank_account ? payload.bank_account.slice(-4) : '';
  }
  if (payload.bank_name !== undefined) payload.bank_name = normalizeText(payload.bank_name);
  if (payload.bank_account_name !== undefined) payload.bank_account_name = normalizeText(payload.bank_account_name);

  return { ...payload, ...extra };
}

function buildUserAccountPatchFromEmployee(employee: Record<string, any>, user: Record<string, any> = {}) {
  const payload: Record<string, any> = {
    employee_id: normalizeText(employee._id || employee.id || employee.employee_id),
    employee_no: employee.employee_no || '',
    updated_at: new Date().toISOString()
  };

  if ((user.user_type || '') !== 'admin') {
    payload.user_type = 'employee';
    payload.role = user.role || 'employee';
  }
  if (!normalizeName(user.real_name) && getEmployeeMatchName(employee)) {
    payload.real_name = employee.name;
  }
  if (isPlaceholderUserName(user.name) && getEmployeeMatchName(employee)) {
    payload.name = employee.name;
  }

  return payload;
}

async function loadEmployeeReferenceMaps(db: any) {
  const [companies, jobs, ratePlans, users] = await Promise.all([
    fetchAllQueryDocs(db.collection('companies')),
    fetchAllQueryDocs(db.collection('jobs')),
    fetchAllQueryDocs(db.collection('rate_plans')),
    fetchAllQueryDocs(db.collection('users'))
  ]);

  return {
    jobs: jobs || [],
    ratePlans: ratePlans || [],
    users: users || [],
    companyMap: new Map((companies || []).map((c: any) => [c._id || c.id, c.name])),
    jobMap: new Map((jobs || []).map((j: any) => [j._id || j.id, j.position || j.job_name || ''])),
    ratePlanMap: new Map((ratePlans || []).map((p: any) => [p._id || p.id, p.name || ''])),
    referrerNameMap: new Map((users || []).map((u: any) => [
      normalizeText(u._id || u.id),
      normalizeText(u.real_name || u.name || '')
    ]))
  };
}

async function findActiveInsuranceJobMapping(input: { company_id?: string; job_id?: string; rate_plan_id?: string }) {
  const companyId = normalizeText(input.company_id);
  const jobId = normalizeText(input.job_id);
  const ratePlanId = normalizeText(input.rate_plan_id);
  if (!companyId || (!jobId && !ratePlanId)) return null;

  const candidates = [
    jobId && ratePlanId ? { company_id: companyId, job_id: jobId, rate_plan_id: ratePlanId, mapping_status: 'active' } : null,
    ratePlanId ? { company_id: companyId, rate_plan_id: ratePlanId, mapping_status: 'active' } : null,
    jobId ? { company_id: companyId, job_id: jobId, mapping_status: 'active' } : null
  ].filter(Boolean) as Record<string, any>[];

  for (const where of candidates) {
    const res = await insuranceApi.listJobMappings({ page: 1, pageSize: 1, where });
    if (res?.list?.length) return res.list[0];
  }
  return null;
}

async function tryAutoAddInsuranceAfterOnboard(employee: any) {
  let mapping: any = null;
  try {
    mapping = await findActiveInsuranceJobMapping(employee);
    if (!mapping) {
      await recordAutoAddInsuranceException(employee, '入职自动加保跳过：岗位没有对应的有效保险映射');
      return;
    }
    if (!normalizeText(employee.name) || !normalizeIdCard(employee.id_card)) {
      await recordAutoAddInsuranceException(employee, '入职自动加保跳过：员工姓名或身份证为空', mapping);
      return;
    }
    await insuranceApi.addInsurance({
      policy_id: mapping.policy_id,
      start_date: getNextDateStr(),
      persons: [{
        name: employee.name,
        idcard: employee.id_card,
        work_company: mapping.work_company_name,
        occupation_id: mapping.occupation_id,
        employee_id: employee.employee_id || employee._id || employee.id,
        employee_company_id: employee.relation_id || '',
        company_id: employee.company_id || '',
        job_id: employee.job_id || '',
        rate_plan_id: employee.rate_plan_id || ''
      }]
    });
  } catch (err: any) {
    await recordAutoAddInsuranceException(employee, `入职自动加保失败：${err?.message || err}`, mapping);
    console.warn('[employeesApi] 自动加保失败，不阻断入职:', err?.message || err);
  }
}

async function recordAutoAddInsuranceException(employee: any, message: string, mapping?: any) {
  try {
    await insuranceApi.recordException({
      source: 'auto_add_onboard',
      status: 'mismatch',
      exception_key: [
        'auto_add_onboard',
        normalizeText(employee.employee_id || employee._id || employee.id || employee.relation_id || employee.name),
        normalizeText(mapping?.policy_id || employee.policy_id || 'no_policy')
      ].join(':'),
      employee_id: employee.employee_id || employee._id || employee.id || '',
      employee_company_id: employee.relation_id || '',
      name: employee.name || '',
      idcard: employee.id_card || '',
      company_id: employee.company_id || '',
      company_name: employee.company_name || '',
      job_id: employee.job_id || '',
      job_name: employee.job_name || '',
      rate_plan_id: employee.rate_plan_id || '',
      policy_id: mapping?.policy_id || '',
      work_company: mapping?.work_company_name || '',
      occupation_id: mapping?.occupation_id || '',
      occupation_name: mapping?.occupation_name || '',
      last_error: message
    });
  } catch (err: any) {
    console.warn('[employeesApi] 自动加保异常记录失败:', err?.message || err);
  }
}

async function recordAutoOffInsuranceException(employee: any, leaveDate: string, message: string, mapping?: any) {
  try {
    const normalizedLeaveDate = normalizeDate(leaveDate);
    const insuranceOffDate = normalizeDate(employee.insurance_off_date) || (normalizedLeaveDate > getTodayStr() ? normalizedLeaveDate : getTodayStr());
    await insuranceApi.recordException({
      source: 'auto_off_resign',
      status: 'mismatch',
      exception_key: [
        'auto_off_resign',
        normalizeText(employee.employee_id || employee._id || employee.id || employee.relation_id || employee.name),
        normalizeText(mapping?.policy_id || employee.policy_id || 'no_policy')
      ].join(':'),
      employee_id: employee.employee_id || employee._id || employee.id || '',
      employee_company_id: employee.relation_id || '',
      name: employee.name || '',
      idcard: employee.id_card || '',
      company_id: employee.company_id || '',
      company_name: employee.company_name || '',
      job_id: employee.job_id || '',
      job_name: employee.job_name || '',
      rate_plan_id: employee.rate_plan_id || '',
      policy_id: mapping?.policy_id || '',
      work_company: mapping?.work_company_name || '',
      occupation_id: mapping?.occupation_id || '',
      occupation_name: mapping?.occupation_name || '',
      leave_date: leaveDate,
      insurance_off_date: insuranceOffDate,
      last_error: message
    });
  } catch (err: any) {
    console.warn('[employeesApi] 自动减保异常记录失败:', err?.message || err);
  }
}

async function tryAutoOffInsuranceAfterResign(employee: any, leaveDate: string) {
  let mapping: any = null;
  const insuranceOffDate = normalizeDate(leaveDate) > getTodayStr() ? normalizeDate(leaveDate) : getTodayStr();
  try {
    mapping = await findActiveInsuranceJobMapping(employee);
    if (!mapping) {
      await recordAutoOffInsuranceException(employee, leaveDate, '离职自动减保跳过：岗位没有对应的有效保险映射');
      return;
    }
    const offRes = await insuranceApi.syncOffEmployees(mapping.policy_id);
    const masked = maskIdCard(employee.id_card);
    const candidate = (offRes?.list || []).find((item: any) => {
      return (masked && normalizeText(item.idcard_masked || maskIdCard(item.idcard)) === masked)
        || normalizeText(item.name) === normalizeText(employee.name);
    });
    if (!candidate) {
      await recordAutoOffInsuranceException(employee, leaveDate, '离职自动减保跳过：云工保可减保员工列表中未找到该员工', mapping);
      return;
    }
    await insuranceApi.offInsurance({
      policy_id: mapping.policy_id,
      start_date: insuranceOffDate,
      persons: [{
        policy_person_id: candidate.policy_person_id,
        employee_id: candidate.employee_id,
        employee_company_id: employee.relation_id || '',
        company_id: employee.company_id || '',
        name: candidate.name || employee.name,
        idcard: candidate.idcard || employee.id_card
      }]
    });
  } catch (err: any) {
    await recordAutoOffInsuranceException(
      { ...employee, insurance_off_date: insuranceOffDate },
      leaveDate,
      `离职自动减保失败：${err?.message || err}`,
      mapping
    );
    console.warn('[employeesApi] 自动减保失败，不阻断离职:', err?.message || err);
  }
}

async function tryBatchAutoOffInsuranceAfterResign(rows: any[], leaveDate: string) {
  const insuranceOffDate = normalizeDate(leaveDate) > getTodayStr() ? normalizeDate(leaveDate) : getTodayStr();
  const groups = new Map<string, Array<{ employee: any; mapping: any }>>();

  for (const row of rows) {
    let mapping: any = null;
    try {
      mapping = await findActiveInsuranceJobMapping(row);
      if (!mapping) {
        await recordAutoOffInsuranceException(row, leaveDate, '批量离职自动减保跳过：岗位没有对应的有效保险映射');
        continue;
      }
      const policyId = normalizeText(mapping.policy_id);
      if (!policyId) {
        await recordAutoOffInsuranceException(row, leaveDate, '批量离职自动减保跳过：保险映射缺少保单', mapping);
        continue;
      }
      if (!groups.has(policyId)) groups.set(policyId, []);
      groups.get(policyId)!.push({ employee: row, mapping });
    } catch (err: any) {
      await recordAutoOffInsuranceException(
        { ...row, insurance_off_date: insuranceOffDate },
        leaveDate,
        `批量离职自动减保匹配失败：${err?.message || err}`,
        mapping
      );
    }
  }

  for (const [policyId, items] of groups.entries()) {
    let offList: any[] = [];
    try {
      const offRes = await insuranceApi.syncOffEmployees(policyId);
      offList = offRes?.list || [];
    } catch (err: any) {
      await Promise.all(items.map(({ employee, mapping }) => recordAutoOffInsuranceException(
        { ...employee, insurance_off_date: insuranceOffDate },
        leaveDate,
        `批量离职自动减保获取可减保名单失败：${err?.message || err}`,
        mapping
      )));
      continue;
    }

    const persons: any[] = [];
    const personEmployees: Array<{ employee: any; mapping: any }> = [];
    for (const item of items) {
      const { employee, mapping } = item;
      const masked = maskIdCard(employee.id_card);
      const candidate = offList.find((row: any) => masked && normalizeText(row.idcard_masked || maskIdCard(row.idcard)) === masked)
        || offList.find((row: any) => normalizeText(row.name) === normalizeText(employee.name));
      if (!candidate) {
        await recordAutoOffInsuranceException(employee, leaveDate, '批量离职自动减保跳过：云工保可减保员工列表中未找到该员工', mapping);
        continue;
      }
      persons.push({
        policy_person_id: candidate.policy_person_id,
        employee_id: candidate.employee_id,
        employee_company_id: employee.relation_id || '',
        company_id: employee.company_id || '',
        name: candidate.name || employee.name,
        idcard: candidate.idcard || employee.id_card
      });
      personEmployees.push(item);
    }

    if (!persons.length) continue;
    try {
      await insuranceApi.offInsurance({
        policy_id: policyId,
        start_date: insuranceOffDate,
        persons
      });
    } catch (err: any) {
      await Promise.all(personEmployees.map(({ employee, mapping }) => recordAutoOffInsuranceException(
        { ...employee, insurance_off_date: insuranceOffDate },
        leaveDate,
        `批量离职自动减保失败：${err?.message || err}`,
        mapping
      )));
      console.warn('[employeesApi] 批量自动减保失败，不阻断离职:', err?.message || err);
    }
  }
}

function resolveJobReferenceId(rawValue: any, companyId: string, preferredName: any, maps: { jobs: any[]; jobMap: Map<string, string> }) {
  const raw = normalizeText(rawValue);
  const label = normalizeText(preferredName);
  const scopedJobs = companyId ? maps.jobs.filter((item) => normalizeText(item.company_id) === companyId) : maps.jobs;

  if (raw && maps.jobMap.has(raw)) return raw;
  if (label) {
    const byLabel = scopedJobs.find((item) => normalizeText(item.position || item.job_name) === label);
    if (byLabel?._id || byLabel?.id) return normalizeText(byLabel._id || byLabel.id);
  }
  if (raw) {
    const byCode = scopedJobs.find((item) => normalizeText(item.job_code || item.code) === raw);
    if (byCode?._id || byCode?.id) return normalizeText(byCode._id || byCode.id);
    const byName = scopedJobs.find((item) => normalizeText(item.position || item.job_name) === raw);
    if (byName?._id || byName?.id) return normalizeText(byName._id || byName.id);
  }

  return raw;
}

function resolveRatePlanReferenceId(
  rawValue: any,
  companyId: string,
  preferredName: any,
  jobId: string,
  maps: { jobs: any[]; ratePlans: any[]; ratePlanMap: Map<string, string> }
) {
  const raw = normalizeText(rawValue);
  const label = normalizeText(preferredName);
  const scopedPlans = companyId ? maps.ratePlans.filter((item) => normalizeText(item.company_id) === companyId) : maps.ratePlans;

  if (raw && maps.ratePlanMap.has(raw)) return raw;
  if (label) {
    const byLabel = scopedPlans.find((item) => normalizeText(item.name) === label);
    if (byLabel?._id || byLabel?.id) return normalizeText(byLabel._id || byLabel.id);
  }

  const job = jobId ? maps.jobs.find((item) => normalizeText(item._id || item.id) === jobId) : null;
  const jobRatePlanId = normalizeText(job?.rate_plan_id);
  if (jobRatePlanId && maps.ratePlanMap.has(jobRatePlanId)) return jobRatePlanId;
  if (jobRatePlanId) {
    const byJobPlanCode = scopedPlans.find((item) =>
      normalizeText(item.plan_code || item.rate_plan_code || item.code) === jobRatePlanId ||
      normalizeText(item.name) === jobRatePlanId
    );
    if (byJobPlanCode?._id || byJobPlanCode?.id) return normalizeText(byJobPlanCode._id || byJobPlanCode.id);
  }

  if (raw) {
    const byCode = scopedPlans.find((item) => normalizeText(item.plan_code || item.rate_plan_code || item.code) === raw);
    if (byCode?._id || byCode?.id) return normalizeText(byCode._id || byCode.id);
    const byName = scopedPlans.find((item) => normalizeText(item.name) === raw);
    if (byName?._id || byName?.id) return normalizeText(byName._id || byName.id);
  }

  return raw;
}

function buildEmployeeRelationView(
  employee: any,
  relation: any,
  maps: {
    jobs: any[];
    ratePlans: any[];
    users: any[];
    companyMap: Map<string, string>;
    jobMap: Map<string, string>;
    ratePlanMap: Map<string, string>;
    referrerNameMap: Map<string, string>;
  },
  today = getTodayStr()
) {
  const employeeId = normalizeText(employee?._id || employee?.id);
  const relationId = normalizeText(relation?._id || relation?.id);
  const companyId = normalizeText(relation?.company_id);
  const jobId = resolveJobReferenceId(
    relation?.job_id,
    companyId,
    relation?.job_name,
    maps
  );
  const ratePlanId = resolveRatePlanReferenceId(
    relation?.rate_plan_id,
    companyId,
    relation?.rate_plan_name,
    jobId,
    maps
  );
  const leaveDate = normalizeDate(relation?.leave_date);
  const referralId = normalizeText(relation?.referrer_id);
  const referralName = pickFirstText(
    relation?.referrer_name,
    maps.referrerNameMap.get(referralId)
  );

  return {
    ...employee,
    _id: relationId || employeeId,
    relation_id: relationId || '',
    employee_id: employeeId,
    employee_no: employee?.employee_no || '',
    name: employee?.name || '',
    phone: employee?.phone || '',
    id_card: employee?.id_card || '',
    company_id: companyId,
    company_name: relation?.company_name || maps.companyMap.get(companyId) || '',
    job_id: jobId,
    job_name: maps.jobMap.get(jobId) || relation?.job_name || '',
    rate_plan_id: ratePlanId,
    rate_plan_name: maps.ratePlanMap.get(ratePlanId) || relation?.rate_plan_name || '',
    referrer_id: referralId,
    referrer_name: referralName,
    join_date: relation?.join_date || '',
    leave_date: leaveDate,
    settlement_mode: relation?.settlement_mode || '',
    contract_status: normalizeContractStatus(relation),
    contract_no: relation?.contract_no || '',
    contract_sequence: Number(relation?.contract_sequence || 0),
    contract_signed_at: relation?.contract_signed_at || '',
    employment_status: normalizeEmploymentStatus(relation?.status, leaveDate, today)
  } as Employee;
}

function getEmployeeMatchName(employee: Partial<Employee> & Record<string, any>) {
  return normalizeName(employee.name || '');
}

function isBindableUser(user: Partial<UserInfo> & Record<string, any>) {
  return (user.user_type || '') !== 'admin';
}

async function getExistingBoundEmployee(db: any, userId: string) {
  if (!userId) return null;

  const userRes = await db.collection('users').doc(userId).get();
  const user = getDocData(userRes);
  if (user?.employee_id) {
    const employeeRes = await db.collection('employees').doc(user.employee_id).get();
    const employee = getDocData(employeeRes);
    if (employee) return employee;
  }

  const res = await db.collection('employees').where({ user_id: userId }).limit(1).get();
  return res.data?.[0] || null;
}

async function generateCompanyContractNo(db: any, companyId: string) {
  const normalizedCompanyId = normalizeText(companyId);
  if (!normalizedCompanyId) throw new Error('缺少企业ID，无法生成合同编号');

  const [companyRes, relationDocs] = await Promise.all([
    db.collection('companies').doc(normalizedCompanyId).get().catch(() => null),
    fetchAllQueryDocs(db.collection('employee_companies').where({ company_id: normalizedCompanyId }))
  ]);
  const company = companyRes ? getDocData(companyRes) : null;
  const companyCode = normalizeContractCodePart(
    company?.company_code
    || company?.code
    || company?.short_name
    || normalizedCompanyId.slice(-6)
  );

  let maxSequence = 0;
  (relationDocs || []).forEach((relation: any) => {
    const sequence = Number(relation.contract_sequence || 0);
    if (Number.isFinite(sequence) && sequence > maxSequence) maxSequence = sequence;
    const contractNo = normalizeText(relation.contract_no);
    const matched = contractNo.match(/(\d+)$/);
    if (matched) {
      const parsed = Number(matched[1]);
      if (Number.isFinite(parsed) && parsed > maxSequence) maxSequence = parsed;
    }
  });

  const nextSequence = maxSequence + 1;
  return {
    contract_no: `HT-${companyCode}-${String(nextSequence).padStart(5, '0')}`,
    contract_sequence: nextSequence
  };
}

function isEmployeeCompanyRelationActive(relation: Record<string, any> | null | undefined, today = getTodayStr()) {
  if (!relation) return false;

  const status = normalizeText(relation.status).toLowerCase();
  if (['resigned', 'left', 'inactive', 'disabled', 'archived'].includes(status)) {
    return false;
  }

  const leaveDate = normalizeDate(relation.leave_date);
  if (leaveDate && leaveDate < today) return false;
  return true;
}

async function findReusableEmployee(
  db: any,
  employee: Partial<Employee> & Record<string, any>,
  preferredUserId = ''
) {
  const employeeIdCard = normalizeIdCard(employee.id_card);
  const employeeName = getEmployeeMatchName(employee);
  if (employeeIdCard && employeeName) {
    const idCardRes = await db.collection('employees').where({ id_card: employeeIdCard }).get();
    const matches = (idCardRes.data || []).filter((item: any) => !normalizeText(item.merged_into_employee_id));
    const nameMatches = matches.filter((item: any) => getEmployeeMatchName(item) === employeeName);
    if (nameMatches.length === 1) return { employee: nameMatches[0], rule: 'id_card_name' as const };
    if (nameMatches.length > 1) {
      return { employee: null, rule: 'id_card_name' as const, ambiguous: true };
    }
    if (matches.length > 0) return { employee: null, rule: 'id_card_name_conflict' as const, ambiguous: true };
  }

  if (preferredUserId) {
    const boundEmployee = await getExistingBoundEmployee(db, preferredUserId);
    if (boundEmployee) {
      if (employeeIdCard && normalizeIdCard(boundEmployee.id_card) && normalizeIdCard(boundEmployee.id_card) !== employeeIdCard) {
        return { employee: null, rule: 'user_id_id_card_conflict' as const, ambiguous: true };
      }
      return { employee: boundEmployee, rule: 'user_id' as const };
    }
  }

  const employeePhone = normalizePhone(employee.phone);
  if (employeePhone && employeeName) {
    const phoneRes = await db.collection('employees').where({ phone: employeePhone }).get();
    const matches = (phoneRes.data || []).filter((item: any) => (
      !normalizeText(item.merged_into_employee_id)
      && getEmployeeMatchName(item) === employeeName
    ));
    if (matches.length === 1) return { employee: matches[0], rule: 'phone_name' as const };
    if (matches.length > 1) {
      return { employee: null, rule: 'phone_name' as const, ambiguous: true };
    }
  }

  return { employee: null, rule: '' as const, ambiguous: false };
}

async function createEmployeeCompanyRelation(
  db: any,
  employeeId: string,
  employee: Partial<Employee> & Record<string, any>,
  settlementMode: string
) {
  const companyId = normalizeText(employee.company_id);
  if (!companyId) throw new Error('企业ID不能为空');

  const existingRes = await db.collection('employee_companies')
    .where({ employee_id: employeeId, company_id: companyId })
    .get();

  const existingRelations = existingRes.data || [];
  const activeRelation = existingRelations.find((item: any) => isEmployeeCompanyRelationActive(item));
  if (activeRelation) {
    throw new Error('该员工已在当前企业存在有效入职关系');
  }

  const nowIso = new Date().toISOString();
  const addRes = await db.collection('employee_companies').add({
    employee_id: employeeId,
    company_id: companyId,
    referrer_id: normalizeText((employee as any).referrer_id),
    referrer_name: normalizeText((employee as any).referrer_name),
    ...(employee.company_name ? { company_name: employee.company_name } : {}),
    hourly_rate: Number((employee as any).hourly_rate || 0),
    salary_type: (employee as any).salary_type || 'monthly',
    settlement_mode: settlementMode,
    contract_status: 'unsigned',
    contract_no: '',
    contract_sequence: 0,
    ...(employee.contract_start ? { contract_start: employee.contract_start } : {}),
    ...(employee.contract_end ? { contract_end: employee.contract_end } : {}),
    ...(employee.contract_type ? { contract_type: employee.contract_type } : {}),
    status: normalizeEmploymentStatus('', normalizeDate((employee as any).leave_date), getTodayStr()),
    join_date: (employee as any).join_date || nowIso,
    ...(employee.leave_date ? { leave_date: employee.leave_date } : {}),
    ...(employee.job_id ? { job_id: employee.job_id } : {}),
    ...(employee.job_name ? { job_name: employee.job_name } : {}),
    ...(employee.rate_plan_id ? { rate_plan_id: employee.rate_plan_id } : {}),
    ...(employee.rate_plan_name ? { rate_plan_name: employee.rate_plan_name } : {}),
    created_at: nowIso,
    updated_at: nowIso
  });
  const relationId = normalizeText((addRes as any)?.id || (addRes as any)?._id || (addRes as any)?.ids?.[0]);
  return { status: 'created', relation: { _id: relationId, employee_id: employeeId, company_id: companyId, ...employee } };
}

async function assertNoActivePersonInCompany(
  db: any,
  employeeId: string,
  data: Partial<Employee> & Record<string, any>
) {
  const companyId = normalizeText(data.company_id);
  if (!companyId) return;

  const checks = [
    { field: 'phone', value: normalizePhone(data.phone), message: '同一企业下手机号已有在职员工记录，不能重复' },
    { field: 'id_card', value: normalizeIdCard(data.id_card), message: '同一企业下身份证号已有在职员工记录，不能重复' }
  ].filter((item) => item.value);

  for (const check of checks) {
    const employeeRes = await db.collection('employees').where({ [check.field]: check.value }).get();
    const candidateIds = (employeeRes.data || [])
      .map((item: any) => normalizeText(item._id || item.id))
      .filter((id: string) => id && id !== employeeId);

    for (const candidateId of candidateIds) {
      const relationRes = await db.collection('employee_companies')
        .where({ employee_id: candidateId, company_id: companyId })
        .get();
      const hasActive = (relationRes.data || []).some((relation: any) => isEmployeeCompanyRelationActive(relation));
      if (hasActive) throw new Error(check.message);
    }
  }
}

const pickUpdateFields = pickFields;

function buildEmployeeCoreUpdate(data: Record<string, any>) {
  const payload = buildEmployeeMasterPayload(pickUpdateFields(data, [
    'name',
    'phone',
    'id_card',
    'gender',
    'status'
  ]), {
    updated_at: new Date().toISOString()
  });
  return payload;
}

function buildEmploymentRelationUpdate(data: Record<string, any>) {
  const payload = pickUpdateFields(data, [
    'company_id',
    'company_name',
    'job_id',
    'job_name',
    'rate_plan_id',
    'rate_plan_name',
    'referrer_id',
    'referrer_name',
    'settlement_mode',
    'join_date',
    'leave_date',
    'contract_start',
    'contract_end',
    'contract_type'
  ]);

  const nextLeaveDate = payload.leave_date !== undefined ? payload.leave_date : data.leave_date;
  // 在职关系状态只由离职日期驱动，避免主档状态干扰关系状态。
  payload.status = deriveEmploymentStatusFromLeaveDate(nextLeaveDate, getTodayStr());

  payload.updated_at = new Date().toISOString();
  return payload;
}

async function linkEmployeeAndUser(db: any, employeeId: string, userId: string) {
  const [employeeRes, userRes] = await Promise.all([
    db.collection('employees').doc(employeeId).get(),
    db.collection('users').doc(userId).get()
  ]);

  const employee = getDocData(employeeRes);
  const user = getDocData(userRes);

  if (!employee) throw new Error('员工不存在');
  if (!user) throw new Error('用户不存在');

  if (employee.user_id && employee.user_id !== userId) {
    throw new Error('该员工已绑定其他账号');
  }
  if (user.employee_id && user.employee_id !== employeeId) {
    throw new Error('该账号已绑定其他员工');
  }

  const boundEmployee = await getExistingBoundEmployee(db, userId);
  if (boundEmployee && (boundEmployee._id || boundEmployee.id) !== employeeId) {
    throw new Error('该账号已绑定其他员工');
  }

  const nowIso = new Date().toISOString();
  const userPayload = buildUserAccountPatchFromEmployee({ ...employee, _id: employeeId }, user);

  const employeePayload: Record<string, any> = {
    user_id: userId,
    updated_at: nowIso,
    ...buildMissingEmployeeBankPayload(employee, user)
  };

  await Promise.all([
    db.collection('employees').doc(employeeId).update(employeePayload),
    db.collection('users').doc(userId).update(userPayload)
  ]);

  return { employee, user };
}

function findSuggestedUsersForEmployee(
  employee: Partial<Employee> & Record<string, any>,
  users: Array<Partial<UserInfo> & Record<string, any>>
) {
  const employeePhone = normalizePhone(employee.phone);
  const employeeName = getEmployeeMatchName(employee);

  if (employeePhone && employeeName) {
    const byPhoneAndName = users.filter((item) => (
      normalizePhone(item.phone) === employeePhone
      && normalizeName(item.real_name || item.name || '') === employeeName
    ));
    if (byPhoneAndName.length) {
      return {
        rule: 'phone_name',
        users: byPhoneAndName.slice(0, 5)
      };
    }
  }

  return {
    rule: '',
    users: []
  };
}

export const employeesApi = {
  // 获取员工列表
  async getList(params?: PaginationParams & { keyword?: string; status?: string; company_id?: string; referrer_id?: string; contract_status?: 'signed' | 'unsigned' }): Promise<PaginationResult<Employee>> {
    try {
      const db = await getDatabase();
      const employeeDocs = await fetchAllQueryDocs(db.collection('employees').orderBy('created_at', 'desc'));

      const maps = await loadEmployeeReferenceMaps(db);

      const today = getTodayStr();
      const employeeMap = new Map<string, any>();
      (employeeDocs || []).forEach((item: any) => {
        if (normalizeText(item?.merged_into_employee_id)) return;
        employeeMap.set(item._id || item.id, item);
      });

      let relations: any[] = [];
      try {
        relations = await fetchAllQueryDocs(
          db.collection('employee_companies').where({
            employee_id: db.command.exists(true)
          })
        );
      } catch (err) {
        console.warn('[employeesApi.getList] employee_companies 未可用，使用 employees.company_id', (err as any)?.message);
      }

      const keyword = normalizeText(params?.keyword).toLowerCase();
      let list: Employee[] = [];

      (relations || []).forEach((relation: any) => {
        const employeeId = normalizeText(relation.employee_id);
        const employee = employeeMap.get(employeeId);
        if (!employee) return;

        if (keyword) {
          const matched = [employee.name, employee.phone, employee.employee_no, employee.id_card]
            .some((value) => normalizeText(value).toLowerCase().includes(keyword));
          if (!matched) return;
        }

        list.push(buildEmployeeRelationView(employee, relation, maps, today));
      });

      // 在职管理只展示存在 employee_companies 在职关系的数据。

      if (params?.company_id) {
        list = list.filter((item: any) => item.company_id === params.company_id);
      }

      if (params?.referrer_id) {
        list = list.filter((item: any) => item.referrer_id === params.referrer_id);
      }

      if (params?.status) {
        list = list.filter((item: any) => item.employment_status === params.status);
      }

      if (params?.contract_status) {
        list = list.filter((item: any) => normalizeContractStatus(item) === params.contract_status);
      }

      list = list.sort((a: any, b: any) => compareRelationPriority(a, b, today));

      const pageSize = params?.pageSize || 20;
      const page = params?.page || 1;
      const total = list.length;
      const skip = (page - 1) * pageSize;
      list = list.slice(skip, skip + pageSize);

      return {
        list: list as Employee[] || [],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    } catch (err: any) {
      console.error('[employeesApi.getList] 失败:', err);
      return { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  // 获取员工主档列表，仅以 employees 表为主，不代表某一次在职关系
  async getProfileList(params?: PaginationParams & { keyword?: string; status?: string }): Promise<PaginationResult<Employee & Record<string, any>>> {
    try {
      const db = await getDatabase();
      const employeeDocs = await fetchAllQueryDocs(db.collection('employees').orderBy('created_at', 'desc'));
      const [relationDocs, companies, users] = await Promise.all([
        fetchAllQueryDocs(db.collection('employee_companies').where({ employee_id: db.command.exists(true) })),
        fetchAllQueryDocs(db.collection('companies')),
        fetchAllQueryDocs(db.collection('users'))
      ]);

      const today = getTodayStr();
      const keyword = normalizeText(params?.keyword).toLowerCase();
      const companyMap = new Map((companies || []).map((item: any) => [item._id || item.id, item.name || '']));
      const userById = new Map((users || []).map((item: any) => [item._id || item.id, item]));
      const userByEmployeeId = new Map((users || [])
        .filter((item: any) => normalizeText(item.employee_id))
        .map((item: any) => [normalizeText(item.employee_id), item]));
      const relationMap = new Map<string, any[]>();
      (relationDocs || []).forEach((relation: any) => {
        const employeeId = normalizeText(relation.employee_id);
        if (!employeeId) return;
        const list = relationMap.get(employeeId) || [];
        list.push(relation);
        relationMap.set(employeeId, list);
      });

      let list = (employeeDocs || [])
        .filter((item: any) => !normalizeText(item?.merged_into_employee_id))
        .filter((item: any) => {
          if (!keyword) return true;
          return [item.name, item.phone, item.employee_no, item.id_card]
            .some((value) => normalizeText(value).toLowerCase().includes(keyword));
        })
        .map((item: any) => {
          const employeeId = normalizeText(item._id || item.id);
          const user = userById.get(normalizeText(item.user_id)) || userByEmployeeId.get(employeeId) || {};
          const syncedItem = { ...item };
          const idCard = normalizeIdCard(syncedItem.id_card);
          const bankName = normalizeText(syncedItem.bank_name) || normalizeText(user.bank_name || user.bank);
          const bankAccount = normalizeText(syncedItem.bank_account) || normalizeText(user.bank_account || user.bankCard || user.bank_card);
          const bankAccountName = normalizeText(syncedItem.bank_account_name) || normalizeText(user.bank_account_name);
          const bankInfoSource = normalizeText(syncedItem.bank_account)
            ? 'employee'
            : (bankAccount ? 'legacy_user' : '');
          const relations = relationMap.get(employeeId) || [];
          const activeRelations = relations.filter((relation: any) => normalizeEmploymentStatus(relation?.status, relation?.leave_date, today) !== 'resigned');
          const latestRelation = pickDisplayRelation(relations, today);
          const activeCompanyNames = [...new Set(activeRelations
            .map((relation: any) => relation.company_name || companyMap.get(relation.company_id) || '')
            .filter(Boolean))];

          return {
            ...syncedItem,
            _id: employeeId,
            user_id: syncedItem.user_id || user._id || '',
            id_card: idCard,
            bank_name: bankName,
            bank_account: bankAccount,
            bank_account_name: bankAccountName,
            bank_info_source: bankInfoSource,
            relation_count: relations.length,
            active_relation_count: activeRelations.length,
            active_company_names: activeCompanyNames.join('、'),
            latest_company_name: latestRelation?.company_name || companyMap.get(latestRelation?.company_id) || syncedItem.company_name || '',
            latest_join_date: latestRelation?.join_date || syncedItem.join_date || '',
            latest_leave_date: latestRelation?.leave_date || syncedItem.leave_date || ''
          };
        });

      if (params?.status) {
        list = list.filter((item: any) => item.status === params.status);
      }

      const pageSize = params?.pageSize || 20;
      const page = params?.page || 1;
      const total = list.length;
      const skip = (page - 1) * pageSize;

      return {
        list: list.slice(skip, skip + pageSize) as Array<Employee & Record<string, any>>,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    } catch (err: any) {
      console.error('[employeesApi.getProfileList] 失败:', err);
      return { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  // 更新员工主档。企业、岗位、工价方案等在职字段应在在职管理中维护。
  async updateProfile(id: string, data: Partial<Employee>): Promise<Employee> {
    try {
      const db = await getDatabase();
      const employeeId = normalizeText(id);
      if (!employeeId) throw new Error('缺少员工ID');

      const currentRes = await db.collection('employees').doc(employeeId).get();
      const currentEmployee = getDocData(currentRes);
      if (!currentEmployee) throw new Error('员工不存在');

      const payload = data as Partial<Employee> & Record<string, any>;
      const nextEmployeeNo = normalizeText(payload.employee_no);
      if (nextEmployeeNo && nextEmployeeNo !== normalizeText(currentEmployee.employee_no)) {
        const noRes = await db.collection('employees').where({ employee_no: nextEmployeeNo }).get();
        const duplicated = (noRes.data || []).find((item: any) => normalizeText(item._id || item.id) !== employeeId);
        if (duplicated) throw new Error('工号已被其他员工使用');
      }

      const nextIdCard = payload.id_card !== undefined ? normalizeIdCard(payload.id_card) : '';
      if (nextIdCard && nextIdCard !== normalizeIdCard(currentEmployee.id_card)) {
        const idCardRes = await db.collection('employees').where({ id_card: nextIdCard }).get();
        const duplicated = (idCardRes.data || []).find((item: any) => normalizeText(item._id || item.id) !== employeeId);
        if (duplicated) throw new Error('身份证号已存在于其他员工主档');
      }

      const updatePayload: Record<string, any> = {
        updated_at: new Date().toISOString()
      };
      const allowedFields = [
        'employee_no',
        'name',
        'phone',
        'id_card',
        'gender',
        'status',
        'user_id',
        'emergency_contact',
        'emergency_phone',
        'bank_name',
        'bank_account',
        'bank_account_name',
        'bank_card_last4',
        'is_blacklisted',
        'blacklist_reason'
      ];

      allowedFields.forEach((field) => {
        if (!(field in payload)) return;
        updatePayload[field] = (payload as any)[field];
      });

      if (updatePayload.name !== undefined) updatePayload.name = normalizeText(updatePayload.name);
      if (updatePayload.phone !== undefined) updatePayload.phone = normalizePhone(updatePayload.phone);
      if (updatePayload.id_card !== undefined) updatePayload.id_card = normalizeIdCard(updatePayload.id_card);
      if (updatePayload.employee_no !== undefined) updatePayload.employee_no = normalizeText(updatePayload.employee_no);
      if (updatePayload.bank_account !== undefined) {
        updatePayload.bank_account = normalizeText(updatePayload.bank_account);
        updatePayload.bank_card_last4 = updatePayload.bank_account ? updatePayload.bank_account.slice(-4) : '';
      }
      if (updatePayload.bank_name !== undefined) updatePayload.bank_name = normalizeText(updatePayload.bank_name);
      if (updatePayload.bank_account_name !== undefined) updatePayload.bank_account_name = normalizeText(updatePayload.bank_account_name);

      const res = await db.collection('employees').doc(employeeId).update(updatePayload);
      if (!res.updated) throw new Error('未找到员工或无权限更新');

      await logAction('update', `employee-profile:${employeeId}`, updatePayload);
      return { ...currentEmployee, ...updatePayload, _id: employeeId } as Employee;
    } catch (err: any) {
      console.error('[employeesApi.updateProfile] 失败:', err);
      throw new Error(err.message || '更新员工主档失败');
    }
  },

  // 获取员工详情
  async getDetail(id: string): Promise<Employee> {
    try {
      const db = await getDatabase();
      const result = await db.collection('employees')
        .doc(id)
        .get();

      if (!result.data?.length) throw new Error('员工不存在');
      return result.data[0] as Employee;
    } catch (err: any) {
      console.error('[employeesApi.getDetail] 失败:', err);
      throw new Error(err.message || '获取员工详情失败');
    }
  },

  async getEditDetail(employeeId: string, relationId?: string): Promise<Employee> {
    try {
      const db = await getDatabase();
      const normalizedEmployeeId = normalizeText(employeeId);
      const normalizedRelationId = normalizeText(relationId);
      const employeeRes = await db.collection('employees').doc(normalizedEmployeeId).get();
      const employee = getDocData(employeeRes);
      if (!employee) throw new Error('员工不存在');

      let relation = null;
      if (normalizedRelationId) {
        const relationRes = await db.collection('employee_companies').doc(normalizedRelationId).get();
        relation = getDocData(relationRes);
      }
      if (!relation) {
        const relationRes = await db.collection('employee_companies').where({ employee_id: normalizedEmployeeId }).get();
        relation = pickDisplayRelation(relationRes.data || []);
      }
      if (!relation) throw new Error('在职关系不存在');

      const resolvedRelationId = normalizeText(relation?._id || relation?.id);
      const leaveDate = normalizeDate(relation?.leave_date);
      return {
        ...(relation || {}),
        ...employee,
        _id: resolvedRelationId || normalizedEmployeeId,
        relation_id: resolvedRelationId,
        employee_id: normalizedEmployeeId,
        company_id: relation?.company_id || '',
        company_name: relation?.company_name || '',
        job_id: relation?.job_id || '',
        job_name: relation?.job_name || '',
        rate_plan_id: relation?.rate_plan_id || '',
        rate_plan_name: relation?.rate_plan_name || '',
        referrer_id: relation?.referrer_id || '',
        referrer_name: relation?.referrer_name || '',
        join_date: relation?.join_date || '',
        leave_date: leaveDate,
        settlement_mode: relation?.settlement_mode || '',
        contract_status: normalizeContractStatus(relation),
        contract_no: relation?.contract_no || '',
        contract_sequence: Number(relation?.contract_sequence || 0),
        contract_signed_at: relation?.contract_signed_at || '',
        employment_status: normalizeEmploymentStatus(relation?.status, leaveDate)
      } as Employee;
    } catch (err: any) {
      console.error('[employeesApi.getEditDetail] 失败:', err);
      throw new Error(err.message || '获取员工编辑信息失败');
    }
  },

  // 创建员工
  async create(data: Partial<Employee>): Promise<Employee> {
    try {
      const db = await getDatabase();
      const { _id, id, ...rest } = data as any;
      if (rest.phone !== undefined) rest.phone = normalizePhone(rest.phone);
      if (rest.id_card !== undefined) rest.id_card = normalizeIdCard(rest.id_card);
      if (rest.name !== undefined) rest.name = normalizeText(rest.name);
      const settlement_mode = getSettlementMode(data as any);
      const reusableMatch = await findReusableEmployee(db, rest);
      if (reusableMatch.ambiguous) {
        throw new Error('匹配到多个历史员工主档，请先人工清理重复员工数据');
      }

      const reusableEmployee = reusableMatch.employee;
      const reusableEmployeeId = getRecordId(reusableEmployee);

      await assertNoActivePersonInCompany(db, reusableEmployeeId, rest);

      if (reusableEmployee) {
        if (data.employee_no && normalizeText(data.employee_no) !== normalizeText(reusableEmployee.employee_no)) {
          throw new Error('该员工已有历史工号，导入工号与现有主档不一致');
        }

        const employeePayload = buildEmployeeCoreUpdate({
          name: rest.name || reusableEmployee.name || '',
          phone: rest.phone || reusableEmployee.phone || '',
          id_card: rest.id_card || reusableEmployee.id_card || '',
          gender: rest.gender ?? reusableEmployee.gender,
          status: (data.status as Employee['status']) || reusableEmployee.status || 'probation'
        });
        await db.collection('employees').doc(reusableEmployeeId).update(employeePayload);
        const updatedEmployee = { ...reusableEmployee, ...employeePayload, _id: reusableEmployeeId };

        const relationResult = await createEmployeeCompanyRelation(db, reusableEmployeeId, {
          ...updatedEmployee,
          ...rest,
          status: (data.status as Employee['status']) || updatedEmployee.status || 'probation'
        }, settlement_mode);

        const finalEmployee = {
          ...(updatedEmployee as Employee),
          ...rest,
          _id: reusableEmployeeId,
          relation_id: relationResult?.relation?._id || '',
          employee_no: reusableEmployee.employee_no || updatedEmployee.employee_no || ''
        } as Employee;
        await tryAutoAddInsuranceAfterOnboard(finalEmployee);
        return finalEmployee;
      }

      const employee = buildEmployeeMasterPayload(rest, {
        employee_no: data.employee_no || await generateUniqueEmployeeNo(db),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: (data.status as Employee['status']) || 'probation'
      });

      const result = await db.collection('employees').add(employee);
      const finalId = (result as any)?.id || (result as any)?._id;
      if (!finalId) throw new Error('未拿到新增员工ID，请检查 employees 集合权限或名称');
      let relationResult: any = null;
      const relationSource = { ...employee, ...rest };
      try {
        relationResult = await createEmployeeCompanyRelation(db, finalId, relationSource, settlement_mode);
      } catch (relationErr) {
        console.error('[employeesApi.create] 写入 employee_companies 失败，准备回滚员工主档', (relationErr as any)?.message);
        try {
          await db.collection('employees').doc(finalId).remove();
        } catch (rollbackErr) {
          console.error('[employeesApi.create] 回滚员工主档失败', (rollbackErr as any)?.message);
        }
        throw relationErr;
      }

      const finalEmployee = { _id: finalId, relation_id: relationResult?.relation?._id || '', ...relationSource } as Employee;
      await tryAutoAddInsuranceAfterOnboard(finalEmployee);
      return finalEmployee;
    } catch (err: any) {
      console.error('[employeesApi.create] 失败:', err);
      throw new Error(err.message || '创建员工失败');
    }
  },

  // 编辑在职关系：人员核心信息写 employees；当前在职关系写 employee_companies。
  async updateEmployment(employeeId: string, relationId: string, data: Partial<Employee>): Promise<Employee> {
    try {
      const db = await getDatabase();
      const { _id: _omit, id: _omit2, ...payload } = data as any;
      if (payload.phone !== undefined) payload.phone = normalizePhone(payload.phone);
      if (payload.id_card !== undefined) payload.id_card = normalizeIdCard(payload.id_card);
      if (payload.name !== undefined) payload.name = normalizeText(payload.name);
      const normalizedEmployeeId = normalizeText(employeeId);
      const normalizedRelationId = normalizeText(relationId || payload.relation_id);
      if (!normalizedEmployeeId) throw new Error('缺少员工ID');
      if (!normalizedRelationId) throw new Error('缺少在职关系ID');

      const [employeeRes, relationRes] = await Promise.all([
        db.collection('employees').doc(normalizedEmployeeId).get(),
        db.collection('employee_companies').doc(normalizedRelationId).get()
      ]);
      const currentEmployee = getDocData(employeeRes);
      const currentRelation = getDocData(relationRes);
      if (!currentEmployee) throw new Error('员工不存在');
      if (!currentRelation) throw new Error('在职关系不存在');
      if (normalizeText(currentRelation.employee_id) !== normalizedEmployeeId) {
        throw new Error('在职关系与员工不匹配');
      }

      if (payload.id_card && payload.id_card !== normalizeIdCard(currentEmployee.id_card)) {
        const idCardRes = await db.collection('employees').where({ id_card: payload.id_card }).get();
        const conflicts = (idCardRes.data || []).filter((item: any) => (
          normalizeText(item._id || item.id) !== normalizedEmployeeId
          && !normalizeText(item.merged_into_employee_id)
        ));
        if (conflicts.length) throw new Error('该身份证号已存在员工主档，不能保存到当前员工');
      }

      const needsDuplicateCheck = payload.phone !== undefined
        || payload.id_card !== undefined
        || payload.company_id !== undefined
        || payload.leave_date !== undefined
        || payload.status !== undefined;
      if (needsDuplicateCheck) {
        await assertNoActivePersonInCompany(db, normalizedEmployeeId, {
          ...currentEmployee,
          ...currentRelation,
          ...payload
        });
      }

      const employeePayload = buildEmployeeCoreUpdate(payload);
      const relationPayload = buildEmploymentRelationUpdate(payload);
      const writes: Promise<any>[] = [
        db.collection('employee_companies').doc(normalizedRelationId).update(relationPayload)
      ];

      if (Object.keys(employeePayload).some((key) => key !== 'updated_at')) {
        writes.push(db.collection('employees').doc(normalizedEmployeeId).update(employeePayload));
      }

      await Promise.all(writes);

      return {
        ...currentRelation,
        ...currentEmployee,
        ...relationPayload,
        ...employeePayload,
        _id: normalizedRelationId,
        employee_id: normalizedEmployeeId,
        relation_id: normalizedRelationId,
        employment_status: normalizeEmploymentStatus(
          relationPayload.status ?? currentRelation.status,
          relationPayload.leave_date ?? currentRelation.leave_date
        )
      } as Employee;
    } catch (err: any) {
      console.error('[employeesApi.updateEmployment] 失败:', err);
      throw new Error(err.message || '更新员工失败');
    }
  },

  // 仅绑定在职关系推荐人：只写 employee_companies，不写 employees
  async bindReferrerForRelation(relationId: string, data: { referrer_id: string; referrer_name?: string }): Promise<void> {
    try {
      const db = await getDatabase();
      const normalizedRelationId = normalizeText(relationId);
      if (!normalizedRelationId) throw new Error('缺少在职关系ID');

      const relationRes = await db.collection('employee_companies').doc(normalizedRelationId).get();
      const relation = getDocData(relationRes);
      if (!relation) throw new Error('在职关系不存在');

      const referrerId = normalizeText(data.referrer_id);
      if (!referrerId) throw new Error('缺少推荐人ID');
      const referrerName = normalizeText(data.referrer_name);

      await db.collection('employee_companies').doc(normalizedRelationId).update({
        referrer_id: referrerId,
        referrer_name: referrerName,
        updated_at: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[employeesApi.bindReferrerForRelation] 失败:', err);
      throw new Error(err.message || '绑定推荐人失败');
    }
  },

  // 人工签约：合同编号按企业维度递增，落在 employee_companies 关系上
  async signContract(relationId: string): Promise<Employee> {
    try {
      const db = await getDatabase();
      const normalizedRelationId = normalizeText(relationId);
      if (!normalizedRelationId) throw new Error('缺少在职关系ID');

      const relationRes = await db.collection('employee_companies').doc(normalizedRelationId).get();
      const relation = getDocData(relationRes);
      if (!relation) throw new Error('在职关系不存在');

      if (normalizeContractStatus(relation) === 'signed') {
        return {
          ...relation,
          _id: normalizedRelationId,
          relation_id: normalizedRelationId,
          contract_status: 'signed',
          contract_no: relation.contract_no || ''
        } as Employee;
      }

      const generated = await generateCompanyContractNo(db, relation.company_id);
      const nowIso = new Date().toISOString();
      const payload = {
        contract_status: 'signed',
        contract_no: generated.contract_no,
        contract_sequence: generated.contract_sequence,
        contract_signed_at: nowIso,
        updated_at: nowIso
      };

      const updateRes = await db.collection('employee_companies')
        .doc(normalizedRelationId)
        .update(payload);
      if (!updateRes.updated) throw new Error('签约失败：未找到在职关系或无权限更新');

      await logAction('update', `employee-company:${normalizedRelationId}:contract`, payload);
      return {
        ...relation,
        ...payload,
        _id: normalizedRelationId,
        relation_id: normalizedRelationId
      } as Employee;
    } catch (err: any) {
      console.error('[employeesApi.signContract] 失败:', err);
      throw new Error(err.message || '签约失败');
    }
  },

  // 删除员工
  async delete(id: string): Promise<void> {
    try {
      const db = await getDatabase();
      const res = await db.collection('employees')
        .doc(id)
        .update({ status: 'resigned', updated_at: new Date().toISOString() });
      if (!res.updated) throw new Error('未找到员工或无权限删除');
      await logAction('delete', `employee:${id}`);
    } catch (err: any) {
      console.error('[employeesApi.delete] 失败:', err);
      throw new Error(err.message || '删除员工失败');
    }
  },

  // 归档员工
  async archive(id: string): Promise<void> {
    try {
      const db = await getDatabase();
      await db.collection('employees')
        .doc(id)
        .update({ status: 'resigned', updated_at: new Date().toISOString() });
    } catch (err: any) {
      console.error('[employeesApi.archive] 失败:', err);
      throw new Error(err.message || '归档员工失败');
    }
  },

  // 离职：只更新当前在职关系；保险减保作为独立后台环节，不阻断离职保存。
  async resign(id: string, leaveDate?: string, employeeId?: string): Promise<void> {
    const leave_date = leaveDate || getTodayStr();
    const nowIso = new Date().toISOString();
    const today = getTodayStr();
    const db = await getDatabase();
    try {
      const targetEmployeeId = normalizeText(employeeId || id);
      const relationId = employeeId ? normalizeText(id) : '';
      if (!targetEmployeeId || !relationId) throw new Error('缺少员工ID或在职关系ID');

      const empDoc = await db.collection('employees').doc(targetEmployeeId).get();
      if (!empDoc.data?.length) throw new Error('未找到员工');
      const employee = empDoc.data[0];
      const relationDoc = await db.collection('employee_companies').doc(relationId).get();
      const relation = getDocData(relationDoc);
      if (!relation) throw new Error('在职关系不存在');
      if (normalizeText(relation.employee_id) !== targetEmployeeId) {
        throw new Error('在职关系与员工不匹配');
      }
      const nextRelationStatus = deriveEmploymentStatusFromLeaveDate(leave_date, today);

      await db.collection('employee_companies')
        .doc(relationId)
        .update({
          status: nextRelationStatus,
          leave_date,
          updated_at: nowIso
        });

      void tryAutoOffInsuranceAfterResign({
        ...employee,
        employee_id: targetEmployeeId,
        _id: targetEmployeeId,
        relation_id: relationId,
        company_id: relation.company_id || '',
        company_name: relation.company_name || '',
        job_id: relation.job_id || '',
        job_name: relation.job_name || '',
        rate_plan_id: relation.rate_plan_id || ''
      }, leave_date);
    } catch (err: any) {
      console.error('[employeesApi.resign] 失败:', err);
      throw new Error(err.message || '离职操作失败');
    }
  },

  async batchResign(rows: Partial<Employee>[], leaveDate?: string): Promise<{ success: number; failed: Array<{ name: string; message: string }> }> {
    const leave_date = leaveDate || getTodayStr();
    const nowIso = new Date().toISOString();
    const today = getTodayStr();
    const db = await getDatabase();
    const nextRelationStatus = deriveEmploymentStatusFromLeaveDate(leave_date, today);
    const successRows: any[] = [];
    const failed: Array<{ name: string; message: string }> = [];

    const normalizedRows = (rows || []).map((row: any) => ({
      ...row,
      employee_id: normalizeText(row.employee_id || row._id),
      relation_id: normalizeText(row.relation_id || row._id),
      name: normalizeText(row.name)
    })).filter((row: any) => row.employee_id || row.relation_id);

    for (const chunk of chunkArray(normalizedRows, 10)) {
      await Promise.all(chunk.map(async (row: any) => {
        const relationId = normalizeText(row.relation_id);
        const employeeId = normalizeText(row.employee_id);
        try {
          if (!relationId || !employeeId) throw new Error('缺少员工ID或在职关系ID');
          await db.collection('employee_companies')
            .doc(relationId)
            .update({
              status: nextRelationStatus,
              leave_date,
              updated_at: nowIso
            });
          successRows.push({
            ...row,
            employee_id: employeeId,
            relation_id: relationId,
            leave_date
          });
        } catch (err: any) {
          failed.push({ name: row.name || employeeId || relationId || '未知人员', message: err?.message || '离职操作失败' });
        }
      }));
    }

    if (successRows.length) {
      void tryBatchAutoOffInsuranceAfterResign(successRows, leave_date);
    }

    return { success: successRows.length, failed };
  },

  // 获取仪表板统计
  async getDashboardStats(): Promise<any> {
    try {
      const db = await getDatabase();
      const total = await db.collection('employees').count();
      const active = await db.collection('employees').where({ status: 'active' }).count();
      return {
        totalEmployees: total.total || 0,
        activeEmployees: active.total || 0
      };
    } catch (err: any) {
      console.error('[employeesApi.getDashboardStats] 失败:', err);
      return { totalEmployees: 0, activeEmployees: 0 };
    }
  },

  async getPendingBindings(params?: { page?: number; pageSize?: number }) {
    const db = await getDatabase();
    const page = Math.max(1, Number(params?.page || 1));
    const pageSize = Math.max(1, Number(params?.pageSize || 20));
    const skip = (page - 1) * pageSize;
    const _ = db.command;

    const buildResponse = (pagedEmployees: any[], total: number, availableUsers: any[]) => {
      const pendingList = pagedEmployees.map((employee: any) => {
        const suggestion = findSuggestedUsersForEmployee(employee, availableUsers);
        return {
          ...employee,
          suggestions: suggestion.users.map((user: any) => ({
            _id: user._id,
            name: user.real_name || user.name || '',
            phone: user.phone || '',
            id_card: employee.id_card || '',
            match_rule: suggestion.rule
          })),
          suggestion_rule: suggestion.rule,
          binding_status: suggestion.users.length > 1 ? 'ambiguous' : (suggestion.users.length === 1 ? 'unbound' : 'unbound')
        };
      });

      return {
        list: pendingList,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        availableUsers: availableUsers.map((u: any) => ({
          _id: u._id,
          name: u.real_name || u.name || '',
          phone: u.phone || '',
          user_type: u.user_type || ''
        }))
      };
    };

    try {
      const pendingCondition = _.or([
        { user_id: '' },
        { user_id: null },
        { user_id: _.exists(false) }
      ]);

      const [countRes, employeesRes] = await Promise.all([
        db.collection('employees').where(pendingCondition).count(),
        db.collection('employees')
          .where(pendingCondition)
          .orderBy('created_at', 'desc')
          .skip(skip)
          .limit(pageSize)
          .get()
      ]);

      const pagedEmployees = employeesRes.data || [];
      const total = Number(countRes.total || 0);
      if (!pagedEmployees.length) {
        return buildResponse([], total, []);
      }

      const phones = [...new Set(
        pagedEmployees
          .map((item: any) => normalizePhone(item.phone))
          .filter(Boolean)
      )];

      const [phoneUsersNested] = await Promise.all([
        Promise.all(
          chunkArray(phones, 20).map((batch) =>
            db.collection('users').where({ phone: _.in(batch) }).get().then((res: any) => res.data || [])
          )
        )
      ]);

      const userMap = new Map<string, any>();
      [...phoneUsersNested.flat()].forEach((item: any) => {
        const userId = normalizeText(item?._id || item?.id);
        if (!userId || !isBindableUser(item)) return;
        userMap.set(userId, item);
      });
      const candidateUsers = [...userMap.values()];
      const candidateUserIds = candidateUsers.map((item: any) => normalizeText(item._id || item.id)).filter(Boolean);

      let boundUserIds = new Set<string>();
      if (candidateUserIds.length) {
        const boundRowsNested = await Promise.all(
          chunkArray(candidateUserIds, 20).map((batch) =>
            db.collection('employees')
              .where({ user_id: _.in(batch) })
              .field({ user_id: true })
              .get()
              .then((res: any) => res.data || [])
          )
        );
        boundUserIds = new Set(
          boundRowsNested
            .flat()
            .map((row: any) => normalizeText(row.user_id))
            .filter(Boolean)
        );
      }

      const availableUsers = candidateUsers.filter((item: any) => !boundUserIds.has(normalizeText(item._id || item.id)));
      return buildResponse(pagedEmployees, total, availableUsers);
    } catch (err: any) {
      console.warn('[employeesApi.getPendingBindings] 分页查询失败，回退全量模式', err?.message || err);
      const [employeesRows, usersRows] = await Promise.all([
        fetchAllQueryDocs(db.collection('employees').orderBy('created_at', 'desc')),
        fetchAllQueryDocs(db.collection('users').orderBy('updated_at', 'desc'))
      ]);

      const employees = employeesRows.filter((item: any) => !normalizeText(item.user_id));
      const allUsers = usersRows.filter((item: any) => isBindableUser(item));
      const boundUserIds = new Set(
        employeesRows
          .map((item: any) => normalizeText(item.user_id))
          .filter(Boolean)
      );
      const availableUsers = allUsers.filter((item: any) => !boundUserIds.has(item._id));
      const total = employees.length;
      const pagedEmployees = employees.slice(skip, skip + pageSize);
      return buildResponse(pagedEmployees, total, availableUsers);
    }
  },

  async bindUser(employeeId: string, userId: string) {
    const db = await getDatabase();
    const { employee, user } = await linkEmployeeAndUser(db, employeeId, userId);
    await logAction('update', `employee:${employeeId}`, { bind_user_id: userId });
    return {
      employee_id: employeeId,
      user_id: userId,
      employee_name: employee.name,
      user_name: user.real_name || user.name || ''
    };
  }
};
