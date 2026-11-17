/**
 * 全局共享零尺寸 SVG 滤镜与流体渐变定义（SvgThemeFilters）。
 *
 * 挂载于 AppProviders 根节点：
 * - `#watercolor-bleed` / `#apo-sketch-ink` 只作用于 `.wash-layer` 湿边层与矢量管道描边，
 *   上层业务文字与等宽编码 `.crisp-content` 彻底绝缘，确保 100% 像素级锐利。
 * - 所有颜色停止点全部引用 `tokens.css` 与 `theme-worlds.css` 的 CSS 变量。
 */
export function SvgThemeFilters() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      data-slot="svg-theme-filters"
      className="pointer-events-none fixed h-0 w-0 overflow-hidden"
    >
      <defs>
        <filter id="watercolor-bleed" x="-12%" y="-15%" width="124%" height="130%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.045"
            numOctaves={3}
            seed={7}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={6.5}
            xChannelSelector="R"
            yChannelSelector="G"
            result="bleed"
          />
          <feGaussianBlur in="bleed" stdDeviation={0.6} result="soft" />
          <feMerge>
            <feMergeNode in="soft" />
            <feMergeNode in="bleed" />
          </feMerge>
        </filter>

        <filter id="apo-sketch-ink" x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.03"
            numOctaves={2}
            seed={11}
            result="inkNoise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="inkNoise"
            scale={2.2}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        <linearGradient id="apo-river-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--wash-sky)" />
          <stop offset="50%" stopColor="var(--wash-mint)" />
          <stop offset="100%" stopColor="var(--conduit-pipe-end)" />
        </linearGradient>

        <linearGradient id="apo-river-wide-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--wash-mint)" />
          <stop offset="55%" stopColor="var(--conduit-pipe-mid)" />
          <stop offset="100%" stopColor="var(--wash-amber)" />
        </linearGradient>

        <linearGradient id="apo-glass-pipe-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--conduit-pipe-start)" />
          <stop offset="50%" stopColor="var(--conduit-pipe-mid)" />
          <stop offset="100%" stopColor="var(--conduit-pipe-end)" />
        </linearGradient>
      </defs>
    </svg>
  )
}
