import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { validateBank, type Bank, type Question } from '../engine/bank'
import { buildFinal, startRun, submitAnswer, type Mode } from '../engine/game'
import { detectLang, dicts, I18nProvider } from '../i18n'
import { recordAnswer, recordRun, type Progress } from '../storage/progress'
import { loadProgress, saveProgress } from '../storage/storage'
import {
  confirmDialog, haptic, hasNativeBackButton, languageCode, onThemeChanged, setAppColor, showBackButton, telegramDark,
} from '../telegram'
import { Briefing } from './Briefing'
import { Home } from './Home'
import { exitTo, type Kind, type Screen } from './nav'
import { Oral } from './Oral'
import { Play } from './Play'
import { Result } from './Result'
import { Settings } from './Settings'
import { Stats } from './Stats'

async function loadBank(): Promise<Bank> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/questions.json`, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return validateBank(await res.json())
}

const systemDark = () => telegramDark() ?? matchMedia('(prefers-color-scheme: dark)').matches
const autoLang = () => detectLang(languageCode() ?? navigator.language)

export type Update = (fn: (p: Progress) => Progress) => void

export function App() {
  const [bank, setBank] = useState<Bank>()
  const [progress, setProgress] = useState<Progress>()
  const [error, setError] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const [sysDark, setSysDark] = useState(systemDark)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const loaded = useRef(false)

  useEffect(() => {
    Promise.all([loadBank(), loadProgress()])
      .then(([b, p]) => {
        setBank(b)
        setProgress(p)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [attempt])

  useEffect(() => {
    if (!progress) return
    if (loaded.current) saveProgress(progress)
    loaded.current = true // skip writing back what was just loaded
  }, [progress])

  const update: Update = useCallback((fn) => setProgress((p) => p && fn(p)), [])

  const lang = progress?.settings.lang ?? autoLang()
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

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const go = useCallback((s: Screen) => {
    setScreen(s)
    window.scrollTo(0, 0)
  }, [])

  const onBack = useMemo(() => {
    switch (screen.name) {
      case 'home':
        return null
      case 'play':
        return async () => {
          const started = screen.run.answers.length > 0 && screen.run.status === 'playing'
          if (!started || (await confirmDialog(t.exitConfirm))) go(exitTo(screen.kind))
        }
      case 'result':
        return () => go(exitTo(screen.kind))
      default:
        return () => go({ name: 'home' })
    }
  }, [screen, t, go])
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
  if (!bank || !progress) return <div className="app center hand">{t.loading}</div>

  const questionsFor = (kind: Kind): Question[] => {
    switch (kind.type) {
      case 'level':
        return bank.questions.filter((q) => q.level === kind.level)
      case 'final':
        return buildFinal(bank.questions, bank.levels.map((l) => l.id), bank.finalExam.questionsPerLevel)
      case 'review':
        return bank.questions.filter((q) => q.id in progress.mistakes)
      case 'oral': {
        const ids = bank.examQuestions.find((e) => e.n === kind.n)?.quizQuestionIds ?? []
        return bank.questions.filter((q) => ids.includes(q.id))
      }
    }
  }
  const start = (kind: Kind, mode: Mode) =>
    go({ name: 'play', kind, run: startRun(questionsFor(kind), mode), id: Date.now() })

  const submit = (answer: string[]) => {
    if (screen.name !== 'play') return
    const { run, kind } = screen
    const q = run.questions[run.answers.length]
    const next = submitAnswer(run, answer)
    const correct = next.answers[next.answers.length - 1].correct
    haptic(correct ? 'success' : 'error')
    setScreen({ ...screen, run: next })
    update((p) => {
      const r = recordAnswer(p, q, correct, { review: kind.type === 'review', streak: next.streak })
      if (next.status === 'playing' || kind.type === 'review' || kind.type === 'oral') return r
      return recordRun(r, kind.type === 'final' ? 'final' : String(kind.level), next)
    })
  }

  let content: ReactNode
  switch (screen.name) {
    case 'home':
      content = <Home bank={bank} progress={progress} go={go} />
      break
    case 'briefing':
      content = <Briefing bank={bank} progress={progress} kind={screen.kind} onStart={(mode) => start(screen.kind, mode)} />
      break
    case 'play':
      content = (
        <Play
          key={screen.id}
          bank={bank}
          run={screen.run}
          onSubmit={submit}
          onDone={() => go({ name: 'result', kind: screen.kind, run: screen.run })}
          onToast={showToast}
        />
      )
      break
    case 'result':
      content = (
        <Result bank={bank} progress={progress} kind={screen.kind} run={screen.run} go={go} onRetry={() => start(screen.kind, screen.run.mode)} />
      )
      break
    case 'oral':
      content = (
        <Oral
          bank={bank}
          progress={progress}
          update={update}
          oral={screen.oral}
          onChange={(oral) => setScreen({ name: 'oral', oral })}
          onPractice={(n) => start({ type: 'oral', n, oral: screen.oral }, 'free')}
        />
      )
      break
    case 'stats':
      content = <Stats bank={bank} progress={progress} />
      break
    case 'settings':
      content = <Settings bank={bank} progress={progress} lang={lang} update={update} onToast={showToast} />
      break
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
    const t = dicts[autoLang()]
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
