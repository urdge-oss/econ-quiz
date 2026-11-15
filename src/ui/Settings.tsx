import type { Bank } from '../engine/bank'
import { APP_VERSION, REPO_URL } from '../config'
import { LANG_NAMES, useT } from '../i18n'
import { defaultProgress, type Lang, type Progress, type Theme } from '../storage/progress'
import { confirmDialog, openExternalLink } from '../telegram'
import type { Update } from './App'

interface Props {
  bank: Bank
  progress: Progress
  lang: Lang
  update: Update
  onToast: (msg: string) => void
}

export function Settings({ bank, progress, lang, update, onToast }: Props) {
  const t = useT()
  const set = (patch: Partial<Progress['settings']>) => update((p) => ({ ...p, settings: { ...p.settings, ...patch } }))
  const { theme, timer } = progress.settings
  const themes: [Theme, string][] = [['auto', t.themeAuto], ['light', t.themeLight], ['dark', t.themeDark]]

  const reset = async () => {
    if (!(await confirmDialog(t.resetConfirm))) return
    update((p) => ({ ...defaultProgress(), settings: p.settings }))
    onToast(t.resetDone)
  }

  return (
    <div className="stack">
      <h2>{t.settings}</h2>

      <h3>{t.language}</h3>
      <div className="seg">
        {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
          <button key={l} className="sk btn small" aria-pressed={lang === l} onClick={() => set({ lang: l })}>
            {LANG_NAMES[l]}
          </button>
        ))}
      </div>

      <h3 className="section">{t.theme}</h3>
      <div className="seg">
        {themes.map(([v, label]) => (
          <button key={v} className="sk btn small" aria-pressed={theme === v} onClick={() => set({ theme: v })}>
            {label}
          </button>
        ))}
      </div>

      <h3 className="section">{t.timer}</h3>
      <div className="seg">
        {[60, 120, 180].map((s) => (
          <button key={s} className="sk btn small" aria-pressed={timer === s} onClick={() => set({ timer: s })}>
            {t.minutes(s / 60)}
          </button>
        ))}
      </div>

      <button className="sk btn wide section" onClick={reset} style={{ color: 'var(--bad-ink)' }}>
        {t.reset}
      </button>

      <div className="sk card stack section">
        <h3>{t.about}</h3>
        <p>World Economy Quiz</p>
        <p className="muted">{t.dataVersion(bank.dataAsOf)}</p>
        <p className="muted">{t.appVersion(APP_VERSION)}</p>
        <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => openExternalLink(REPO_URL)}>
          {t.repo}
        </button>
      </div>
    </div>
  )
}
