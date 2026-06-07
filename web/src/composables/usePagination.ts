// composables/usePagination.ts - 统一分页逻辑
// 消除每个页面重复定义的分页状态+事件处理
import { reactive } from 'vue'

export function usePagination(loadFn: () => void, defaultPageSize = 20) {
  const pagination = reactive({
    page: 1,
    pageSize: defaultPageSize,
    total: 0,
  })

  function onSizeChange(size: number) {
    pagination.pageSize = size
    pagination.page = 1
    loadFn()
  }

  function onCurrentChange(page: number) {
    pagination.page = page
    loadFn()
  }

  return { pagination, onSizeChange, onCurrentChange }
}
