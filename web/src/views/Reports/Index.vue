<template>
  <div class="reports-page">
    <el-row :gutter="20">
      <el-col :xs="24" :lg="6">
        <el-card>
          <el-radio-group v-model="reportType" class="report-type-selector">
            <el-radio-button label="recruitment">招聘统计</el-radio-button>
            <el-radio-button label="employee">员工统计</el-radio-button>
            <el-radio-button label="salary">薪资统计</el-radio-button>
          </el-radio-group>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card>
          <el-form :inline="true" :model="filterForm">
            <el-form-item label="时间范围">
              <el-date-picker
                v-model="filterForm.dateRange"
                type="daterange"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                value-format="YYYY-MM-DD"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="loading" @click="loadData">查询</el-button>
              <el-button @click="handleExport" :disabled="!tableData.length">导出</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="mt-20">
      <div v-loading="loading">
        <!-- 招聘统计 -->
        <div v-if="reportType === 'recruitment'">
          <el-row :gutter="20">
            <el-col :xs="24" :sm="12" :lg="6">
              <div class="stat-box">
                <div class="stat-value text-primary">{{ summary.totalApplications }}</div>
                <div class="stat-label">总报名人数</div>
              </div>
            </el-col>
            <el-col :xs="24" :sm="12" :lg="6">
              <div class="stat-box">
                <div class="stat-value text-success">{{ summary.passRate }}%</div>
                <div class="stat-label">面试通过率</div>
              </div>
            </el-col>
          </el-row>
          <el-table :data="tableData" stripe class="mt-20">
            <el-table-column prop="date" label="日期" />
            <el-table-column prop="applications" label="报名数" />
            <el-table-column prop="interviews" label="面试数" />
            <el-table-column prop="passed" label="通过数" />
            <el-table-column prop="rejected" label="未通过" />
          </el-table>
        </div>

        <!-- 员工统计 -->
        <div v-else-if="reportType === 'employee'">
          <el-row :gutter="20">
            <el-col :xs="24" :sm="12" :lg="6">
              <div class="stat-box">
                <div class="stat-value text-primary">{{ summary.totalEmployees }}</div>
                <div class="stat-label">总在职</div>
              </div>
            </el-col>
            <el-col :xs="24" :sm="12" :lg="6">
              <div class="stat-box">
                <div class="stat-value text-success">{{ summary.historyEmployees }}</div>
                <div class="stat-label">历史在职</div>
              </div>
            </el-col>
            <el-col :xs="24" :sm="12" :lg="6">
              <div class="stat-box">
                <div class="stat-value text-warning">{{ summary.newThisMonth }}</div>
                <div class="stat-label">入职</div>
              </div>
            </el-col>
            <el-col :xs="24" :sm="12" :lg="6">
              <div class="stat-box">
                <div class="stat-value text-danger">{{ summary.leftThisMonth }}</div>
                <div class="stat-label">离职</div>
              </div>
            </el-col>
          </el-row>
          <el-table :data="tableData" stripe class="mt-20">
            <el-table-column prop="company_name" label="企业" />
            <el-table-column prop="active_count" label="总在职" />
            <el-table-column prop="history_active_count" label="历史在职" />
            <el-table-column prop="joined_count" label="入职人数" />
            <el-table-column prop="left_count" label="离职人数" />
          </el-table>
        </div>

        <!-- 薪资统计 -->
        <div v-else-if="reportType === 'salary'">
          <el-row :gutter="20">
            <el-col :xs="24" :sm="12" :lg="6">
              <div class="stat-box">
                <div class="stat-value text-primary">¥{{ formatCurrency(summary.totalPayroll) }}</div>
                <div class="stat-label">期间实发总额</div>
              </div>
            </el-col>
            <el-col :xs="24" :sm="12" :lg="6">
              <div class="stat-box">
                <div class="stat-value text-success">¥{{ formatCurrency(summary.avgSalary) }}</div>
                <div class="stat-label">期间人均实发</div>
              </div>
            </el-col>
          </el-row>
          <el-tabs v-model="salaryView" class="mt-20">
            <el-tab-pane label="按天显示" name="daily" />
            <el-tab-pane label="按企业显示" name="company" />
          </el-tabs>
          <el-table :data="tableData" stripe class="mt-20">
            <el-table-column v-if="salaryView === 'daily'" prop="date" label="日期" />
            <el-table-column v-else prop="company_name" label="企业" />
            <el-table-column prop="gross_pay" label="应发工资" />
            <el-table-column prop="net_pay" label="实发工资" />
            <el-table-column prop="employee_count" label="人数" />
            <el-table-column prop="avg_pay" label="人均工资" />
          </el-table>
        </div>

        <!-- 财务报表 -->
        <div v-else>
          <el-row :gutter="20">
            <el-col :xs="24" :sm="12" :lg="6">
              <div class="stat-box">
                <div class="stat-value text-primary">¥{{ formatCurrency(summary.totalRevenue) }}</div>
                <div class="stat-label">营收</div>
              </div>
            </el-col>
            <el-col :xs="24" :sm="12" :lg="6">
              <div class="stat-box">
                <div class="stat-value text-warning">¥{{ formatCurrency(summary.totalSalaryCost) }}</div>
                <div class="stat-label">工资成本</div>
              </div>
            </el-col>
            <el-col :xs="24" :sm="12" :lg="6">
              <div class="stat-box">
                <div class="stat-value text-danger">¥{{ formatCurrency(summary.totalCost) }}</div>
                <div class="stat-label">其他成本</div>
              </div>
            </el-col>
            <el-col :xs="24" :sm="12" :lg="6">
              <div class="stat-box">
                <div class="stat-value" :class="summary.totalProfit >= 0 ? 'text-success' : 'text-danger'">¥{{ formatCurrency(summary.totalProfit) }}</div>
                <div class="stat-label">净利润</div>
              </div>
            </el-col>
          </el-row>
          <el-table :data="tableData" stripe class="mt-20">
            <el-table-column prop="company_name" label="企业" />
            <el-table-column prop="revenue" label="营收" />
            <el-table-column prop="salary_cost" label="工资成本" />
            <el-table-column prop="other_cost" label="其他成本" />
            <el-table-column prop="billable_hours" label="计费工时" />
            <el-table-column prop="profit" label="利润" />
          </el-table>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { statsApi } from '@/api/modules/stats';
