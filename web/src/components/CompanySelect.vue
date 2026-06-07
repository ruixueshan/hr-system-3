<template>
  <el-select
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    @change="$emit('change', $event)"
    filterable
    :clearable="clearable"
    :placeholder="placeholder"
    :style="width ? 'width:'+width : ''"
  >
    <el-option
      v-for="c in companies"
      :key="c._id"
      :label="c.name"
      :value="c._id"
    />
  </el-select>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { companiesApi } from '@/api/modules/companies';
import type { Company } from '@/api/types';

const props = withDefaults(defineProps<{
  modelValue?: string;
  placeholder?: string;
  clearable?: boolean;
  width?: string;
}>(), {
  placeholder: '选择企业',
  clearable: true,
  width: '240px',
});

defineEmits<{
  (e: 'update:modelValue', val: string): void;
  (e: 'change', val: string): void;
}>();

const companies = ref<Company[]>([]);

onMounted(async () => {
  try {
    const result = await companiesApi.getList({ page: 1, pageSize: 200 });
    companies.value = result.list || [];
  } catch {
    companies.value = [];
  }
});
</script>
