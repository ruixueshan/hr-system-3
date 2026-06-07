<template>
  <el-tag
    :type="tag.type"
    :effect="effect"
    :size="size"
  >{{ tag.text }}</el-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  status?: string;
  map: Record<string, { text: string; type: string }>;
  effect?: 'dark' | 'light' | 'plain';
  size?: 'small' | 'default' | 'large';
}>(), {
  effect: 'light',
  size: 'small',
});

const tag = computed(() => {
  const key = props.status || '';
  return props.map[key] || { text: key || '未知', type: 'info' };
});
</script>
