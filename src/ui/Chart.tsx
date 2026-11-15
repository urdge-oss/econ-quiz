// A textbook graph from charts[] drawn in the app's pencil style: axes and curves get the same wobble filter
// as the sketchy boxes (seeded by chart id, so it never jitters), areas get hatching. Text stays crisp.
import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Chart as Spec, Point } from '../engine/bank'
import { useT } from '../i18n'

// viewBox units ≈ px at 320 px screen width (the card is ~256 px wide there, scale 0.95), so 14 units ≥ 13 px on screen
const W = 270
const H = 262
const M = { l: 50, r: 8, t: 26, b: 40 }
const PW = W - M.l - M.r
const PH = H - M.t - M.b
const HATCH = [45, -45, 70, -20] // a different angle per area, so neighbours differ even in grayscale
const SIZE = { tick: 15, curve: 16, marker: 14, text: 14, axis: 15, letter: 15 }

const seedOf = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7)
/** Rough width of Caveat text (subscripts count as narrower). */
const textWidth = (s: string, size: number) => [...s].reduce((w, c) => w + (/[₀-₉]/.test(c) ? 0.3 : 0.42), 0) * size

/** Draws ₀–₉ as lowered digits: the hand font has no subscript glyphs. */
function Sub({ text }: { text: string }) {
  const runs = text.split(/([₀-₉]+)/).filter(Boolean)
  let low = false
  return runs.map((r, i) => {
    const sub = /[₀-₉]/.test(r)
    const dy = sub === low ? undefined : sub ? '0.3em' : '-0.3em'
    low = sub
    return sub ? (
      <tspan key={i} dy={dy} fontSize="85%">
        {[...r].map((c) => String(c.charCodeAt(0) - 0x2080)).join('')}
      </tspan>
    ) : (
      <tspan key={i} dy={dy}>
        {r}
      </tspan>
    )
  })
}

interface Label {
  x: number // left edge
  y: number // baseline
  text: string
  size: number
  className?: string
}

/**
 * Places labels one by one, keeping each inside the picture and nudging it up or down when its (estimated) box
 * would cover one placed before it. Fixed things (ticks, axis titles, area letters) are placed first and never move.
 */
function layoutLabels() {
  const boxes: { x: number; y: number; w: number; h: number }[] = []
  const labels: Label[] = []
  const hits = (x: number, y: number, w: number, h: number) =>
    boxes.some((b) => x < b.x + b.w && b.x < x + w && y - h < b.y && b.y - b.h < y)
  const block = (x: number, y: number, w: number, h: number) => boxes.push({ x, y, w, h })
  const add = (x: number, y: number, text: string, size: number, opts: { anchor?: 'start' | 'end' | 'middle'; fixed?: boolean; className?: string } = {}) => {
    const w = textWidth(text, size)
    const h = size * 0.85
    let left = opts.anchor === 'end' ? x - w : opts.anchor === 'middle' ? x - w / 2 : x
    left = Math.max(2, Math.min(left, W - 2 - w))
    let top = y
    if (!opts.fixed)
      for (const dy of [0, -h, h, -2 * h, 2 * h]) {
        if (!hits(left, y + dy, w, h)) {
          top = y + dy
          break
        }
      }
    block(left, top, w, h)
    labels.push({ x: left, y: top, text, size, className: opts.className })
  }
  return { add, block, labels }
}

