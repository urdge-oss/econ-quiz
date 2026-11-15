// The only place that touches persistent storage.
// Telegram CloudStorage (synced across the user's devices) when available, localStorage always as a local copy.
import { cloudStorage as cloud } from '../telegram'
import { defaultProgress, migrate, PROGRESS_KEY as KEY, type Progress } from './progress'

const CHUNK = 4000 // CloudStorage values are limited to 4096 chars, so the JSON is split across KEY_0, KEY_1, …
const DEBOUNCE_MS = 1500

let cloudChunks = 0
let queue: Promise<unknown> = Promise.resolve()
let timer: ReturnType<typeof setTimeout> | undefined
let pending: string | null = null

const call = <T>(fn: (cb: (err: string | null, v?: T) => void) => void) =>
  new Promise<T | undefined>((resolve, reject) => fn((err, v) => (err ? reject(new Error(err)) : resolve(v))))

const chunkKeys = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `${KEY}_${from + i}`)

async function readCloud(): Promise<string | null> {
  const count = Number(await call<string>((cb) => cloud!.getItem(KEY, cb)))
  if (!count) return null
  const keys = chunkKeys(0, count)
  const values = await call<Record<string, string>>((cb) => cloud!.getItems(keys, cb))
  cloudChunks = count
  return keys.map((k) => values?.[k] ?? '').join('')
}

async function writeCloud(json: string) {
  const chunks: string[] = []
  for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK))
  // chunks first, count last: an interrupted write leaves unparsable data, and load falls back to the local copy
  for (const [i, c] of chunks.entries()) await call((cb) => cloud!.setItem(`${KEY}_${i}`, c, cb))
  await call((cb) => cloud!.setItem(KEY, String(chunks.length), cb))
  if (cloudChunks > chunks.length) await call((cb) => cloud!.removeItems(chunkKeys(chunks.length, cloudChunks), cb))
  cloudChunks = chunks.length
}

function readLocal(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function parse(text: string | null): Progress | null {
  try {
    return text ? migrate(JSON.parse(text)) : null
  } catch {
    return null
  }
}

export async function loadProgress(): Promise<Progress> {
  let cloudText: string | null = null
  if (cloud) {
    try {
      cloudText = await readCloud()
    } catch (e) {
      console.warn('CloudStorage read failed, using the local copy', e)
    }
  }
  const copies = [parse(cloudText), parse(readLocal())].filter((p): p is Progress => p !== null)
  copies.sort((a, b) => b.savedAt - a.savedAt)
  return copies[0] ?? defaultProgress()
}

export function flushProgress(): Promise<unknown> {
  clearTimeout(timer)
  if (pending === null || !cloud) return queue
  const json = pending
  pending = null
  queue = queue.then(() => writeCloud(json)).catch((e) => console.warn('CloudStorage write failed', e))
  return queue
}

/** Writes the local copy at once and the cloud copy debounced. */
export function saveProgress(p: Progress) {
  pending = JSON.stringify({ ...p, savedAt: Date.now() })
  try {
    localStorage.setItem(KEY, pending)
  } catch {
    // private mode / storage blocked: the cloud copy (if any) still gets it
  }
  clearTimeout(timer)
  timer = setTimeout(flushProgress, DEBOUNCE_MS)
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushProgress()
})