import { companiesApi } from '@/api/modules/companies';
import { employeesApi } from '@/api/modules/employees';
import { financeApi } from '@/api/modules/finance';
import { loadXlsx } from '@/utils/loadXlsx';
import { useTableLoading } from '@/composables/useTableLoading';

type ReportType = 'recruitment' | 'employee' | 'salary' | 'finance';

const route = useRoute();
const router = useRouter();
const { loading, withLoading } = useTableLoading();
const reportType = ref<ReportType>('recruitment');
const salaryView = ref<'daily' | 'company'>('daily');
const tableData = ref<any[]>([]);
const salaryTableData = reactive({
  daily: [] as any[],
  company: [] as any[]
});

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultDateRange() {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  return [formatDate(monthStart), formatDate(today)];
}

function normalizeReportType(value?: string) {
  if (value === 'employee' || value === 'salary' || value === 'finance') {
    return value;
  }
  return 'recruitment';
}

function resolveReportTypeFromRoute() {
  if (route.path === '/finance-reports') {
    return 'finance' as ReportType;
  }

  const queryType = Array.isArray(route.query.type) ? route.query.type[0] : route.query.type;
  return normalizeReportType(typeof queryType === 'string' ? queryType : undefined);
}

function buildRouteForReportType(type: ReportType) {
  if (type === 'finance') {
    return {
      path: '/finance-reports',
      query: {}
    };
  }

  return {
    path: '/reports',
    query: type === 'recruitment' ? {} : { type }
  };
}

// 汇总数据
const summary = reactive({
  totalApplications: 0,
  passRate: 0,
  historyEmployees: 0,
  totalEmployees: 0,
  newThisMonth: 0,
  leftThisMonth: 0,
  totalPayroll: 0,
  avgSalary: 0,
  totalRevenue: 0,
  totalCost: 0,
  totalSalaryCost: 0,
  totalOtherCost: 0,
  totalProfit: 0
});

const filterForm = reactive({
  dateRange: getDefaultDateRange()
});

const companyNameMap = ref<Record<string, string>>({});

