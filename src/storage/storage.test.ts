import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultProgress, type Progress } from './progress'

// Fake Telegram CloudStorage + localStorage, shared across simulated app restarts.
const cloud = new Map<string, string>()
const local = new Map<string, string>()

function stubEnv() {
  const cb = <T>(fn?: (e: null, v: T) => void, v?: T) => fn?.(null, v as T)
  vi.stubGlobal('window', {
    Telegram: {
      WebApp: {
        initData: 'query_id=1',
        isVersionAtLeast: () => true,
        CloudStorage: {
          setItem: (k: string, v: string, f?: (e: null, ok: boolean) => void) => {
            if (v.length > 4096) throw new Error('value too long')
            cloud.set(k, v)
            cb(f, true)
          },
          getItem: (k: string, f: (e: null, v: string) => void) => cb(f, cloud.get(k) ?? ''),
          getItems: (ks: string[], f: (e: null, v: Record<string, string>) => void) =>
            cb(f, Object.fromEntries(ks.map((k) => [k, cloud.get(k) ?? '']))),
          removeItems: (ks: string[], f?: (e: null, ok: boolean) => void) => {
            ks.forEach((k) => cloud.delete(k))
            cb(f, true)
          },
        },
      },
    },
  })
  vi.stubGlobal('document', { addEventListener: () => {} })
  vi.stubGlobal('localStorage', { getItem: (k: string) => local.get(k) ?? null, setItem: (k: string, v: string) => local.set(k, v) })
}

async function freshApp() {
  vi.resetModules()
  stubEnv()
  return import('./storage')
}

const big = (): Progress => ({
  ...defaultProgress(),
  answered: 42,
  mistakes: Object.fromEntries(Array.from({ length: 316 }, (_, i) => [`L${String(i % 13).padStart(2, '0')}-${String(i).padStart(3, '0')}`, i % 2])),
  oral: Object.fromEntries(Array.from({ length: 110 }, (_, i) => [i + 1, [2, 4] as [number, number]])),
})

beforeEach(() => {
  cloud.clear()
  local.clear()
})

describe('storage adapter', () => {
  it('splits large progress into chunks under the CloudStorage limit and reads it back', async () => {
    const s = await freshApp()
    s.saveProgress(big())
    await s.flushProgress()
    expect(Number(cloud.get('progress_v1'))).toBeGreaterThan(1)

    local.clear() // another device: only the cloud copy exists
    const loaded = await (await freshApp()).loadProgress()
    expect(loaded.mistakes).toEqual(big().mistakes)
    expect(loaded.answered).toBe(42)
  })

  it('removes stale chunks when progress shrinks', async () => {
    const s = await freshApp()
    s.saveProgress(big())
    await s.flushProgress()
    s.saveProgress(defaultProgress())
    await s.flushProgress()
    expect(cloud.get('progress_v1')).toBe('1')
    expect([...cloud.keys()].sort()).toEqual(['progress_v1', 'progress_v1_0'])
  })

  it('prefers the newer copy and survives a broken cloud value', async () => {
    const s = await freshApp()
    s.saveProgress({ ...defaultProgress(), answered: 1 })
    await s.flushProgress()
    local.set('progress_v1', JSON.stringify({ ...defaultProgress(), answered: 2, savedAt: Date.now() + 1000 }))
    expect((await (await freshApp()).loadProgress()).answered).toBe(2)

    cloud.set('progress_v1_0', '{"v":1,"answ') // interrupted write
    local.clear()
    expect((await (await freshApp()).loadProgress()).answered).toBe(0)
  })
})
