import { legendEntries } from "../utils/scale.ts"

export function Legend({ unit }: { unit: string }) {
  return (
    <section className="legend" aria-label="Legend">
      <ul>
        {legendEntries(unit).map((entry) => (
          <li key={entry.label}>
            <span
              className="legend-swatch"
              style={{ background: entry.color }}
              aria-hidden="true"
            />
            {entry.label}
          </li>
        ))}
      </ul>
    </section>
  )
}
