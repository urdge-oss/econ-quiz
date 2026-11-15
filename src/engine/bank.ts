export type QType = 'single' | 'multi' | 'order'

export interface Option {
  id: string
  text: string
}

export interface Question {
  id: string
  level: number
  type: QType
  examRefs: number[]
  difficulty: number
  volatile: boolean
  question: string
  options: Option[]
  correct: string[]
  explanation: string
}

export interface Level {
  id: number
  slug: string
  title: string
  subtitle: string
  examRange: [number, number]
  briefing: string[]
}

export interface ExamQuestion {
  n: number
  title: string
  originalTitle: string
  level: number
  keyPoints: string[]
  quizQuestionIds: string[]
}

export interface Bank {
  schemaVersion: 1
  dataAsOf: string
  language: string
  levels: Level[]
  finalExam: { title: string; subtitle: string; questionsPerLevel: number }
  questions: Question[]
  examQuestions: ExamQuestion[]
}

/** Checks the structure of questions.json; throws an Error naming the first broken spot. */
export function validateBank(raw: unknown): Bank {
  const fail = (where: string, msg: string): never => {
    throw new Error(`${where}: ${msg}`)
  }
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
  const str = (v: unknown, where: string) => (typeof v === 'string' && v !== '' ? v : fail(where, 'expected text'))
  const num = (v: unknown, where: string) => (Number.isInteger(v) ? (v as number) : fail(where, 'expected integer'))
  const arr = (v: unknown, where: string) => (Array.isArray(v) ? (v as unknown[]) : fail(where, 'expected list'))

  if (!isObj(raw)) return fail('root', 'not an object')
  if (raw.schemaVersion !== 1) fail('schemaVersion', `unsupported ${String(raw.schemaVersion)}`)
  str(raw.dataAsOf, 'dataAsOf')

  const levelIds = new Set<number>()
  for (const [i, l] of arr(raw.levels, 'levels').entries()) {
    const w = `levels[${i}]`
    if (!isObj(l)) return fail(w, 'not an object')
    levelIds.add(num(l.id, `${w}.id`))
    str(l.title, `${w}.title`)
    str(l.subtitle, `${w}.subtitle`)
    const r = arr(l.examRange, `${w}.examRange`)
    if (r.length !== 2) fail(`${w}.examRange`, 'expected [from, to]')
    r.forEach((x, j) => num(x, `${w}.examRange[${j}]`))
    arr(l.briefing, `${w}.briefing`).forEach((b, j) => str(b, `${w}.briefing[${j}]`))
  }
  if (levelIds.size === 0) fail('levels', 'empty')

  const fe = raw.finalExam
  if (!isObj(fe)) return fail('finalExam', 'not an object')
  str(fe.title, 'finalExam.title')
  if (num(fe.questionsPerLevel, 'finalExam.questionsPerLevel') < 1) fail('finalExam.questionsPerLevel', 'must be ≥ 1')

  const qIds = new Set<string>()
  for (const [i, q] of arr(raw.questions, 'questions').entries()) {
    if (!isObj(q)) return fail(`questions[${i}]`, 'not an object')
    const w = typeof q.id === 'string' ? q.id : `questions[${i}]`
    const id = str(q.id, `${w}.id`)
    if (qIds.has(id)) fail(w, 'duplicate id')
    qIds.add(id)
    if (!levelIds.has(num(q.level, `${w}.level`))) fail(w, `unknown level ${String(q.level)}`)
    if (q.type !== 'single' && q.type !== 'multi' && q.type !== 'order') fail(w, `unknown type ${String(q.type)}`)
    str(q.question, `${w}.question`)
    str(q.explanation, `${w}.explanation`)
    num(q.difficulty, `${w}.difficulty`)
    if (typeof q.volatile !== 'boolean') fail(`${w}.volatile`, 'expected true/false')
    arr(q.examRefs, `${w}.examRefs`).forEach((r, j) => num(r, `${w}.examRefs[${j}]`))
    const opts = arr(q.options, `${w}.options`)
    const optIds = opts.map((o, j) => {
      if (!isObj(o)) return fail(`${w}.options[${j}]`, 'not an object')
      str(o.text, `${w}.options[${j}].text`)
      return str(o.id, `${w}.options[${j}].id`)
    })
    if (new Set(optIds).size !== optIds.length || optIds.length < 2) fail(`${w}.options`, 'need ≥ 2 unique ids')
    const correct = arr(q.correct, `${w}.correct`).map((c, j) => str(c, `${w}.correct[${j}]`))
    if (correct.length === 0 || new Set(correct).size !== correct.length || !correct.every((c) => optIds.includes(c)))
      fail(`${w}.correct`, 'must be unique option ids')
    if (q.type === 'single' && correct.length !== 1) fail(`${w}.correct`, 'single needs exactly 1')
    if (q.type === 'order' && correct.length !== optIds.length) fail(`${w}.correct`, 'order must list every option')
  }

  for (const [i, e] of arr(raw.examQuestions, 'examQuestions').entries()) {
    const w = `examQuestions[${i}]`
    if (!isObj(e)) return fail(w, 'not an object')
    num(e.n, `${w}.n`)
    str(e.title, `${w}.title`)
    if (typeof e.originalTitle !== 'string') fail(`${w}.originalTitle`, 'expected text')
    if (!levelIds.has(num(e.level, `${w}.level`))) fail(w, 'unknown level')
    arr(e.keyPoints, `${w}.keyPoints`).forEach((p, j) => str(p, `${w}.keyPoints[${j}]`))
    for (const id of arr(e.quizQuestionIds, `${w}.quizQuestionIds`))
      if (!qIds.has(str(id, `${w}.quizQuestionIds`))) fail(w, `unknown question ${String(id)}`)
  }
  return raw as unknown as Bank
}
