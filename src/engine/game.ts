import type { ExamQuestion, Question } from './bank'

export type Rng = () => number

/** Fisher–Yates; returns a shuffled copy. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Copy of q with options in a fresh random order; an `order` question never starts already solved. */
export function prepareQuestion(q: Question, rng: Rng = Math.random): Question {
  let options = shuffle(q.options, rng)
  if (q.type === 'order' && options.every((o, i) => o.id === q.correct[i])) {
    options = [...options.slice(1), options[0]] // rotating a permutation of unique ids always changes it
  }
  return { ...q, options }
}

export function isCorrect(q: Question, answer: readonly string[]): boolean {
  if (answer.length !== q.correct.length) return false
  if (q.type === 'order') return answer.every((id, i) => id === q.correct[i])
  return new Set(answer).size === answer.length && answer.every((id) => q.correct.includes(id))
}

/** For `order`: which positions of the answer are right. */
export const positionMatches = (q: Question, answer: readonly string[]) => answer.map((id, i) => id === q.correct[i])

export type Mode = 'normal' | 'hardcore' | 'free'
export const MAX_LIVES: Record<Mode, number> = { normal: 3, hardcore: 1, free: Infinity }

export interface AnswerRecord {
  id: string
  answer: string[]
  correct: boolean
}

export interface Run {
  mode: Mode
  questions: Question[]
  answers: AnswerRecord[]
  lives: number
  streak: number
  bestStreak: number
  status: 'playing' | 'lost' | 'won'
}

/** Every start reshuffles both the question order and each question's options. */
export function startRun(questions: readonly Question[], mode: Mode, rng: Rng = Math.random): Run {
  return {
    mode,
    questions: shuffle(questions, rng).map((q) => prepareQuestion(q, rng)),
    answers: [],
    lives: MAX_LIVES[mode],
    streak: 0,
    bestStreak: 0,
    status: 'playing',
  }
}

export function submitAnswer(run: Run, answer: readonly string[]): Run {
  if (run.status !== 'playing') return run
  const q = run.questions[run.answers.length]
  const correct = isCorrect(q, answer)
  const lives = correct ? run.lives : run.lives - 1
  const streak = correct ? run.streak + 1 : 0
  const answers = [...run.answers, { id: q.id, answer: [...answer], correct }]
  const status = lives <= 0 ? 'lost' : answers.length === run.questions.length ? 'won' : 'playing'
  return { ...run, answers, lives, streak, bestStreak: Math.max(run.bestStreak, streak), status }
}

export const correctCount = (run: Run) => run.answers.filter((a) => a.correct).length

/** Normal mode: stars = lives left. Hardcore: a crown. Only for a won run. */
export function rating(run: Run): { stars: number; crown: boolean } {
  if (run.status !== 'won') return { stars: 0, crown: false }
  return { stars: run.mode === 'normal' ? run.lives : 0, crown: run.mode === 'hardcore' }
}

/** `perLevel` random questions from each level, spreading across difficulties. startRun shuffles the result. */
export function buildFinal(questions: readonly Question[], levelIds: readonly number[], perLevel: number, rng: Rng = Math.random): Question[] {
  const picked: Question[] = []
  for (const level of levelIds) {
    const buckets = new Map<number, Question[]>()
    for (const q of shuffle(questions.filter((x) => x.level === level), rng)) {
      buckets.set(q.difficulty, [...(buckets.get(q.difficulty) ?? []), q])
    }
    const rounds = shuffle([...buckets.values()], rng)
    let taken = 0
    while (taken < perLevel && rounds.some((b) => b.length > 0)) {
      for (const b of rounds) {
        if (taken < perLevel && b.length > 0) {
          picked.push(b.pop()!)
          taken++
        }
      }
    }
  }
  return picked
}

/** Question id → correct answers in a row in review mode. */
export type Mistakes = Record<string, number>
export const REVIEW_STREAK_TO_CLEAR = 2

export const addMistake = (m: Mistakes, id: string): Mistakes => ({ ...m, [id]: 0 })

export function reviewAnswer(m: Mistakes, id: string, correct: boolean): Mistakes {
  if (!correct) return addMistake(m, id)
  if (!(id in m)) return m
  const next = { ...m, [id]: m[id] + 1 }
  if (next[id] >= REVIEW_STREAK_TO_CLEAR) delete next[id]
  return next
}

/** Oral-exam self-assessment: exam number → [points said, points total]. */
export type OralScores = Record<string, [number, number]>

export function pickExam(
  exams: readonly ExamQuestion[],
  opts: { level: number | null; weakestFirst: boolean; scores: OralScores; exclude?: number },
  rng: Rng = Math.random,
): ExamQuestion | undefined {
  let pool = exams.filter((e) => opts.level === null || e.level === opts.level)
  if (pool.length > 1) pool = pool.filter((e) => e.n !== opts.exclude)
  if (opts.weakestFirst) {
    const score = (e: ExamQuestion) => {
      const s = opts.scores[e.n]
      return s && s[1] > 0 ? s[0] / s[1] : 0 // not rated yet counts as lowest
    }
    const min = Math.min(...pool.map(score))
    pool = pool.filter((e) => score(e) === min)
  }
  return pool[Math.floor(rng() * pool.length)]
}
