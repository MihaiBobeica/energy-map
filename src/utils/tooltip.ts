/**
 * Placement for the map tooltip.
 *
 * The tooltip used to flip to the other side of the pointer near an edge,
 * which quietly assumes the other side has room. On a phone it does not: the
 * flip threshold sat at `width - 260`, so on a 390px screen any pointer past
 * 130px flipped a 232px-wide tooltip straight off the left edge. It was only
 * ever fully visible for 260 <= x <= width - 260 — a range that is empty below
 * 520px, which is every phone.
 *
 * So the rule is: prefer the far side of the pointer, take the near side when
 * the far side will not fit, and clamp into the viewport when neither will.
 * The clamp is what makes a narrow screen work, and it is what guarantees the
 * tooltip can never leave the screen no matter how wrong the size estimate is.
 */

/** Also applied as the element's max-width, so the two cannot drift apart. */
export const TOOLTIP_MAX_WIDTH = 232

/**
 * Height is content-driven, so this is an estimate rather than a cap. It errs
 * large on purpose: overestimating only lifts the tooltip slightly higher than
 * needed, while underestimating would let it hang off the bottom edge.
 */
export const TOOLTIP_MAX_HEIGHT = 104

/** Breathing room against the viewport edge, and away from the pointer. */
const EDGE_GAP = 8
const POINTER_GAP = 14

function placeAxis(pointer: number, size: number, viewport: number): number {
  const far = pointer + POINTER_GAP
  const near = pointer - POINTER_GAP - size
  const limit = viewport - EDGE_GAP - size
  const preferred = far + size <= viewport - EDGE_GAP ? far : near
  // Math.max on the limit keeps the clamp sane when the tooltip is wider than
  // the viewport itself: pinned to the near edge beats an inverted range.
  return Math.min(Math.max(preferred, EDGE_GAP), Math.max(EDGE_GAP, limit))
}

export function placeTooltip(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
): { left: number; top: number } {
  return {
    left: placeAxis(x, TOOLTIP_MAX_WIDTH, viewportWidth),
    top: placeAxis(y, TOOLTIP_MAX_HEIGHT, viewportHeight),
  }
}
