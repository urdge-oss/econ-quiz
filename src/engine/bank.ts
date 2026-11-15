export type QType = 'single' | 'multi' | 'order'

export interface Option {
  id: string
  text: string
}

export interface Question {
  id: string // unique inside its course only
  level: number
  type: QType
  examRefs: number[]
  difficulty: number
  volatile: boolean
  chart: string | null
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
  formulas: string[]
  draw: string | null
  chart: string | null
  problem: boolean
  quizQuestionIds: string[]
}

export type Point = [number, number]

/** A textbook graph in math coordinates: axes run from 0 to max, y points up. */
export interface Chart {
  id: string
  title: string
  x: { label: string; max: number }
  y: { label: string; max: number }
  curves: { label: string; points: Point[]; labelAt?: Point; style?: 'solid' | 'dashed' | 'bold' }[]
  guides: { points: Point[] }[]
  ticks: { x: { at: number; label: string }[]; y: { at: number; label: string }[] }
  markers: { at: Point; label: string }[]
  areas: { label: string; polygon: Point[]; labelAt: Point }[]
  texts: { at: Point; text: string }[]
  notes: string[]
}

export interface FrameworkPart {
  kind: string
  weight: number
  label: string
  hint: string
}

export interface Bank {
  schemaVersion: 2
  course: { id: string; title: string; subtitle: string; emoji: string; answerFramework: FrameworkPart[] }
  dataAsOf: string
  language: string
  levels: Level[]
  finalExam: { title: string; subtitle: string; questionsPerLevel: number }
  charts: Chart[]
  questions: Question[]
  examQuestions: ExamQuestion[]
}

/** One entry of courses.json: enough for the course picker without loading the course file. */
export interface CourseInfo {
  id: string
  title: string
  subtitle: string
  emoji: string
  file: string
  dataAsOf: string
  levels: number
  questions: number
  examQuestions: number
}

