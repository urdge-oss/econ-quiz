import { useState } from 'react'
import type { Bank } from '../engine/bank'
import type { Mode } from '../engine/game'
import { useT } from '../i18n'
import { isPassed, type CourseProgress } from '../storage/progress'
import { Rating } from './icons'
import type { BriefingKind } from './nav'

/** Pre-run screen for a level, the final exam or the mistakes review. */
export function Briefing({ bank, progress, kind, onStart }: { bank: Bank; progress: CourseProgress; kind: BriefingKind; onStart: (mode: Mode) => void }) {
  const t = useT()
  const [mode, setMode] = useState<Mode>('normal')

  let over = ''
  let title: string
  let subtitle = ''
  let range = ''
  let facts: string[]
  let count: number
  if (kind.type === 'level') {
    const l = bank.levels.find((x) => x.id === kind.level)!
    over = t.level(l.id)
    title = l.title
    subtitle = l.subtitle
    range = t.examRange(l.examRange[0], l.examRange[1])
    facts = l.briefing
    count = bank.questions.filter((q) => q.level === l.id).length
  } else if (kind.type === 'final') {
    const per = bank.finalExam.questionsPerLevel
    const allPassed = bank.levels.every((l) => isPassed(progress.levels[l.id]))
    title = t.finalExam
    subtitle = bank.finalExam.subtitle
    range = t.examRange(1, bank.examQuestions.length)
    facts = [...t.finalFacts(per, bank.levels.length), ...(allPassed ? [] : [t.finalHint])]
    count = per * bank.levels.length
  } else {
    title = t.mistakes
    facts = t.reviewFacts
    count = Object.keys(progress.mistakes).length
  }
  const withModes = kind.type === 'level' || kind.type === 'final'
  const result = kind.type === 'level' ? progress.levels[kind.level] : kind.type === 'final' ? progress.levels.final : undefined

  return (
    <div className="stack">
      <div>
        {over && <p className="hand" style={{ fontSize: '1.4rem' }}>{over}</p>}
        <h2>{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="row muted">
        {range && <span>{range}</span>}
        <span>{t.questionCount(count)}</span>
        {isPassed(result) && <Rating stars={result!.stars} crown={result!.crown} label={`${t.stars}: ${result!.stars}/3`} />}
      </div>

      <div className="sk card">
        <h3>{t.keyFacts}</h3>
        <ul className="facts">
          {facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>

      {withModes && (
        <div>
          <h3>{t.mode}</h3>
          <div className="seg" style={{ marginTop: 8 }}>
            {(['normal', 'hardcore'] as const).map((m) => (
              <button key={m} className="sk btn" aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m === 'normal' ? t.normal : t.hardcore}
                <small className="muted">{m === 'normal' ? t.normalHint : t.hardcoreHint}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="sk btn wide primary" disabled={count === 0} onClick={() => onStart(withModes ? mode : 'free')}>
        {t.start}
      </button>
    </div>
  )
}
