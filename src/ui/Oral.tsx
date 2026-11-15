import { useEffect, useState } from 'react'
import type { Bank, ExamQuestion } from '../engine/bank'
import { pickExam } from '../engine/game'
import { useT } from '../i18n'
import type { Progress } from '../storage/progress'
import { haptic } from '../telegram'
import type { Update } from './App'
import { Timer } from './icons'
import type { OralState } from './nav'

interface Props {
  bank: Bank
  progress: Progress
  update: Update
  oral: OralState
  onChange: (oral: OralState) => void
  onPractice: (n: number) => void
}

export function Oral({ bank, progress, update, oral, onChange, onPractice }: Props) {
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
        duration={progress.settings.timer}
        setDuration={(timer) => update((p) => ({ ...p, settings: { ...p.settings, timer } }))}
        score={progress.oral[n]}
        setScore={(s) => update((p) => ({ ...p, oral: { ...p.oral, [n]: s } }))}
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
  duration: number
  setDuration: (s: number) => void
  score?: [number, number]
  setScore: (s: [number, number]) => void
  onPractice: () => void
}

function OralCard({ exam, levelTitle, duration, setDuration, score, setScore, onPractice }: CardProps) {
  const t = useT()
  const [left, setLeft] = useState(duration * 1000)
  const [running, setRunning] = useState(false)
  const [shown, setShown] = useState(false)
  const [said, setSaid] = useState<boolean[]>(() => exam.keyPoints.map(() => false))

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

  const toggle = (i: number) => {
    const next = said.map((v, j) => (j === i ? !v : v))
    setSaid(next)
    setScore([next.filter(Boolean).length, next.length])
  }

  return (
    <div className="sk card stack">
      <p className="hand" style={{ fontSize: '1.4rem' }}>
        {t.examNo(exam.n)} · {levelTitle}
      </p>
      <p className="question">{exam.title}</p>
      {exam.originalTitle && exam.originalTitle !== exam.title && (
        <p className="muted">
          {t.syllabus} {exam.originalTitle}
        </p>
      )}
      {score && <p className="muted">{t.lastScore(score[0], score[1])}</p>}

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
        <div className="section">
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
          <p className="hand" style={{ fontSize: '1.4rem' }}>
            {t.pointsScore(said.filter(Boolean).length, said.length)}
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
