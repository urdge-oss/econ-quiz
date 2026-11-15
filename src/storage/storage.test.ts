import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultCourse, defaultSettings, type CourseProgress, type Progress } from './progress'

// Fake Telegram CloudStorage + localStorage, shared across simulated app restarts.
// The fake cloud enforces Telegram's limits: key 1–128 chars of A-Z a-z 0-9 _ -, value ≤ 4096 chars, ≤ 1024 keys.
const cloud = new Map<string, string>()
const local = new Map<string, string>()
let failCloudRemove = false
let failCloudSetFor: RegExp | null = null

function stubEnv() {
  type Cb<T> = (e: string | null, v?: T) => void
  vi.stubGlobal('window', {
    Telegram: {
      WebApp: {
        initData: 'query_id=1',
        isVersionAtLeast: () => true,
        CloudStorage: {
          setItem: (k: string, v: string, f?: Cb<boolean>) => {
            if (!/^[A-Za-z0-9_-]{1,128}$/.test(k)) return f?.('KEY_INVALID')
            if (v.length > 4096) return f?.('VALUE_TOO_LONG')
            if (failCloudSetFor?.test(k)) return f?.('NETWORK')
            if (!cloud.has(k) && cloud.size >= 1024) return f?.('STORAGE_KEYS_LIMIT')
            cloud.set(k, v)
            f?.(null, true)
          },
          getItem: (k: string, f: Cb<string>) => f(null, cloud.get(k) ?? ''),
          getItems: (ks: string[], f: Cb<Record<string, string>>) => f(null, Object.fromEntries(ks.map((k) => [k, cloud.get(k) ?? '']))),
          removeItems: (ks: string[], f?: Cb<boolean>) => {
            if (failCloudRemove) return f?.('NETWORK')
            ks.forEach((k) => cloud.delete(k))
            f?.(null, true)
          },
        },
      },
    },
  })
  vi.stubGlobal('document', { addEventListener: () => {} })
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => local.set(k, v),
    removeItem: (k: string) => local.delete(k),
  })
}

const IDS = ['world-economy', 'microeconomics']

async function freshApp() {
  vi.resetModules()
  stubEnv()
  return import('./storage')
}

/** Start the app: load, then let pending cloud writes finish. */
async function boot() {
  const s = await freshApp()
  const p = await s.loadProgress(IDS)
  await s.flushProgress()
  return { s, p }
}

const mistakes354 = Object.fromEntries(
  Array.from({ length: 354 }, (_, i) => [`L${String((i % 15) + 1).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`, i % 2]),
)

// What the old version (progress_v1) stored after a few weeks of play
const v1 = {
  v: 1,
  savedAt: 1_760_000_000_000,
  results: {
    1: { stars: 3, crown: true, bestNormal: 24, bestHardcore: 24 },
    2: { stars: 2, crown: false, bestNormal: 22, bestHardcore: 5 },
    7: { stars: 1, crown: false, bestNormal: 18, bestHardcore: 0 },
    final: { stars: 0, crown: false, bestNormal: 30, bestHardcore: 0 },
  },
  answered: 412,
  correct: 337,
  bestStreak: 19,
  perLevel: { 1: [60, 55], 2: [48, 40], 7: [30, 21] } as Record<string, [number, number]>,
  mistakes: Object.fromEntries(Array.from({ length: 260 }, (_, i) => [`L${String((i % 13) + 1).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`, i % 2])),
  oral: Object.fromEntries(Array.from({ length: 110 }, (_, i) => [i + 1, [i % 4, 4]])),
  settings: { lang: 'ru', theme: 'dark', timer: 180 },
}
const expectedCourse = (): CourseProgress => ({
  levels: v1.results,
  mistakes: v1.mistakes,
  oral: v1.oral as CourseProgress['oral'],
  stats: { answered: 412, correct: 337, bestStreak: 19, perLevel: v1.perLevel },
})

/** Writes v1 data exactly the way the old storage.ts did: cloud in 4000-char chunks + count, local as one string. */
function seedV1(data: object = v1) {
  const json = JSON.stringify(data)
  const chunks = json.match(/[\s\S]{1,4000}/g)!
  chunks.forEach((c, i) => cloud.set(`progress_v1_${i}`, c))
  cloud.set('progress_v1', String(chunks.length))
  local.set('progress_v1', json)
  return chunks.length
}

const v1Keys = (m: Map<string, string>) => [...m.keys()].filter((k) => k.startsWith('progress_v1'))

beforeEach(() => {
  cloud.clear()
  local.clear()
  failCloudRemove = false
  failCloudSetFor = null
})

