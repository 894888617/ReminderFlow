export type RecordStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED'

export type LegacyRecordStatus = RecordStatus | string | null | undefined

export const RECORD_STATUS_MAP: Record<RecordStatus, { label: string; value: RecordStatus }> = {
  PENDING: {
    label: '待处理',
    value: 'PENDING',
  },
  COMPLETED: {
    label: '已完成',
    value: 'COMPLETED',
  },
  CANCELLED: {
    label: '已取消',
    value: 'CANCELLED',
  },
}

export const RECORD_STATUS_OPTIONS = [
  RECORD_STATUS_MAP.PENDING,
  RECORD_STATUS_MAP.COMPLETED,
  RECORD_STATUS_MAP.CANCELLED,
]

export const RECORD_STATUS_FILTER_OPTIONS = [
  { label: '全部状态', value: '' },
  ...RECORD_STATUS_OPTIONS,
]

export function normalizeRecordStatus(status: LegacyRecordStatus): RecordStatus {
  const normalized = String(status || '').trim().toUpperCase()

  if (normalized === 'COMPLETED' || normalized === 'DONE') return 'COMPLETED'
  if (normalized === 'CANCELLED') return 'CANCELLED'

  return 'PENDING'
}

export function getRecordStatusText(status: LegacyRecordStatus) {
  return RECORD_STATUS_MAP[normalizeRecordStatus(status)].label
}
