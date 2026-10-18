export type GrantTimeZone = 'local' | 'UTC'

/** DatePicker handles wall time; this boundary explicitly turns it into an absolute UTC instant. */
export function grantWallTimeToInstant(value: string, zone: GrantTimeZone): string | null {
  if (!value) return null
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!parts) throw new Error('invalid')
  const [year, month, day, hour, minute] = parts.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ]
  const date = new Date(0)
  if (zone === 'UTC') {
    date.setUTCFullYear(year, month - 1, day)
    date.setUTCHours(hour, minute, 0, 0)
  } else {
    date.setFullYear(year, month - 1, day)
    date.setHours(hour, minute, 0, 0)
  }
  const wall = grantInstantToWallTime(date.toISOString(), zone)
  if (wall !== value) throw new Error('invalid')
  if (zone === 'local') {
    // A repeated DST wall time has two possible instants. Require explicit UTC rather than guessing.
    const offsets = new Set(
      [-180, -1, 0, 1, 180].map((days) =>
        new Date(date.getTime() + days * 86_400_000).getTimezoneOffset(),
      ),
    )
    const candidates = [...offsets].map(
      (offset) => date.getTime() + (offset - date.getTimezoneOffset()) * 60_000,
    )
    if (
      candidates.filter(
        (candidate) => grantInstantToWallTime(new Date(candidate).toISOString(), 'local') === value,
      ).length > 1
    )
      throw new Error('ambiguous')
  }
  return date.toISOString()
}

export function grantInstantToWallTime(value: string | null, zone: GrantTimeZone): string {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const part = (local: number, utc: number) => String(zone === 'UTC' ? utc : local).padStart(2, '0')
  return `${String(zone === 'UTC' ? date.getUTCFullYear() : date.getFullYear()).padStart(4, '0')}-${part(date.getMonth() + 1, date.getUTCMonth() + 1)}-${part(date.getDate(), date.getUTCDate())}T${part(date.getHours(), date.getUTCHours())}:${part(date.getMinutes(), date.getUTCMinutes())}`
}
