import { useEffect, useState } from 'react'
import type { Bank, Chart as ChartSpec, ExamQuestion, FrameworkPart } from '../engine/bank'
import { pickExam } from '../engine/game'
import { useT } from '../i18n'
import type { CourseProgress } from '../storage/progress'
import { haptic } from '../telegram'
import { Chart } from './Chart'
import { Timer } from './icons'
import type { OralState } from './nav'

interface Props {
  bank: Bank
  progress: CourseProgress
  update: (fn: (c: CourseProgress) => CourseProgress) => void
  timer: number
  setTimer: (s: number) => void
  oral: OralState
  onChange: (oral: OralState) => void
  onPractice: (n: number) => void
}

export function Oral({ bank, progress, update, timer, setTimer, oral, onChange, onPractice }: Props) {
  const t = useT()
  const pick = (o: Partial<OralState>, exclude?: number) =>
    pickExam(bank.examQuestions, { level: oral.level, weakestFirst: oral.weakest, scores: progress.oral, exclude, ...o })!.n
  const [first] = useState(() => pick({}))
  const n = oral.n ?? first
  const exam = bank.examQuestions.find((e) => e.n === n)!

  return (
    <div className="stack">
      <h2>{t.oral}</h2>
      <div className="sk card stack">
        <label className="row">
          <span>{t.onlyLevel}</span>
          <select
            value={oral.level ?? ''}
            onChange={(e) => {
              const level = e.target.value ? Number(e.target.value) : null
              onChange({ ...oral, level, n: pick({ level }) })
            }}
          >
            <option value="">{t.allLevels}</option>
            {bank.levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.id}. {l.title}
              </option>
            ))}
          </select>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={oral.weakest} onChange={(e) => onChange({ ...oral, n, weakest: e.target.checked })} />
          {t.weakestFirst}
        </label>
      </div>

      <OralCard
        key={n}
        exam={exam}
        levelTitle={bank.levels.find((l) => l.id === exam.level)!.title}
        framework={bank.course.answerFramework}
        chart={exam.chart ? bank.charts.find((c) => c.id === exam.chart) : undefined}
        duration={timer}
        setDuration={setTimer}
        score={progress.oral[n]}
        setScore={(s) => update((c) => ({ ...c, oral: { ...c.oral, [n]: s } }))}
        onPractice={() => onPractice(n)}
      />

      <button className="sk btn wide primary" onClick={() => onChange({ ...oral, n: pick({}, n) })}>
        {t.nextExam}
      </button>
    </div>
  )
}

interface CardProps {
  exam: ExamQuestion
  levelTitle: string
  framework: FrameworkPart[]
  chart?: ChartSpec
  duration: number
  setDuration: (s: number) => void
  score?: [number, number]
  setScore: (s: [number, number]) => void
  onPractice: () => void
}

