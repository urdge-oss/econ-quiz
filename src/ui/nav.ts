// Hash routes (GitHub Pages serves one file, so the path stays fixed): #/courses, #/c/<course>/level/7, …
// A run in progress lives in memory, not in the URL; #/c/<course>/play without one goes back to the course.

/** Oral-exam screen state; kept in memory per course so it survives a practice quiz and back. */
export interface OralState {
  n?: number
  level: number | null
  weakest: boolean
}

export type Kind = { type: 'level'; level: number } | { type: 'final' } | { type: 'review' } | { type: 'oral'; n: number }
export type BriefingKind = Exclude<Kind, { type: 'oral' }>

export type Route =
  | { name: 'start' } // empty hash: decides between the last course and the course list
  | { name: 'courses' }
  | { name: 'settings' }
  | { name: 'devCharts' }
  | { name: 'home'; course: string }
  | { name: 'briefing'; course: string; kind: BriefingKind }
  | { name: 'play'; course: string }
  | { name: 'result'; course: string }
  | { name: 'oral'; course: string }
  | { name: 'stats'; course: string }

export type Go = (r: Route, replace?: boolean) => void

export function parseHash(hash: string): Route {
  const [a, course, b, c] = hash.replace(/^#\/?/, '').split('/')
  if (a === 'courses') return { name: 'courses' }
  if (a === 'settings') return { name: 'settings' }
  if (a === 'dev' && course === 'charts') return { name: 'devCharts' }
  if (a === 'c' && course) {
    if (!b) return { name: 'home', course }
    if (b === 'level' && /^\d+$/.test(c ?? '')) return { name: 'briefing', course, kind: { type: 'level', level: Number(c) } }
    if (b === 'final' || b === 'review') return { name: 'briefing', course, kind: { type: b } }
    if (b === 'play' || b === 'result' || b === 'oral' || b === 'stats') return { name: b, course }
  }
  return { name: 'start' }
}

export function toHash(r: Route): string {
  switch (r.name) {
    case 'start':
      return '#/'
    case 'courses':
    case 'settings':
      return `#/${r.name}`
    case 'devCharts':
      return '#/dev/charts'
    case 'home':
      return `#/c/${r.course}`
    case 'briefing':
      return `#/c/${r.course}/${r.kind.type === 'level' ? `level/${r.kind.level}` : r.kind.type}`
    default:
      return `#/c/${r.course}/${r.name}`
  }
}

export const exitTo = (course: string, kind: Kind): Route => (kind.type === 'oral' ? { name: 'oral', course } : { name: 'home', course })
