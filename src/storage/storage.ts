// The only place that touches persistent storage.
// Telegram CloudStorage (synced across the user's devices) when available, localStorage always as a local copy.
// Both use the same keys and layout. Every value is stamped with the time it was saved; on load the newer copy wins, key by key.
import { cloudStorage, type TgCloudStorage } from '../telegram'
import {
  COURSE_PARTS, fromV1, LEGACY_COURSE, normalize, type CourseProgress, type Progress, type Settings,
} from './progress'

// CloudStorage keys may only contain A-Z a-z 0-9 _ - (so "p2_", not "p2:"); 128 chars; up to 1024 keys per user.
export const SETTINGS_KEY = 'p2_settings'
export const LAST_COURSE_KEY = 'p2_lastCourse'
export const MIGRATED_KEY = 'p2_migrated'
export const courseKey = (course: string, part: (typeof COURSE_PARTS)[number]) => `p2_${course}_${part}`
export const V1_KEY = 'progress_v1'

const CHUNK = 4000 // CloudStorage values are limited to 4096 chars
const DEBOUNCE_MS = 1500

interface Backend {
  get(keys: string[]): Promise<Record<string, string>> // a missing key reads as ''
  set(items: [string, string][]): Promise<void>
  remove(keys: string[]): Promise<void>
}

const call = <T>(fn: (cb: (err: string | null, v?: T) => void) => void) =>
  new Promise<T | undefined>((resolve, reject) => fn((err, v) => (err ? reject(new Error(err)) : resolve(v))))

const cloudBackend = (cs: TgCloudStorage): Backend => ({
  get: async (keys) => (keys.length ? ((await call<Record<string, string>>((cb) => cs.getItems(keys, cb))) ?? {}) : {}),
  set: async (items) => {
    for (const [k, v] of items) await call((cb) => cs.setItem(k, v, cb))
  },
  remove: async (keys) => {
    if (keys.length) await call((cb) => cs.removeItems(keys, cb))
  },
})

const localBackend: Backend = {
  get: async (keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k) ?? ''])),
  set: async (items) => items.forEach(([k, v]) => localStorage.setItem(k, v)),
  remove: async (keys) => keys.forEach((k) => localStorage.removeItem(k)),
}

const chunkKeys = (key: string, from: number, to: number) => Array.from({ length: to - from }, (_, i) => `${key}_${from + i}`)

/** Splits every value: `key` holds the number of parts, `key_0`, `key_1`, … hold the text. Writes run one at a time. */
class Store {
  private counts = new Map<string, number>()
  private queue: Promise<unknown> = Promise.resolve()
  constructor(readonly backend: Backend) {}

  async read(keys: string[]): Promise<Record<string, string | null>> {
    const heads = await this.backend.get(keys)
    const count = (k: string) => {
      const n = Number(heads[k])
      return Number.isInteger(n) && n > 0 ? n : 0
    }
    const parts = await this.backend.get(keys.flatMap((k) => chunkKeys(k, 0, count(k))))
    const out: Record<string, string | null> = {}
    for (const k of keys) {
      this.counts.set(k, count(k))
      out[k] = count(k) ? chunkKeys(k, 0, count(k)).map((c) => parts[c] ?? '').join('') : null
    }
    return out
  }

