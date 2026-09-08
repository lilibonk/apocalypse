export function shouldUseRealtime(
  size: number,
  visible: boolean,
  motionEnabled: boolean,
  domMotion: boolean,
  reducedMotion: boolean | null,
) {
  return size >= 256 && visible && motionEnabled && domMotion && reducedMotion === false
}
