// stores/user.store.ts - 用户业务状态管理
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { authApi } from '@/api/modules/auth';
import { rolesApi } from '@/api/modules/roles';

export const useUserStore = defineStore('user', () => {
  const permissions = ref<string[]>([]);
  const roles = ref<string[]>([]);

  async function fetchUserInfo() {
    try {
      const userInfo = await authApi.getProfile();
      return userInfo;
    } catch (err) {
      console.error('获取用户信息失败:', err);
      throw err;
    }
  }

  // 根据角色名从 roles 集合加载对应权限列表
  async function loadPermissions(roleName: string) {
    if (!roleName) {
      permissions.value = [];
      roles.value = [];
      return;
    }
    try {
      const result = await rolesApi.getList({ pageSize: 100 });
      const matched = result.list.find((r: any) => r.name === roleName && r.status !== 'inactive' && r.status !== 'deleted');
      if (matched) {
        permissions.value = matched.permissions || [];
        roles.value = [roleName];
      } else {
        permissions.value = [];
        roles.value = [roleName];
      }
    } catch (err) {
      console.error('加载权限失败:', err);
      permissions.value = [];
      roles.value = roleName ? [roleName] : [];
    }
  }

  function setPermissions(perms: string[]) {
    permissions.value = perms;
  }

  function setRoles(roleList: string[]) {
    roles.value = roleList;
  }

  function hasPermission(permission: string): boolean {
    if (!permission) return true;
    // * 通配：拥有所有权限
    if (permissions.value.includes('*')) return true;
    return permissions.value.includes(permission);
  }

  function hasRole(role: string): boolean {
    return roles.value.includes(role);
  }

  return {
    permissions,
    roles,
    fetchUserInfo,
    loadPermissions,
    setPermissions,
    setRoles,
    hasPermission,
    hasRole
  };
});
