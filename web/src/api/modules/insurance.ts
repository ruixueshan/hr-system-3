import { callFunction } from '../cloud';

const FN = 'insurance-yungongbao';

export interface InsuranceListParams {
  page?: number;
  pageSize?: number;
  where?: Record<string, any>;
  orderBy?: string;
  order?: 'asc' | 'desc';
}

export const insuranceApi = {
  getConfig: () => callFunction(FN, 'getConfig'),
  saveConfig: (data: any) => callFunction(FN, 'saveConfig', data),
  login: () => callFunction(FN, 'login'),
  checkCustomerStatus: () => callFunction(FN, 'checkCustomerStatus'),
  getOverview: () => callFunction(FN, 'getOverview'),

  syncPolicies: () => callFunction(FN, 'syncPolicies'),
  syncActivePolicies: () => callFunction(FN, 'syncActivePolicies'),
  syncWorkCompanies: (policy_id: string) => callFunction(FN, 'syncWorkCompanies', { policy_id }),
  syncOccupations: (policy_id: string) => callFunction(FN, 'syncOccupations', { policy_id }),
  syncPolicyPersons: (policy_id: string) => callFunction(FN, 'syncPolicyPersons', { policy_id }),
  syncOffEmployees: (policy_id: string) => callFunction(FN, 'syncOffEmployees', { policy_id }),

  listPolicies: (params?: InsuranceListParams) => callFunction(FN, 'listPolicies', params),
  listActivePolicies: (params?: InsuranceListParams) => callFunction(FN, 'listActivePolicies', params),
  listWorkCompanies: (params?: InsuranceListParams) => callFunction(FN, 'listWorkCompanies', params),
  listOccupations: (params?: InsuranceListParams) => callFunction(FN, 'listOccupations', params),
  listCompanyMappings: (params?: InsuranceListParams) => callFunction(FN, 'listCompanyMappings', params),
  listJobMappings: (params?: InsuranceListParams) => callFunction(FN, 'listJobMappings', params),
  listInsuranceRecords: (params?: InsuranceListParams) => callFunction(FN, 'listInsuranceRecords', params),
  listBatchTasks: (params?: InsuranceListParams) => callFunction(FN, 'listBatchTasks', params),
  listBatchTaskItems: (task_id: string, params?: InsuranceListParams) => callFunction(FN, 'listBatchTaskItems', {
    ...(params || {}),
    where: { task_id }
  }),
  listChangeRequests: (params?: InsuranceListParams) => callFunction(FN, 'listChangeRequests', params),
  listProviderChangeRecords: (params?: InsuranceListParams & { type?: string; keyword?: string; policy_id?: string }) => callFunction(FN, 'listProviderChangeRecords', params),
  getProviderChangeDetail: (policy_change_id: string) => callFunction(FN, 'getProviderChangeDetail', { policy_change_id }),
  listProviderEmployees: (params?: InsuranceListParams & { policy_id?: string }) => callFunction(FN, 'listProviderEmployees', params),
  getProviderEmployeeDetail: (employee_id: string) => callFunction(FN, 'getProviderEmployeeDetail', { employee_id }),
  listSyncLogs: (params?: InsuranceListParams) => callFunction(FN, 'listSyncLogs', params),
  listExceptions: (params?: InsuranceListParams) => callFunction(FN, 'listExceptions', params),
  recordException: (data: any) => callFunction(FN, 'recordException', data),

  // 未承保人员清单（后端封装）
  listUninsuredEmployees: (params?: InsuranceListParams & { company_id?: string; name?: string }) => callFunction(FN, 'listUninsuredEmployees', params),

  saveCompanyMapping: (data: any) => callFunction(FN, 'saveCompanyMapping', data),
  saveJobMapping: (data: any) => callFunction(FN, 'saveJobMapping', data),

  precheckAddInsurance: (data: any) => callFunction(FN, 'precheckAddInsurance', data),
  precheckOffInsurance: (data: any) => callFunction(FN, 'precheckOffInsurance', data),
  addInsurance: (data: any) => callFunction(FN, 'addInsurance', data),
  offInsurance: (data: any) => callFunction(FN, 'offInsurance', data),

  createBatchTask: (data: any) => callFunction(FN, 'createBatchTask', data),
  precheckBatchTask: (task_id: string) => callFunction(FN, 'precheckBatchTask', { task_id }),
  submitBatchTask: (task_id: string) => callFunction(FN, 'submitBatchTask', { task_id }),
  retryBatchFailedItems: (task_id: string) => callFunction(FN, 'retryBatchFailedItems', { task_id })
};
