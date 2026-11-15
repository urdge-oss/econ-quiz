import type { Bank } from '../engine/bank'
import { useT } from '../i18n'
import { isPassed, type Progress } from '../storage/progress'
import { Bars, Crown, Gear, Rating, Star } from './icons'
import type { Go } from './nav'

export function Home({ bank, progress, go }: { bank: Bank; progress: Progress; go: Go }) {
  const t = useT()
  const results = bank.levels.map((l) => progress.results[l.id])
  const passed = results.filter(isPassed).length
  const stars = results.reduce((s, r) => s + (r?.stars ?? 0), 0)
  const crowns = results.filter((r) => r?.crown).length
  const mistakes = Object.keys(progress.mistakes).length

  return (
    <>
      <header className="row">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>World Economy Quiz</h1>
          <p className="muted">{t.tagline}</p>
        </div>
        <button className="sk btn icon-btn" onClick={() => go({ name: 'stats' })} aria-label={t.stats} title={t.stats}>
          <Bars />
        </button>
        <button className="sk btn icon-btn" onClick={() => go({ name: 'settings' })} aria-label={t.settings} title={t.settings}>
          <Gear />
        </button>
      </header>

      <div className="sk card summary section">
        <div>
          <div className="num">
            {passed}/{bank.levels.length}
          </div>
          <div className="muted">{t.levelsPassed}</div>
        </div>
        <div>
          <div className="num">
            <Star on /> {stars}/{bank.levels.length * 3}
          </div>
          <div className="muted">{t.stars}</div>
        </div>
        <div>
          <div className="num">
            <Crown /> {crowns}
          </div>
          <div className="muted">{t.crowns}</div>
        </div>
      </div>

      <div className="stack section">
        {bank.levels.map((l, i) => {
          const r = results[i]
          return (
            <button key={l.id} className="sk level-card" onClick={() => go({ name: 'briefing', kind: { type: 'level', level: l.id } })}>
              <span className="n" aria-label={t.level(l.id)}>
                {l.id}
              </span>
              <span className="mid">
                <span className="title">{l.title}</span>
                <span className="sub">{l.subtitle}</span>
              </span>
              <Rating stars={r?.stars ?? 0} crown={!!r?.crown} label={`${t.stars}: ${r?.stars ?? 0}/3${r?.crown ? ` · ${t.hardcoreDone}` : ''}`} />
            </button>
          )
        })}
      </div>

      <div className="stack section">
        <button className="sk btn wide primary col" onClick={() => go({ name: 'briefing', kind: { type: 'final' } })}>
          {t.finalExam}
          {passed < bank.levels.length && <small>{t.finalHint}</small>}
        </button>
        <button className="sk btn wide col" disabled={mistakes === 0} onClick={() => go({ name: 'briefing', kind: { type: 'review' } })}>
          {t.mistakes}
          <small>{t.mistakesToReview(mistakes)}</small>
        </button>
        <button className="sk btn wide col" onClick={() => go({ name: 'oral', oral: { level: null, weakest: false } })}>
          {t.oral}
          <small>{t.oralHint}</small>
        </button>
      </div>
    </>
  )
}
