import type { Bank } from '../engine/bank'
import { Chart } from './Chart'

/** #/dev/charts, dev build only: every chart at the 320 px card width, light and dark side by side. */
export function DevCharts({ banks }: { banks: Bank[] }) {
  const charts = banks.flatMap((b) => b.charts)
  return (
    <div className="stack">
      <h2>Charts ({charts.length})</h2>
      <div className="dev-charts">
        {charts.flatMap((c) =>
          (['light', 'dark'] as const).map((theme) => (
            <div key={`${c.id}-${theme}`} data-theme={theme} className="stack">
              <p className="hand" style={{ fontSize: '1.2rem' }}>
                {c.id} · {theme}
              </p>
              <div style={{ width: 256 }}>
                <Chart spec={c} showNotes />
              </div>
            </div>
          )),
        )}
      </div>
    </div>
  )
}
