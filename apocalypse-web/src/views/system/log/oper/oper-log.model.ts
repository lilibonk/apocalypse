/** JSON 可解析时格式化（2 空格），否则原样返回；不改写业务原文。 */
export function formatPayload(value: string | null): string | null {
  const text = value?.trim()
  if (!text) return null
  if (!/^[[{]/.test(text)) return value
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return value
  }
}
