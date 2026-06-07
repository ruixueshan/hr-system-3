import type { UserInfo } from '@/api/types';

export function isValidReferrerUser(user: Partial<UserInfo> | null | undefined) {
  if (!user?._id) return false;
  if (user.role === 'candidate' || user.role === 'employee' || user.user_type === 'candidate') return false;
  return true;
}

export function normalizeReferrerUsers(users: Array<Partial<UserInfo>> = []) {
  return users
    .filter((item) => isValidReferrerUser(item))
    .map((item) => ({
      ...item,
      name: item.name || item.real_name || item.phone || item._id || ''
    }))
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN'));
}