function resetSummary() {
  summary.totalApplications = 0;
  summary.passRate = 0;
  summary.historyEmployees = 0;
  summary.totalEmployees = 0;
  summary.newThisMonth = 0;
  summary.leftThisMonth = 0;
  summary.totalPayroll = 0;
  summary.avgSalary = 0;
  summary.totalRevenue = 0;
  summary.totalCost = 0;
  summary.totalSalaryCost = 0;
  summary.totalOtherCost = 0;
  summary.totalProfit = 0;
}

function getTargetMonth() {
  const [startDate, endDate] = filterForm.dateRange || [];
  if (startDate && endDate && startDate.slice(0, 7) === endDate.slice(0, 7)) {
    return {
      year: Number(startDate.slice(0, 4)),
      month: Number(startDate.slice(5, 7)),
      yearMonth: startDate.slice(0, 7)
    };
  }

  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    yearMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  };
}

function isWithinRange(dateText?: string) {
  const [startDate, endDate] = filterForm.dateRange || [];
  if (!startDate || !endDate || !dateText) return true;
  const normalized = normalizeDate(dateText);
  return normalized >= startDate && normalized <= endDate;
}

function formatCurrency(value?: number) {
  return (Number(value) || 0).toFixed(2);
}

function normalizeDate(dateText?: string) {
  if (!dateText) return '';
  const match = String(dateText).match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return '';
  return formatDate(parsed);
}

function getPreviousDate(dateText?: string) {
  const normalized = normalizeDate(dateText);
  if (!normalized) return '';
  const parsed = new Date(`${normalized}T00:00:00`);
  parsed.setDate(parsed.getDate() - 1);
  return formatDate(parsed);
}

function isActiveOnDate(joinDate?: string, leaveDate?: string, targetDate?: string) {
  if (!targetDate) return false;
  const normalizedJoinDate = normalizeDate(joinDate);
  const normalizedLeaveDate = normalizeDate(leaveDate);
  if (normalizedJoinDate && normalizedJoinDate > targetDate) return false;
  if (normalizedLeaveDate && normalizedLeaveDate < targetDate) return false;
  return true;
}

function isSalaryInRange(item: any, startDate?: string, endDate?: string) {
  const date = getSalaryDate(item);
  if (date) {
    if (startDate && date < startDate) return false;
    if (endDate && date > endDate) return false;
    return true;
  }

  const yearMonth = item.year_month || (item.year && item.month
    ? `${item.year}-${String(item.month).padStart(2, '0')}`
    : '');
  if (!yearMonth) return true;

  const startMonth = startDate?.slice(0, 7);
  const endMonth = endDate?.slice(0, 7);
  if (startMonth && yearMonth < startMonth) return false;
  if (endMonth && yearMonth > endMonth) return false;
  return true;
}

function getSalaryDate(item: any) {
  return normalizeDate(
    item.pay_date || item.approved_at || item.paid_at || item.updated_at || item.created_at
  ) || (item.year && item.month
    ? `${item.year}-${String(item.month).padStart(2, '0')}-01`
    : '');
}

function getEmployeeCompanyName(employee: any, companyId: string) {
  return employee.company_name || companyNameMap.value[companyId] || (companyId === 'unknown' ? '未分配企业' : companyId);
}

function getSalaryCompanyName(salary: any, companyId: string) {
  return salary.company_name || companyNameMap.value[companyId] || (companyId === 'unknown' ? '未分配企业' : companyId);
}

function applySalaryTableData() {
  tableData.value = salaryView.value === 'daily' ? salaryTableData.daily : salaryTableData.company;
}

async function loadCompanies() {
  const result = await companiesApi.getList({ page: 1, pageSize: 500 });
  companyNameMap.value = (result.list || []).reduce((acc: Record<string, string>, company: any) => {
    acc[company._id] = company.name || company.short_name || company._id;
    return acc;
  }, {});
}

