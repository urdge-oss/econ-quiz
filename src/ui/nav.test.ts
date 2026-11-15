import { describe, expect, it } from 'vitest'
import { parseHash, toHash, type Route } from './nav'

describe('hash routes', () => {
  it('round-trips every route', () => {
    const routes: Route[] = [
      { name: 'start' },
      { name: 'courses' },
      { name: 'settings' },
      { name: 'devCharts' },
      { name: 'home', course: 'microeconomics' },
      { name: 'briefing', course: 'microeconomics', kind: { type: 'level', level: 7 } },
      { name: 'briefing', course: 'world-economy', kind: { type: 'final' } },
      { name: 'briefing', course: 'world-economy', kind: { type: 'review' } },
      { name: 'play', course: 'microeconomics' },
      { name: 'result', course: 'microeconomics' },
      { name: 'oral', course: 'world-economy' },
      { name: 'stats', course: 'world-economy' },
    ]
    for (const r of routes) expect(parseHash(toHash(r))).toEqual(r)
    expect(toHash(routes[5])).toBe('#/c/microeconomics/level/7')
  })
  it('falls back to the start route on anything unknown', () => {
    for (const h of ['', '#', '#/', '#/nope', '#/c', '#/c/x/level/abc', '#/c/x/whatever'])
      expect(parseHash(h)).toEqual({ name: 'start' })
  })
})