describe('storage adapter', () => {
  it('splits long values into parts under the CloudStorage limit and reads them back', async () => {
    const { s, p } = await boot()
    s.saveProgress({ ...p, courses: { ...p.courses, microeconomics: { ...defaultCourse(), mistakes: mistakes354 } } })
    await s.flushProgress()
    const parts = Number(cloud.get('p2_microeconomics_mistakes'))
    expect(parts).toBeGreaterThan(1)
    expect([...cloud.values()].every((v) => v.length <= 4096)).toBe(true)

    local.clear() // another device: only the cloud copy exists
    const { p: other } = await boot()
    expect(other.courses.microeconomics.mistakes).toEqual(mistakes354)
    expect(other.courses['world-economy']).toEqual(defaultCourse())
  })

  it('removes stale parts when a value shrinks', async () => {
    const { s, p } = await boot()
    const course = { ...defaultCourse(), mistakes: mistakes354 }
    s.saveProgress({ ...p, courses: { ...p.courses, microeconomics: course } })
    await s.flushProgress()
    s.saveProgress({ ...p, courses: { ...p.courses, microeconomics: { ...course, mistakes: {} } } })
    await s.flushProgress()
    for (const m of [cloud, local]) {
      expect(m.get('p2_microeconomics_mistakes')).toBe('1')
      expect([...m.keys()].filter((k) => k.startsWith('p2_microeconomics_mistakes'))).toHaveLength(2)
    }
  })

  it('keeps courses apart and writes only the keys that changed', async () => {
    const { s, p } = await boot()
    const before = new Map(cloud)
    s.saveProgress({ ...p, courses: { ...p.courses, microeconomics: { ...defaultCourse(), oral: { 3: [2, 5] } } } })
    await s.flushProgress()
    const changed = [...cloud.keys()].filter((k) => cloud.get(k) !== before.get(k))
    expect(changed.every((k) => k.startsWith('p2_microeconomics_oral'))).toBe(true)
    const { p: again } = await boot()
    expect(again.courses.microeconomics.oral).toEqual({ 3: [2, 5] })
    expect(again.courses['world-economy'].oral).toEqual({})
  })

  it('takes the newer copy key by key and survives a broken cloud value', async () => {
    const { s, p } = await boot()
    s.saveProgress({ ...p, settings: { ...p.settings, timer: 60 } })
    await s.flushProgress()
    local.set('p2_settings_0', JSON.stringify({ t: Date.now() + 1000, d: { ...defaultSettings(), timer: 180 } }))
    expect((await boot()).p.settings.timer).toBe(180)
    expect(JSON.parse(cloud.get('p2_settings_0')!).d.timer).toBe(180) // the stale cloud copy is brought up to date

    cloud.set('p2_settings_0', '{"t":99999999999999,"d":{"tim') // interrupted write
    expect((await boot()).p.settings.timer).toBe(180)
  })
})

describe('migration from progress_v1', () => {
  it('moves realistic v1 data into World Economy, checks it, then deletes the old keys', async () => {
    expect(seedV1()).toBeGreaterThan(1) // the old cloud copy really was chunked
    const { p } = await boot()
    expect(p.courses['world-economy']).toEqual(expectedCourse())
    expect(p.courses.microeconomics).toEqual(defaultCourse())
    expect(p.settings).toEqual({ lang: 'ru', theme: 'dark', timer: 180 })
    expect(p.lastCourse).toBeNull() // so the course picker shows the new subject once
    for (const m of [cloud, local]) {
      expect(v1Keys(m)).toEqual([])
      expect(m.has('p2_migrated')).toBe(true)
    }

    local.clear() // the phone: only the cloud copy
    expect((await boot()).p.courses['world-economy']).toEqual(expectedCourse())
  })

  it('takes the newer of the cloud and local v1 copies', async () => {
    seedV1()
    local.set('progress_v1', JSON.stringify({ ...v1, savedAt: v1.savedAt + 5000, answered: 500 }))
    expect((await boot()).p.courses['world-economy'].stats.answered).toBe(500)
  })

  it('is idempotent: running again changes nothing', async () => {
    seedV1()
    await boot()
    const cloudAfter = new Map(cloud)
    const localAfter = new Map(local)
    const { p } = await boot()
    expect(p.courses['world-economy']).toEqual(expectedCourse())
    expect(cloud).toEqual(cloudAfter)
    expect(local).toEqual(localAfter)
  })

  it('finishes a migration that stopped between writing and deleting, without losing newer progress', async () => {
    seedV1()
    failCloudRemove = true // the app is closed right after writing the new keys
    const first = await boot()
    expect(v1Keys(cloud).length).toBeGreaterThan(0)
    expect(cloud.has('p2_migrated')).toBe(false)
    expect(first.p.courses['world-economy']).toEqual(expectedCourse())

    // the player keeps playing before the next start
    const course = first.p.courses['world-economy']
    first.s.saveProgress({
      ...first.p,
      courses: { ...first.p.courses, 'world-economy': { ...course, stats: { ...course.stats, answered: 413, correct: 338 } } },
    })
    await first.s.flushProgress()

    failCloudRemove = false
    const { p } = await boot()
    expect(p.courses['world-economy'].stats.answered).toBe(413)
    expect(p.courses['world-economy'].mistakes).toEqual(v1.mistakes)
    expect(v1Keys(cloud)).toEqual([])
    expect(v1Keys(local)).toEqual([])
    expect(cloud.has('p2_migrated')).toBe(true)
  })

  it('keeps the old keys when the new ones could not be written, and retries on the next start', async () => {
    seedV1()
    failCloudSetFor = /^p2_world-economy_mistakes/ // e.g. the connection drops
    const { p } = await boot()
    expect(p.courses['world-economy']).toEqual(expectedCourse()) // the player still sees everything
    expect(v1Keys(cloud).length).toBeGreaterThan(0)
    expect(local.has('progress_v1')).toBe(true)

    failCloudSetFor = null
    await boot()
    expect(v1Keys(cloud)).toEqual([])
    local.clear()
    expect((await boot()).p.courses['world-economy']).toEqual(expectedCourse())
  })

  it('works when only a browser localStorage copy exists', async () => {
    local.set('progress_v1', JSON.stringify(v1))
    vi.resetModules()
    stubEnv()
    vi.stubGlobal('window', {}) // plain browser, no Telegram
    const s = await import('./storage')
    const p: Progress = await s.loadProgress(IDS)
    expect(p.courses['world-economy']).toEqual(expectedCourse())
    expect(local.has('progress_v1')).toBe(false)
    expect(local.has('p2_migrated')).toBe(true)
  })
})
