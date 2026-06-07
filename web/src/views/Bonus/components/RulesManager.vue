<template>
  <div class="rules-manager">
    <el-card class="rules-tip-card">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="规则匹配顺序：推荐人+企业 > 推荐人 > 企业 > 全局默认；月份必须命中生效区间，同层再按优先级从高到低匹配。"
      />
    </el-card>

    <el-card class="rules-toolbar-card">
      <el-form :model="filterForm" inline>
        <el-form-item label="推荐人">
          <el-select v-model="filterForm.recommender_id" placeholder="全部推荐人" clearable filterable style="width: 220px;">
            <el-option v-for="item in hrUsers" :key="item._id" :label="item.name" :value="item._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="企业">
          <el-select v-model="filterForm.company_id" placeholder="全部企业" clearable filterable style="width: 220px;">
            <el-option v-for="item in companies" :key="item._id" :label="item.name" :value="item._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="层级">
          <el-select v-model="filterForm.scope" placeholder="全部层级" clearable style="width: 160px;">
            <el-option label="推荐人+企业" value="recommender_company" />
            <el-option label="推荐人" value="recommender" />
            <el-option label="企业" value="company" />
            <el-option label="全局默认" value="global" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filterForm.status" placeholder="全部状态" clearable style="width: 140px;">
            <el-option label="启用" value="active" />
            <el-option label="停用" value="disabled" />
          </el-select>
        </el-form-item>
        <el-form-item label="命中日期">
          <el-date-picker
            v-model="filterForm.target_date"
            type="date"
            placeholder="全部日期"
            format="YYYY年MM月DD日"
            value-format="YYYY-MM-DD"
            style="width: 160px;"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
          <el-button type="success" @click="openDialog()">新增规则</el-button>
          <el-button :disabled="!selectedRuleIds.length" @click="openCopyDialog">规则复制</el-button>
          <el-button :disabled="!selectedRuleIds.length" @click="openBatchCoefficientDialog">批量改规则值</el-button>
          <el-button :disabled="!selectedRuleIds.length" @click="openRenewDialog">按日期续期</el-button>
          <el-button type="warning" @click="openGenerateDialog">生成正式规则</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card>
      <el-table v-loading="loading" :data="filteredRules" stripe @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="48" />
        <el-table-column label="层级" width="130">
          <template #default="{ row }">
            <el-tag :type="getScopeTagType(row.scope)">{{ getScopeLabel(row.scope) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="recommender_name" label="推荐人" min-width="150">
          <template #default="{ row }">{{ row.recommender_name || '全部推荐人' }}</template>
        </el-table-column>
        <el-table-column prop="company_name" label="企业" min-width="180">
          <template #default="{ row }">{{ row.company_name || '全部企业' }}</template>
        </el-table-column>
        <el-table-column prop="calculation_mode" label="计提方式" width="140">
          <template #default="{ row }">{{ getCalculationModeLabel(row.calculation_mode) }}</template>
        </el-table-column>
        <el-table-column label="规则值" width="120">
          <template #default="{ row }">{{ formatRuleValue(row) }}</template>
        </el-table-column>
        <el-table-column label="提成周期" width="120">
          <template #default="{ row }">{{ getPeriodLabel(row) }}</template>
        </el-table-column>
        <el-table-column prop="start_date" label="生效开始" width="120" />
        <el-table-column prop="end_date" label="生效结束" width="120">
          <template #default="{ row }">{{ row.end_date || '长期' }}</template>
        </el-table-column>
        <el-table-column prop="priority" label="优先级" width="90" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">{{ row.status === 'active' ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="220" show-overflow-tooltip />
        <el-table-column label="更新时间" width="190">
          <template #default="{ row }"><BeijingDateTime :value="row.updated_at || row.created_at" /></template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>

        <template #empty>
          <el-empty description="暂无提成规则" />
        </template>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="620px">
      <el-form label-width="110px">
        <el-form-item label="规则层级" required>
          <el-radio-group v-model="form.scope" @change="handleScopeChange">
            <el-radio label="recommender_company">推荐人+企业</el-radio>
            <el-radio label="recommender">推荐人</el-radio>
            <el-radio label="company">企业</el-radio>
            <el-radio label="global">全局默认</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="needsRecommender(form.scope)" label="推荐人" required>
          <el-select v-model="form.recommender_id" placeholder="选择推荐人" filterable clearable>
            <el-option v-for="item in hrUsers" :key="item._id" :label="item.name" :value="item._id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="needsCompany(form.scope)" label="企业" required>
          <el-select v-model="form.company_id" placeholder="选择企业" filterable clearable>
            <el-option v-for="item in companies" :key="item._id" :label="item.name" :value="item._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="计提方式" required>
          <el-radio-group v-model="form.calculation_mode">
            <el-radio v-for="item in BONUS_CALCULATION_MODE_OPTIONS" :key="item.value" :label="item.value">{{ item.label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="getRuleValueLabel(form.calculation_mode)" required>
          <el-input-number v-model="form.rule_value" :min="0" :precision="2" :step="0.1" />
          <div class="field-tip">{{ getRuleValueTip(form.calculation_mode) }}</div>
        </el-form-item>
        <el-form-item label="提成周期" required>
          <el-select v-model="form.period_option" placeholder="选择提成周期" style="width: 220px;" @change="handlePeriodOptionChange">
            <el-option v-for="item in BONUS_PERIOD_OPTIONS" :key="`${item.value}-${item.months}`" :label="item.label" :value="String(item.months || 0)" />
            <el-option label="自定义月数" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.period_option === 'custom'" label="周期月数" required>
          <el-input-number v-model="form.bonus_period_months" :min="1" :precision="0" :step="1" />
          <div class="field-tip">按员工入职日期起算，满对应月数后停止提成。</div>
        </el-form-item>
        <el-form-item label="生效开始" required>
          <el-date-picker
            v-model="form.start_date"
            type="date"
            placeholder="选择生效日期"
            format="YYYY年MM月DD日"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="生效结束">
          <el-date-picker
            v-model="form.end_date"
            type="date"
            placeholder="不填表示长期"
            format="YYYY年MM月DD日"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="优先级">
          <el-input-number v-model="form.priority" :min="0" :step="10" />
          <div class="field-tip">推荐：推荐人+企业 300，推荐人 200，企业 100，全局 0</div>
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio label="active">启用</el-radio>
            <el-radio label="disabled">停用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" maxlength="100" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="generatorVisible" title="生成正式规则" width="700px">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="会按当前在职员工实际存在的 推荐人+企业 组合生成正式规则，可选同时清理初始化兜底规则。"
      />
      <el-form label-width="130px" class="generator-form">
        <el-form-item label="推荐人范围">
          <el-select v-model="generatorForm.recommender_ids" multiple collapse-tags collapse-tags-tooltip filterable clearable placeholder="默认全部推荐人">
            <el-option v-for="item in hrUsers" :key="item._id" :label="item.name" :value="item._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="企业范围">
          <el-select v-model="generatorForm.company_ids" multiple collapse-tags collapse-tags-tooltip filterable clearable placeholder="默认全部企业">
            <el-option v-for="item in companies" :key="item._id" :label="item.name" :value="item._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="默认计提方式" required>
          <el-radio-group v-model="generatorForm.calculation_mode">
            <el-radio v-for="item in BONUS_CALCULATION_MODE_OPTIONS" :key="item.value" :label="item.value">{{ item.label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="getRuleValueLabel(generatorForm.calculation_mode)" required>
          <el-input-number v-model="generatorForm.rule_value" :min="0" :precision="2" :step="0.1" />
          <div class="field-tip">{{ getRuleValueTip(generatorForm.calculation_mode) }}</div>
        </el-form-item>
        <el-form-item label="提成周期" required>
          <el-select v-model="generatorForm.period_option" placeholder="选择提成周期" style="width: 220px;" @change="handleGeneratorPeriodOptionChange">
            <el-option v-for="item in BONUS_PERIOD_OPTIONS" :key="`generator-${item.value}-${item.months}`" :label="item.label" :value="String(item.months || 0)" />
            <el-option label="自定义月数" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="generatorForm.period_option === 'custom'" label="周期月数" required>
          <el-input-number v-model="generatorForm.bonus_period_months" :min="1" :precision="0" :step="1" />
          <div class="field-tip">按员工入职日期起算的提成持续月数。</div>
        </el-form-item>
        <el-form-item label="生效开始" required>
          <el-date-picker
            v-model="generatorForm.start_date"
            type="date"
            placeholder="选择生效日期"
            format="YYYY年MM月DD日"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="生效结束">
          <el-date-picker
            v-model="generatorForm.end_date"
            type="date"
            placeholder="不填表示长期"
            format="YYYY年MM月DD日"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="处理策略">
          <el-checkbox v-model="generatorForm.replace_existing">覆盖同范围同月份已有正式规则</el-checkbox>
          <el-checkbox v-model="generatorForm.delete_fallback">删除系统默认兜底规则</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="generatorVisible = false">取消</el-button>
        <el-button type="primary" :loading="generating" @click="handleGenerate">开始生成</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="copyVisible" title="规则复制" width="560px">
      <el-form label-width="120px">
        <el-form-item label="已选规则">
          <span>{{ selectedRuleIds.length }} 条</span>
        </el-form-item>
        <el-form-item label="复制到开始日" required>
          <el-date-picker v-model="copyForm.start_date" type="date" placeholder="选择开始日期" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="复制到结束日">
          <el-date-picker v-model="copyForm.end_date" type="date" placeholder="不填表示长期" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="处理策略">
          <el-checkbox v-model="copyForm.replace_existing">覆盖同范围同月份规则</el-checkbox>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="copyForm.remark" type="textarea" :rows="2" maxlength="100" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="copyVisible = false">取消</el-button>
        <el-button type="primary" :loading="copying" @click="handleCopyRules">开始复制</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchCoefficientVisible" title="批量改规则值" width="520px">
      <el-form label-width="120px">
        <el-form-item label="已选规则">
          <span>{{ selectedRuleIds.length }} 条</span>
        </el-form-item>
        <el-form-item label="计提方式">
          <span>{{ getCalculationModeLabel(batchCoefficientMode) }}</span>
        </el-form-item>
        <el-form-item :label="getRuleValueLabel(batchCoefficientMode)" required>
          <el-input-number v-model="batchCoefficientForm.rule_value" :min="0" :precision="2" :step="0.1" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="batchCoefficientForm.remark" type="textarea" :rows="2" maxlength="100" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchCoefficientVisible = false">取消</el-button>
        <el-button type="primary" :loading="updatingCoefficient" @click="handleBatchCoefficient">开始更新</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="renewVisible" title="按日期续期" width="560px">
      <el-form label-width="120px">
        <el-form-item label="已选规则">
          <span>{{ selectedRuleIds.length }} 条</span>
        </el-form-item>
        <el-form-item label="续期开始日" required>
          <el-date-picker v-model="renewForm.start_date" type="date" placeholder="选择开始日期" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="续期结束日">
          <el-date-picker v-model="renewForm.end_date" type="date" placeholder="不填表示长期" format="YYYY年MM月DD日" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="处理策略">
          <el-checkbox v-model="renewForm.replace_existing">覆盖同范围同月份规则</el-checkbox>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="renewForm.remark" type="textarea" :rows="2" maxlength="100" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renewVisible = false">取消</el-button>
        <el-button type="primary" :loading="renewing" @click="handleRenewRules">开始续期</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  BONUS_CALCULATION_MODE_OPTIONS,
  BONUS_PERIOD_OPTIONS,
  bonusApi,
  getBonusCalculationModeLabel,
  getBonusPeriodLabel,
  getBonusRuleValue,
  type BonusCalculationMode,
  type BonusPeriodType,
  type BonusRule
} from '@/api/modules/bonus';
import { companiesApi } from '@/api/modules/companies';
import { usersApi } from '@/api/modules/users';
import { getTodayBeijing } from '@/utils/format';
import BeijingDateTime from '@/components/common/BeijingDateTime.vue';
import { normalizeReferrerUsers } from '@/utils/referrerUsers';
import { useTableLoading } from '@/composables/useTableLoading';

type RuleScope = 'global' | 'company' | 'recommender' | 'recommender_company';
type RuleFormState = {
  _id: string;
  scope: RuleScope;
  recommender_id: string;
  recommender_name: string;
  company_id: string;
  company_name: string;
  calculation_mode: BonusCalculationMode;
  rule_value: number;
  bonus_period_type: BonusPeriodType;
  bonus_period_months: number;
  period_option: string;
  start_date: string;
  end_date: string;
  priority: number;
  status: BonusRule['status'];
  remark: string;
};

const { loading, withLoading } = useTableLoading();
const saving = ref(false);
const generating = ref(false);
const copying = ref(false);
const updatingCoefficient = ref(false);
const renewing = ref(false);
const dialogVisible = ref(false);
const generatorVisible = ref(false);
const copyVisible = ref(false);
const batchCoefficientVisible = ref(false);
const renewVisible = ref(false);
const hrUsers = ref<Array<{ _id: string; name: string }>>([]);
const companies = ref<Array<{ _id: string; name: string }>>([]);
const rules = ref<BonusRule[]>([]);
const selectedRuleIds = ref<string[]>([]);

const filterForm = reactive({
  recommender_id: '',
  company_id: '',
  scope: '' as '' | RuleScope,
  status: '' as '' | BonusRule['status'],
  target_date: ''
});

const form = reactive<RuleFormState>({
  _id: '',
  scope: 'recommender_company',
  recommender_id: '',
  recommender_name: '',
  company_id: '',
  company_name: '',
  calculation_mode: 'hourly',
  rule_value: 1,
  bonus_period_type: 'long_term',
  bonus_period_months: 0,
  period_option: '0',
  start_date: getTodayBeijing(),
  end_date: '',
  priority: 300,
  status: 'active',
  remark: ''
});

const generatorForm = reactive({
  recommender_ids: [] as string[],
  company_ids: [] as string[],
  calculation_mode: 'hourly' as BonusCalculationMode,
  rule_value: 1,
  bonus_period_type: 'long_term' as BonusPeriodType,
  bonus_period_months: 0,
  period_option: '0',
  start_date: getTodayBeijing(),
  end_date: '',
  replace_existing: true,
  delete_fallback: true
});

const copyForm = reactive({
  start_date: getTodayBeijing(),
  end_date: '',
  replace_existing: false,
  remark: ''
});

const batchCoefficientForm = reactive({
  rule_value: 1,
  remark: ''
});

const renewForm = reactive({
  start_date: getTodayBeijing(),
  end_date: '',
  replace_existing: false,
  remark: ''
});

const dialogTitle = computed(() => (form._id ? '编辑提成规则' : '新增提成规则'));
const selectedRules = computed(() => ruleList.value.filter((item) => selectedRuleIds.value.includes(item._id || '')));
const selectedCalculationModes = computed(() => Array.from(new Set(selectedRules.value.map((item) => item.calculation_mode || 'hourly'))));
const batchCoefficientMode = computed<BonusCalculationMode>(() => (selectedCalculationModes.value[0] || 'hourly') as BonusCalculationMode);

const ruleList = computed(() => {
  const recommenderMap = new Map(hrUsers.value.map((item) => [item._id, item.name]));
  const companyMap = new Map(companies.value.map((item) => [item._id, item.name]));
  return (rules.value || []).map((item) => ({
    ...item,
    scope: (item.scope || getRuleScope(item)) as RuleScope,
    recommender_name: item.recommender_name || recommenderMap.get(item.recommender_id || '') || '',
    company_name: item.company_name || companyMap.get(item.company_id || '') || ''
  }));
});

const filteredRules = computed(() => {
  return ruleList.value.filter((item) => {
    if (filterForm.recommender_id && item.recommender_id !== filterForm.recommender_id) return false;
    if (filterForm.company_id && item.company_id !== filterForm.company_id) return false;
    if (filterForm.scope && item.scope !== filterForm.scope) return false;
    if (filterForm.status && item.status !== filterForm.status) return false;
    if (filterForm.target_date) {
      if (!item.start_date || item.start_date > filterForm.target_date) return false;
      if (item.end_date && item.end_date < filterForm.target_date) return false;
    }
    return true;
  }).sort((left, right) => {
    if (left.priority !== right.priority) return right.priority - left.priority;
    if ((left.start_date || '') !== (right.start_date || '')) return String(right.start_date || '').localeCompare(String(left.start_date || ''));
    return getScopeLabel(left.scope as RuleScope).localeCompare(getScopeLabel(right.scope as RuleScope), 'zh-CN');
  });
});

function getSuggestedPriority(scope: RuleScope) {
  const map: Record<RuleScope, number> = {
    recommender_company: 300,
    recommender: 200,
    company: 100,
    global: 0
  };
  return map[scope];
}

function getRuleScope(rule: Partial<BonusRule>) {
  const hasRecommender = !!String(rule.recommender_id || '').trim();
  const hasCompany = !!String(rule.company_id || '').trim();
  if (hasRecommender && hasCompany) return 'recommender_company';
  if (hasRecommender) return 'recommender';
  if (hasCompany) return 'company';
  return 'global';
}

function getScopeLabel(scope: RuleScope) {
  const map: Record<RuleScope, string> = {
    recommender_company: '推荐人+企业',
    recommender: '推荐人',
    company: '企业',
    global: '全局默认'
  };
  return map[scope] || scope;
}

function getScopeTagType(scope: RuleScope): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<RuleScope, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    recommender_company: 'success',
    recommender: 'warning',
    company: 'info',
    global: 'danger'
  };
  return map[scope] || '';
}

function getCalculationModeLabel(mode: BonusCalculationMode) {
  return getBonusCalculationModeLabel(mode);
}

function getRuleValueLabel(mode: BonusCalculationMode) {
  if (mode === 'service_fee') return '月管理费';
  if (mode === 'gross_salary') return '应发工资比例(%)';
  return '小时系数';
}

function getRuleValueTip(mode: BonusCalculationMode) {
  if (mode === 'service_fee') return '按甲方每月管理费计算，完整在职按全额计提，不完整在职按有效在职天数比例折算。';
  if (mode === 'gross_salary') return '按人员当月应发工资的百分比计算提成，例如填 5 表示提 5%。';
  return '按当月有效工时乘以小时系数计算提成。';
}

function getPeriodLabel(rule: Pick<BonusRule, 'bonus_period_type' | 'bonus_period_months'>) {
  return getBonusPeriodLabel(rule);
}

function resolvePeriodOption(type: BonusPeriodType, months: number) {
  if (type !== 'fixed_months' || months <= 0) return '0';
  if ([3, 6, 12].includes(months)) return String(months);
  return 'custom';
}

function handlePeriodOptionChange(value: string) {
  if (value === 'custom') {
    form.bonus_period_type = 'fixed_months';
    form.bonus_period_months = Math.max(1, Number(form.bonus_period_months || 1));
    return;
  }
  const months = Number(value || 0);
  if (months > 0) {
    form.bonus_period_type = 'fixed_months';
    form.bonus_period_months = months;
  } else {
    form.bonus_period_type = 'long_term';
    form.bonus_period_months = 0;
  }
}

function handleGeneratorPeriodOptionChange(value: string) {
  if (value === 'custom') {
    generatorForm.bonus_period_type = 'fixed_months';
    generatorForm.bonus_period_months = Math.max(1, Number(generatorForm.bonus_period_months || 1));
    return;
  }
  const months = Number(value || 0);
  if (months > 0) {
    generatorForm.bonus_period_type = 'fixed_months';
    generatorForm.bonus_period_months = months;
  } else {
    generatorForm.bonus_period_type = 'long_term';
    generatorForm.bonus_period_months = 0;
  }
}

function formatRuleValue(rule: BonusRule) {
  const value = getBonusRuleValue(rule);
  if (rule.calculation_mode === 'hourly') return value.toFixed(2);
  if (rule.calculation_mode === 'service_fee') return `¥${value.toFixed(2)}`;
  return `${value.toFixed(2)}%`;
}

function needsRecommender(scope: RuleScope) {
  return scope === 'recommender' || scope === 'recommender_company';
}

function needsCompany(scope: RuleScope) {
  return scope === 'company' || scope === 'recommender_company';
}

function resetForm() {
  form._id = '';
  form.scope = 'recommender_company';
  form.recommender_id = '';
  form.recommender_name = '';
  form.company_id = '';
  form.company_name = '';
  form.calculation_mode = 'hourly';
  form.rule_value = 1;
  form.bonus_period_type = 'long_term';
  form.bonus_period_months = 0;
  form.period_option = '0';
  form.start_date = getTodayBeijing();
  form.end_date = '';
  form.priority = getSuggestedPriority('recommender_company');
  form.status = 'active';
  form.remark = '';
}

function handleScopeChange(scope: RuleScope) {
  if (!needsRecommender(scope)) {
    form.recommender_id = '';
    form.recommender_name = '';
  }
  if (!needsCompany(scope)) {
    form.company_id = '';
    form.company_name = '';
  }
  form.priority = getSuggestedPriority(scope);
}

async function loadOptions() {
  const [userRes, companyRes] = await Promise.all([
    usersApi.getList({ page: 1, pageSize: 500 }),
    companiesApi.getList({ page: 1, pageSize: 500 })
  ]);
  hrUsers.value = normalizeReferrerUsers(userRes.list || []) as Array<{ _id: string; name: string }>;
  companies.value = (companyRes.list || []).map((item: any) => ({ _id: item._id, name: item.name }));
}

async function loadRules() {
  await withLoading(async () => {
    rules.value = await bonusApi.listRules(filterForm.status ? { status: filterForm.status } : {});
  });
}

function handleSearch() {
  loadRules();
}

function handleSelectionChange(rows: BonusRule[]) {
  selectedRuleIds.value = rows.map((item) => item._id || '').filter(Boolean);
}

function handleReset() {
  filterForm.recommender_id = '';
  filterForm.company_id = '';
  filterForm.scope = '';
  filterForm.status = '';
  filterForm.target_date = '';
  loadRules();
}

function openDialog(rule?: BonusRule) {
  if (!rule) {
    resetForm();
  } else {
    form._id = rule._id || '';
    form.scope = (rule.scope || getRuleScope(rule)) as RuleScope;
    form.recommender_id = rule.recommender_id || '';
    form.recommender_name = rule.recommender_name || '';
    form.company_id = rule.company_id || '';
    form.company_name = rule.company_name || '';
    form.calculation_mode = rule.calculation_mode || 'hourly';
    form.rule_value = getBonusRuleValue(rule);
    form.bonus_period_type = rule.bonus_period_type || 'long_term';
    form.bonus_period_months = Number(rule.bonus_period_months || 0);
    form.period_option = resolvePeriodOption(form.bonus_period_type, form.bonus_period_months);
    form.start_date = rule.start_date || '';
    form.end_date = rule.end_date || '';
    form.priority = Number(rule.priority || getSuggestedPriority(form.scope));
    form.status = rule.status || 'active';
    form.remark = rule.remark || '';
  }
  dialogVisible.value = true;
}

function validateRuleForm() {
  if (needsRecommender(form.scope) && !form.recommender_id) throw new Error('请选择推荐人');
  if (needsCompany(form.scope) && !form.company_id) throw new Error('请选择企业');
  if (!form.start_date) throw new Error('请选择生效开始日期');
  if (form.end_date && form.end_date < form.start_date) throw new Error('生效结束日期不能早于开始日期');
  if (form.bonus_period_type === 'fixed_months' && Number(form.bonus_period_months) <= 0) throw new Error('周期月数必须大于 0');
  if (Number(form.rule_value) < 0) throw new Error('规则值不能小于 0');
}

async function handleSubmit() {
  try {
    validateRuleForm();
  } catch (err: any) {
    ElMessage.warning(err.message || '请完善规则信息');
    return;
  }

  saving.value = true;
  try {
    const recommenderName = hrUsers.value.find((item) => item._id === form.recommender_id)?.name || '';
    const companyName = companies.value.find((item) => item._id === form.company_id)?.name || '';
    await bonusApi.saveRule({
      _id: form._id || undefined,
      scope: form.scope,
      recommender_id: needsRecommender(form.scope) ? form.recommender_id : '',
      recommender_name: needsRecommender(form.scope) ? recommenderName : '',
      company_id: needsCompany(form.scope) ? form.company_id : '',
      company_name: needsCompany(form.scope) ? companyName : '',
      calculation_mode: form.calculation_mode,
      hourly_coefficient: form.calculation_mode === 'hourly' ? Number(form.rule_value || 0) : 0,
      service_fee_rate: form.calculation_mode === 'service_fee' ? Number(form.rule_value || 0) : 0,
      gross_salary_rate: form.calculation_mode === 'gross_salary' ? Number(form.rule_value || 0) : 0,
      bonus_period_type: form.bonus_period_type,
      bonus_period_months: form.bonus_period_type === 'fixed_months' ? Number(form.bonus_period_months || 0) : 0,
      start_date: form.start_date,
      end_date: form.end_date || '',
      priority: Number(form.priority || 0),
      status: form.status,
      remark: form.remark
    });
    ElMessage.success(form._id ? '规则更新成功' : '规则创建成功');
    dialogVisible.value = false;
    await loadRules();
  } catch (err: any) {
    console.error('保存提成规则失败:', err);
    ElMessage.error(err?.message || '保存提成规则失败');
  } finally {
    saving.value = false;
  }
}

async function handleDelete(rule: BonusRule) {
  try {
    await ElMessageBox.confirm(`确定删除规则「${getScopeLabel((rule.scope || getRuleScope(rule)) as RuleScope)} / ${rule.recommender_name || '全部推荐人'} / ${rule.company_name || '全部企业'}」吗？`, '提示', { type: 'warning' });
    await bonusApi.deleteRule(rule._id || '');
    ElMessage.success('规则删除成功');
    await loadRules();
  } catch (err) {
    if (err !== 'cancel') console.error('删除提成规则失败:', err);
  }
}

function openGenerateDialog() {
  generatorForm.start_date = filterForm.target_date || getTodayBeijing();
  generatorForm.end_date = '';
  generatorForm.calculation_mode = 'hourly';
  generatorForm.rule_value = 1;
  generatorForm.bonus_period_type = 'long_term';
  generatorForm.bonus_period_months = 0;
  generatorForm.period_option = '0';
  generatorVisible.value = true;
}

function openCopyDialog() {
  copyForm.start_date = filterForm.target_date || getTodayBeijing();
  copyForm.end_date = '';
  copyForm.replace_existing = false;
  copyForm.remark = '';
  copyVisible.value = true;
}

function openBatchCoefficientDialog() {
  if (selectedCalculationModes.value.length > 1) {
    ElMessage.warning('批量更新前请先选择同一计提方式的规则');
    return;
  }
  batchCoefficientForm.rule_value = 1;
  batchCoefficientForm.remark = '';
  batchCoefficientVisible.value = true;
}

function openRenewDialog() {
  renewForm.start_date = filterForm.target_date || getTodayBeijing();
  renewForm.end_date = '';
  renewForm.replace_existing = false;
  renewForm.remark = '';
  renewVisible.value = true;
}

async function handleGenerate() {
  if (!generatorForm.start_date) {
    ElMessage.warning('请选择生效开始日期');
    return;
  }
  if (generatorForm.end_date && generatorForm.end_date < generatorForm.start_date) {
    ElMessage.warning('生效结束日期不能早于开始日期');
    return;
  }
  if (generatorForm.bonus_period_type === 'fixed_months' && Number(generatorForm.bonus_period_months) <= 0) {
    ElMessage.warning('周期月数必须大于 0');
    return;
  }

  generating.value = true;
  try {
    const result = await bonusApi.generateFormalRules({
      start_date: generatorForm.start_date,
      end_date: generatorForm.end_date || undefined,
      calculation_mode: generatorForm.calculation_mode,
      hourly_coefficient: generatorForm.calculation_mode === 'hourly' ? Number(generatorForm.rule_value || 0) : 0,
      service_fee_rate: generatorForm.calculation_mode === 'service_fee' ? Number(generatorForm.rule_value || 0) : 0,
      gross_salary_rate: generatorForm.calculation_mode === 'gross_salary' ? Number(generatorForm.rule_value || 0) : 0,
      bonus_period_type: generatorForm.bonus_period_type,
      bonus_period_months: generatorForm.bonus_period_type === 'fixed_months' ? Number(generatorForm.bonus_period_months || 0) : 0,
      recommender_ids: generatorForm.recommender_ids,
      company_ids: generatorForm.company_ids,
      replace_existing: generatorForm.replace_existing,
      delete_fallback: generatorForm.delete_fallback
    });
    ElMessage.success(`正式规则生成完成：新增 ${result.created} 条，更新 ${result.updated} 条，清理兜底 ${result.deleted_fallback} 条，覆盖组合 ${result.pair_count} 个`);
    generatorVisible.value = false;
    await loadRules();
  } catch (err: any) {
    console.error('生成正式规则失败:', err);
    ElMessage.error(err?.message || '生成正式规则失败');
  } finally {
    generating.value = false;
  }
}

async function handleCopyRules() {
  if (!selectedRuleIds.value.length) {
    ElMessage.warning('请先选择规则');
    return;
  }
  if (!copyForm.start_date) {
    ElMessage.warning('请选择复制开始日期');
    return;
  }
  if (copyForm.end_date && copyForm.end_date < copyForm.start_date) {
    ElMessage.warning('复制结束日期不能早于开始日期');
    return;
  }

  copying.value = true;
  try {
    const result = await bonusApi.copyRules({
      rule_ids: selectedRuleIds.value,
      start_date: copyForm.start_date,
      end_date: copyForm.end_date || undefined,
      replace_existing: copyForm.replace_existing,
      remark: copyForm.remark || undefined
    });
    ElMessage.success(`规则复制完成：新增 ${result.created} 条，更新 ${result.updated} 条，跳过 ${result.skipped} 条`);
    copyVisible.value = false;
    await loadRules();
  } catch (err: any) {
    console.error('规则复制失败:', err);
    ElMessage.error(err?.message || '规则复制失败');
  } finally {
    copying.value = false;
  }
}

async function handleBatchCoefficient() {
  if (!selectedRuleIds.value.length) {
    ElMessage.warning('请先选择规则');
    return;
  }
  if (selectedCalculationModes.value.length > 1) {
    ElMessage.warning('批量更新仅支持同一计提方式的规则');
    return;
  }
  if (Number(batchCoefficientForm.rule_value) < 0) {
    ElMessage.warning('规则值不能小于 0');
    return;
  }

  updatingCoefficient.value = true;
  try {
    const result = await bonusApi.batchUpdateCoefficient({
      rule_ids: selectedRuleIds.value,
      calculation_mode: batchCoefficientMode.value,
      rule_value: Number(batchCoefficientForm.rule_value || 0),
      remark: batchCoefficientForm.remark || undefined
    });
    ElMessage.success(`批量更新规则值完成：更新 ${result.updated} 条规则`);
    batchCoefficientVisible.value = false;
    await loadRules();
  } catch (err: any) {
    console.error('批量改系数失败:', err);
    ElMessage.error(err?.message || '批量改系数失败');
  } finally {
    updatingCoefficient.value = false;
  }
}

async function handleRenewRules() {
  if (!selectedRuleIds.value.length) {
    ElMessage.warning('请先选择规则');
    return;
  }
  if (!renewForm.start_date) {
    ElMessage.warning('请选择续期开始日期');
    return;
  }
  if (renewForm.end_date && renewForm.end_date < renewForm.start_date) {
    ElMessage.warning('续期结束日期不能早于开始日期');
    return;
  }

  renewing.value = true;
  try {
    const result = await bonusApi.renewRules({
      rule_ids: selectedRuleIds.value,
      start_date: renewForm.start_date,
      end_date: renewForm.end_date || undefined,
      replace_existing: renewForm.replace_existing,
      remark: renewForm.remark || undefined
    });
    ElMessage.success(`规则续期完成：新增 ${result.created} 条，更新 ${result.updated} 条，跳过 ${result.skipped} 条`);
    renewVisible.value = false;
    await loadRules();
  } catch (err: any) {
    console.error('规则续期失败:', err);
    ElMessage.error(err?.message || '规则续期失败');
  } finally {
    renewing.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadOptions(), loadRules()]);
});
</script>

<style scoped lang="scss">
.rules-manager {
  .rules-tip-card,
  .rules-toolbar-card {
    margin-bottom: 16px;
  }

  .field-tip {
    margin-left: 12px;
    color: #909399;
    font-size: 12px;
  }

  .generator-form {
    margin-top: 16px;
  }
}
</style>
