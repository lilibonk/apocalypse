export interface MonthCell {
  isoDate: string
  day: number
}

export function monthRange(month: string): { from: string; to: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('月份格式无效')
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` }
}

export function monthCells(month: string): (MonthCell | null)[] {
  const { from, to } = monthRange(month)
  const leading = new Date(`${from}T00:00:00Z`).getUTCDay()
  const lastDay = Number(to.slice(-2))
  return [
    ...Array.from<null>({ length: leading }).fill(null),
    ...Array.from({ length: lastDay }, (_, index) => {
      const day = index + 1
      return { isoDate: `${month}-${String(day).padStart(2, '0')}`, day }
    }),
  ]
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}
