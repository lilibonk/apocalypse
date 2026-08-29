/** 将冗长 User Agent 压缩为管理台列表可扫描的设备摘要；原文保留在详情中。 */
export function summarizeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent?.trim()) return '未知设备'

  const source = userAgent.trim()
  const os =
    source.match(/Windows NT/) !== null
      ? 'Windows'
      : source.match(/Android/) !== null
        ? 'Android'
        : source.match(/iPhone|iPad/) !== null
          ? 'iOS'
          : source.match(/Mac OS X/) !== null
            ? 'macOS'
            : source.match(/Linux/) !== null
              ? 'Linux'
              : '未知系统'

  const candidates: Array<[string, RegExp]> = [
    ['Edge', /Edg\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
    ['curl', /curl\/([\d.]+)/],
    ['Postman', /PostmanRuntime\/([\d.]+)/],
  ]
  const match = candidates
    .map(([name, pattern]) => ({ name, match: source.match(pattern) }))
    .find((candidate) => candidate.match)
  const client = match
    ? `${match.name} ${match.match?.[1]?.split('.')[0] ?? ''}`.trim()
    : '未知客户端'
  return `${os} · ${client}`
}
