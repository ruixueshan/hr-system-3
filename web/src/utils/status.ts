// utils/status.ts - 跨页面复用的状态标签映射
// 每个页面独有的状态映射留在各自的组件中

export const EMPLOYMENT_STATUS_MAP: Record<string, { text: string; type: string }> = {
  active: { text: '在职', type: 'success' },
  pending_resign: { text: '待离职', type: 'warning' },
  resigned: { text: '已离职', type: 'info' },
} as const;

export function getEmploymentStatusText(status?: string): string {
  return EMPLOYMENT_STATUS_MAP[status || '']?.text || '-';
}

export function getEmploymentStatusType(
  status?: string
): '' | 'success' | 'warning' | 'info' | 'danger' {
  return (EMPLOYMENT_STATUS_MAP[status || '']?.type as '' | 'success' | 'warning' | 'info' | 'danger') || '';
}

// 员工主档状态 map（probation / regular / resigned）
export const EMPLOYEE_STATUS_MAP: Record<string, { text: string; type: string }> = {
  probation: { text: '试用期', type: 'warning' },
  regular: { text: '正式员工', type: 'success' },
  resigned: { text: '已离职', type: 'info' },
} as const;

// 项目报销状态 map（pending / approved / deleted）
export const REIMBURSEMENT_STATUS_MAP: Record<string, { text: string; type: string }> = {
  pending: { text: '待审批', type: 'info' },
  approved: { text: '已通过', type: 'success' },
  deleted: { text: '已删除', type: 'danger' },
} as const;

// 预支状态 map（pending / approved / paid / rejected）
export const ADVANCE_STATUS_MAP: Record<string, { text: string; type: string }> = {
  pending: { text: '待审核', type: 'warning' },
  approved: { text: '已通过', type: 'success' },
  paid: { text: '已打款', type: 'success' },
  rejected: { text: '已驳回', type: 'danger' },
} as const;

// 企业合作状态 map（active / paused / terminated）
export const COMPANY_STATUS_MAP: Record<string, { text: string; type: string }> = {
  active: { text: '合作中', type: 'success' },
  paused: { text: '暂停合作', type: 'warning' },
  terminated: { text: '终止合作', type: 'info' },
} as const;

// 提成批次状态 map（calculated / approved / partially_paid / paid / cancelled）
export const BONUS_STATUS_MAP: Record<string, { text: string; type: string }> = {
  calculated: { text: '待审核', type: 'warning' },
  approved: { text: '已审核', type: 'success' },
  partially_paid: { text: '部分发放', type: 'info' },
  paid: { text: '已发放', type: 'success' },
  cancelled: { text: '已取消', type: 'danger' },
} as const;

// 规则启用/停用状态 map（active / disabled）
export const RULE_STATUS_MAP: Record<string, { text: string; type: string }> = {
  active: { text: '启用', type: 'success' },
  disabled: { text: '停用', type: 'info' },
} as const;

// 候选人业务阶段 map
export const BUSINESS_STATUS_MAP: Record<string, { text: string; type: string }> = {
  registered: { text: '已注册', type: 'info' },
  applied: { text: '已报名', type: 'warning' },
  interviewing: { text: '面试中', type: '' },
  passed: { text: '待入职', type: 'success' },
  rejected: { text: '未通过', type: 'danger' },
  cancelled: { text: '已取消', type: 'info' },
  onboarded: { text: '已入职', type: 'success' },
} as const;

// 候选人报名状态 map
export const APPLICATION_STATUS_MAP: Record<string, { text: string; type: string }> = {
  pending: { text: '待联系', type: 'warning' },
  contacted: { text: '已联系', type: '' },
  interview: { text: '面试中', type: '' },
  passed: { text: '已通过', type: 'success' },
  rejected: { text: '未通过', type: 'danger' },
  cancelled: { text: '已取消', type: 'info' },
} as const;
