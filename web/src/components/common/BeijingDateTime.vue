<template>
  <span>{{ text }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatDate } from '@/utils/format';

const props = withDefaults(defineProps<{
  value?: Date | string | number | null;
  format?: string;
  emptyText?: string;
}>(), {
  value: null,
  format: 'YYYY-MM-DD HH:mm:ss',
  emptyText: '-'
});

const text = computed(() => {
  if (!props.value) return props.emptyText;
  const formatted = formatDate(props.value, props.format);
  return formatted === '-' ? props.emptyText : formatted;
});
</script>
