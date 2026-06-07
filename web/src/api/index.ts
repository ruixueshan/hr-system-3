/**
 * API 模块统一导出
 */

export { authApi } from './modules/auth';
export { companiesApi } from './modules/companies';
export { jobsApi } from './modules/jobs';
export { employeesApi } from './modules/employees';
export { applicationsApi } from './modules/applications';
export { candidatesApi } from './modules/candidates';
export { interviewsApi } from './modules/interviews';
export { salariesApi } from './modules/salaries';
export { advancesApi } from './modules/advances';
export { projectReimbursementsApi } from './modules/projectReimbursements';
export { bonusApi } from './modules/bonus';
export { worktimeApi } from './modules/worktime';
export { statsApi } from './modules/stats';
export { archivesApi } from './modules/archives';
export { qrcodeApi } from './modules/qrcode';
export { ratePlansApi } from './modules/ratePlans';
export { systemApi } from './modules/system';
export { insuranceApi } from './modules/insurance';

// 导出请求实例
export { default as request } from './request';
export type { UserInfo } from './types';
