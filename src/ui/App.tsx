import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { validateBank, validateIndex, type Bank, type CourseInfo, type Question } from '../engine/bank'
import { buildFinal, startRun, submitAnswer, type Mode, type Run } from '../engine/game'
import { DEFAULT_LANG, dicts, I18nProvider, useT } from '../i18n'
import { courseOf, recordAnswer, recordRun, type CourseProgress, type Progress } from '../storage/progress'
import { loadProgress, saveProgress } from '../storage/storage'
import {
  confirmDialog, haptic, hasNativeBackButton, onThemeChanged, setAppColor, showBackButton, telegramDark,
} from '../telegram'
import { Briefing } from './Briefing'
import { Courses } from './Courses'
import { DevCharts } from './DevCharts'
import { Home } from './Home'
import { exitTo, parseHash, toHash, type Kind, type OralState, type Route } from './nav'
import { Oral } from './Oral'
import { Play } from './Play'
import { Result } from './Result'
import { Settings } from './Settings'
import { Stats } from './Stats'

async function fetchData(path: string): Promise<unknown> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${path}`, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const systemDark = () => telegramDark() ?? matchMedia('(prefers-color-scheme: dark)').matches

export type Update = (fn: (p: Progress) => Progress) => void

/** A course file is loaded lazily, the first time the course is opened; a broken file only affects its own course. */
type CourseState = { bank?: Bank; error?: string }
interface Playing {
  course: string
  kind: Kind
  run: Run
  id: number
}

const Skeleton = () => {
  const t = useT()
  return (
    <div className="stack" aria-busy="true" aria-label={t.loading}>
      <div className="sk card skeleton" />
      <div className="sk card skeleton tall" />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="sk card skeleton" />
      ))}
    </div>
  )
}

export function App() {
  const [index, setIndex] = useState<CourseInfo[]>()
  const [progress, setProgress] = useState<Progress>()
  const [error, setError] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  const [banks, setBanks] = useState<Record<string, CourseState>>({})
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash))
  const [playing, setPlaying] = useState<Playing | null>(null)
  const [oral, setOral] = useState<Record<string, OralState>>({})
  const [sysDark, setSysDark] = useState(systemDark)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    fetchData('courses.json')
      .then(validateIndex)
      .then(async (idx) => {
        const p = await loadProgress(idx.map((c) => c.id))
        setIndex(idx)
        setProgress(p)
      })
      .catch((e: unknown) => setError(message(e)))
  }, [attempt])

  // storage writes only the keys that changed, so saving what was just loaded writes nothing
  useEffect(() => {
    if (progress) saveProgress(progress)
  }, [progress])

  const update: Update = useCallback((fn) => setProgress((p) => p && fn(p)), [])
  const updateCourse = useCallback(
    (id: string) => (fn: (c: CourseProgress) => CourseProgress) => update((p) => ({ ...p, courses: { ...p.courses, [id]: fn(courseOf(p, id)) } })),
    [update],
  )

  const go = useCallback((r: Route, replace = false) => {
    const hash = toHash(r)
    if (replace) history.replaceState(null, '', hash)
    else if (location.hash !== hash) location.hash = hash
    setRoute(r)
    window.scrollTo(0, 0)
  }, [])
  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash(location.hash))
      window.scrollTo(0, 0)
    }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  const courseId = 'course' in route ? route.course : null
  const info = index?.find((c) => c.id === courseId)

  const loadCourse = useCallback((c: CourseInfo) => {
    setBanks((b) => ({ ...b, [c.id]: {} }))
    fetchData(c.file)
      .then((raw) => {
        const bank = validateBank(raw)
        if (bank.course.id !== c.id) throw new Error(`course id ${bank.course.id}, expected ${c.id}`)
        setBanks((b) => ({ ...b, [c.id]: { bank } }))
      })
      .catch((e: unknown) => setBanks((b) => ({ ...b, [c.id]: { error: message(e) } })))
  }, [])
  useEffect(() => {
    const wanted = route.name === 'devCharts' ? (index ?? []) : info ? [info] : []
    for (const c of wanted) if (!banks[c.id]) loadCourse(c)
  }, [route.name, index, info, banks, loadCourse])

  // Redirects: the start route, unknown courses, a run that is no longer in memory, the dev page in production
  useEffect(() => {
    if (!index || !progress) return
    if (route.name === 'start' || (route.name === 'courses' && index.length === 1)) {
      const target = index.find((c) => c.id === progress.lastCourse) ?? (index.length === 1 ? index[0] : null)
      if (route.name === 'start' || target) go(target ? { name: 'home', course: target.id } : { name: 'courses' }, true)
    } else if (courseId && !info) go({ name: 'courses' }, true)
    else if ((route.name === 'play' || route.name === 'result') && playing?.course !== route.course) go({ name: 'home', course: route.course }, true)
    else if (route.name === 'devCharts' && !import.meta.env.DEV) go({ name: 'start' }, true)
    else if (route.name === 'briefing' && route.kind.type === 'level') {
      const level = route.kind.level
      if (banks[route.course]?.bank?.levels.every((l) => l.id !== level)) go({ name: 'home', course: route.course }, true)
    }
  }, [route, index, progress, courseId, info, playing, banks, go])

  useEffect(() => {
    if (info && progress && progress.lastCourse !== info.id) update((p) => ({ ...p, lastCourse: info.id }))
  }, [info, progress, update])

  const lang = progress?.settings.lang ?? DEFAULT_LANG
  const t = dicts[lang]
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setSysDark(systemDark())
    mq.addEventListener('change', sync)
    const off = onThemeChanged(sync)
    return () => {
      mq.removeEventListener('change', sync)
      off()
    }
  }, [])
  const theme = progress?.settings.theme ?? 'auto'
  const dark = theme === 'auto' ? sysDark : theme === 'dark'
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = dark ? 'dark' : 'light'
    setAppColor(getComputedStyle(root).getPropertyValue('--paper').trim())
  }, [dark])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(id)
  }, [toast])

  // Back always goes to the screen's parent, not through history
  const lastCourse = index?.some((c) => c.id === progress?.lastCourse) ? progress!.lastCourse : null
  const onBack = useMemo(() => {
    switch (route.name) {
      case 'start':
      case 'home':
      case 'devCharts':
        return null
      case 'courses':
        return lastCourse ? () => go({ name: 'home', course: lastCourse }) : null
      case 'settings':
        return () => go(lastCourse ? { name: 'home', course: lastCourse } : { name: 'courses' })
      case 'play': {
        const course = route.course
        return async () => {
          if (!playing) return go({ name: 'home', course })
          const started = playing.run.answers.length > 0 && playing.run.status === 'playing'
          if (!started || (await confirmDialog(t.exitConfirm))) go(exitTo(course, playing.kind))
        }
      }
      case 'result':
        return () => go(playing ? exitTo(route.course, playing.kind) : { name: 'home', course: route.course })
      default:
        return () => go({ name: 'home', course: route.course })
    }
  }, [route, lastCourse, playing, t, go])
  useEffect(() => (onBack ? showBackButton(onBack) : undefined), [onBack])

  if (error)
    return (
      <I18nProvider value={t}>
        <div className="app center">
          <h2>{t.loadError}</h2>
          <p className="muted">{error}</p>
          <button
            className="sk btn primary"
            onClick={() => {
              setError(undefined)
              setAttempt((a) => a + 1)
            }}
          >
            {t.tryAgain}
          </button>
        </div>
      </I18nProvider>
    )
  if (!index || !progress) return <div className="app center hand">{t.loading}</div>

  const questionsFor = (bank: Bank, c: CourseProgress, kind: Kind): Question[] => {
    switch (kind.type) {
      case 'level':
        return bank.questions.filter((q) => q.level === kind.level)
      case 'final':
        return buildFinal(bank.questions, bank.levels.map((l) => l.id), bank.finalExam.questionsPerLevel)
      case 'review':
        return bank.questions.filter((q) => q.id in c.mistakes)
      case 'oral': {
        const ids = bank.examQuestions.find((e) => e.n === kind.n)?.quizQuestionIds ?? []
        return bank.questions.filter((q) => ids.includes(q.id))
      }
    }
  }
  const start = (bank: Bank, kind: Kind, mode: Mode, replace = false) => {
    const course = bank.course.id
    setPlaying({ course, kind, run: startRun(questionsFor(bank, courseOf(progress, course), kind), mode), id: Date.now() })
    go({ name: 'play', course }, replace)
  }

  const submit = (answer: string[]) => {
    if (!playing) return
    const { run, kind, course } = playing
    const q = run.questions[run.answers.length]
    const next = submitAnswer(run, answer)
    const correct = next.answers[next.answers.length - 1].correct
    haptic(correct ? 'success' : 'error')
    setPlaying({ ...playing, run: next })
    updateCourse(course)((c) => {
      const r = recordAnswer(c, q, correct, { review: kind.type === 'review', streak: next.streak })
      if (next.status === 'playing' || kind.type === 'review' || kind.type === 'oral') return r
      return recordRun(r, kind.type === 'final' ? 'final' : String(kind.level), next)
    })
  }

  let content: ReactNode = null
  if (route.name === 'courses') {
    const errors = Object.fromEntries(Object.entries(banks).map(([id, s]) => [id, s.error]))
    content = <Courses index={index} progress={progress} errors={errors} go={go} />
  } else if (route.name === 'settings') {
    content = <Settings index={index} progress={progress} lang={lang} update={update} onToast={setToast} />
  } else if (route.name === 'devCharts') {
    const loaded = Object.values(banks).flatMap((s) => (s.bank ? [s.bank] : []))
    content = loaded.length < index.length ? <Skeleton /> : <DevCharts banks={loaded} />
  } else if (route.name !== 'start' && info) {
    const state = banks[info.id]
    const bank = state?.bank
    const course = courseOf(progress, info.id)
    if (state?.error) {
      content = (
        <div className="center">
          <h2>
            {info.emoji} {info.title}
          </h2>
          <p className="error-text">{t.courseError}</p>
          <p className="muted">{state.error}</p>
          <button className="sk btn primary" onClick={() => loadCourse(info)}>
            {t.tryAgain}
          </button>
        </div>
      )
    } else if (!bank) {
      content = <Skeleton />
    } else if (route.name === 'home') {
      content = <Home bank={bank} progress={course} multi={index.length > 1} go={go} />
    } else if (route.name === 'briefing') {
      const k = route.kind
      content =
        k.type === 'level' && !bank.levels.some((l) => l.id === k.level) ? null : (
          <Briefing bank={bank} progress={course} kind={k} onStart={(mode) => start(bank, k, mode)} />
        )
    } else if (route.name === 'play' && playing) {
      content = (
        <Play
          key={playing.id}
          bank={bank}
          run={playing.run}
          onSubmit={submit}
          onDone={() => go({ name: 'result', course: info.id }, true)}
          onToast={setToast}
        />
      )
    } else if (route.name === 'result' && playing) {
      content = (
        <Result
          bank={bank}
          progress={course}
          kind={playing.kind}
          run={playing.run}
          go={go}
          onRetry={() => start(bank, playing.kind, playing.run.mode, true)}
        />
      )
    } else if (route.name === 'oral') {
      const o = oral[info.id] ?? { level: null, weakest: false }
      const setO = (next: OralState) => setOral((all) => ({ ...all, [info.id]: next }))
      content = (
        <Oral
          bank={bank}
          progress={course}
          update={updateCourse(info.id)}
          timer={progress.settings.timer}
          setTimer={(timer) => update((p) => ({ ...p, settings: { ...p.settings, timer } }))}
          oral={o}
          onChange={setO}
          onPractice={(n) => {
            setO({ ...o, n })
            start(bank, { type: 'oral', n }, 'free')
          }}
        />
      )
    } else if (route.name === 'stats') {
      content = <Stats bank={bank} progress={course} />
    }
  }

  return (
    <I18nProvider value={t}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        {/* wobbles the outlines of .sk boxes so they look hand-drawn */}
        <filter id="rough" x="-5%" y="-10%" width="110%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="3.5" />
        </filter>
      </svg>
      <div className="app">
        {onBack && !hasNativeBackButton && (
          <div className="topbar">
            <button className="sk btn small" onClick={onBack}>
              ← {t.back}
            </button>
          </div>
        )}
        {content}
      </div>
      {toast && (
        <div className="sk toast" role="status">
          {toast}
        </div>
      )}
    </I18nProvider>
  )
}

/** Last line of defence: a render error shows a message instead of a white screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    const t = dicts[DEFAULT_LANG]
    return (
      <div className="app center">
        <h2>{t.crash}</h2>
        <p className="muted">{this.state.error.message}</p>
        <button className="sk btn primary" onClick={() => location.reload()}>
          {t.tryAgain}
        </button>
      </div>
    )
  }
}
