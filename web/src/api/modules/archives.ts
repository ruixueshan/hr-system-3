/**
 * 档案模块 API
 */

import { getDatabase } from '../cloud';

export interface Archive {
  _id?: string;
  user_id: string;
  file_type: string;
  file_url: string;
  file_size?: number;
  description?: string;
  status: 'active' | 'archived' | 'deleted';
  created_at?: string;
  updated_at?: string;
}

async function fetchAllArchives(query: any, batchSize = 100) {
  const countRes = await query.count();
  const total = countRes.total || 0;
  const list: any[] = [];

  for (let skip = 0; skip < total; skip += batchSize) {
    const result = await query.skip(skip).limit(Math.min(batchSize, total - skip)).get();
    list.push(...(result.data || []));
  }

  return list;
}

export const archivesApi = {
  // 获取档案列表
  async getList(params?: any): Promise<any> {
    try {
      const db = await getDatabase();
      const list = await fetchAllArchives(db.collection('archives'));
      return { list, total: list.length };
    } catch (err: any) {
      console.error('[archivesApi.getList] 失败:', err);
      return { list: [], total: 0 };
    }
  },

  // 创建档案
  async create(data: Partial<Archive>): Promise<Archive> {
    try {
      const db = await getDatabase();
      const archive = {
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'active'
      };

      const result = await db.collection('archives').add(archive);
      return { _id: result.id, ...archive } as Archive;
    } catch (err: any) {
      console.error('[archivesApi.create] 失败:', err);
      throw new Error(err.message || '创建档案失败');
    }
  }
};
