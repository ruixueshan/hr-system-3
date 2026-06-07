// composables/useTableLoading.ts - 统一表格加载状态管理
// 消除每页的 loading = ref(false) + try/catch/finally 模板代码
import { ref } from 'vue'

export function useTableLoading() {
  const loading = ref(false)

  async function withLoading<T>(fn: () => Promise<T>): Promise<T> {
    loading.value = true
    try {
      return await fn()
    } finally {
      loading.value = false
    }
  }

  return { loading, withLoading }
}
