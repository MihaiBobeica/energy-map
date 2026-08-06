export type ChartSeries = {
  id: string
  label: string
  points: [year: number, value: number][]
  emphasized: boolean
}

const WIDTH = 320
const HEIGHT = 160
const PAD = { top: 10, right: 8, bottom: 20, left: 44 }

const EMPHASIZED_COLOR = "#1d6fa8"
const MUTED_COLOR = "#9db4c4"

/**
 * Smallest "round" number at or above `value`.
 *
 * The steps are deliberately fine. With only 1/2/5/10, a country generating
 * 561 TWh got an axis topping out at 1000, so its line sat in the lower half
 * and a decade of variation looked like a flat line. 1.5/2.5/3/4/6/7.5 give a
 * much tighter fit while still landing on numbers a reader can divide by.
 */
function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const factor of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10]) {
    if (value <= factor * magnitude) return factor * magnitude
  }
  return 10 * magnitude
}

/**
 * Three significant digits, not one decimal place. Half of a 2.5-style axis
 * maximum is 1.25, and `toFixed(1)` printed "1.3" against a gridline actually
 * drawn at 1.25 — a label that contradicts its own line. The same rounding
 * flattened small values to "0.0", which reads as a reported zero.
 */
const tickFormat = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 })

function formatTick(value: number): string {
  return value >= 1000 ? `${tickFormat.format(value / 1000)}k` : tickFormat.format(value)
}

/** Minimal dependency-free SVG line chart for country histories. */
export function LineChart({
  series,
  unit,
  markerYear,
}: {
  series: ChartSeries[]
  unit: string
  markerYear?: number
}) {
  const drawable = series.filter((entry) => entry.points.length > 0)
  const allPoints = drawable.flatMap((entry) => entry.points)
  if (allPoints.length === 0) return null

  const years = allPoints.map(([year]) => year)
  const minYear = Math.min(...years)
  const maxYear = Math.max(...years)
  const maxValue = niceMax(Math.max(...allPoints.map(([, value]) => value)))

  const x = (year: number) =>
    maxYear === minYear
      ? PAD.left + (WIDTH - PAD.left - PAD.right) / 2
      : PAD.left + ((year - minYear) / (maxYear - minYear)) * (WIDTH - PAD.left - PAD.right)
  const y = (value: number) =>
    HEIGHT - PAD.bottom - (value / maxValue) * (HEIGHT - PAD.top - PAD.bottom)

  const yTicks = [0, maxValue / 2, maxValue]
  const emphasized = drawable.find((entry) => entry.emphasized) ?? drawable[0]
  // Only mark the selected year when this series actually has a point there:
  // a marker floating over a gap would imply a value that was never reported.
  const markerPoint =
    markerYear === undefined
      ? undefined
      : emphasized?.points.find(([pointYear]) => pointYear === markerYear)

  const described = drawable
    .map((entry) => {
      const values = entry.points.map(([, value]) => value)
      const first = entry.points[0]
      const last = entry.points[entry.points.length - 1]
      return (
        `${entry.label}: ${formatTick(first![1])} in ${first![0]} to ` +
        `${formatTick(last![1])} in ${last![0]}, peak ${formatTick(Math.max(...values))}`
      )
    })
    .join("; ")

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="line-chart"
      role="img"
      aria-label={`History in ${unit}. ${described}.`}
    >
      {yTicks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={y(tick)}
            y2={y(tick)}
            stroke="#dfe6ec"
            strokeWidth={1}
          />
          <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" className="chart-tick">
            {formatTick(tick)}
          </text>
        </g>
      ))}

      {/* The year the map is showing, so the chart and the map agree. */}
      {markerPoint && (
        <line
          x1={x(markerPoint[0])}
          x2={x(markerPoint[0])}
          y1={PAD.top}
          y2={HEIGHT - PAD.bottom}
          stroke="#c3d0da"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      )}

      <text x={PAD.left} y={HEIGHT - 4} className="chart-tick">
        {minYear}
      </text>
      <text x={WIDTH - PAD.right} y={HEIGHT - 4} textAnchor="end" className="chart-tick">
        {maxYear}
      </text>

      {drawable.map((entry) => {
        const color = entry.emphasized ? EMPHASIZED_COLOR : MUTED_COLOR
        // A polyline through one point draws nothing at all, which read as a
        // country having no history rather than one year of it.
        if (entry.points.length === 1) {
          const [year, value] = entry.points[0]!
          return <circle key={entry.id} cx={x(year)} cy={y(value)} r={2.6} fill={color} />
        }
        return (
          <polyline
            key={entry.id}
            fill="none"
            stroke={color}
            strokeWidth={entry.emphasized ? 2 : 1.3}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={entry.points.map(([year, value]) => `${x(year)},${y(value)}`).join(" ")}
          />
        )
      })}

      {markerPoint && (
        <circle
          cx={x(markerPoint[0])}
          cy={y(markerPoint[1])}
          r={3.2}
          fill="#fff"
          stroke={EMPHASIZED_COLOR}
          strokeWidth={2}
        />
      )}
    </svg>
  )
}
