// Thin wrapper over Telegram.WebApp. Every call is a safe no-op (or a browser fallback) outside Telegram.

type Cb<T> = (err: string | null, value?: T) => void

export interface TgCloudStorage {
  setItem(key: string, value: string, cb?: Cb<boolean>): void
  getItem(key: string, cb: Cb<string>): void
  getItems(keys: string[], cb: Cb<Record<string, string>>): void
  removeItems(keys: string[], cb?: Cb<boolean>): void
}

interface TgWebApp {
  initData: string
  colorScheme: 'light' | 'dark'
  isVersionAtLeast(version: string): boolean
  ready(): void
  expand(): void
  disableVerticalSwipes?(): void
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
  onEvent(event: 'themeChanged', cb: () => void): void
  offEvent(event: 'themeChanged', cb: () => void): void
  openTelegramLink(url: string): void
  openLink(url: string): void
  showConfirm(message: string, cb: (ok: boolean) => void): void
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void }
  HapticFeedback: {
    notificationOccurred(type: 'error' | 'success' | 'warning'): void
    selectionChanged(): void
  }
  CloudStorage: TgCloudStorage
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp }
  }
}

const sdk = window.Telegram?.WebApp
/** The SDK script also loads in a plain browser; only inside Telegram is initData filled in. */
const tg = sdk?.initData ? sdk : undefined
const at = (version: string) => !!tg?.isVersionAtLeast(version)

export const inTelegram = !!tg
export const hasNativeBackButton = at('6.1')
export const cloudStorage: TgCloudStorage | undefined = at('6.9') ? tg!.CloudStorage : undefined

export function initTelegram() {
  if (!tg) return
  tg.ready()
  tg.expand()
  if (at('7.7')) tg.disableVerticalSwipes?.()
}

export function setAppColor(hex: string) {
  if (at('6.1')) tg!.setBackgroundColor(hex)
  if (at('6.9')) tg!.setHeaderColor(hex) // hex colors are accepted from 6.9
}

/** null outside Telegram: then the caller follows prefers-color-scheme. */
export const telegramDark = (): boolean | null => (tg ? tg.colorScheme === 'dark' : null)

export function onThemeChanged(cb: () => void): () => void {
  if (!tg) return () => {}
  tg.onEvent('themeChanged', cb)
  return () => tg.offEvent('themeChanged', cb)
}

export function haptic(kind: 'success' | 'error' | 'warning' | 'select') {
  if (!at('6.1')) return
  if (kind === 'select') tg!.HapticFeedback.selectionChanged()
  else tg!.HapticFeedback.notificationOccurred(kind)
}

/** Shows the Telegram back button wired to cb; returns the cleanup. */
export function showBackButton(cb: () => void): () => void {
  if (!hasNativeBackButton) return () => {}
  tg!.BackButton.onClick(cb)
  tg!.BackButton.show()
  return () => {
    tg!.BackButton.offClick(cb)
    tg!.BackButton.hide()
  }
}

export function confirmDialog(message: string): Promise<boolean> {
  if (at('6.2')) return new Promise((resolve) => tg!.showConfirm(message, resolve))
  return Promise.resolve(window.confirm(message))
}

export function openTelegramLink(url: string) {
  if (tg) tg.openTelegramLink(url)
  else window.open(url, '_blank', 'noopener')
}

export function openExternalLink(url: string) {
  if (tg) tg.openLink(url)
  else window.open(url, '_blank', 'noopener')
}
