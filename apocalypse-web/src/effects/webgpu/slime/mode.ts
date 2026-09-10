export function resolveSlimeMode(
  size: number,
  visible: boolean,
  motionEnabled: boolean,
  domMotion: boolean | null,
  reducedMotion: boolean | null,
) {
  // Only explicit static preferences get a poster. Visibility/motion detection is not a fallback.
  if (size < 256 || !motionEnabled || domMotion === false || reducedMotion === true) return 'static'
  if (!visible || domMotion === null || reducedMotion === null) return 'pending'
  return 'realtime'
}
