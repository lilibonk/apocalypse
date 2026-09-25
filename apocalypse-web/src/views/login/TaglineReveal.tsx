import type { CSSProperties } from 'react'

import './tagline-reveal.css'

interface TaglineRevealProps {
  text: string
  animate: boolean
}

/** Keep the heading readable as one phrase while its visual characters enter in sequence. */
export function TaglineReveal({ text, animate }: TaglineRevealProps) {
  if (!animate) return <span>{text}</span>

  const segments = text.split(/(\s+)/u)

  return (
    <span>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {segments.map((segment, segmentIndex) => {
          if (/^\s+$/u.test(segment)) {
            return <span key={segmentIndex}>{segment}</span>
          }

          const characters = Array.from(segment)
          const start = Array.from(segments.slice(0, segmentIndex).join('')).length
          return (
            <span key={segmentIndex} className="inline-block whitespace-nowrap">
              {characters.map((character, index) => (
                <span
                  key={index}
                  className="tagline-reveal-character"
                  style={{ '--tagline-delay': `${(start + index) * 25}ms` } as CSSProperties}
                >
                  {character}
                </span>
              ))}
            </span>
          )
        })}
      </span>
    </span>
  )
}
