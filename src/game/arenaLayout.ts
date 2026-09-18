/** Obstacle circles, shared between the renderer and enemy steering. */
export type Obstacle = { x: number; z: number; r: number }

export let pillars: Obstacle[] = []

export function setPillars(p: Obstacle[]) {
  pillars = p
}
