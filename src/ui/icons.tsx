// Hand-drawn doodle icons. Stroke follows currentColor; fills use theme variables from styles.css.
import type { ReactNode } from 'react'

const Svg = ({ children, className = '', label }: { children: ReactNode; className?: string; label?: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={`ico ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  >
    {children}
  </svg>
)

// Heart drawn as two halves split by a zigzag crack, so it can break apart.
const CRACK = 'L11 17.2 L13 13.6 L11.2 10.2 Z'
const HEART_L = `M12 6.6 C10.9 4.6 9.1 3.2 7 3.3 C4.4 3.4 2.4 5.4 2.5 8.2 C2.6 11.6 5.6 15.1 12 20.8 ${CRACK}`
const HEART_R = `M12 6.6 C13.1 4.6 14.9 3.2 17 3.3 C19.6 3.4 21.6 5.4 21.5 8.2 C21.4 11.6 18.4 15.1 12 20.8 ${CRACK}`
const HEART = 'M12 6.6 C13.1 4.6 14.9 3.2 17 3.3 C19.6 3.4 21.6 5.4 21.5 8.2 C21.4 11.6 18.4 15.1 12 20.8 C5.6 15.1 2.6 11.6 2.5 8.2 C2.4 5.4 4.4 3.4 7 3.3 C9.1 3.2 10.9 4.6 12 6.6 Z'

export const Heart = ({ lost, breaking }: { lost?: boolean; breaking?: boolean }) => (
  <Svg className={`heart${lost ? ' lost' : ''}${breaking ? ' breaking' : ''}`}>
    <path className="whole" d={HEART} />
    <path className="half l" d={HEART_L} />
    <path className="half r" d={HEART_R} />
  </Svg>
)

export const Star = ({ on, label }: { on: boolean; label?: string }) => (
  <Svg className={`star${on ? ' on' : ''}`} label={label}>
    <path d="M12 2.6 L14.6 8.5 L21 9.2 L16.1 13.4 L17.6 19.8 L12 16.4 L6.3 19.7 L7.9 13.3 L3.1 9.1 L9.5 8.6 Z" />
  </Svg>
)

export const Crown = ({ label }: { label?: string }) => (
  <Svg className="crown" label={label}>
    <path d="M3.4 17.6 L4.3 7.9 L8.9 12.2 L12.1 4.8 L15.2 12.3 L19.7 7.7 L20.6 17.7 C15 16.9 9 16.9 3.4 17.6 Z" />
    <path d="M4 20.4 C9.3 19.8 14.8 19.8 20.1 20.4" />
  </Svg>
)

export const Book = () => (
  <Svg className="book">
    <path d="M12 6.6 C9.6 4.9 6.2 4.5 3.1 5.3 L3 18.9 C6.1 18.1 9.5 18.5 12 20.1 C14.5 18.5 17.9 18 21 18.8 L20.9 5.2 C17.8 4.5 14.4 4.9 12 6.6 Z" />
    <path d="M12 6.8 L12 19.8" />
  </Svg>
)

export const Timer = () => (
  <Svg className="timer">
    <path d="M12 6.2 C16.3 6.1 19.6 9.4 19.5 13.6 C19.4 17.6 16.1 20.7 12.1 20.6 C8 20.5 4.6 17.4 4.6 13.4 C4.6 9.3 7.9 6.3 12 6.2 Z" />
    <path d="M12 13.6 L12.1 9.4 M9.8 3.1 L14.3 3.2 M12 3.3 L12 6 M18.3 6.4 L19.8 5" />
  </Svg>
)

export const Pencil = () => (
  <Svg className="pencil">
    <path d="M4.2 19.8 L5.1 15.5 L16.4 4.2 C17.2 3.4 18.5 3.4 19.3 4.2 L19.8 4.7 C20.6 5.5 20.6 6.8 19.8 7.6 L8.5 18.9 Z" />
    <path d="M14.6 6.1 L17.9 9.4 M5.1 15.5 L8.5 18.9" />
  </Svg>
)

export const Check = ({ label }: { label?: string }) => (
  <Svg className="mark ok" label={label}>
    <path d="M4.6 12.8 C6.4 14.2 8 15.9 9.4 18 C11.9 12.6 15.3 8.6 19.8 5.6" strokeWidth={2.4} />
  </Svg>
)

export const Cross = ({ label }: { label?: string }) => (
  <Svg className="mark bad" label={label}>
    <path d="M6.2 6 C10 9.8 14.1 14.2 18.3 18.4 M17.9 5.7 C14 9.8 10 13.9 5.8 18.2" strokeWidth={2.4} />
  </Svg>
)

export const Gear = () => (
  <Svg>
    <path d="M12 8.6 C13.9 8.6 15.4 10.1 15.4 12 C15.4 13.9 13.9 15.4 12 15.4 C10.1 15.4 8.6 13.9 8.6 12 C8.6 10.1 10.1 8.6 12 8.6 Z" />
    <path d="M12 2.8 L12 5.4 M12 18.6 L12 21.2 M2.8 12 L5.4 12 M18.6 12 L21.2 12 M5.5 5.5 L7.3 7.3 M16.7 16.7 L18.5 18.5 M5.5 18.5 L7.3 16.7 M16.7 7.3 L18.5 5.5" />
  </Svg>
)

export const Bars = () => (
  <Svg>
    <path d="M4 20.2 L20.3 20 M6.5 19.6 L6.6 12.5 M11.9 19.6 L12 6.8 M17.4 19.6 L17.3 10.4" strokeWidth={2.2} />
  </Svg>
)

/** Stars + crown for a level card or result. */
export const Rating = ({ stars, crown, label }: { stars: number; crown: boolean; label: string }) => (
  <span className="rating" role="img" aria-label={label}>
    {[1, 2, 3].map((i) => (
      <Star key={i} on={i <= stars} />
    ))}
    {crown && <Crown />}
  </span>
)
