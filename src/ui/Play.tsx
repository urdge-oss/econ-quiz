import { useEffect, useRef, useState } from 'react'
import type { Bank, Question } from '../engine/bank'
import { MAX_LIVES, positionMatches, type Run } from '../engine/game'
import { REPORT_CHAT } from '../config'
import { useT } from '../i18n'
import { haptic, openTelegramLink } from '../telegram'
import { Chart } from './Chart'
import { Book, Check, Cross, Heart, Pencil } from './icons'

// Graph areas are lettered A–D, so answers to a graph question are numbered instead: "B + C" on button A would confuse.
const labelsFor = (q: Question) => (q.chart ? '123456' : 'ABCDEF')

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // older Telegram WebViews block the async clipboard API
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      ta.remove()
    }
  }
}

interface Props {
  bank: Bank
  run: Run
  onSubmit: (answer: string[]) => void
  onDone: () => void
  onToast: (msg: string) => void
}

export function Play({ bank, run, onSubmit, onDone, onToast }: Props) {
  const t = useT()
  const [reveal, setReveal] = useState(false)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const idx = reveal ? run.answers.length - 1 : run.answers.length
  const q = run.questions[idx]
  const last = reveal ? run.answers[idx] : undefined
  const maxLives = MAX_LIVES[run.mode]
  const chart = q.chart ? bank.charts.find((c) => c.id === q.chart) : undefined

  useEffect(() => {
    if (reveal) feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    else window.scrollTo(0, 0)
  }, [reveal, idx])

  const answer = (a: string[]) => {
    onSubmit(a)
    setReveal(true)
  }
  const next = () => (run.status === 'playing' ? setReveal(false) : onDone())

  const report = async () => {
    const level = bank.levels.find((l) => l.id === q.level)!
    const copied = await copyText(t.reportTemplate(bank.course.id, q.id, `${t.level(level.id)} · ${level.title}`, q.question))
    onToast(copied ? t.reportCopied : t.reportNotCopied(q.id))
    openTelegramLink(`https://t.me/${REPORT_CHAT}`)
  }

  return (
    <>
      <div className="hud">
        <span className="count" aria-label={`${idx + 1} / ${run.questions.length}`}>
          {idx + 1} / {run.questions.length}
        </span>
        {Number.isFinite(maxLives) && (
          <span className="hearts" role="img" aria-label={t.livesLabel(run.lives)}>
            {Array.from({ length: maxLives }, (_, i) => (
              <Heart key={i} lost={i >= run.lives} breaking={!!last && !last.correct && i === run.lives} />
            ))}
          </span>
        )}
        <span className="spacer" />
        <span className="streak">{t.streak(run.streak)}</span>
      </div>

      <div className="sk card stack">
        <p className="question">{q.question}</p>
        {q.type === 'multi' && <p className="hint">{t.selectAll}</p>}
        {q.type === 'order' && !last && <p className="hint">{t.orderHint}</p>}
        {chart && <Chart spec={chart} />}
      </div>

      <div className="section">
        {q.type === 'order' ? (
          <OrderQuestion key={q.id} q={q} result={last?.answer} onAnswer={answer} />
        ) : (
          <ChoiceQuestion key={q.id} q={q} result={last?.answer} onAnswer={answer} />
        )}
      </div>

      {last && (
        <div ref={feedbackRef} className={`sk card stack feedback ${last.correct ? 'ok' : 'bad'}`}>
          <div className="verdict" aria-live="polite">
            {last.correct ? <Check /> : <Cross />}
            {last.correct ? t.correct : t.wrong}
          </div>
          <p>{q.explanation}</p>
          {chart && <Chart spec={chart} showNotes />}
          <div className="row">
            {q.examRefs.map((n) => (
              <span key={n} className="badge">
                <Book />
                <span>
                  {t.examBadge(n)} — {bank.examQuestions.find((e) => e.n === n)?.title}
                </span>
              </span>
            ))}
            {q.volatile && <span className="badge volatile">↻ {t.dataAsOf(bank.dataAsOf.slice(0, 4))}</span>}
          </div>
          <button className="sk btn wide primary" onClick={next}>
            {run.status === 'playing' ? t.next : t.toResults}
          </button>
          <button className="link row" onClick={report}>
            <Pencil /> {t.report}
          </button>
        </div>
      )}
    </>
  )
}

