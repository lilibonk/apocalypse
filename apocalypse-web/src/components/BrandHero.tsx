/** README 同源品牌首图；应用主题与系统主题可不同，因此明暗由 .dark 控制。 */
export function BrandHero({ alt }: { alt: string }) {
  return (
    <div className="overflow-hidden rounded-panel border border-border-subtle">
      <picture className="block dark:hidden">
        <source media="(max-width: 600px)" srcSet="/brand/hero-mobile-light.png" />
        <img
          src="/brand/hero-light.png"
          alt={alt}
          width="2880"
          height="1000"
          className="block h-auto w-full"
          decoding="async"
        />
      </picture>
      <picture className="hidden dark:block">
        <source media="(max-width: 600px)" srcSet="/brand/hero-mobile-dark.png" />
        <img
          src="/brand/hero-dark.png"
          alt={alt}
          width="2880"
          height="1000"
          className="block h-auto w-full"
          decoding="async"
        />
      </picture>
    </div>
  )
}
