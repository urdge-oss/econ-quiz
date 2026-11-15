import type { Bank } from '../engine/bank'
import { useT } from '../i18n'
import type { Progress } from '../storage/progress'

const pct = (c: number, a: number) => (a ? Math.round((100 * c) / a) : null)

export function Stats({ bank, progress }: { bank: Bank; progress: Progress }) {
  const t = useT()
  const total = pct(progress.correct, progress.answered)
  return (
    <div className="stack">
      <h2>{t.stats}</h2>
      <div className="sk card summary">
        <div>
          <div className="num">{progress.answered}</div>
          <div className="muted">{t.totalAnswers}</div>
        </div>
        <div>
          <div className="num">{total === null ? '—' : `${total}%`}</div>
          <div className="muted">{t.accuracy}</div>
        </div>
        <div>
          <div className="num">{progress.bestStreak}</div>
          <div className="muted">{t.bestStreak}</div>
        </div>
      </div>

      <h3 className="section">{t.byLevel}</h3>
      <div className="sk card stack">
        {bank.levels.map((l) => {
          const [a, c] = progress.perLevel[l.id] ?? [0, 0]
          const p = pct(c, a)
          return (
            <div key={l.id}>
              <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'baseline' }}>
                <span style={{ minWidth: 0 }}>
                  <span className="hand" style={{ fontSize: '1.3rem' }}>{l.id}.</span> {l.title}
                </span>
                <span className="spacer" />
                <span className="muted" style={{ whiteSpace: 'nowrap' }}>
                  {p === null ? t.noData : `${p}% · ${c}/${a}`}
                </span>
              </div>
              <div className="bar" aria-hidden="true">
                <i style={{ width: `${p ?? 0}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
