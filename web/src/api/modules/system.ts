import { callFunction } from '../cloud';

export const systemApi = {
  async getConfig(params: { key?: string; category?: string } = {}) {
    return callFunction('system', 'get-config', params);
  },

  async setConfig(params: { key: string; value: any; category?: string; description?: string }) {
    return callFunction('system', 'set-config', params);
  },

  async getSalaryInsuranceV2Config() {
    return this.getConfig({ category: 'salary' });
  }
};
