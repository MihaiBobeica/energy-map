import {
  BUCKET_COLORS,
  categoricalStates,
  rampTicks,
  type ScaleDefinition,
} from "../utils/scale.ts"

/**
 * The colour key. The two categorical states sit apart from the value ramp
 * because they are not the bottom of a continuum — "never reported" and
 * "reported as zero" are different kinds of fact from "1–3 TWh", and over half
 * of all published source cells are exactly zero.
 */
export function ScaleKey({ scale }: { scale: ScaleDefinition }) {
  const ticks = rampTicks(scale)

  return (
    <section className="rail-section scale-key" aria-label="Legend">
      <div className="scale-head">
        <span className="field-label">Scale</span>
        <span className="scale-unit">{scale.unit}</span>
      </div>

      <ul className="scale-states">
        {categoricalStates(scale).map((state) => (
          <li key={state.label}>
            <span
              className="legend-swatch"
              style={{ background: state.color }}
              aria-hidden="true"
            />
            {state.label}
          </li>
        ))}
      </ul>

      <ul className="scale-ramp" aria-hidden="true">
        {BUCKET_COLORS.map((color, index) => (
          <li key={color} style={{ background: color }} title={ticks[index]} />
        ))}
      </ul>
      <ul className="scale-ticks" aria-hidden="true">
        {ticks.map((tick) => (
          <li key={tick}>{tick}</li>
        ))}
      </ul>
      <p className="visually-hidden">
        Colour ramp from {ticks[0]} to {ticks[ticks.length - 1]} {scale.unit}.
      </p>
    </section>
  )
}
