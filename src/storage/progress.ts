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

export interface Settings {
  lang: Lang | null
  theme: Theme
  timer: number
}

export interface Stats {
  answered: number
  correct: number
  bestStreak: number
  perLevel: Record<string, [number, number]> // level id → [answered, correct]
}

/** Everything a player has done in one course. Each field is stored under its own key (see storage.ts). */
export interface CourseProgress {
  levels: Record<string, LevelResult> // key: level id, or "final"
  mistakes: Mistakes
  oral: OralScores
  stats: Stats
}
export const COURSE_PARTS = ['levels', 'mistakes', 'oral', 'stats'] as const

export interface Progress {
  settings: Settings
  lastCourse: string | null
  courses: Record<string, CourseProgress>
}

export const defaultSettings = (): Settings => ({ lang: null, theme: 'auto', timer: 120 })
export const defaultStats = (): Stats => ({ answered: 0, correct: 0, bestStreak: 0, perLevel: {} })
export const defaultCourse = (): CourseProgress => ({ levels: {}, mistakes: {}, oral: {}, stats: defaultStats() })
export const courseOf = (p: Progress, id: string): CourseProgress => p.courses[id] ?? defaultCourse()

export const emptyResult = (): LevelResult => ({ stars: 0, crown: false, bestNormal: 0, bestHardcore: 0 })

export function recordAnswer(c: CourseProgress, q: Question, correct: boolean, opts: { review: boolean; streak: number }): CourseProgress {
  const s = c.stats
  const [a, ok] = s.perLevel[q.level] ?? [0, 0]
  const plus = correct ? 1 : 0
  return {
    ...c,
    stats: {
      answered: s.answered + 1,
      correct: s.correct + plus,
      bestStreak: Math.max(s.bestStreak, opts.streak),
      perLevel: { ...s.perLevel, [q.level]: [a + 1, ok + plus] },
    },
    mistakes: opts.review ? reviewAnswer(c.mistakes, q.id, correct) : correct ? c.mistakes : addMistake(c.mistakes, q.id),
  }
}

/** Keeps the best result per level (or "final") and mode. */
export function recordRun(c: CourseProgress, key: string, run: Run): CourseProgress {
  const prev = c.levels[key] ?? emptyResult()
  const { stars, crown } = rating(run)
  const score = correctCount(run)
  const next: LevelResult = {
    stars: Math.max(prev.stars, stars),
    crown: prev.crown || crown,
    bestNormal: run.mode === 'normal' ? Math.max(prev.bestNormal, score) : prev.bestNormal,
    bestHardcore: run.mode === 'hardcore' ? Math.max(prev.bestHardcore, score) : prev.bestHardcore,
  }
  return { ...c, levels: { ...c.levels, [key]: next } }
}

export const isPassed = (r?: LevelResult) => !!r && (r.stars > 0 || r.crown)

/** Course card numbers that need no course file: levels are every result key except "final". */
export function summary(c: CourseProgress) {
  const levels = Object.entries(c.levels).filter(([k]) => k !== 'final').map(([, r]) => r)
  return {
    passed: levels.filter(isPassed).length,
    stars: levels.reduce((s, r) => s + r.stars, 0),
    crowns: levels.filter((r) => r.crown).length,
    mistakes: Object.keys(c.mistakes).length,
  }
}

/** Fills in fields missing from stored data (older or partial values). */
export function normalize(part: (typeof COURSE_PARTS)[number] | 'settings', d: unknown): unknown {
  const o = typeof d === 'object' && d !== null && !Array.isArray(d) ? d : {}
  if (part === 'settings') return { ...defaultSettings(), ...o }
  if (part === 'stats') return { ...defaultStats(), ...o }
  return o
}

// ---------- v1 (one JSON blob in "progress_v1", World Economy only) ----------

export const LEGACY_COURSE = 'world-economy'

interface ProgressV1 {
  v: 1
  savedAt: number
  results: Record<string, LevelResult>
  answered: number
  correct: number
  bestStreak: number
  perLevel: Record<string, [number, number]>
  mistakes: Mistakes
  oral: OralScores
  settings: Partial<Settings>
}

/** v1 blob → settings + World Economy progress, or null if it is not v1 data. */
export function fromV1(raw: unknown): { savedAt: number; settings: Settings; course: CourseProgress } | null {
  if (typeof raw !== 'object' || raw === null || (raw as { v?: unknown }).v !== 1) return null
  const p = raw as Partial<ProgressV1>
  return {
    savedAt: typeof p.savedAt === 'number' ? p.savedAt : 0,
    settings: normalize('settings', p.settings) as Settings,
    course: {
      levels: p.results ?? {},
      mistakes: p.mistakes ?? {},
      oral: p.oral ?? {},
      stats: { answered: p.answered ?? 0, correct: p.correct ?? 0, bestStreak: p.bestStreak ?? 0, perLevel: p.perLevel ?? {} },
    },
  }
}
