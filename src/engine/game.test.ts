import { describe, expect, it } from 'vitest'
import index from '../../public/data/courses.json'
import weRaw from '../../public/data/courses/world-economy.json'
import microRaw from '../../public/data/courses/microeconomics.json'
import { validateBank, validateIndex, type Question } from './bank'
import {
  addMistake, buildFinal, isCorrect, pickExam, positionMatches, prepareQuestion, rating,
  reviewAnswer, shuffle, startRun, submitAnswer, type Run,
} from './game'

const bank = validateBank(weRaw)
const micro = validateBank(microRaw)
const q = (over: Partial<Question>): Question => ({
  id: 'T-1', level: 1, type: 'single', examRefs: [1], difficulty: 1, volatile: false, chart: null,
  question: '?', explanation: '!', options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id })), correct: ['a'],
  ...over,
})
const identityRng = () => 0.9999 // Fisher–Yates with j = i at every step leaves the order unchanged

describe('course data', () => {
  it('validates courses.json and both course files, and the index matches them', () => {
    const courses = validateIndex(index)
    expect(courses.map((c) => c.id)).toEqual(['world-economy', 'microeconomics'])
    for (const [info, b] of [[courses[0], bank], [courses[1], micro]] as const) {
      expect(b.course.id).toBe(info.id)
      expect(b.levels).toHaveLength(info.levels)
      expect(b.questions).toHaveLength(info.questions)
      expect(b.examQuestions).toHaveLength(info.examQuestions)
    }
    expect([bank.levels.length, bank.questions.length, bank.examQuestions.length]).toEqual([13, 316, 110])
    expect([micro.levels.length, micro.questions.length, micro.examQuestions.length]).toEqual([15, 354, 120])
    expect(micro.charts).toHaveLength(10)
    expect(micro.questions.filter((x) => x.chart)).toHaveLength(29)
    expect(micro.course.answerFramework.map((f) => f.weight)).toEqual([30, 25, 25, 20])
    expect(bank.course.answerFramework).toEqual([])
  })
  it('rejects broken data with a readable message', () => {
    const broken = structuredClone(weRaw) as typeof weRaw
    broken.questions[5].correct = ['z']
    expect(() => validateBank(broken)).toThrow(/L01-006\.correct/)
    expect(() => validateBank({ schemaVersion: 1 })).toThrow(/schemaVersion/)
    const badChart = structuredClone(microRaw) as typeof microRaw
    badChart.questions.find((x) => x.chart)!.chart = 'nope'
    expect(() => validateBank(badChart)).toThrow(/unknown chart nope/)
    const badCurve = structuredClone(microRaw) as typeof microRaw
    badCurve.charts[0].curves[0].points = [[0, 1]]
    expect(() => validateBank(badCurve)).toThrow(/chart ceiling\.curves\[0\]\.points/)
    expect(() => validateIndex({ schemaVersion: 2, courses: [{ ...index.courses[0], id: 'a:b' }] })).toThrow(/id/)
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
    for (const x of [...bank.questions, ...micro.questions]) {
      const p = prepareQuestion(x)
      expect(p.options.map((o) => o.id).sort()).toEqual(x.options.map((o) => o.id).sort())
    }
  })
})

describe('order questions', () => {
  const ord = q({ type: 'order', options: ['a', 'b', 'c'].map((id) => ({ id, text: id })), correct: ['a', 'b', 'c'] })
  it('never starts in the correct order, even when the shuffle returns it', () => {
    expect(prepareQuestion(ord, identityRng).options.map((o) => o.id)).not.toEqual(ord.correct)
    for (const x of [...bank.questions, ...micro.questions].filter((b) => b.type === 'order')) {
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
  it.each([
    ['world-economy', bank, 39],
    ['microeconomics', micro, 45],
  ] as const)('%s: exactly N per level, no repeats, mixed difficulty when possible', (_, b, total) => {
    const ids = b.levels.map((l) => l.id)
    const per = b.finalExam.questionsPerLevel
    expect(per * ids.length).toBe(total)
    for (let t = 0; t < 30; t++) {
      const f = buildFinal(b.questions, ids, per)
      expect(f).toHaveLength(total)
      expect(new Set(f.map((x) => x.id)).size).toBe(total)
      for (const l of ids) {
        const mine = f.filter((x) => x.level === l)
        expect(mine).toHaveLength(per)
        const available = new Set(b.questions.filter((x) => x.level === l).map((x) => x.difficulty)).size
        expect(new Set(mine.map((x) => x.difficulty)).size).toBe(Math.min(per, available))
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
