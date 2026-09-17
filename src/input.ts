/**
 * Raw input lives outside React on purpose: the charge state machine is polled
 * every frame and must never cause a re-render.
 */
import { CAMERA } from './config'

export const keys = new Set<string>()

export const mouse = {
  /** Right button -- volts. */
  right: false,
  /** Left button -- amperes. */
  left: false,
  dx: 0,
  dy: 0,
}

export const look = { yaw: 0, pitch: -0.12 }

export const pointer = { locked: false }

/**
 * Pointer-lock input hygiene.
 *
 * Chrome warps the cursor while locked and reports the warp itself as motion:
 * you get one event of real movement immediately followed by its exact
 * negation, plus a large bogus delta right after lock is granted. Feeding
 * those to the camera snaps the view at the sky the instant you click DRAW.
 *
 * Two filters, both safe for real mice:
 *   - drop any single event past TELEPORT px; no hand moves that far in one
 *     sample, so it is always a warp or an alt-tab.
 *   - drop an event that exactly cancels the one before it; a real mouse does
 *     not reverse a large movement perfectly on the very next sample.
 */
const TELEPORT = 320
const MIRROR_MIN = 24
const LOCK_SETTLE_MS = 90
let lockedAt = 0
let prevX = 0
let prevY = 0

let attached = false

export function attachInput(canvas: HTMLElement) {
  if (attached) return
  attached = true

  window.addEventListener('keydown', (e) => {
    keys.add(e.code)
    // Space scrolls, and F-keys are not ours to intercept.
    if (e.code === 'Space') e.preventDefault()
  })
  window.addEventListener('keyup', (e) => keys.delete(e.code))
  window.addEventListener('blur', () => {
    keys.clear()
    mouse.left = false
    mouse.right = false
  })

  canvas.addEventListener('contextmenu', (e) => e.preventDefault())

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouse.left = true
    if (e.button === 2) mouse.right = true
  })
  // Release is tracked on the window: letting go outside the canvas must still
  // count as a release, otherwise the shot never leaves the barrel.
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.left = false
    if (e.button === 2) mouse.right = false
  })

  window.addEventListener('mousemove', (e) => {
    if (!pointer.locked) return
    const mx = e.movementX
    const my = e.movementY
    if (performance.now() - lockedAt < LOCK_SETTLE_MS) { prevX = mx; prevY = my; return }
    const teleport = Math.abs(mx) > TELEPORT || Math.abs(my) > TELEPORT
    const mirror = mx === -prevX && my === -prevY && Math.hypot(mx, my) > MIRROR_MIN
    prevX = mx
    prevY = my
    if (teleport || mirror) return
    mouse.dx += mx
    mouse.dy += my
  })

  document.addEventListener('pointerlockchange', () => {
    const now = document.pointerLockElement === canvas
    if (now && !pointer.locked) {
      lockedAt = performance.now()
      mouse.dx = 0
      mouse.dy = 0
      prevX = 0
      prevY = 0
    }
    pointer.locked = now
  })
}

export function requestLock(canvas: HTMLElement) {
  const r = canvas.requestPointerLock?.()
  // Chrome returns a promise in newer versions; swallow the rejection that
  // fires when the user exits lock too quickly.
  if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {})
}

/** Consume accumulated mouse motion into yaw/pitch. Call once per frame. */
export function consumeLook() {
  look.yaw -= mouse.dx * CAMERA.sensitivity
  look.pitch -= mouse.dy * CAMERA.sensitivity
  look.pitch = Math.max(CAMERA.pitchMin, Math.min(CAMERA.pitchMax, look.pitch))
  mouse.dx = 0
  mouse.dy = 0
}

export function resetInput() {
  keys.clear()
  mouse.left = false
  mouse.right = false
  mouse.dx = 0
  mouse.dy = 0
  look.yaw = 0
  look.pitch = -0.12
}
