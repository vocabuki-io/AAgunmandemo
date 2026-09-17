import { Color } from 'three'

/** Electricity is the only saturated colour in the game. */
export const CYAN = '#22e6ff'
export const MAGENTA = '#ff2f9e'
export const AMBER = '#ffd23f'
export const WHITE_HOT = '#eaffff'

const cyan = new Color(CYAN)
const magenta = new Color(MAGENTA)

/** hue 0 = pure amperes (magenta), 1 = pure volts (cyan). */
export function boltColor(out: Color, hue: number) {
  return out.copy(magenta).lerp(cyan, hue)
}