  write(key: string, value: string) {
    return this.run(async () => {
      const parts: [string, string][] = []
      for (let i = 0; i * CHUNK < value.length || i === 0; i++) parts.push([`${key}_${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK)])
      // parts first, count last: an interrupted write leaves an unparsable value, and load takes the other copy
      await this.backend.set(parts)
      await this.backend.set([[key, String(parts.length)]])
      const old = this.counts.get(key) ?? 0
      if (old > parts.length) await this.backend.remove(chunkKeys(key, parts.length, old))
      this.counts.set(key, parts.length)
    })
  }

  remove(key: string) {
    return this.run(async () => {
      await this.backend.remove([key, ...chunkKeys(key, 0, this.counts.get(key) ?? 0)])
      this.counts.set(key, 0)
    })
  }

  idle = () => this.queue

  private run(fn: () => Promise<void>) {
    const p = this.queue.then(fn)
    this.queue = p.catch(() => {})
    return p
  }
}

function localWorks() {
  try {
    localStorage.setItem('p2_probe', '1')
    localStorage.removeItem('p2_probe')
    return true
  } catch {
    return false // private mode / storage blocked: the cloud copy (if any) still works
  }
}

const cloud = cloudStorage ? new Store(cloudBackend(cloudStorage)) : null
const local = localWorks() ? new Store(localBackend) : null
const stores = [cloud, local].filter((s): s is Store => s !== null)

/** key → JSON of the data last loaded or saved, so a save writes only the keys that changed. */
const known = new Map<string, string>()
/** key → stamped value waiting for the debounced cloud write. */
const pending = new Map<string, string>()
let timer: ReturnType<typeof setTimeout> | undefined

interface Stamped {
  t: number
  d: unknown
  raw: string
}
const stamp = (t: number, json: string) => `{"t":${t},"d":${json}}`

function parseStamped(raw: string | null | undefined): Stamped | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as { t?: unknown; d?: unknown }
    return typeof v.t === 'number' && 'd' in v ? { t: v.t, d: v.d, raw } : null
  } catch {
    return null
  }
}

function parseV1(raw: string | null | undefined) {
  try {
    return raw ? fromV1(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function entries(p: Progress): [string, unknown][] {
  return [
    [SETTINGS_KEY, p.settings],
    [LAST_COURSE_KEY, p.lastCourse],
    ...Object.entries(p.courses).flatMap(([c, cp]) => COURSE_PARTS.map((part): [string, unknown] => [courseKey(c, part), cp[part]])),
  ]
}

/**
 * Loads settings and the progress of the given courses.
 * If v1 data ("progress_v1") is still around, it is merged into World Economy, written to every store,
 * read back and compared; only then are the v1 keys deleted and "p2_migrated" set. A run that stops halfway
 * is simply repeated on the next start: merging is newest-wins, so repeating it changes nothing.
 */
export async function loadProgress(courseIds: string[]): Promise<Progress> {
  const keys = [SETTINGS_KEY, LAST_COURSE_KEY, ...courseIds.flatMap((c) => COURSE_PARTS.map((p) => courseKey(c, p)))]
  const reads = await Promise.all(
    stores.map((s) =>
      s.read(s === cloud ? [...keys, V1_KEY] : keys).catch((e: unknown) => {
        console.warn('storage read failed', e)
        return null
      }),
    ),
  )

  const best = new Map<string, Stamped>()
  const consider = (k: string, v: Stamped | null) => {
    if (v && !((best.get(k)?.t ?? -1) >= v.t)) best.set(k, v) // ties keep what is already there
  }
  for (const r of reads) if (r) for (const k of keys) consider(k, parseStamped(r[k]))

  // v1 lived in cloud as chunks (same layout as Store) and in localStorage as one plain JSON string
  const cloudRead = cloud ? reads[stores.indexOf(cloud)] : null
  let localV1: string | null = null
  try {
    localV1 = local ? localStorage.getItem(V1_KEY) : null
  } catch {
    // unreadable local storage: only the cloud copy counts
  }
  const v1 = [parseV1(cloudRead?.[V1_KEY]), parseV1(localV1)]
    .filter((x) => x !== null)
    .sort((a, b) => b.savedAt - a.savedAt)[0]
  const migrated: string[] = []
  if (v1) {
    const parts: [string, unknown][] = [
      [SETTINGS_KEY, v1.settings],
      ...COURSE_PARTS.map((p): [string, unknown] => [courseKey(LEGACY_COURSE, p), v1.course[p]]),
    ]
    for (const [k, d] of parts) {
      const json = JSON.stringify(d)
      consider(k, { t: v1.savedAt, d, raw: stamp(v1.savedAt, json) })
      migrated.push(k)
    }
  }

  // Bring every readable store up to the winning values. Cloud waits for the debounce unless we are migrating.
  const writes: Promise<unknown>[] = []
  for (const [i, s] of stores.entries()) {
    const r = reads[i]
    if (!r) continue // never overwrite a store we could not read
    for (const [k, v] of best) {
      if (r[k] === v.raw) continue
      if (s === cloud && !v1) pending.set(k, v.raw)
      else writes.push(s.write(k, v.raw))
    }
  }
  if (pending.size) schedule()

  if (v1) {
    try {
      await Promise.all(writes)
      for (const [i, s] of stores.entries()) {
        if (!reads[i]) throw new Error('a store could not be read, so it cannot be checked')
        const back = await s.read(migrated)
        const bad = migrated.find((k) => back[k] !== best.get(k)!.raw)
        if (bad) throw new Error(`read-back mismatch in ${bad}`)
      }
      if (cloud) await cloud.remove(V1_KEY)
      if (local) localStorage.removeItem(V1_KEY)
      for (const s of stores) await s.backend.set([[MIGRATED_KEY, String(Date.now())]])
    } catch (e) {
      console.warn('progress_v1 migration not finished; it will be retried on the next start', e)
    }
  } else {
    await Promise.all(writes).catch((e: unknown) => console.warn('storage sync failed', e))
  }

  const data = (k: string) => best.get(k)?.d
  const progress: Progress = {
    settings: normalize('settings', data(SETTINGS_KEY)) as Settings,
    lastCourse: typeof data(LAST_COURSE_KEY) === 'string' ? (data(LAST_COURSE_KEY) as string) : null,
    courses: Object.fromEntries(
      courseIds.map((c) => [c, Object.fromEntries(COURSE_PARTS.map((p) => [p, normalize(p, data(courseKey(c, p)))])) as unknown as CourseProgress]),
    ),
  }
  for (const [k, d] of entries(progress)) known.set(k, JSON.stringify(d))
  return progress
}

function schedule() {
  clearTimeout(timer)
  timer = setTimeout(flushProgress, DEBOUNCE_MS)
}

/** Sends pending cloud writes now; resolves when every store has finished writing. */
export function flushProgress(): Promise<unknown> {
  clearTimeout(timer)
  const items = [...pending]
  pending.clear()
  const sent = items.map(([k, v]) => cloud!.write(k, v).catch((e: unknown) => console.warn('CloudStorage write failed', k, e)))
  return Promise.all([...sent, ...stores.map((s) => s.idle())])
}

/** Writes changed keys to the local copy at once and to the cloud debounced. */
export function saveProgress(p: Progress) {
  const now = Date.now()
  for (const [k, d] of entries(p)) {
    const json = JSON.stringify(d)
    if (known.get(k) === json) continue
    known.set(k, json)
    const raw = stamp(now, json)
    local?.write(k, raw).catch((e: unknown) => console.warn('local save failed', k, e))
    if (cloud) pending.set(k, raw)
  }
  if (pending.size) schedule()
}

if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushProgress()
  })
