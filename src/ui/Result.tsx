import type { Bank, Question } from '../engine/bank'
import { correctCount, rating, type Run } from '../engine/game'
import { useT } from '../i18n'
import type { Progress } from '../storage/progress'
import { Check, Crown, Rating } from './icons'
import { exitTo, type Go, type Kind } from './nav'

function CorrectAnswer({ q }: { q: Question }) {
  const text = (id: string) => q.options.find((o) => o.id === id)!.text
  const items = q.correct.map((id) => <li key={id}>{text(id)}</li>)
  return q.type === 'order' ? <ol className="facts">{items}</ol> : <ul className="facts">{items}</ul>
}

interface Props {
  bank: Bank
  progress: Progress
  kind: Kind
  run: Run
  go: Go
  onRetry: () => void
}

export function Result({ bank, progress, kind, run, go, onRetry }: Props) {
  const t = useT()
  const total = run.questions.length
  const answered = run.answers.length
  const { stars, crown } = rating(run)
  const lost = run.status === 'lost'
  const free = run.mode === 'free'
  const title = lost ? t.gameOver : free ? t.done : kind.type === 'final' ? t.finalComplete : t.levelComplete
  const fatal = lost ? run.questions[answered - 1] : undefined
  const mistakesLeft = Object.keys(progress.mistakes).length
  const lastLevel = bank.levels[bank.levels.length - 1].id

  return (
    <div className="stack">
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <h2>{title}</h2>
        {!lost && !free && (
          <div className="big-rating row" style={{ justifyContent: 'center' }}>
            {run.mode === 'normal' ? (
              <Rating stars={stars} crown={false} label={`${t.stars}: ${stars}/3`} />
            ) : (
              crown && (
                <>
                  <Crown label={t.hardcoreDone} />
                  <span className="hand" style={{ fontSize: '1.5rem' }}>
                    {t.hardcoreDone}
                  </span>
                </>
              )
            )}
          </div>
        )}
        <p>{t.answeredOf(answered, total)}</p>
        <p>{t.correctOf(correctCount(run), total)}</p>
        {kind.type === 'review' && <p className="muted">{t.mistakesLeft(mistakesLeft)}</p>}
      </div>

      {fatal && (
        <div className="sk card stack feedback bad">
          <h3>{t.failedOn(answered)}</h3>
          <p className="question">{fatal.question}</p>
          <div className="row" style={{ color: 'var(--ok-ink)', fontWeight: 700 }}>
            <Check /> {t.correctAnswer}:
          </div>
          <CorrectAnswer q={fatal} />
          <p className="muted">{fatal.explanation}</p>
        </div>
      )}

      {kind.type === 'final' && (
        <div className="sk card stack">
          <h3>{t.byTopic}</h3>
          {bank.levels.map((l) => {
            const mine = run.questions.flatMap((q, i) => (q.level === l.id ? [run.answers[i]?.correct ?? false] : []))
            const ok = mine.filter(Boolean).length
            return (
              <div key={l.id} className="topic-row">
                <span>{l.title}</span>
                <span className="hand" style={{ fontSize: '1.4rem' }}>
                  {ok}/{mine.length}
                </span>
                {ok < mine.length ? (
                  <button className="sk btn small" onClick={() => go({ name: 'briefing', kind: { type: 'level', level: l.id } })}>
                    {t.repeat}
                  </button>
                ) : (
                  <span />
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="stack">
        <button className="sk btn wide primary" onClick={onRetry} disabled={kind.type === 'review' && mistakesLeft === 0}>
          {t.retry}
        </button>
        {kind.type === 'level' && kind.level < lastLevel && (
          <button className="sk btn wide" onClick={() => go({ name: 'briefing', kind: { type: 'level', level: kind.level + 1 } })}>
            {t.nextLevel}
          </button>
        )}
        <button className="sk btn wide" onClick={() => go(exitTo(kind))}>
          {kind.type === 'oral' ? t.backToOral : t.toLevels}
        </button>
      </div>
    </div>
  )
}