/** single: a tap answers. multi: tick, then Check. `result` = the submitted answer once revealed. */
function ChoiceQuestion({ q, result, onAnswer }: { q: Question; result?: string[]; onAnswer: (a: string[]) => void }) {
  const t = useT()
  const multi = q.type === 'multi'
  const [sel, setSel] = useState<string[]>([])
  const done = !!result
  const shown = result ?? sel

  const toggle = (id: string) => {
    haptic('select')
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  return (
    <>
      <ul className="choices">
        {q.options.map((o, i) => {
          const chosen = shown.includes(o.id)
          const right = q.correct.includes(o.id)
          const state = done ? (right ? 'ok' : chosen ? 'bad' : 'dim') : chosen ? 'on' : ''
          return (
            <li key={o.id}>
              <button
                className={`sk choice ${state}${done && chosen ? ' picked' : ''}`}
                disabled={done}
                aria-pressed={multi ? chosen : undefined}
                onClick={() => (multi ? toggle(o.id) : onAnswer([o.id]))}
              >
                <span className="letter">{labelsFor(q)[i]}</span>
                <span>
                  {o.text}
                  {done && chosen && <span className="tag"> · {t.yourChoice}</span>}
                </span>
                <span className="mark-slot">
                  {done ? (
                    right ? <Check label={t.correct} /> : chosen ? <Cross label={t.wrong} /> : null
                  ) : (
                    multi && <span className="box" aria-hidden="true" />
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {multi && !done && (
        <button className="sk btn wide primary section" disabled={sel.length === 0} onClick={() => onAnswer(sel)}>
          {t.check}
        </button>
      )}
    </>
  )
}

/** Tap items in order to build the list; tap a placed item to take it back. */
function OrderQuestion({ q, result, onAnswer }: { q: Question; result?: string[]; onAnswer: (a: string[]) => void }) {
  const t = useT()
  const [placed, setPlaced] = useState<string[]>([])
  const done = !!result
  const list = result ?? placed
  const pool = q.options.filter((o) => !list.includes(o.id))
  const text = (id: string) => q.options.find((o) => o.id === id)!.text
  const matches = result ? positionMatches(q, result) : []
  const move = (fn: (p: string[]) => string[]) => {
    haptic('select')
    setPlaced(fn)
  }

  return (
    <>
      {done && <h3>{t.yourOrder}</h3>}
      <ol className="choices">
        {list.map((id, i) => (
          <li key={id}>
            <button
              className={`sk choice ${done ? (matches[i] ? 'ok' : 'bad') : 'on'}`}
              disabled={done}
              onClick={() => move((p) => p.filter((x) => x !== id))}
            >
              <span className="order-pos">{i + 1}</span>
              <span>{text(id)}</span>
              <span className="mark-slot">{done && (matches[i] ? <Check label={t.correct} /> : <Cross label={t.wrong} />)}</span>
            </button>
          </li>
        ))}
        {!done && pool.length > 0 && (
          <li className="slot-empty choice" aria-hidden="true">
            <span className="order-pos">{list.length + 1}</span>
          </li>
        )}
      </ol>

      {!done && pool.length > 0 && (
        <ul className="choices section">
          {pool.map((o, i) => (
            <li key={o.id}>
              <button className="sk choice" onClick={() => move((p) => [...p, o.id])}>
                <span className="letter">{labelsFor(q)[i]}</span>
                <span>{o.text}</span>
                <span />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!done && (
        <button className="sk btn wide primary section" disabled={pool.length > 0} onClick={() => onAnswer(placed)}>
          {t.check}
        </button>
      )}

      {done && !matches.every(Boolean) && (
        <div className="section">
          <h3>{t.correctOrder}</h3>
          <ol className="choices" style={{ marginTop: 8 }}>
            {q.correct.map((id, i) => (
              <li key={id} className="sk choice ok">
                <span className="order-pos">{i + 1}</span>
                <span>{text(id)}</span>
                <span />
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  )
}
