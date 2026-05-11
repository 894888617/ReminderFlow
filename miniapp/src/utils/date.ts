export function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 16)
}

export function todayDate() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function currentTime() {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function buildDateTime(date: string, time: string) {
  if (!date || !time) return undefined
  return `${date}T${time}:00+08:00`
}

export function splitDateTime(value?: string | null) {
  if (!value) {
    return {
      date: '',
      time: '',
    }
  }

  const normalized = value.replace('T', ' ')

  return {
    date: normalized.slice(0, 10),
    time: normalized.slice(11, 16),
  }
}