const fail = (where: string, msg: string): never => {
  throw new Error(`${where}: ${msg}`)
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const obj = (v: unknown, where: string) => (isObj(v) ? v : fail(where, 'not an object'))
const str = (v: unknown, where: string) => (typeof v === 'string' && v !== '' ? v : fail(where, 'expected text'))
const text = (v: unknown, where: string) => (typeof v === 'string' ? v : fail(where, 'expected text'))
const int = (v: unknown, where: string) => (Number.isInteger(v) ? (v as number) : fail(where, 'expected integer'))
const num = (v: unknown, where: string) => (typeof v === 'number' && Number.isFinite(v) ? v : fail(where, 'expected number'))
const arr = (v: unknown, where: string) => (Array.isArray(v) ? (v as unknown[]) : fail(where, 'expected list'))
const bool = (v: unknown, where: string) => (typeof v === 'boolean' ? v : fail(where, 'expected true/false'))
const point = (v: unknown, where: string) => {
  const p = arr(v, where)
  if (p.length !== 2) fail(where, 'expected [x, y]')
  p.forEach((c, i) => num(c, `${where}[${i}]`))
}
const points = (v: unknown, where: string, min: number) => {
  const ps = arr(v, where)
  if (ps.length < min) fail(where, `needs at least ${min} points`)
  ps.forEach((p, i) => point(p, `${where}[${i}]`))
}

/** courses.json: the list of courses. */
export function validateIndex(raw: unknown): CourseInfo[] {
  const root = obj(raw, 'courses.json')
  if (root.schemaVersion !== 2) fail('courses.json schemaVersion', `unsupported ${String(root.schemaVersion)}`)
  const ids = new Set<string>()
  const list = arr(root.courses, 'courses')
  if (list.length === 0) fail('courses', 'empty')
  for (const [i, c] of list.entries()) {
    const w = `courses[${i}]`
    const o = obj(c, w)
    const id = str(o.id, `${w}.id`)
    // the id becomes part of storage keys, which Telegram limits to A-Z a-z 0-9 _ -
    if (!/^[A-Za-z0-9-]{1,40}$/.test(id) || ids.has(id)) fail(`${w}.id`, 'must be unique, letters/digits/hyphens')
    ids.add(id)
    for (const k of ['title', 'subtitle', 'emoji', 'file', 'dataAsOf'] as const) str(o[k], `${w}.${k}`)
    for (const k of ['levels', 'questions', 'examQuestions'] as const) int(o[k], `${w}.${k}`)
  }
  return list as CourseInfo[]
}

function validateChart(c: unknown, where: string): string {
  const o = obj(c, where)
  const id = str(o.id, `${where}.id`)
  const w = `chart ${id}`
  str(o.title, `${w}.title`)
  for (const axis of ['x', 'y'] as const) {
    const a = obj(o[axis], `${w}.${axis}`)
    text(a.label, `${w}.${axis}.label`)
    if (num(a.max, `${w}.${axis}.max`) <= 0) fail(`${w}.${axis}.max`, 'must be > 0')
  }
  arr(o.curves, `${w}.curves`).forEach((cv, i) => {
    const x = obj(cv, `${w}.curves[${i}]`)
    text(x.label, `${w}.curves[${i}].label`)
    points(x.points, `${w}.curves[${i}].points`, 2)
    if (x.labelAt !== undefined) point(x.labelAt, `${w}.curves[${i}].labelAt`)
    if (x.style !== undefined && x.style !== 'solid' && x.style !== 'dashed' && x.style !== 'bold')
      fail(`${w}.curves[${i}].style`, `unknown ${String(x.style)}`)
  })
  arr(o.guides, `${w}.guides`).forEach((g, i) => points(obj(g, `${w}.guides[${i}]`).points, `${w}.guides[${i}].points`, 2))
  const ticks = obj(o.ticks, `${w}.ticks`)
  for (const axis of ['x', 'y'] as const)
    arr(ticks[axis], `${w}.ticks.${axis}`).forEach((t, i) => {
      const x = obj(t, `${w}.ticks.${axis}[${i}]`)
      num(x.at, `${w}.ticks.${axis}[${i}].at`)
      text(x.label, `${w}.ticks.${axis}[${i}].label`)
    })
  arr(o.markers, `${w}.markers`).forEach((m, i) => {
    const x = obj(m, `${w}.markers[${i}]`)
    point(x.at, `${w}.markers[${i}].at`)
    text(x.label, `${w}.markers[${i}].label`)
  })
  arr(o.areas, `${w}.areas`).forEach((a, i) => {
    const x = obj(a, `${w}.areas[${i}]`)
    str(x.label, `${w}.areas[${i}].label`)
    points(x.polygon, `${w}.areas[${i}].polygon`, 3)
    point(x.labelAt, `${w}.areas[${i}].labelAt`)
  })
  arr(o.texts, `${w}.texts`).forEach((t, i) => {
    const x = obj(t, `${w}.texts[${i}]`)
    point(x.at, `${w}.texts[${i}].at`)
    str(x.text, `${w}.texts[${i}].text`)
  })
  arr(o.notes, `${w}.notes`).forEach((n, i) => str(n, `${w}.notes[${i}]`))
  return id
}

/** Checks one course file; throws an Error naming the first broken spot. */
export function validateBank(raw: unknown): Bank {
  const root = obj(raw, 'root')
  if (root.schemaVersion !== 2) fail('schemaVersion', `unsupported ${String(root.schemaVersion)}`)
  str(root.dataAsOf, 'dataAsOf')

  const course = obj(root.course, 'course')
  for (const k of ['id', 'title', 'subtitle', 'emoji'] as const) str(course[k], `course.${k}`)
  arr(course.answerFramework, 'course.answerFramework').forEach((f, i) => {
    const x = obj(f, `course.answerFramework[${i}]`)
    for (const k of ['kind', 'label', 'hint'] as const) str(x[k], `course.answerFramework[${i}].${k}`)
    num(x.weight, `course.answerFramework[${i}].weight`)
  })

  const chartIds = new Set<string>()
  for (const [i, c] of arr(root.charts, 'charts').entries()) {
    const id = validateChart(c, `charts[${i}]`)
    if (chartIds.has(id)) fail(`chart ${id}`, 'duplicate id')
    chartIds.add(id)
  }
  const chartRef = (v: unknown, where: string) => {
    if (v !== null && !chartIds.has(str(v, where))) fail(where, `unknown chart ${String(v)}`)
  }

  const levelIds = new Set<number>()
  for (const [i, l] of arr(root.levels, 'levels').entries()) {
    const w = `levels[${i}]`
    const o = obj(l, w)
    levelIds.add(int(o.id, `${w}.id`))
    str(o.title, `${w}.title`)
    str(o.subtitle, `${w}.subtitle`)
    const r = arr(o.examRange, `${w}.examRange`)
    if (r.length !== 2) fail(`${w}.examRange`, 'expected [from, to]')
    r.forEach((x, j) => int(x, `${w}.examRange[${j}]`))
    arr(o.briefing, `${w}.briefing`).forEach((b, j) => str(b, `${w}.briefing[${j}]`))
  }
  if (levelIds.size === 0) fail('levels', 'empty')

  const fe = obj(root.finalExam, 'finalExam')
  str(fe.title, 'finalExam.title')
  if (int(fe.questionsPerLevel, 'finalExam.questionsPerLevel') < 1) fail('finalExam.questionsPerLevel', 'must be ≥ 1')

  const qIds = new Set<string>()
  for (const [i, q] of arr(root.questions, 'questions').entries()) {
    const o = obj(q, `questions[${i}]`)
    const w = typeof o.id === 'string' ? o.id : `questions[${i}]`
    const id = str(o.id, `${w}.id`)
    if (qIds.has(id)) fail(w, 'duplicate id')
    qIds.add(id)
    if (!levelIds.has(int(o.level, `${w}.level`))) fail(w, `unknown level ${String(o.level)}`)
    if (o.type !== 'single' && o.type !== 'multi' && o.type !== 'order') fail(w, `unknown type ${String(o.type)}`)
    str(o.question, `${w}.question`)
    str(o.explanation, `${w}.explanation`)
    int(o.difficulty, `${w}.difficulty`)
    bool(o.volatile, `${w}.volatile`)
    chartRef(o.chart, `${w}.chart`)
    arr(o.examRefs, `${w}.examRefs`).forEach((r, j) => int(r, `${w}.examRefs[${j}]`))
    const optIds = arr(o.options, `${w}.options`).map((x, j) => {
      const opt = obj(x, `${w}.options[${j}]`)
      str(opt.text, `${w}.options[${j}].text`)
      return str(opt.id, `${w}.options[${j}].id`)
    })
    if (new Set(optIds).size !== optIds.length || optIds.length < 2) fail(`${w}.options`, 'need ≥ 2 unique ids')
    const correct = arr(o.correct, `${w}.correct`).map((c, j) => str(c, `${w}.correct[${j}]`))
    if (correct.length === 0 || new Set(correct).size !== correct.length || !correct.every((c) => optIds.includes(c)))
      fail(`${w}.correct`, 'must be unique option ids')
    if (o.type === 'single' && correct.length !== 1) fail(`${w}.correct`, 'single needs exactly 1')
    if (o.type === 'order' && correct.length !== optIds.length) fail(`${w}.correct`, 'order must list every option')
  }

  for (const [i, e] of arr(root.examQuestions, 'examQuestions').entries()) {
    const o = obj(e, `examQuestions[${i}]`)
    const w = `exam ${String(o.n ?? i)}`
    int(o.n, `${w}.n`)
    str(o.title, `${w}.title`)
    text(o.originalTitle, `${w}.originalTitle`)
    if (!levelIds.has(int(o.level, `${w}.level`))) fail(w, 'unknown level')
    arr(o.keyPoints, `${w}.keyPoints`).forEach((p, j) => str(p, `${w}.keyPoints[${j}]`))
    arr(o.formulas, `${w}.formulas`).forEach((f, j) => str(f, `${w}.formulas[${j}]`))
    if (o.draw !== null) str(o.draw, `${w}.draw`)
    chartRef(o.chart, `${w}.chart`)
    bool(o.problem, `${w}.problem`)
    for (const id of arr(o.quizQuestionIds, `${w}.quizQuestionIds`))
      if (!qIds.has(str(id, `${w}.quizQuestionIds`))) fail(w, `unknown question ${String(id)}`)
  }
  return root as unknown as Bank
}
