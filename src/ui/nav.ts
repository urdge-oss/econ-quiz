import type { Run } from '../engine/game'

/** Oral-exam screen state; kept in navigation so it survives a practice quiz and back. */
export interface OralState {
  n?: number
  level: number | null
  weakest: boolean
}

export type Kind =
  | { type: 'level'; level: number }
  | { type: 'final' }
  | { type: 'review' }
  | { type: 'oral'; n: number; oral: OralState }

export type Screen =
  | { name: 'home' }
  | { name: 'briefing'; kind: Kind }
  | { name: 'play'; kind: Kind; run: Run; id: number }
  | { name: 'result'; kind: Kind; run: Run }
  | { name: 'oral'; oral: OralState }
  | { name: 'stats' }
  | { name: 'settings' }

export type Go = (s: Screen) => void

export const exitTo = (kind: Kind): Screen => (kind.type === 'oral' ? { name: 'oral', oral: { ...kind.oral, n: kind.n } } : { name: 'home' })
