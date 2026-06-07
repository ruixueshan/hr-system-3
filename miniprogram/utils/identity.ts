function getUserId(user: any): string {
  return String(user?.id || user?._id || user?.user_id || '').trim();
}

function getEmployeeId(userOrProfile: any): string {
  return String(userOrProfile?.employee_id || userOrProfile?._id || userOrProfile?.id || '').trim();
}

module.exports = {
  getUserId,
  getEmployeeId
};

export {};
