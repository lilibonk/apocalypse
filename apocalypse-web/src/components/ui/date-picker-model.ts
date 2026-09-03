export function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01' || value > '9999-12-31')
    return false
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function moveDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  const next = date.toISOString().slice(0, 10)
  return validDate(next) ? next : value
}

export function moveMonth(value: string, months: number): string {
  const date = new Date(`${value.slice(0, 7)}-01T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + months)
  const first = date.toISOString().slice(0, 10)
  if (!validDate(first)) return value
  const next = `${first.slice(0, 7)}-${value.slice(8, 10)}`
  if (validDate(next)) return next
  date.setUTCMonth(date.getUTCMonth() + 1)
  date.setUTCDate(0)
  return date.toISOString().slice(0, 10)
}

export function dateCells(month: string): (string | null)[][] {
  const first = `${month}-01`
  if (!validDate(first)) return []
  const offset = new Date(`${first}T12:00:00Z`).getUTCDay()
  const date = new Date(`${first}T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + 1)
  date.setUTCDate(0)
  const count = date.getUTCDate()
  return Array.from({ length: Math.ceil((offset + count) / 7) }, (_, week) =>
    Array.from({ length: 7 }, (_, index) => {
      const day = week * 7 + index - offset + 1
      return day < 1 || day > count ? null : `${month}-${String(day).padStart(2, '0')}`
    }),
  )
}
