import type { Question } from '../engine/bank'
import { addMistake, correctCount, rating, reviewAnswer, type Mistakes, type OralScores, type Run } from '../engine/game'

export type Lang = 'ru' | 'uk' | 'en'
export type Theme = 'auto' | 'light' | 'dark'

export interface LevelResult {
  stars: number // best normal-mode stars, 0–3
  crown: boolean // passed in hardcore
  bestNormal: number // most correct answers in one run
  bestHardcore: number
}

export interface Progress {
  v: 1
  savedAt: number // ms; the newer of cloud/local copies wins on load
  results: Record<string, LevelResult> // key: level id, or "final"
  answered: number
  correct: number
  bestStreak: number
  perLevel: Record<string, [number, number]> // level id → [answered, correct]
  mistakes: Mistakes
  oral: OralScores
  settings: { lang: Lang | null; theme: Theme; timer: number }
}

export const PROGRESS_KEY = 'progress_v1'

export const defaultProgress = (): Progress => ({
  v: 1,
  savedAt: 0,
  results: {},
  answered: 0,
  correct: 0,
  bestStreak: 0,
  perLevel: {},
  mistakes: {},
  oral: {},
  settings: { lang: null, theme: 'auto', timer: 120 },
})

/** Brings stored data to the current schema. Add `if (raw.v === 1) raw = v1to2(raw)` steps here when it changes. */
export function migrate(raw: unknown): Progress | null {
  if (typeof raw !== 'object' || raw === null || (raw as { v?: unknown }).v !== 1) return null
  const p = raw as Partial<Progress>
  const d = defaultProgress()
  return { ...d, ...p, settings: { ...d.settings, ...p.settings } }
}

export const emptyResult = (): LevelResult => ({ stars: 0, crown: false, bestNormal: 0, bestHardcore: 0 })

export function recordAnswer(p: Progress, q: Question, correct: boolean, opts: { review: boolean; streak: number }): Progress {
  const [a, c] = p.perLevel[q.level] ?? [0, 0]
  const plus = correct ? 1 : 0
  return {
    ...p,
    answered: p.answered + 1,
    correct: p.correct + plus,
    bestStreak: Math.max(p.bestStreak, opts.streak),
    perLevel: { ...p.perLevel, [q.level]: [a + 1, c + plus] },
    mistakes: opts.review ? reviewAnswer(p.mistakes, q.id, correct) : correct ? p.mistakes : addMistake(p.mistakes, q.id),
  }
}

/** Keeps the best result per level (or "final") and mode. */
export function recordRun(p: Progress, key: string, run: Run): Progress {
  const prev = p.results[key] ?? emptyResult()
  const { stars, crown } = rating(run)
  const score = correctCount(run)
  const next: LevelResult = {
    stars: Math.max(prev.stars, stars),
    crown: prev.crown || crown,
    bestNormal: run.mode === 'normal' ? Math.max(prev.bestNormal, score) : prev.bestNormal,
    bestHardcore: run.mode === 'hardcore' ? Math.max(prev.bestHardcore, score) : prev.bestHardcore,
  }
  return { ...p, results: { ...p.results, [key]: next } }
}

export const isPassed = (r?: LevelResult) => !!r && (r.stars > 0 || r.crown)
