# Web端员工工号生成检查报告

## 检查时间
2026-04-28

## 检查结论
✅ **新增员工和导入员工时，每次都会生成新的工号** ✅

---

## 详细分析

### 1. 新增员工工号生成流程

**文件位置**: [web/src/views/Employees/Index.vue](web/src/views/Employees/Index.vue#L683-L723)

```typescript
// 新增员工流程：
1. 用户点击"入职登记"按钮
2. openAdd() 函数打开对话框（第683行）
3. 用户填写员工信息（不包括工号）
4. 点击保存调用 saveAdd() 函数
5. 调用 employeesApi.create(payload) 创建员工
```

**关键代码**: [web/src/api/modules/employees.ts](web/src/api/modules/employees.ts#L489)

```typescript
// 第469-495行：create函数
async create(data: Partial<Employee>): Promise<Employee> {
  ...
  const employee = {
    ...rest,
    user_id: matchedUserId,
    settlement_mode,
    employee_no: data.employee_no || `E${Date.now()}`,  // ← 第489行
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: (data.status as Employee['status']) || 'probation'
  };
  
  const result = await db.collection('employees').add(employee);
  ...
}
```

### 2. 员工导入工号生成流程

**文件位置**: [web/src/views/Employees/Index.vue](web/src/views/Employees/Index.vue#L950-1050)

```typescript
// 导入员工流程：
1. 用户上传Excel文件
2. handleImportFile() 解析文件（第953行）
3. validateImportRows() 校验数据（第778行）
4. 确认导入调用 confirmImport()（第1007行）
5. 逐行调用 employeesApi.create(payload)
```

**校验逻辑**（第847行）:
```typescript
const employeeNo = normalizeText(row['工号'] || row['员工编码'] || row['employee_no']);
...
// 如果Excel中提供了工号，使用提供的工号
// 如果没有提供，则 employeeNo = undefined
validRows.push({
  __row_no: rowNo,
  employee_no: employeeNo || undefined,  // ← 第924行
  ...
});
```

**导入时调用create函数**（第1028行）:
```typescript
async function confirmImport() {
  ...
  for (let index = 0; index < validatedImportRows.value.length; index += 1) {
    const row = validatedImportRows.value[index];
    try {
      const { __row_no, ...payload } = row;
      await employeesApi.create(payload);  // ← 第1028行
      ...
    }
  }
}
```

### 3. 工号生成机制分析

| 场景 | 工号来源 | 生成规则 | 样例 |
|------|--------|--------|------|
| **新增员工** | Web端create函数 | `E${Date.now()}` | E1719072000000 |
| **导入员工（提供工号）** | Excel文件 | 使用提供的工号 | 用户输入值 |
| **导入员工（不提供工号）** | Web端create函数 | `E${Date.now()}` | E1719072000000 |

---

## ⚠️ 发现的问题

### 问题1: 工号生成规则不一致

**云函数端的规则** （[cloudfunctions/utils/index.js](cloudfunctions/utils/index.js#L16-L23)）:
```javascript
function generateEmployeeNo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000);
  return `EP${year}${month}${day}${String(random).padStart(4, '0')}`;
}
```
**生成格式**: `EP20260428xxxx` (含年月日+4位随机数)

**Web端API的规则** （[web/src/api/modules/employees.ts](web/src/api/modules/employees.ts#L489)）:
```typescript
employee_no: data.employee_no || `E${Date.now()}`,
```
**生成格式**: `E1719072000000` (E+13位时间戳)

### 问题2: 导入时是否会重复生成工号

**当前行为分析**:
- ✅ 如果Excel中**提供了工号** → 使用提供的工号，不会新增生成
- ⚠️  如果Excel中**未提供工号** → 每次调用create都会生成新的工号

在同一时间戳范围内，`E${Date.now()}`可能产生相同的工号值，因为：
- `Date.now()` 的精度是毫秒
- 如果在同一毫秒内创建多个员工，会产生相同工号
- 这可能导致**数据库唯一性约束冲突**

---

## 建议

1. **统一工号生成规则**：Web端API应采用云函数utils中的`generateEmployeeNo()`规则
2. **增加时间戳精度**：当前`Date.now()`可能在并发创建时产生重复
3. **导入模板优化**：建议Excel模板中明确标示工号字段，鼓励用户提供工号
4. **添加唯一性检验**：确保employee_no字段在数据库中有唯一索引

---

## 文件清单

- ✅ [web/src/views/Employees/Index.vue](web/src/views/Employees/Index.vue) - 员工管理前端页面
- ✅ [web/src/api/modules/employees.ts](web/src/api/modules/employees.ts) - 员工API接口
- ✅ [cloudfunctions/employees/index.js](cloudfunctions/employees/index.js) - 云函数实现
- ✅ [cloudfunctions/utils/index.js](cloudfunctions/utils/index.js) - 工具函数库

---

## 结论

**新增员工和导入员工时，都会每次生成新的工号**。

但存在以下隐患：
1. 工号生成规则不统一（Web端 vs 云函数端）
2. 并发创建时可能产生重复工号
3. 生成格式完全不同，不符合业务规范

建议进行代码统一和规范化处理。
