/**
 * Highlighted path with one travelling pulse. Restart by changing `pulseKey`; the pulse runs once
 * (CSS keyframes) and global motion switches collapse it, leaving the static highlight.
 */
export function PathPulse({
  d,
  pulseKey,
  active,
}: {
  d: string
  pulseKey: string | number
  active: boolean
}) {
  return (
    <g className="graph-path" data-active={active}>
      <path d={d} className="graph-path-line" />
      {active && <path key={pulseKey} d={d} pathLength={1} className="graph-path-pulse" />}
    </g>
  )
}
