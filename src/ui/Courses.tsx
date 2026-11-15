import type { CourseInfo } from '../engine/bank'
import { useT } from '../i18n'
import { courseOf, summary, type Progress } from '../storage/progress'
import { Gear, Star } from './icons'
import type { Go } from './nav'

const pct = (c: number, a: number) => (a ? `${Math.round((100 * c) / a)}%` : '—')

/** Course picker with each course's progress and the overall totals. */
export function Courses({ index, progress, errors, go }: { index: CourseInfo[]; progress: Progress; errors: Record<string, string | undefined>; go: Go }) {
  const t = useT()
  const all = index.map((c) => courseOf(progress, c.id).stats)
  const answered = all.reduce((s, x) => s + x.answered, 0)
  const correct = all.reduce((s, x) => s + x.correct, 0)

  return (
    <>
      <header className="row">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{t.courses}</h1>
          <p className="muted">{t.coursesHint}</p>
        </div>
        <button className="sk btn icon-btn" onClick={() => go({ name: 'settings' })} aria-label={t.settings} title={t.settings}>
          <Gear />
        </button>
      </header>

      <div className="stack section">
        {index.map((c) => {
          const s = summary(courseOf(progress, c.id))
          return (
            <button key={c.id} className="sk course-card" onClick={() => go({ name: 'home', course: c.id })}>
              <span className="emoji" aria-hidden="true">
                {c.emoji}
              </span>
              <span className="title">{c.title}</span>
              <span className="muted">{c.subtitle}</span>
              <span className="facts-row">
                <span className="row" style={{ gap: 2 }} aria-label={`${t.stars}: ${s.stars}/${c.levels * 3}`}>
                  <Star on /> {s.stars}/{c.levels * 3}
                </span>
                <span>{t.levelsOf(s.passed, c.levels)}</span>
                <span>{t.courseMistakes(s.mistakes)}</span>
                {errors[c.id] && <span className="error-text">{t.courseError}</span>}
              </span>
            </button>
          )
        })}
      </div>

      <h3 className="section">{t.allCourses}</h3>
      <div className="sk card summary" style={{ marginTop: 8 }}>
        <div>
          <div className="num">{answered}</div>
          <div className="muted">{t.totalAnswers}</div>
        </div>
        <div>
          <div className="num">{pct(correct, answered)}</div>
          <div className="muted">{t.accuracy}</div>
        </div>
        <div>
          <div className="num">{Math.max(0, ...all.map((x) => x.bestStreak))}</div>
          <div className="muted">{t.bestStreak}</div>
        </div>
      </div>
    </>
  )
}
