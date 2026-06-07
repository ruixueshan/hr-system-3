const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const EMPTY_RELATION_IDS_TO_REMOVE = [
  'f0df711e69db675203f24c1c75e47043',
  'dc1452ab69e6fc18005fc5ad732c3602',
  'e469a40b69e6ffe0006254e34e491880',
  '2e3df17869e6fffd00607fb70aaef9aa',
  '6bdc73f469e784c20007bc65762eef52',
  '948392db69f03c770002a90458ae44f4'
];

const USER_BINDINGS_TO_REPAIR = [
  {
    employee_id: '8d2e20b369c77d8e01efd5144c68fee0',
    user_id: 'ecbc875b69eeec7400ce498d44f2558c',
    name: '陆红梅'
  },
  {
    employee_id: '6a0a1fb669ca254702341f7438526e44',
    user_id: 'd3a457a269ca257c023846174ee50c5c',
    name: '圆通人力'
  },
  {
    employee_id: 'b40d329969eeeb6c00cb4c5d70456416',
    user_id: '41d75f4069eeebc400c86f4b5cfb91b5',
    name: '马广州'
  }
];

function success(data = null, message = 'success') {
  return { code: 0, message, data };
}

function error(code = 1, message = 'error', data = null) {
  return { code, message, data };
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizePhone(value) {
  return normalizeText(value).replace(/\D+/g, '');
}

function normalizeIdCard(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeDate(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function isActiveRelation(relation) {
  const status = normalizeText(relation?.status).toLowerCase();
  if (['resigned', 'left', 'inactive', 'disabled', 'archived'].includes(status)) return false;
  const leaveDate = normalizeDate(relation?.leave_date);
  const today = new Date().toISOString().slice(0, 10);
  return !leaveDate || leaveDate >= today;
}

async function fetchAll(collectionName, pageSize = 100) {
  const countRes = await db.collection(collectionName).count();
  const total = Number(countRes.total || 0);
  const rows = [];
  for (let skip = 0; skip < total; skip += pageSize) {
    const res = await db.collection(collectionName)
      .skip(skip)
      .limit(Math.min(pageSize, total - skip))
      .get();
    rows.push(...(res.data || []));
  }
  return rows;
}

function compactRows(rows, limit = 100) {
  return rows.slice(0, limit);
}

async function countRefs(collectionName, fieldName, values) {
  if (!values.length) return 0;
  let total = 0;
  for (let index = 0; index < values.length; index += 20) {
    const chunk = values.slice(index, index + 20);
    const res = await db.collection(collectionName)
      .where({ [fieldName]: db.command.in(chunk) })
      .count()
      .catch(() => ({ total: 0 }));
    total += Number(res.total || 0);
  }
  return total;
}

async function countRelationReferences(relationIds) {
  const checks = [
    ['worktimes', 'employee_company_id'],
    ['worktimes', 'relation_id'],
    ['worktime_monthly_summaries', 'employee_company_id'],
    ['worktime_monthly_summaries', 'relation_id'],
    ['salaries', 'employee_company_id'],
    ['salaries', 'relation_id'],
    ['salary_insurance_ledgers', 'employee_company_id'],
    ['salary_insurance_deductions', 'employee_company_id']
  ];

  const rows = [];
  for (const [collection, field] of checks) {
    rows.push({
      collection,
      field,
      count: await countRefs(collection, field, relationIds)
    });
  }
  return rows.filter((row) => row.count > 0);
}

function getUserName(user) {
  return normalizeText(user?.real_name || user?.name || user?.nickName || user?.nickname);
}

function hasIdentityMatch(employee, user) {
  const employeePhone = normalizePhone(employee.phone);
  const userPhone = normalizePhone(user.phone);
  return Boolean(
    employeePhone && userPhone && employeePhone === userPhone
  );
}

function isInvalidPhone(value) {
  const phone = normalizePhone(value);
  return Boolean(phone) && !/^1\d{10}$/.test(phone);
}

function mapToDuplicateGroups(items, keyGetter, rowMapper, sampleLimit = 20) {
  const groups = new Map();
  for (const item of items) {
    const key = keyGetter(item);
    if (!key) continue;
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }

  const duplicates = [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      key,
      count: list.length,
      rows: list.map(rowMapper)
    }));

  return {
    group_count: duplicates.length,
    record_count: duplicates.reduce((sum, item) => sum + item.count, 0),
    samples: duplicates.slice(0, sampleLimit)
  };
}

function compactEmployee(employee) {
  return {
    employee_id: employee._id || '',
    employee_no: employee.employee_no || '',
    name: employee.name || '',
    phone: employee.phone || '',
    id_card: employee.id_card || '',
    user_id: employee.user_id || '',
    status: employee.status || '',
    company_id: employee.company_id || '',
    job_id: employee.job_id || '',
    join_date: normalizeDate(employee.join_date),
    leave_date: normalizeDate(employee.leave_date)
  };
}

function compactUser(user) {
  return {
    user_id: user._id || '',
    name: getUserName(user),
    phone: user.phone || '',
    user_type: user.user_type || '',
    employee_id: user.employee_id || '',
    employee_no: user.employee_no || ''
  };
}

function compactRelation(relation) {
  return {
    relation_id: relation._id || '',
    employee_id: relation.employee_id || '',
    company_id: relation.company_id || '',
    job_id: relation.job_id || '',
    status: relation.status || '',
    join_date: normalizeDate(relation.join_date),
    leave_date: normalizeDate(relation.leave_date)
  };
}

function runPrecisionAudit({ employees, relations, users, companies }) {
  const employeeMap = new Map(employees.map((item) => [item._id, item]));
  const userMap = new Map(users.map((item) => [item._id, item]));
  const today = new Date().toISOString().slice(0, 10);

  const activeRelations = relations.filter(isActiveRelation);
  const activeRelationLeaveDateConflict = relations
    .filter((item) => normalizeText(item.status).toLowerCase() === 'active' && normalizeDate(item.leave_date))
    .map(compactRelation);

  const activeRelationPastLeaveDate = relations
    .filter((item) => normalizeText(item.status).toLowerCase() === 'active')
    .filter((item) => {
      const leaveDate = normalizeDate(item.leave_date);
      return leaveDate && leaveDate < today;
    })
    .map(compactRelation);

  const usersWithEmployeeId = users.filter((item) => normalizeText(item.employee_id));
  const userEmployeeMissing = usersWithEmployeeId
    .filter((item) => !employeeMap.has(normalizeText(item.employee_id)))
    .map(compactUser);

  const employeeUserMissing = employees
    .filter((item) => normalizeText(item.user_id) && !userMap.has(normalizeText(item.user_id)))
    .map(compactEmployee);

  const employeeUserReverseMismatch = employees
    .filter((item) => {
      const userId = normalizeText(item.user_id);
      if (!userId) return false;
      const user = userMap.get(userId);
      return user && normalizeText(user.employee_id) && normalizeText(user.employee_id) !== item._id;
    })
    .map((item) => ({
      ...compactEmployee(item),
      user_employee_id: userMap.get(normalizeText(item.user_id))?.employee_id || ''
    }));

  const employeesMissingUserId = employees
    .filter((item) => !normalizeText(item.user_id))
    .map(compactEmployee);

  const employeesMissingIdCard = employees
    .filter((item) => !normalizeIdCard(item.id_card))
    .map(compactEmployee);

  const employeesInvalidPhone = employees
    .filter((item) => isInvalidPhone(item.phone))
    .map(compactEmployee);

  const usersInvalidPhone = users
    .filter((item) => isInvalidPhone(item.phone))
    .map(compactUser);

  const employeeRelationFieldsPresent = employees
    .filter((item) => (
      normalizeText(item.company_id)
      || normalizeText(item.job_id)
      || normalizeText(item.referrer_id)
      || normalizeDate(item.join_date)
      || normalizeDate(item.leave_date)
      || normalizeText(item.company_name)
      || normalizeText(item.job_name)
    ))
    .map(compactEmployee);

  return {
    totals: {
      users: users.length,
      employees: employees.length,
      employee_companies: relations.length,
      companies: companies.length,
      active_relation_count: activeRelations.length,
      active_relation_employee_count: new Set(activeRelations.map((item) => normalizeText(item.employee_id)).filter(Boolean)).size
    },
    duplicate_groups: {
      employees_by_id_card: mapToDuplicateGroups(
        employees,
        (item) => normalizeIdCard(item.id_card),
        compactEmployee
      ),
      employees_by_user_id: mapToDuplicateGroups(
        employees,
        (item) => normalizeText(item.user_id),
        compactEmployee
      ),
      employees_by_phone_name_without_id_card: mapToDuplicateGroups(
        employees.filter((item) => !normalizeIdCard(item.id_card)),
        (item) => {
          const phone = normalizePhone(item.phone);
          const name = normalizeText(item.name).replace(/\s+/g, '');
          return phone && name ? `${phone}__${name}` : '';
        },
        compactEmployee
      ),
      users_by_id_card: mapToDuplicateGroups(
        users,
        (item) => normalizeIdCard(item.id_card),
        compactUser
      ),
      users_by_phone: mapToDuplicateGroups(
        users,
        (item) => normalizePhone(item.phone),
        compactUser
      ),
      users_by_employee_id: mapToDuplicateGroups(
        users,
        (item) => normalizeText(item.employee_id),
        compactUser
      ),
      active_relations_by_employee_id: mapToDuplicateGroups(
        activeRelations,
        (item) => normalizeText(item.employee_id),
        compactRelation
      ),
      active_relations_by_employee_company: mapToDuplicateGroups(
        activeRelations,
        (item) => {
          const employeeId = normalizeText(item.employee_id);
          const companyId = normalizeText(item.company_id);
          return employeeId && companyId ? `${employeeId}__${companyId}` : '';
        },
        compactRelation
      )
    },
    issues: {
      active_relation_leave_date_conflict: activeRelationLeaveDateConflict.length,
      active_relation_past_leave_date: activeRelationPastLeaveDate.length,
      user_employee_missing: userEmployeeMissing.length,
      employee_user_missing: employeeUserMissing.length,
      employee_user_reverse_mismatch: employeeUserReverseMismatch.length,
      employees_missing_user_id: employeesMissingUserId.length,
      employees_missing_id_card: employeesMissingIdCard.length,
      employees_invalid_phone: employeesInvalidPhone.length,
      users_invalid_phone: usersInvalidPhone.length,
      employee_relation_fields_present: employeeRelationFieldsPresent.length
    },
    samples: {
      active_relation_leave_date_conflict: compactRows(activeRelationLeaveDateConflict, 20),
      active_relation_past_leave_date: compactRows(activeRelationPastLeaveDate, 20),
      user_employee_missing: compactRows(userEmployeeMissing, 20),
      employee_user_missing: compactRows(employeeUserMissing, 20),
      employee_user_reverse_mismatch: compactRows(employeeUserReverseMismatch, 20),
      employees_missing_user_id: compactRows(employeesMissingUserId, 20),
      employees_missing_id_card: compactRows(employeesMissingIdCard, 20),
      employees_invalid_phone: compactRows(employeesInvalidPhone, 20),
      users_invalid_phone: compactRows(usersInvalidPhone, 20),
      employee_relation_fields_present: compactRows(employeeRelationFieldsPresent, 20)
    }
  };
}

async function handleRepair() {
  const now = db.serverDate();
  const removedRelations = [];
  const skippedRelations = [];

  const referenceCounts = await countRelationReferences(EMPTY_RELATION_IDS_TO_REMOVE);

  for (const relationId of EMPTY_RELATION_IDS_TO_REMOVE) {
    const relationRes = await db.collection('employee_companies').doc(relationId).get().catch(() => ({ data: null }));
    const relation = relationRes.data;
    if (!relation) {
      skippedRelations.push({ relation_id: relationId, reason: 'not_found' });
      continue;
    }

    const relationRefs = await countRelationReferences([relationId]);
    const canRemove = (
      !normalizeText(relation.employee_id) &&
      !normalizeText(relation.employee_no) &&
      !normalizeText(relation.name || relation.employee_name) &&
      !normalizePhone(relation.phone) &&
      !normalizeIdCard(relation.id_card) &&
      relationRefs.length === 0
    );

    if (!canRemove) {
      skippedRelations.push({
        relation_id: relationId,
        reason: 'validation_failed',
        refs: relationRefs
      });
      continue;
    }

    await db.collection('employee_companies').doc(relationId).remove();
    removedRelations.push({
      relation_id: relationId,
      company_id: relation.company_id || '',
      status: relation.status || '',
      join_date: normalizeDate(relation.join_date)
    });
  }

  const boundUsers = [];
  const skippedBindings = [];

  for (const binding of USER_BINDINGS_TO_REPAIR) {
    const [employeeRes, userRes] = await Promise.all([
      db.collection('employees').doc(binding.employee_id).get().catch(() => ({ data: null })),
      db.collection('users').doc(binding.user_id).get().catch(() => ({ data: null }))
    ]);
    const employee = employeeRes.data;
    const user = userRes.data;

    if (!employee || !user) {
      skippedBindings.push({
        ...binding,
        reason: !employee ? 'employee_not_found' : 'user_not_found'
      });
      continue;
    }

    const employeeUserId = normalizeText(employee.user_id);
    const userEmployeeId = normalizeText(user.employee_id);
    const expectedName = normalizeText(binding.name);
    const nameMatches = !expectedName || normalizeText(employee.name) === expectedName || getUserName(user) === expectedName;
    const canBind = (
      (!employeeUserId || employeeUserId === binding.user_id) &&
      (!userEmployeeId || userEmployeeId === binding.employee_id) &&
      nameMatches &&
      hasIdentityMatch(employee, user)
    );

    if (!canBind) {
      skippedBindings.push({
        ...binding,
        reason: 'validation_failed',
        employee_user_id: employeeUserId,
        user_employee_id: userEmployeeId,
        employee_name: employee.name || '',
        user_name: getUserName(user),
        employee_phone: employee.phone || '',
        user_phone: user.phone || ''
      });
      continue;
    }

    await Promise.all([
      db.collection('employees').doc(binding.employee_id).update({
        data: {
          user_id: binding.user_id,
          updated_at: now
        }
      }),
      db.collection('users').doc(binding.user_id).update({
        data: {
          employee_id: binding.employee_id,
          updated_at: now
        }
      })
    ]);

    boundUsers.push({
      employee_id: binding.employee_id,
      employee_no: employee.employee_no || '',
      employee_name: employee.name || '',
      user_id: binding.user_id,
      user_name: getUserName(user)
    });
  }

  return success({
    removed_relations: removedRelations,
    skipped_relations: skippedRelations,
    bound_users: boundUsers,
    skipped_bindings: skippedBindings,
    relation_reference_counts_before: referenceCounts
  }, '员工链路修复完成');
}

exports.main = async (event = {}) => {
  try {
    const [employees, relations, users, companies] = await Promise.all([
      fetchAll('employees'),
      fetchAll('employee_companies'),
      fetchAll('users'),
      fetchAll('companies')
    ]);

    if (event.action === 'precision-audit') {
      return success(
        runPrecisionAudit({ employees, relations, users, companies }),
        '员工数据库精确聚合审计完成'
      );
    }

    const employeeMap = new Map(employees.map((item) => [item._id, item]));
    const userMap = new Map(users.map((item) => [item._id, item]));
    const companyMap = new Map(companies.map((item) => [item._id, item]));

    const usersByEmployeeId = new Map();
    const usersByPhone = new Map();

    for (const user of users) {
      const employeeId = normalizeText(user.employee_id);
      if (employeeId) {
        const list = usersByEmployeeId.get(employeeId) || [];
        list.push(user);
        usersByEmployeeId.set(employeeId, list);
      }

      const phone = normalizePhone(user.phone);
      if (phone) {
        const list = usersByPhone.get(phone) || [];
        list.push(user);
        usersByPhone.set(phone, list);
      }

    }

    const relationMissingEmployee = [];
    const activeRelationMissingEmployee = [];
    const relationEmployeeMerged = [];

    for (const relation of relations) {
      const employeeId = normalizeText(relation.employee_id);
      const employee = employeeMap.get(employeeId);
      if (!employee) {
        const row = {
          relation_id: relation._id,
          employee_id: employeeId,
          employee_no: relation.employee_no || '',
          name: relation.name || relation.employee_name || '',
          phone: relation.phone || '',
          id_card: relation.id_card || '',
          company_id: relation.company_id || '',
          company_name: companyMap.get(relation.company_id)?.name || relation.company_name || '',
          job_id: relation.job_id || '',
          job_name: relation.job_name || '',
          rate_plan_id: relation.rate_plan_id || '',
          rate_plan_name: relation.rate_plan_name || '',
          settlement_mode: relation.settlement_mode || '',
          source: relation.source || '',
          status: relation.status || '',
          join_date: normalizeDate(relation.join_date),
          leave_date: normalizeDate(relation.leave_date)
        };
        relationMissingEmployee.push(row);
        if (isActiveRelation(relation)) activeRelationMissingEmployee.push(row);
        continue;
      }
      if (normalizeText(employee.merged_into_employee_id)) {
        relationEmployeeMerged.push({
          relation_id: relation._id,
          employee_id: employeeId,
          merged_into_employee_id: employee.merged_into_employee_id,
          employee_no: employee.employee_no || '',
          name: employee.name || '',
          company_name: companyMap.get(relation.company_id)?.name || relation.company_name || ''
        });
      }
    }

    const activeEmployeeIds = new Set(relations.filter(isActiveRelation).map((item) => normalizeText(item.employee_id)).filter(Boolean));
    const relationEmployeeIds = new Set(relations.map((item) => normalizeText(item.employee_id)).filter(Boolean));

    const activeEmployeeNoUserBinding = [];
    const activeEmployeeBadUserId = [];
    const activeEmployeeReverseMissing = [];
    const activeEmployeeMultipleUsers = [];
    const activeEmployeePossibleUser = [];

    for (const employeeId of activeEmployeeIds) {
      const employee = employeeMap.get(employeeId);
      if (!employee) continue;

      const employeeUserId = normalizeText(employee.user_id);
      const userById = employeeUserId ? userMap.get(employeeUserId) : null;
      const reverseUsers = usersByEmployeeId.get(employeeId) || [];

      if (employeeUserId && !userById) {
        activeEmployeeBadUserId.push({
          employee_id: employeeId,
          employee_no: employee.employee_no || '',
          name: employee.name || '',
          phone: employee.phone || '',
          user_id: employeeUserId
        });
      }

      if (employeeUserId && userById && normalizeText(userById.employee_id) !== employeeId) {
        activeEmployeeReverseMissing.push({
          employee_id: employeeId,
          employee_no: employee.employee_no || '',
          name: employee.name || '',
          phone: employee.phone || '',
          user_id: employeeUserId,
          user_employee_id: userById.employee_id || ''
        });
      }

      if (reverseUsers.length > 1) {
        activeEmployeeMultipleUsers.push({
          employee_id: employeeId,
          employee_no: employee.employee_no || '',
          name: employee.name || '',
          phone: employee.phone || '',
          user_ids: reverseUsers.map((item) => item._id),
          user_names: reverseUsers.map((item) => item.real_name || item.name || '')
        });
      }

      const hasValidBinding = (
        (employeeUserId && userById && normalizeText(userById.employee_id) === employeeId) ||
        reverseUsers.length === 1
      );

      if (!hasValidBinding) {
        const candidates = [
          ...(usersByPhone.get(normalizePhone(employee.phone)) || [])
        ].filter((item, index, arr) => (
          arr.findIndex((other) => other._id === item._id) === index &&
          (!normalizeText(item.employee_id) || normalizeText(item.employee_id) === employeeId)
        ));

        const row = {
          employee_id: employeeId,
          employee_no: employee.employee_no || '',
          name: employee.name || '',
          phone: employee.phone || '',
          id_card: employee.id_card || '',
          current_user_id: employeeUserId,
          candidate_user_ids: candidates.map((item) => item._id),
          candidate_user_names: candidates.map((item) => item.real_name || item.name || '')
        };
        activeEmployeeNoUserBinding.push(row);
        if (candidates.length) activeEmployeePossibleUser.push(row);
      }
    }

    const employeeWithoutAnyRelation = employees
      .filter((employee) => !normalizeText(employee.merged_into_employee_id) && !relationEmployeeIds.has(employee._id))
      .map((employee) => ({
        employee_id: employee._id,
        employee_no: employee.employee_no || '',
        name: employee.name || '',
        phone: employee.phone || '',
        id_card: employee.id_card || '',
        status: employee.status || ''
      }));

    const missingRelationIds = activeRelationMissingEmployee.map((item) => item.relation_id).filter(Boolean);
    const missingRelationReferenceCounts = await countRelationReferences(missingRelationIds);

    return success({
      totals: {
        employees: employees.length,
        employee_companies: relations.length,
        users: users.length,
        companies: companies.length,
        active_relation_employee_count: activeEmployeeIds.size
      },
      issues: {
        relation_missing_employee: relationMissingEmployee.length,
        active_relation_missing_employee: activeRelationMissingEmployee.length,
        relation_employee_merged: relationEmployeeMerged.length,
        active_employee_no_user_binding: activeEmployeeNoUserBinding.length,
        active_employee_bad_user_id: activeEmployeeBadUserId.length,
        active_employee_user_reverse_missing: activeEmployeeReverseMissing.length,
        active_employee_multiple_users: activeEmployeeMultipleUsers.length,
        active_employee_possible_user_by_phone_or_id_card: activeEmployeePossibleUser.length,
        employee_without_any_relation: employeeWithoutAnyRelation.length
      },
      details: {
        relation_missing_employee: compactRows(relationMissingEmployee),
        active_relation_missing_employee: compactRows(activeRelationMissingEmployee),
        relation_employee_merged: compactRows(relationEmployeeMerged),
        active_employee_no_user_binding: compactRows(activeEmployeeNoUserBinding),
        active_employee_bad_user_id: compactRows(activeEmployeeBadUserId),
        active_employee_user_reverse_missing: compactRows(activeEmployeeReverseMissing),
        active_employee_multiple_users: compactRows(activeEmployeeMultipleUsers),
        active_employee_possible_user_by_phone_or_id_card: compactRows(activeEmployeePossibleUser),
        employee_without_any_relation: compactRows(employeeWithoutAnyRelation),
        missing_relation_reference_counts: missingRelationReferenceCounts
      }
    }, '员工链路检查完成');
  } catch (err) {
    console.error('[audit-employee-chain] failed:', err);
    return error(500, err.message || '检查失败');
  }
};
