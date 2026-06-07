# 薪资报送银行功能实现文档

## 📋 功能概述

在Web端薪资管理菜单下新增"报送银行"子菜单/Tab，用于查询和导出向银行报送的薪资发放数据。

## 🎯 核心需求实现

### 1. **菜单结构**
- 在"薪资管理"页面的Tab栏添加新的"报送银行"Tab
- 新Tab名称：`bank-transfer`

### 2. **数据查询**
- **默认查询日期**：当天（可修改）
- **数据源**：从`salaries`表查询当天的实发记录
- **关联字段**：与`employees`表关联获取银行卡信息

- **查询模式**：支持日结（daily）和月结（monthly）两种模式

### 3. **数据字段**
生成的报送银行表包含以下字段：

| 字段 | 来源 | 说明 |
|------|------|------|
| 工号 | salaries | 员工工号 |
| 姓名 | salaries | 员工姓名 |
| 企业 | salaries | 企业名称 |
| 银行名称 | employees.bank_name | 银行名称 |
| 收款账号 | employees.bank_account | 银行账号（加密存储） |
| 收款户名 | employees.name | 员工姓名 |
| 交易金额 | salaries.net_pay | 实发工资 |
| 交易备注 | 自动生成 | 企业简称+日期(+月)+工资 |
| 跨行标志 | 固定值 | 默认"是" |
| 个人标志 | 固定值 | 默认"是" |
| 发放日期 | salaries.pay_date | 薪资发放日期 |

### 4. **交易备注规则**
- **日结模式**：`{企业简称}MM月DD工资` (例：展瑞03月25工资)
- **月结模式**：`{企业简称}MM月工资` (例：展瑞03月工资)

### 5. **导出功能**
- 支持导出为Excel文件（.xlsx）
- 文件名格式：`薪资报送银行_{模式}_{日期}.xlsx`
  - 日结示例：`薪资报送银行_日结_2026-03-25.xlsx`
  - 月结示例：`薪资报送银行_月结_2026-03.xlsx`

## 🏗️ 技术实现

### 前端改动（Web端）

#### 1. **API接口** (`web/src/api/modules/salaries.ts`)
新增函数：
```typescript
async getBankTransferData(params?: {
  company_id?: string;      // 企业ID（可选）
  date?: string;            // 查询日期（YYYY-MM-DD，日结用）
  month?: string;           // 查询月份（YYYY-MM，月结用）
  settlement_mode?: 'daily' | 'monthly';  // 查询模式
  page?: number;
  pageSize?: number;
}): Promise<{ list: any[]; total: number }>
```

#### 2. **页面组件** (`web/src/views/Salary/Index.vue`)

**新增Tab：**
```vue
<el-tab-pane label="报送银行" name="bank-transfer">
  <!-- 查询表单 -->
  <!-- 数据表格 -->
  <!-- 导出按钮 -->
</el-tab-pane>
```

**新增响应式数据：**
```typescript
const bankTransferForm = reactive({
  company_id: '',
  date: today,              // 默认当天
  settlement_mode: 'daily', // 默认日结模式
  month: currentMonth       // 默认当月
});

const bankTransferRows = ref<any[]>([]);
const bankTransferLoading = ref(false);
```

**新增方法：**
- `loadBankTransferData()`：加载报送银行数据
- `handleExportBankTransfer()`：导出数据为Excel

### 后端改动（云函数）

#### 云函数 (`cloudfunctions/salaries/index.js`)

**新增action：** `'bank-transfer'`

**新增处理函数：** `handleBankTransfer()`
- 查询条件：`status = 'paid'`（已发薪记录）
- 支持按日期或月份过滤
- 支持按企业过滤
- 关联employees表获取银行信息
- 自动生成交易备注

## 📊 使用流程

1. **进入薪资管理**：点击左侧菜单"薪资管理"
2. **切换到报送银行**：点击Tab栏中的"报送银行"
3. **设置查询条件**：
   - 选择企业（可选）
   - 选择查询方式（日结/月结）
   - 日结：选择查询日期（默认当天）
   - 月结：选择查询月份（默认当月）
4. **点击查询**：加载符合条件的报送银行数据
5. **导出数据**：点击"导出"按钮生成Excel文件

## 🔐 数据安全

- 银行账号在数据库中加密存储
- 云函数层面验证权限
- 只展示已发薪（status='paid'）的记录
- 支持企业级别的数据隔离

## 🚀 部署说明

1. **Web端**：自动包含，重新构建即可
2. **云函数**：需要重新部署salaries云函数
   ```bash
   tcb fn deploy salaries -e cloud1-5glojms9a83c3457
   ```
3. **数据库**：无需修改（使用现有的salaries和employees表）

## 📝 注意事项

1. 账户信息完整性：需要确保employees表中的`bank_account`和`bank_name`字段有数据
2. 发薪状态：只查询status='paid'的工资记录
3. 时区处理：日期查询基于YYYY-MM-DD格式
4. 分页查询：默认一次性返回1000条记录

## ✅ 测试清单

- [ ] 日结模式查询和导出
- [ ] 月结模式查询和导出
- [ ] 按企业筛选
- [ ] Excel导出格式检查
- [ ] 交易备注内容验证
- [ ] 银行信息关联查询

## 🔗 相关文件

| 文件路径 | 说明 |
|---------|------|
| `web/src/views/Salary/Index.vue` | 薪资管理页面 |
| `web/src/api/modules/salaries.ts` | 薪资API接口 |
| `cloudfunctions/salaries/index.js` | 薪资云函数 |
| `database/collections.json` | 数据库集合定义 |
