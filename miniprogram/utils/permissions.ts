const INTERVIEWS_MANAGE_PERMISSION = 'interviews:manage';

async function loadRolePermissions(roleName: string): Promise<string[]> {
  if (!roleName) return [];

  try {
    const db = wx.cloud.database();
    const res = await db.collection('roles')
      .where({ name: roleName })
      .limit(20)
      .get();

    const matched = (res.data || []).find((item: any) => item.status !== 'inactive' && item.status !== 'deleted');
    return matched?.permissions || [];
  } catch (err) {
    console.error('[permissions.loadRolePermissions] 失败:', err);
    return [];
  }
}

function hasPermission(permissions: string[] = [], permission = ''): boolean {
  if (!permission) return true;
  return permissions.includes('*') || permissions.includes(permission);
}

module.exports = {
  INTERVIEWS_MANAGE_PERMISSION,
  loadRolePermissions,
  hasPermission
};

export {};