async function loadData() {
  resetSummary();
  tableData.value = [];

  await withLoading(async () => {
    const [start_date, end_date] = filterForm.dateRange || [];
    const targetMonth = getTargetMonth();

    if (reportType.value === 'recruitment') {
      const trend = await statsApi.trend({ start_date, end_date });
      const stats = await statsApi.recruitment({ start_date, end_date });
      tableData.value = Object.entries(trend.trend || {})
        .sort(([dateA], [dateB]) => String(dateA).localeCompare(String(dateB)))
        .map(([date, applications]: any) => ({
        date,
        applications,
        interviews: 0,
        passed: 0,
        rejected: 0
        }));
      summary.totalApplications = stats.total || 0;
      summary.passRate = stats.byStatus?.passed ? Math.round((stats.byStatus.passed / (stats.total || 1)) * 100) : 0;
    } else if (reportType.value === 'employee') {
      const employeesResult = await employeesApi.getList({ page: 1, pageSize: 5000 });
      const employees = employeesResult.list || [];
      const historyDate = getPreviousDate(start_date);
      const grouped = employees.reduce((acc: Record<string, any>, employee: any) => {
        const companyId = employee.company_id || 'unknown';
        if (!acc[companyId]) {
          acc[companyId] = {
            company_name: getEmployeeCompanyName(employee, companyId),
            history_active_count: 0,
            active_count: 0,
            joined_count: 0,
            left_count: 0
          };
        }

        const joinDate = normalizeDate(employee.join_date);
        const leaveDate = normalizeDate(employee.leave_date || employee.departure_date);
        if (historyDate && isActiveOnDate(joinDate, leaveDate, historyDate)) {
          acc[companyId].history_active_count += 1;
        }
        if (isActiveOnDate(joinDate, leaveDate, end_date)) {
          acc[companyId].active_count += 1;
        }
        if (start_date && end_date && joinDate && joinDate >= start_date && joinDate <= end_date) {
          acc[companyId].joined_count += 1;
        }
        if (start_date && end_date && leaveDate && leaveDate >= start_date && leaveDate <= end_date) {
          acc[companyId].left_count += 1;
        }
        return acc;
      }, {});

      tableData.value = Object.values(grouped)
        .sort((a: any, b: any) => {
          if (b.active_count !== a.active_count) return b.active_count - a.active_count;
          return String(a.company_name).localeCompare(String(b.company_name));
        });
      summary.historyEmployees = tableData.value.reduce((sum, item: any) => sum + Number(item.history_active_count || 0), 0);
      summary.totalEmployees = tableData.value.reduce((sum, item: any) => sum + Number(item.active_count || 0), 0);
      summary.newThisMonth = tableData.value.reduce((sum, item: any) => sum + Number(item.joined_count || 0), 0);
      summary.leftThisMonth = tableData.value.reduce((sum, item: any) => sum + Number(item.left_count || 0), 0);
    } else if (reportType.value === 'salary') {
      const exportRes = await statsApi.export({ type: 'salaries' });
      const filteredSalaries = (exportRes || []).filter((salary: any) => isSalaryInRange(salary, start_date, end_date));
      const groupedByDate = filteredSalaries.reduce((acc: Record<string, any>, salary: any) => {
        const salaryDate = getSalaryDate(salary) || '未知日期';
        if (!acc[salaryDate]) {
          acc[salaryDate] = {
            date: salaryDate,
            gross_pay: 0,
            net_pay: 0,
            employee_count: 0,
            avg_pay: 0,
            _employeeSet: new Set<string>()
          };
        }
        acc[salaryDate].gross_pay += Number(salary.gross_pay || salary.total_amount || 0);
        acc[salaryDate].net_pay += Number(salary.net_pay || salary.total_amount || 0);
        if (salary.employee_id) {
          acc[salaryDate]._employeeSet.add(salary.employee_id);
        }
        acc[salaryDate].employee_count = acc[salaryDate]._employeeSet.size || acc[salaryDate].employee_count + 1;
        acc[salaryDate].avg_pay = acc[salaryDate].employee_count > 0 ? acc[salaryDate].net_pay / acc[salaryDate].employee_count : 0;
        return acc;
      }, {});

      const groupedByCompany = filteredSalaries.reduce((acc: Record<string, any>, salary: any) => {
        const companyId = salary.company_id || 'unknown';
        if (!acc[companyId]) {
          acc[companyId] = {
            company_name: getSalaryCompanyName(salary, companyId),
            gross_pay: 0,
            net_pay: 0,
            employee_count: 0,
            avg_pay: 0,
            _employeeSet: new Set<string>()
          };
        }

        acc[companyId].gross_pay += Number(salary.gross_pay || salary.total_amount || 0);
        acc[companyId].net_pay += Number(salary.net_pay || salary.total_amount || 0);
        if (salary.employee_id) {
          acc[companyId]._employeeSet.add(salary.employee_id);
        }
        acc[companyId].employee_count = acc[companyId]._employeeSet.size || acc[companyId].employee_count + 1;
        acc[companyId].avg_pay = acc[companyId].employee_count > 0 ? acc[companyId].net_pay / acc[companyId].employee_count : 0;
        return acc;
      }, {});

      salaryTableData.daily = Object.values(groupedByDate)
        .map((item: any) => ({
          date: item.date,
          gross_pay: formatCurrency(item.gross_pay),
          net_pay: formatCurrency(item.net_pay),
          employee_count: item.employee_count,
          avg_pay: formatCurrency(item.avg_pay)
        }))
        .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)));

      salaryTableData.company = Object.values(groupedByCompany)
        .map((item: any) => ({
          company_name: item.company_name,
          gross_pay: formatCurrency(item.gross_pay),
          net_pay: formatCurrency(item.net_pay),
          employee_count: item.employee_count,
          avg_pay: formatCurrency(item.avg_pay)
        }))
        .sort((a: any, b: any) => Number(String(b.net_pay)) - Number(String(a.net_pay)));

      applySalaryTableData();

      const employeeSet = new Set(filteredSalaries.map((salary: any) => salary.employee_id).filter(Boolean));
      summary.totalPayroll = filteredSalaries.reduce((sum: number, salary: any) => sum + Number(salary.net_pay || salary.total_amount || 0), 0);
      summary.avgSalary = employeeSet.size ? summary.totalPayroll / employeeSet.size : 0;
    } else {
      const finance = await financeApi.getFinanceSummary({ start_date, end_date, company_id: undefined });
      tableData.value = (finance.list || []).map((item: any) => ({
        company_name: item.company_name || item.company_id,
        revenue: formatCurrency(item.revenue),
        salary_cost: formatCurrency(item.salary_cost),
        other_cost: formatCurrency(item.other_cost),
        billable_hours: Number(item.billable_hours || 0).toFixed(2),
        profit: formatCurrency(item.profit)
      }));
      summary.totalRevenue = finance.summary?.totalRevenue || 0;
      summary.totalSalaryCost = finance.summary?.totalSalaryCost || 0;
      summary.totalOtherCost = finance.summary?.totalOtherCost || 0;
      summary.totalCost = summary.totalOtherCost;
      summary.totalProfit = finance.summary?.totalProfit || 0;
    }
  });
}