function ChartSvg({ spec }: { spec: Spec }) {
  const uid = useId().replace(/:/g, '')
  const sx = (x: number) => M.l + (x / spec.x.max) * PW
  const sy = (y: number) => M.t + PH - (y / spec.y.max) * PH
  const path = (pts: Point[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`).join('')

  const { add, block, labels } = layoutLabels()
  const chips = spec.areas.map((a) => {
    const w = Math.max(20, textWidth(a.label, SIZE.letter) * 1.3 + 10)
    const [x, y] = [sx(a.labelAt[0]), sy(a.labelAt[1])]
    block(x - w / 2, y + 10, w, 20)
    return { x, y, w, label: a.label }
  })
  for (const t of spec.ticks.x) add(sx(t.at), M.t + PH + 18, t.label, SIZE.tick, { anchor: 'middle', fixed: true })
  for (const t of spec.ticks.y) add(M.l - 7, sy(t.at) + 5, t.label, SIZE.tick, { anchor: 'end', fixed: true })
  add(M.l + PW / 2, H - 4, spec.x.label, SIZE.axis, { anchor: 'middle', fixed: true, className: 'soft' })
  add(2, M.t - 12, spec.y.label, SIZE.axis, { fixed: true, className: 'soft' })
  for (const m of spec.markers) {
    // to the right of the dot, or to the left when it would run off the picture
    const right = sx(m.at[0]) + 6 + textWidth(m.label, SIZE.marker) <= W - 2
    add(sx(m.at[0]) + (right ? 6 : -6), sy(m.at[1]) - 6, m.label, SIZE.marker, { anchor: right ? 'start' : 'end' })
  }
  for (const c of spec.curves) if (c.label && c.labelAt) add(sx(c.labelAt[0]), sy(c.labelAt[1]) + 5, c.label, SIZE.curve)
  for (const t of spec.texts) add(sx(t.at[0]), sy(t.at[1]) + 4, t.text, SIZE.text, { className: 'soft' })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" aria-hidden="true">
      <defs>
        <filter id={`${uid}r`} filterUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed={seedOf(spec.id)} />
          <feDisplacementMap in="SourceGraphic" scale="2.6" />
        </filter>
        {spec.areas.map((_, i) => (
          <pattern key={i} id={`${uid}h${i}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform={`rotate(${HATCH[i % 4]})`}>
            <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: `var(--h${i % 4})` }} strokeWidth="1.6" />
          </pattern>
        ))}
      </defs>

      {spec.areas.map((a, i) => (
        <g key={i}>
          <path d={`${path(a.polygon)}Z`} style={{ fill: `var(--h${i % 4})` }} opacity="0.16" />
          <path d={`${path(a.polygon)}Z`} fill={`url(#${uid}h${i})`} />
        </g>
      ))}

      <g filter={`url(#${uid}r)`} fill="none" strokeLinecap="round" strokeLinejoin="round" className="chart-ink">
        {spec.guides.map((g, i) => (
          <path key={i} d={path(g.points)} className="guide" />
        ))}
        <path d={`M${M.l} ${M.t - 6}V${M.t + PH}H${M.l + PW + 4}`} strokeWidth="2" />
        {spec.ticks.x.map((t, i) => (
          <path key={i} d={`M${sx(t.at)} ${M.t + PH}v4`} strokeWidth="1.5" />
        ))}
        {spec.ticks.y.map((t, i) => (
          <path key={i} d={`M${M.l - 4} ${sy(t.at)}h4`} strokeWidth="1.5" />
        ))}
        {spec.curves.map((c, i) => (
          <path key={i} d={path(c.points)} strokeWidth={c.style === 'bold' ? 3.4 : 1.9} strokeDasharray={c.style === 'dashed' ? '6 4' : undefined} />
        ))}
      </g>

      <g className="chart-text">
        {spec.markers.map((m, i) => (
          <circle key={i} cx={sx(m.at[0])} cy={sy(m.at[1])} r="3.3" className="dot" />
        ))}
        {labels.map((l, i) => (
          <text key={i} x={l.x} y={l.y} fontSize={l.size} className={l.className}>
            <Sub text={l.text} />
          </text>
        ))}
        {chips.map((c, i) => (
          <g key={i} transform={`translate(${c.x} ${c.y})`}>
            <rect x={-c.w / 2} y="-10" width={c.w} height="20" rx="10" className="area-chip" />
            <text y="5.5" textAnchor="middle" className="area-letter">
              {c.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  )
}

/** Full card width, at most ~45% of the screen tall; a tap opens it full screen. Notes are hidden while it is a question. */
export function Chart({ spec, showNotes = false }: { spec: Spec; showNotes?: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const label = [spec.title, ...spec.notes].join('. ')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open])

  return (
    <figure className="chart">
      <div className="chart-box" role="img" aria-label={label} onClick={() => setOpen(true)}>
        <ChartSvg spec={spec} />
      </div>
      <button className="link chart-open" onClick={() => setOpen(true)} aria-label={t.openChart} title={t.openChart}>
        ⤢
      </button>
      {showNotes && spec.notes.length > 0 && <figcaption className="muted">{spec.notes.join(' ')}</figcaption>}
      {open &&
        createPortal(
          <div className="chart-full" role="dialog" aria-modal="true" aria-label={spec.title} onClick={() => setOpen(false)}>
            <div className="sk card stack" onClick={(e) => e.stopPropagation()}>
              <p className="hand" style={{ fontSize: '1.4rem' }}>
                {spec.title}
              </p>
              <div role="img" aria-label={label}>
                <ChartSvg spec={spec} />
              </div>
              {showNotes && spec.notes.length > 0 && <p className="muted">{spec.notes.join(' ')}</p>}
              <button className="sk btn wide" autoFocus onClick={() => setOpen(false)}>
                {t.close}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </figure>
  )
}