function OralCard({ exam, levelTitle, framework, chart, duration, setDuration, score, setScore, onPractice }: CardProps) {
  const t = useT()
  const [left, setLeft] = useState(duration * 1000)
  const [running, setRunning] = useState(false)
  const [shown, setShown] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [chartShown, setChartShown] = useState(false)
  const [said, setSaid] = useState<boolean[]>(() => exam.keyPoints.map(() => false))
  // "wrote the formula" / "drew the graph" count as extra points when the question has them
  const extras = [...(exam.formulas.length ? ['formula'] : []), ...(exam.draw ? ['graph'] : [])]
  const [done, setDone] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!running) return
    const end = Date.now() + left // `left` is read once, when the timer (re)starts
    const id = setInterval(() => {
      const l = Math.max(0, end - Date.now())
      setLeft(l)
      if (l === 0) {
        setRunning(false)
        haptic('warning')
      }
    }, 200)
    return () => clearInterval(id)
  }, [running])

  const reset = (s = duration) => {
    setRunning(false)
    setLeft(s * 1000)
  }
  const secs = Math.ceil(left / 1000)
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`

  const total = said.length + extras.length
  const got = (s: boolean[], d: Record<string, boolean>) => s.filter(Boolean).length + extras.filter((x) => d[x]).length
  const toggle = (i: number) => {
    const next = said.map((v, j) => (j === i ? !v : v))
    setSaid(next)
    setScore([got(next, done), total])
  }
  const toggleExtra = (x: string) => {
    const next = { ...done, [x]: !done[x] }
    setDone(next)
    setScore([got(said, next), total])
  }
  const active = framework.find((f) => f.kind === hint)

  return (
    <div className="sk card stack">
      <div className="row">
        <p className="hand" style={{ fontSize: '1.4rem' }}>
          {t.examNo(exam.n)} · {levelTitle}
        </p>
        {exam.problem && <span className="badge problem">{t.problem}</span>}
      </div>
      <p className="question">{exam.title}</p>
      {exam.originalTitle && exam.originalTitle !== exam.title && (
        <p className="muted">
          {t.syllabus} {exam.originalTitle}
        </p>
      )}
      {score && <p className="muted">{t.lastScore(score[0], score[1])}</p>}

      {framework.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <p className="muted">{t.gradedOn}</p>
          <div className="chips">
            {framework.map((f) => (
              <button key={f.kind} className="sk chip" aria-expanded={hint === f.kind} onClick={() => setHint(hint === f.kind ? null : f.kind)}>
                {f.label} {f.weight}%
              </button>
            ))}
          </div>
          {active && (
            <p className="hint" role="status">
              {active.hint}
            </p>
          )}
        </div>
      )}
      {exam.draw && <p className="hint">{t.drawHint}</p>}

      <div className="row section" style={{ justifyContent: 'center' }}>
        <Timer />
        <span className={`clock${left === 0 ? ' up' : ''}`} role="timer" aria-live="off">
          {clock}
        </span>
      </div>
      {left === 0 ? (
        <p className="hand" role="status" style={{ textAlign: 'center', fontSize: '1.5rem', color: 'var(--bad-ink)' }}>
          {t.timeUp}
        </p>
      ) : (
        <p className="muted" style={{ textAlign: 'center' }}>
          {t.answerAloud}
        </p>
      )}
      <div className="seg">
        <button className="sk btn primary" disabled={left === 0} onClick={() => setRunning(!running)}>
          {running ? t.timerPause : t.timerStart}
        </button>
        <button className="sk btn" onClick={() => reset()}>
          {t.timerReset}
        </button>
      </div>
      <div className="seg">
        {[60, 120, 180].map((s) => (
          <button
            key={s}
            className="sk btn small"
            aria-pressed={duration === s}
            onClick={() => {
              setDuration(s)
              reset(s)
            }}
          >
            {t.minutes(s / 60)}
          </button>
        ))}
      </div>

      {shown ? (
        <div className="stack section">
          <h3>{exam.problem ? t.solutionSteps : t.keyPoints}</h3>
          <p>{t.markSaid}</p>
          <ul className="points">
            {exam.keyPoints.map((p, i) => (
              <li key={p}>
                <label>
                  <input type="checkbox" checked={said[i]} onChange={() => toggle(i)} />
                  <span>{p}</span>
                </label>
              </li>
            ))}
          </ul>

          {exam.formulas.length > 0 && (
            <div>
              <h3>{t.formulas}</h3>
              <ul className="formulas">
                {exam.formulas.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {exam.draw && (
            <div className="stack" style={{ gap: 8 }}>
              <h3>{t.whatToDraw}</h3>
              <p>{exam.draw}</p>
              {chart && (
                <button className="sk btn wide" aria-expanded={chartShown} onClick={() => setChartShown(!chartShown)}>
                  {chartShown ? t.hideChart : t.showChart}
                </button>
              )}
              {chart && chartShown && <Chart spec={chart} showNotes />}
            </div>
          )}

          {extras.length > 0 && (
            <ul className="points">
              {extras.map((x) => (
                <li key={x}>
                  <label>
                    <input type="checkbox" checked={!!done[x]} onChange={() => toggleExtra(x)} />
                    <span>{x === 'formula' ? t.wroteFormula : t.drewGraph}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <p className="hand" style={{ fontSize: '1.4rem' }}>
            {extras.length ? t.scoreOf(got(said, done), total) : t.pointsScore(got(said, done), total)}
          </p>
        </div>
      ) : (
        <button className="sk btn wide section" onClick={() => setShown(true)}>
          {t.showPoints}
        </button>
      )}

      <button className="sk btn wide" onClick={onPractice}>
        {t.practiceTopic(exam.quizQuestionIds.length)}
      </button>
    </div>
  )
}