async function handleExport() {
  try {
    const rows = tableData.value || [];
    if (!rows.length) {
      ElMessage.warning('暂无可导出的数据');
      return;
    }

    const XLSX = await loadXlsx();
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '报表');
    XLSX.writeFile(wb, `report_${reportType.value}.xlsx`);
  } catch {
    ElMessage.error('导出失败');
  }
}

onMounted(async () => {
  if (route.path === '/reports' && route.query.type === 'finance') {
    await router.replace('/finance-reports');
    return;
  }
  reportType.value = resolveReportTypeFromRoute();
  await loadCompanies();
  await loadData();
});

watch(() => [route.path, route.query.type], () => {
  if (route.path === '/reports' && route.query.type === 'finance') {
    router.replace('/finance-reports');
    return;
  }

  const nextType = resolveReportTypeFromRoute();
  if (reportType.value !== nextType) {
    reportType.value = nextType;
    return;
  }

  loadData();
});

watch(reportType, async (nextType) => {
  const currentType = resolveReportTypeFromRoute();
  if (nextType !== currentType) {
    await router.replace(buildRouteForReportType(nextType));
    return;
  }

  loadData();
});

watch(salaryView, () => {
  if (reportType.value === 'salary') {
    applySalaryTableData();
  }
});
</script>

<style scoped lang="scss">
.reports-page {
  .report-type-selector {
    display: flex;
    justify-content: center;
    margin-bottom: 16px;
  }

  .mt-20 {
    margin-top: 20px;
  }

  .stat-box {
    background: #f5f5f5;
    border-radius: 8px;
    padding: 24px;
    text-align: center;

    .stat-value {
      font-size: 32px;
      font-weight: 600;
    }

    .stat-label {
      font-size: 14px;
      color: #999;
      margin-top: 8px;
    }
  }

  .text-primary {
    color: var(--primary-color);
  }

  .text-success {
    color: var(--success-color);
  }

  .text-warning {
    color: var(--warning-color);
  }

  .text-danger {
    color: var(--danger-color);
  }
}
</style>
