export type ChartSeries = {
  id: string
  label: string
  points: [year: number, value: number][]
  emphasized: boolean
}

const WIDTH = 320
const HEIGHT = 160
const PAD = { top: 8, right: 8, bottom: 20, left: 44 }

function niceMax(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const factor of [1, 2, 5, 10]) {
    if (value <= factor * magnitude) return factor * magnitude
  }
  return 10 * magnitude
}

/** Minimal dependency-free SVG line chart for country histories. */
export function LineChart({ series, unit }: { series: ChartSeries[]; unit: string }) {
  const allPoints = series.flatMap((entry) => entry.points)
  if (allPoints.length === 0) return null

  const years = allPoints.map(([year]) => year)
  const minYear = Math.min(...years)
  const maxYear = Math.max(...years)
  const maxValue = niceMax(Math.max(...allPoints.map(([, value]) => value)))

  const x = (year: number) =>
    maxYear === minYear
      ? (PAD.left + WIDTH - PAD.right) / 2
      : PAD.left + ((year - minYear) / (maxYear - minYear)) * (WIDTH - PAD.left - PAD.right)
  const y = (value: number) =>
    HEIGHT - PAD.bottom - (value / maxValue) * (HEIGHT - PAD.top - PAD.bottom)

  const yTicks = [0, maxValue / 2, maxValue]
  const described = series
    .map((entry) => `${entry.label}: ${entry.points.length} points, ${minYear}–${maxYear}`)
    .join("; ")

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="line-chart"
      role="img"
      aria-label={`Historical chart in ${unit}. ${described}`}
    >
      {yTicks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={y(tick)}
            y2={y(tick)}
            stroke="#d3dce2"
            strokeWidth={1}
          />
          <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" className="chart-tick">
            {tick >= 1000 ? `${tick / 1000}k` : tick}
          </text>
        </g>
      ))}
      <text x={PAD.left} y={HEIGHT - 4} className="chart-tick">
        {minYear}
      </text>
      <text x={WIDTH - PAD.right} y={HEIGHT - 4} textAnchor="end" className="chart-tick">
        {maxYear}
      </text>
      {series.map((entry) => (
        <polyline
          key={entry.id}
          fill="none"
          stroke={entry.emphasized ? "#1d6fa8" : "#9db4c4"}
          strokeWidth={entry.emphasized ? 2.2 : 1.4}
          points={entry.points.map(([year, value]) => `${x(year)},${y(value)}`).join(" ")}
        />
      ))}
    </svg>
  )
}
