import { describe, expect, it } from 'vitest'
import raw from '../../public/data/questions.json'
import { validateBank, type Question } from './bank'
import {
  addMistake, buildFinal, isCorrect, pickExam, positionMatches, prepareQuestion, rating,
  reviewAnswer, shuffle, startRun, submitAnswer, type Run,
} from './game'

const bank = validateBank(raw)
const q = (over: Partial<Question>): Question => ({
  id: 'T-1', level: 1, type: 'single', examRefs: [1], difficulty: 1, volatile: false,
  question: '?', explanation: '!', options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id })), correct: ['a'],
  ...over,
})
const identityRng = () => 0.9999 // Fisher–Yates with j = i at every step leaves the order unchanged

describe('bank', () => {
  it('validates the real questions.json', () => {
    expect(bank.questions).toHaveLength(316)
    expect(bank.levels).toHaveLength(13)
    expect(bank.examQuestions).toHaveLength(110)
  })
  it('rejects broken data with a readable message', () => {
    const broken = structuredClone(raw) as typeof raw
    broken.questions[5].correct = ['z']
    expect(() => validateBank(broken)).toThrow(/L01-006\.correct/)
    expect(() => validateBank({ schemaVersion: 2 })).toThrow(/schemaVersion/)
  })
})

describe('shuffle', () => {
  it('keeps every element and does not mutate the input', () => {
    const input = Array.from({ length: 50 }, (_, i) => i)
    for (let t = 0; t < 100; t++) {
      const out = shuffle(input)
      expect(out).toHaveLength(50)
      expect([...out].sort((a, b) => a - b)).toEqual(input)
    }
    expect(input[0]).toBe(0)
  })
  it('shuffles options of every real question without losing any', () => {
    for (const x of bank.questions) {
      const p = prepareQuestion(x)
      expect(p.options.map((o) => o.id).sort()).toEqual(x.options.map((o) => o.id).sort())
    }
  })
})

describe('order questions', () => {
  const ord = q({ type: 'order', options: ['a', 'b', 'c'].map((id) => ({ id, text: id })), correct: ['a', 'b', 'c'] })
  it('never starts in the correct order, even when the shuffle returns it', () => {
    expect(prepareQuestion(ord, identityRng).options.map((o) => o.id)).not.toEqual(ord.correct)
    for (const x of bank.questions.filter((b) => b.type === 'order')) {
      for (let t = 0; t < 50; t++) expect(prepareQuestion(x).options.map((o) => o.id)).not.toEqual(x.correct)
    }
  })
  it('checks order and marks matching positions', () => {
    expect(isCorrect(ord, ['a', 'b', 'c'])).toBe(true)
    expect(isCorrect(ord, ['a', 'c', 'b'])).toBe(false)
    expect(isCorrect(ord, ['a', 'b'])).toBe(false)
    expect(positionMatches(ord, ['a', 'c', 'b'])).toEqual([true, false, false])
  })
})

describe('answer checking', () => {
  it('single', () => {
    const s = q({})
    expect(isCorrect(s, ['a'])).toBe(true)
    expect(isCorrect(s, ['b'])).toBe(false)
    expect(isCorrect(s, [])).toBe(false)
  })
  it('multi: only the exact set is right', () => {
    const m = q({ type: 'multi', options: 'abcde'.split('').map((id) => ({ id, text: id })), correct: ['a', 'c', 'd'] })
    expect(isCorrect(m, ['d', 'a', 'c'])).toBe(true)
    expect(isCorrect(m, ['a', 'c'])).toBe(false) // partially right = wrong
    expect(isCorrect(m, ['a', 'c', 'd', 'e'])).toBe(false)
    expect(isCorrect(m, ['a', 'a', 'c'])).toBe(false)
  })
})

describe('lives and game over', () => {
  const qs = Array.from({ length: 5 }, (_, i) => q({ id: `Q${i}` }))
  const play = (run: Run, pattern: boolean[]) => pattern.reduce((r, ok) => submitAnswer(r, [ok ? 'a' : 'b']), run)

  it('normal: 3 lives, game over on the third mistake', () => {
    const r = play(startRun(qs, 'normal'), [false, true, false, false])
    expect(r.status).toBe('lost')
    expect(r.lives).toBe(0)
    expect(r.answers).toHaveLength(4)
    expect(submitAnswer(r, ['a'])).toBe(r) // no answers after game over
  })
  it('normal: stars = lives left', () => {
    expect(rating(play(startRun(qs, 'normal'), [true, true, true, true, true]))).toEqual({ stars: 3, crown: false })
    const two = play(startRun(qs, 'normal'), [false, true, false, true, true])
    expect(two.status).toBe('won')
    expect(rating(two)).toEqual({ stars: 1, crown: false })
  })
  it('hardcore: one mistake ends the game, a clean run gives a crown', () => {
    expect(play(startRun(qs, 'hardcore'), [true, false]).status).toBe('lost')
    expect(rating(play(startRun(qs, 'hardcore'), [true, true, true, true, true]))).toEqual({ stars: 0, crown: true })
  })
  it('free mode never ends early and tracks streaks', () => {
    const r = play(startRun(qs, 'free'), [true, true, false, true, false])
    expect(r.status).toBe('won')
    expect(r.bestStreak).toBe(2)
  })
})

describe('final exam', () => {
  it('takes exactly N per level, no repeats, mixed difficulty when possible', () => {
    const ids = bank.levels.map((l) => l.id)
    for (let t = 0; t < 30; t++) {
      const f = buildFinal(bank.questions, ids, 3)
      expect(f).toHaveLength(39)
      expect(new Set(f.map((x) => x.id)).size).toBe(39)
      for (const l of ids) {
        const mine = f.filter((x) => x.level === l)
        expect(mine).toHaveLength(3)
        const available = new Set(bank.questions.filter((x) => x.level === l).map((x) => x.difficulty)).size
        expect(new Set(mine.map((x) => x.difficulty)).size).toBe(Math.min(3, available))
      }
    }
  })
})

describe('mistakes review', () => {
  it('removes a question after two correct answers in a row', () => {
    let m = addMistake({}, 'A')
    m = reviewAnswer(m, 'A', true)
    expect(m).toEqual({ A: 1 })
    m = reviewAnswer(m, 'A', false) // a miss resets the count
    expect(m).toEqual({ A: 0 })
    m = reviewAnswer(reviewAnswer(m, 'A', true), 'A', true)
    expect(m).toEqual({})
    expect(reviewAnswer({}, 'B', true)).toEqual({})
  })
})

describe('oral exam picker', () => {
  it('filters by level, skips the current one and prefers low self-scores', () => {
    const l6 = bank.examQuestions.filter((e) => e.level === 6)
    for (let t = 0; t < 20; t++) {
      expect(pickExam(bank.examQuestions, { level: 6, weakestFirst: false, scores: {}, exclude: 38 })?.level).toBe(6)
      expect(pickExam(bank.examQuestions, { level: 6, weakestFirst: false, scores: {}, exclude: 38 })?.n).not.toBe(38)
    }
    const scores = Object.fromEntries(l6.map((e) => [e.n, [3, 3] as [number, number]]))
    scores[44] = [1, 4]
    expect(pickExam(bank.examQuestions, { level: 6, weakestFirst: true, scores })?.n).toBe(44)
  })
})
