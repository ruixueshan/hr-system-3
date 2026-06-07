import { callFunction } from '../cloud';
import type { CandidateActionLog, CandidateDetail, CandidateRecord, PaginationResult } from '../types';

async function callCandidates(action: string, data: Record<string, any> = {}) {
  return callFunction('candidates', action, data);
}

export const candidatesApi = {
  async getList(params: { scope?: 'mine' | 'public' | 'all'; owner_id?: string; keyword?: string; page?: number; pageSize?: number }): Promise<PaginationResult<CandidateRecord>> {
    const data = await callCandidates('list', params);
    return {
      list: data.list || [],
      total: data.total || 0,
      page: data.page || 1,
      pageSize: data.pageSize || 20,
      totalPages: Math.ceil((data.total || 0) / (data.pageSize || 20))
    };
  },

  async getDetail(candidate_id: string): Promise<CandidateDetail> {
    return callCandidates('detail', { candidate_id });
  },

  async claim(candidate_id: string, operator: { id: string; name: string; role?: string }) {
    return callCandidates('claim', {
      candidate_id,
      owner_id: operator.id,
      owner_name: operator.name,
      owner_role: operator.role || 'hr'
    });
  },

  async moveToPublic(candidate_id: string, operator: { id: string; name: string; role?: string }, reason = 'manual_release') {
    return callCandidates('move-to-public', {
      candidate_id,
      operator_id: operator.id,
      operator_name: operator.name,
      operator_role: operator.role || 'hr',
      reason
    });
  },

  async recordAction(payload: CandidateActionLog) {
    return callCandidates('record-action', payload as Record<string, any>);
  },

  async importCandidates(params: {
    scope: 'mine' | 'public';
    owner_id: string;
    owner_name: string;
    candidates: Array<{
      phone: string;
      name?: string;
      gender?: number;
      id_card?: string;
      education?: string;
    }>;
  }) {
    return callCandidates('import', params);
  },

  async saveRemark(params: {
    candidate_id: string;
    category: 'skill' | 'residence_area' | 'target_area' | 'shift_demand';
    content: string;
    remark_id?: string;
    operator_id?: string;
    operator_name?: string;
    operator_role?: string;
  }) {
    return callCandidates('save-remark', {
      candidate_id: params.candidate_id,
      category: params.category,
      content: params.content,
      remark_id: params.remark_id,
      operator_id: params.operator_id,
      operator_name: params.operator_name,
      operator_role: params.operator_role || 'hr'
    });
  }
};
