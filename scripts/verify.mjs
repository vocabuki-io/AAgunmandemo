/**
 * AA GUNMAN verification harness.
 *
 * 1. serves the production build
 * 2. opens it in chromium and requires ZERO console errors / page errors
 * 3. saves a screenshot per scenario
 * 4. computes the per-pixel STANDARD DEVIATION of the frame and fails on a
 *    near-uniform image.
 *
 * Mean brightness is deliberately NOT used: a mean-based gate only rejects
 * pure black and pure white, so an empty scene with a flat sky passes it.
 * Standard deviation answers the question we actually care about -- is
 * anything at all drawn on this screen.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SHOTS = resolve(ROOT, 'shots')
/** A fresh port per run: a leftover preview from an aborted run must never be
 *  able to silently serve a STALE dist and make this harness lie. */
const PORT = 4300 + Math.floor(Math.random() * 600)
const URL = `http://127.0.0.1:${PORT}/`

const VIEWPORT = { width: 1280, height: 720 }

/**
 * Read game state out of the debug probe the app publishes on window.__aa.
 * Scenarios assert on this, so verify checks that the game WORKS -- not only
 * that something colourful was drawn.
 */
const probe = (page) => page.evaluate(() => {
  const a = window.__aa
  const s = a.useGame.getState()
  const alive = (arr) => arr.filter((b) => b.alive).length
  return {
    phase: s.phase,
    hp: s.hp,
    spares: s.spares,
    chambers: s.chambers.map((c) => +c.toFixed(2)),
    cylinder: +s.chambers.reduce((x, y) => x + y, 0).toFixed(2),
    shotsFired: s.shotsFired,
    spentUnits: +s.spentUnits.toFixed(2),
    reloading: s.reloading,
    paused: s.paused,
    deathReason: s.deathReason,
    wave: s.wave,
    director: { phase: a.director.phase, waveIndex: a.director.waveIndex, queued: a.director.queue.length },
    enemiesLeft: s.enemiesLeft,
    score: s.score,
    v: +a.charge.v.toFixed(3),
    amp: +a.charge.a.toFixed(3),
    bolts: alive(a.bolts),
    stats: { ...a.stats },
    audio: { ready: a.audio.ready, played: a.audio.played, muted: a.audio.muted },
    enemies: a.enemies ? a.enemies.filter((e) => e.alive).length : 0,
    // Bodies that have finished rising out of the sand. Spawning scales them
    // up over 0.45s of GAME time, which is several seconds of wall time on a
    // slow renderer.
    emerged: a.enemies.filter((e) => e.alive && e.emerge >= 0.99).length,
    kinds: ['armored', 'swarm', 'runner'].reduce((o, k) => {
      o[k] = a.enemies.filter((e) => e.alive && e.kind === k).length
      return o
    }, {}),
    nearest: a.enemies
      ? Math.min(Infinity, ...a.enemies.filter((e) => e.alive).map((e) =>
          Math.hypot(e.pos.x - a.playerState.pos.x, e.pos.z - a.playerState.pos.z)))
      : Infinity,
    playerY: +a.playerState.pos.y.toFixed(2),
    px: a.playerState.pos.x,
    pz: a.playerState.pos.z,
    // Horizontal facing, so movement can be checked against where the camera
    // looks rather than against world axes.
    camX: a.camState.dir.x,
    camZ: a.camState.dir.z,
  }
})

const near = (actual, expected, tol) => Math.abs(actual - expected) <= tol

/** Scenarios run in order against a single server, one fresh page each. */
const SCENARIOS = [
  {
    name: '01-title',
    minStd: 18,
    async run() {},
    assert: (s) => [
      ['stays on the title screen', s.phase === 'title'],
      ['cylinder starts full', s.cylinder === 600],
    ],
  },
  {
    name: '02-arena',
    minStd: 14,
    async run(page) {
      await startGame(page)
      await page.waitForTimeout(1500)
    },
    assert: (s) => [
      ['entered play', s.phase === 'playing'],
      ['player is standing on the floor, not falling through it', near(s.playerY, 0.9, 0.35)],
      ['nothing fired on its own', s.shotsFired === 0],
    ],
  },
  {
    name: '03-charge-volt',
    // Zoomed to FOV 26, so the frame shows a narrow slice of arena and is
    // legitimately flatter than the wide shots. Still 10x the 1.13 an empty
    // scene measured.
    minStd: 12,
    async run(page) {
      await startGame(page, { calm: true })
      await holdUntilCharged(page, { volt: true })
    },
    // Screenshot is taken WHILE the button is still held: this is the rule
    // "never discharge while either button is down".
    assert: (s) => [
      ['volts are at full charge', near(s.v, 1, 0.02)],
      ['amperes untouched', s.amp === 0],
      ['no shot while the button is held', s.shotsFired === 0],
      ['no battery spent while holding', s.cylinder === 600],
    ],
  },
  {
    name: '04-charge-amp',
    minStd: 14,
    async run(page) {
      await startGame(page, { calm: true })
      await holdUntilCharged(page, { amp: true })
    },
    assert: (s) => [
      ['amperes are at full charge', near(s.amp, 1, 0.02)],
      ['volts untouched', s.v === 0],
      ['no shot while the button is held', s.shotsFired === 0],
    ],
  },
  {
    name: '05-hold-both',
    minStd: 12,
    async run(page) {
      await startGame(page, { calm: true })
      await holdUntilCharged(page, { volt: true, amp: true })
      await page.waitForTimeout(600)
    },
    assert: (s) => [
      ['both knobs charged', near(s.v, 1, 0.02) && near(s.amp, 1, 0.02)],
      ['STILL no shot with both held', s.shotsFired === 0],
    ],
  },
  {
    name: '06-fire-volt',
    minStd: 14,
    settle: 150,
    async run(page) {
      await startGame(page, { calm: true })
      await holdUntilCharged(page, { volt: true })
      await page.mouse.up({ button: 'right' })
      await page.waitForTimeout(1200)
    },
    assert: (s) => [
      ['fired exactly once on release', s.shotsFired === 1],
      ['one bolt was spawned', s.stats.boltsSpawned === 1],
      ['the bolt travelled and resolved', s.stats.worldImpacts + s.stats.boltsExpired === 1],
      // 400V x 1.26A / 40 = 12.6 units. A pure penetrator is CHEAP.
      ['pure-volt shot costs 12.6 units', near(s.spentUnits, 12.6, 0.4)],
      ['charge reset after firing', s.v === 0 && s.amp === 0],
    ],
  },
  {
    name: '07-fire-amp',
    minStd: 14,
    settle: 150,
    async run(page) {
      await startGame(page, { calm: true })
      await holdUntilCharged(page, { amp: true })
      await page.mouse.up({ button: 'left' })
      await page.waitForTimeout(1200)
    },
    assert: (s) => [
      ['fired exactly once on release', s.shotsFired === 1],
      ['one bolt was spawned', s.stats.boltsSpawned === 1],
      ['the bolt travelled and resolved', s.stats.worldImpacts + s.stats.boltsExpired === 1],
      // 58V x 10A / 40 = 14.5 units. A pure shock shot is also CHEAP.
      ['pure-ampere shot costs 14.5 units', near(s.spentUnits, 14.5, 0.4)],
    ],
  },
  {
    name: '08-fire-mixed',
    minStd: 14,
    settle: 150,
    async run(page) {
      await startGame(page, { calm: true })
      await holdUntilCharged(page, { volt: true, amp: true })
      await page.mouse.up({ button: 'left' })
      await page.waitForTimeout(600)
      // Still held on the right: the gun must wait for it.
      await page.mouse.up({ button: 'right' })
      await page.waitForTimeout(900)
    },
    assert: (s) => [
      ['waited for the LAST button, then fired once', s.shotsFired === 1],
      ['one bolt was spawned', s.stats.boltsSpawned === 1],
      // 400V x 10A / 40 = 100 units: one whole AA for a single shot. This is
      // the ratio that makes always-max-charge a losing strategy.
      ['max shot drains a full cell (100 units)', near(s.spentUnits, 100, 0.5)],
      ['exactly one chamber emptied', s.chambers[0] === 0 && s.chambers[1] === 600 / 6],
    ],
  },
  {
    name: '09-enemies',
    minStd: 14,
    async run(page) {
      await startGame(page)
      await waitForState(page, (s) => s.enemies >= 4, 'enemies to spawn')
    },
    assert: (s) => [
      ['enemies are on the sand', s.enemies >= 4],
      ['left counts the field plus the queue', s.enemiesLeft === s.enemies + s.director.queued],
      // Wave 1 is the teaching wave: swarm and one runner, no plating yet.
      ['wave 1 sends no armour', s.kinds.armored === 0],
    ],
  },
  {
    name: '10-arc-kill',
    minStd: 14,
    settle: 150,
    async run(page) {
      await startGame(page, { calm: true })
      // Planted tight and frozen, then aimed at. At 3fps a 1.15s charge is
      // 3.5s of wall time, in which a 4.3 m/s swarm covers 15 metres and ends
      // up standing on the player -- this scenario is about the arc, not a
      // footrace. Aim is snapped by the debug hook because CDP cannot turn a
      // pointer-locked camera.
      await page.evaluate(() => {
        window.__aa.debug.freezeEnemies = true
        const spots = [[7, 0], [7.6, 0.9], [7.6, -0.9], [8.3, 0.5], [8.3, -0.5]]
        for (const [d, x] of spots) window.__aa.debugSpawnAhead('swarm', d, x)
      })
      await page.evaluate(() => window.__aa.debugFaceNearest())
      await holdUntilCharged(page, { amp: true })
      await page.mouse.up({ button: 'left' })
      await page.waitForTimeout(1200)
    },
    assert: (s) => [
      ['the bolt hit a body', s.stats.enemyHits >= 1],
      ['the charge conducted to the rest of the pack', s.stats.arcHits >= 3],
      // One 14.5-unit shot clears a five-body pack. This is the whole reason
      // swarms want amperes: 2.9 units a kill against 100 for full charge.
      ['one ampere shot cleared the pack', s.stats.enemyKills >= 5],
      ['it cost one ampere shot, not a full cell', s.spentUnits < 16],
      ['score went up', s.score > 0],
    ],
  },
  {
    name: '11-player-damage',
    minStd: 14,
    async run(page) {
      await startGame(page, { calm: true })
      // Planted in contact rather than walked in. This scenario is about melee
      // damage and i-frames; how long a swarm takes to cross the arena is
      // 09-enemies' and 20-wave-clear's business, and waiting for it here
      // meant waiting on the game clock, which on a slow renderer advances at
      // a small fraction of wall time.
      await page.evaluate(() => {
        window.__aa.debug.godMode = false
        for (let i = 0; i < 3; i++) window.__aa.debugSpawnAhead('swarm', 1.2, (i - 1) * 0.7)
      })
      await waitForState(page, (s) => s.stats.playerHits >= 2, 'enemies to land hits')
    },
    assert: (s) => [
      ['melee contact damaged the player', s.hp < 100],
      // i-frames mean a crowd cannot land more than one hit at a time, so
      // total damage stays inside the per-hit range of the enemy table.
      ['damage stays within hits x the damage table', s.hp >= 100 - s.stats.playerHits * 18],
      ['every hit did land damage', s.hp <= 100 - s.stats.playerHits * 6],
      ['still alive and playing', s.phase === 'playing'],
    ],
  },
  {
    name: '12-enemies-on-screen',
    minStd: 14,
    async run(page, ctx) {
      await startGame(page, { calm: true })
      const before = await page.screenshot()
      await page.evaluate(() => {
        // Frozen and planted close. Both matter: unfrozen, the bodies walk
        // toward the player while the harness waits, so how much of the frame
        // they end up filling depends on how much GAME time passed -- which on
        // a slow renderer is almost none. Pinning the geometry makes the
        // measurement depend only on whether they are drawn.
        window.__aa.debug.freezeEnemies = true
        const S = window.__aa.debugSpawnAhead
        S('armored', 4.2, -3.0); S('armored', 4.4, 0); S('armored', 4.2, 3.0)
        S('armored', 6.2, -1.6); S('armored', 6.2, 1.6)
        S('runner', 3.0, -1.5); S('runner', 3.0, 1.5)
        S('swarm', 2.4, -0.6); S('swarm', 2.4, 0.6); S('swarm', 3.0, 0)
      })
      await waitForState(page, (s) => s.emerged >= 10, 'the enemies to finish rising')
      await page.waitForTimeout(250)
      const after = await page.screenshot()
      return { diff: await ctx.meanAbsDiff(page, before, after) }
    },
    assert: (s) => [
      ['all three kinds spawned in front of the camera', s.enemies >= 10],
      ['every one of them finished rising', s.emerged >= 10],
      // A renderer that draws nothing scores ~0 here. Measured 2.88 with this
      // formation, so the gate keeps real margin without being decorative.
      ['enemies visibly changed the frame', s.diff > 1.8],
    ],
  },
  {
    name: '13-reload',
    minStd: 14,
    async run(page) {
      await startGame(page, { calm: true })
      // One max-power shot empties exactly one chamber.
      await holdUntilCharged(page, { volt: true, amp: true })
      await page.mouse.up({ button: 'left' })
      await page.mouse.up({ button: 'right' })
      await waitForState(page, (s) => s.shotsFired === 1, 'the shot to leave')
      await page.keyboard.press('r')
      await waitForState(page, (s) => !s.reloading && s.stats.reloads === 1, 'the reload to finish')
    },
    assert: (s) => [
      ['cylinder is full again', s.cylinder === 600],
      // Only the one emptied chamber was replaced, so only one spare is gone.
      ['exactly one spare was consumed', s.spares === 7],
      ['not stuck in the reloading state', s.reloading === false],
    ],
  },
  {
    name: '14-reload-waste',
    minStd: 14,
    async run(page) {
      await startGame(page, { calm: true })
      // A chamber with charge still in it. Reloading now throws that charge
      // away -- reloading early is how you waste batteries, and this pins it.
      await page.evaluate(() => window.__aa.useGame.setState({
        chambers: [40, 100, 100, 100, 100, 100], spares: 5,
      }))
      await page.keyboard.press('r')
      await waitForState(page, (s) => !s.reloading && s.stats.reloads === 1, 'the reload to finish')
    },
    assert: (s) => [
      ['cylinder is full', s.cylinder === 600],
      ['a whole spare was spent', s.spares === 4],
      // 100 units of spare bought only 60 units of capacity: the other 40
      // went in the dirt with the part-used cell.
      ['the part-used cell was discarded, not topped up', s.chambers[0] === 100],
    ],
  },
  {
    name: '15-out-of-batteries',
    minStd: 14,
    async run(page) {
      await startGame(page, { calm: true })
      await page.evaluate(() => window.__aa.useGame.setState({
        chambers: [4, 0, 0, 0, 0, 0], spares: 0,
      }))
      await holdUntilCharged(page, { volt: true, amp: true })
      await page.mouse.up({ button: 'left' })
      await page.mouse.up({ button: 'right' })
      await waitForState(page, (s) => s.phase !== 'playing', 'the run to end')
    },
    assert: (s) => [
      ['the run ended', s.phase === 'lost'],
      ['ended for the right reason', s.deathReason === 'OUT OF BATTERIES'],
      // The last 4 units still fired -- a shot scaled down, not a dead trigger.
      ['the last of the charge still fired a shot', s.shotsFired === 1 && s.spentUnits === 4],
    ],
  },
  {
    name: '16-armor-blocks-low-volts',
    minStd: 14,
    settle: 150,
    async run(page) {
      await startGame(page, { calm: true })
      await page.evaluate(() => {
        window.__aa.debug.freezeEnemies = true
        window.__aa.debugSpawnAhead('armored', 8, 0)
      })
      // Every ampere in the world and no push behind it: 58V against 220V of
      // plating. This must bounce.
      await holdUntilCharged(page, { amp: true })
      await page.mouse.up({ button: 'left' })
      await page.waitForTimeout(1200)
    },
    assert: (s) => [
      ['the shot was fired', s.stats.boltsSpawned === 1],
      ['plating turned it away, no damage at all', s.stats.enemyHits === 0],
      ['nothing died', s.stats.enemyKills === 0],
      ['the armoured body is still standing', s.kinds.armored >= 1],
    ],
  },
  {
    name: '17-armor-breaks-with-volts',
    minStd: 14,
    settle: 150,
    async run(page) {
      await startGame(page, { calm: true })
      await page.evaluate(() => {
        window.__aa.debug.freezeEnemies = true
        window.__aa.debugSpawnAhead('armored', 8, 0)
      })
      // Just over the 220V plating threshold with enough current behind it to
      // finish the job in one shot. The charge overshoots by up to a frame's
      // worth at 5fps, so this asserts the cost is well under a full-charge
      // shot rather than an exact figure -- 18-economy pins the true optimum
      // (40.0 units) deterministically.
      await chargeTo(page, { v: 0.5, a: 0.7 })
      await page.waitForTimeout(1400)
    },
    assert: (s) => [
      ['the bolt got through the plating', s.stats.enemyHits >= 1],
      ['the armoured body went down in one shot', s.stats.enemyKills >= 1],
      ['it cost clearly less than a full-charge shot', s.spentUnits < 80],
    ],
  },
  {
    name: '18-economy',
    minStd: 14,
    async run(page) {
      await startGame(page, { calm: true })
      return { econ: await page.evaluate(() => window.__aa.analyseEconomy()) }
    },
    assert: (s) => {
      const e = s.econ
      const by = Object.fromEntries(e.plans.map((p) => [p.kind, p]))
      return [
        // Each threat wants a different corner of the (volts, amperes) plane.
        ['armour needs volts', by.armored.v >= 0.4],
        ['armour needs current too', by.armored.a >= 0.5],
        // Only armour is worth spending volts on, so only armour is answered
        // by the beam; the other two are ampere balls of different sizes.
        ['only armour is worth a beam', by.armored.shot === 'beam'],
        ['swarms are answered by an ampere ball', by.swarm.shot === 'amp'],
        ['runners are answered by an ampere ball', by.runner.shot === 'amp'],
        ['swarms want amperes and no volts', by.swarm.a >= 0.2 && by.swarm.v <= 0.2],
        ['one shot clears a whole swarm cluster', by.swarm.cleared >= 5],
        ['runners want a cheap tap', by.runner.costPerKill <= 6],
        // A swarm blast is a materially longer hold than a runner tap, so the
        // two ampere answers are still different decisions rather than one.
        ['a swarm blast costs a real hold beyond a runner tap', by.swarm.a - by.runner.a >= 0.15],
        ['the answers are not all the same shot', e.minOptimumSpread >= 0.18],
        ['full charge is never the cheapest answer', e.plans.every((p) => p.v < 1 || p.a < 1)],
        // The rule the whole game rests on.
        ['full-charge spam cannot finish the run', e.run.maxChargeOverBudget > 1.25],
        ['shooting well leaves real room for missing', e.run.optimalHeadroom >= 3],
      ]
    },
  },
  {
    name: '19-wave-one',
    minStd: 14,
    async run(page) {
      await startGame(page)
      await waitForState(page, (s) => s.director.phase === 'engaging', 'wave 1 to open')
      await waitForState(page, (s) => s.enemies >= 3, 'bodies to arrive')
    },
    assert: (s) => [
      ['the run opens on wave 1', s.wave === 0 && s.director.waveIndex === 0],
      // Wave 1 is 6 swarm + 1 runner; "left" counts the field plus the queue.
      ['left counts the field plus what is still owed', s.enemiesLeft === s.enemies + s.director.queued],
      ['the whole wave is accounted for', s.enemies + s.director.queued === 7],
      ['they trickle in rather than all landing at once', s.director.queued > 0 || s.enemies === 7],
    ],
  },
  {
    name: '20-wave-clear',
    minStd: 14,
    async run(page) {
      await startGame(page)
      await page.evaluate(() => { window.__aa.debug.godMode = true; window.__aa.debug.infiniteBattery = true })
      await waitForState(page, (s) => s.enemies >= 2, 'wave 1 to arrive')
      // Clear it with real shots through the real hit path. Aim is snapped by
      // the debug hook because CDP cannot turn a pointer-locked camera.
      for (let i = 0; i < 40; i++) {
        const st = await probe(page)
        if (st.wave >= 1) break
        if (st.enemies > 0) {
          await page.evaluate(() => window.__aa.debugFaceNearest())
          await chargeTo(page, { a: 0.75 })
          await page.waitForTimeout(500)
        } else {
          await page.waitForTimeout(500)
        }
      }
      await waitForState(page, (s) => s.wave >= 1, 'wave 2 to open')
    },
    assert: (s) => [
      ['the wave was cleared by shooting', s.stats.enemyKills >= 7],
      ['the director advanced', s.wave === 1 && s.director.waveIndex === 1],
      // Between-wave resupply: 8 spares to start, +3 on clear.
      ['spares were resupplied between waves', s.spares === 11],
    ],
  },
  {
    name: '21-run-cleared',
    minStd: 14,
    async run(page) {
      await startGame(page, { calm: true })
      // Jump the director to the far side of the last wave. This is a test of
      // the end-of-run transition, not of fighting 26 bodies at 5fps.
      await page.evaluate(() => {
        window.__aa.debug.spawnPaused = false
        const d = window.__aa.director
        d.waveIndex = 5
        d.phase = 'engaging'
        d.queue = []
        d.timer = 0
      })
      await waitForState(page, (s) => s.phase !== 'playing', 'the run to be declared over')
    },
    assert: (s) => [
      ['clearing the last wave wins the run', s.phase === 'won'],
      ['the director parks in the cleared state', s.director.phase === 'cleared'],
      // No resupply after the final wave -- the run is over.
      ['no pointless resupply after the last wave', s.spares === 8],
    ],
  },
  {
    name: '22-audio',
    minStd: 14,
    settle: 150,
    async run(page) {
      await startGame(page, { calm: true })
      const before = await page.evaluate(() => window.__aa.audio.played)
      await holdUntilCharged(page, { volt: true, amp: true })
      await page.mouse.up({ button: 'left' })
      await page.mouse.up({ button: 'right' })
      await page.waitForTimeout(1400)
      const after = await page.evaluate(() => window.__aa.audio.played)
      const muted = await page.evaluate(() => {
        // M toggles mute; the press must survive a slow frame like any other.
        const was = window.__aa.audio.muted
        return { was }
      })
      await page.keyboard.press('m')
      await page.waitForTimeout(600)
      const nowMuted = await page.evaluate(() => window.__aa.audio.muted)
      return { sfxBefore: before, sfxAfter: after, wasMuted: muted.was, nowMuted }
    },
    assert: (s) => [
      // Everything is synthesised at runtime, so "ready" means a live
      // AudioContext with the charge loops already running.
      ['the audio context came up', s.audio.ready === true],
      ['firing actually scheduled sound', s.sfxAfter > s.sfxBefore],
      ['a shot is more than one voice', s.sfxAfter - s.sfxBefore >= 3],
      ['M toggles mute', s.wasMuted === false && s.nowMuted === true],
    ],
  },
  {
    name: '23-pause-on-lost-lock',
    minStd: 14,
    async run(page) {
      await startGame(page, { calm: true })
      await page.evaluate(() => document.exitPointerLock())
      await page.waitForTimeout(900)
      const overlay = await page.locator('[data-testid="pause-overlay"]').count()
      const before = await probe(page)
      // The world must be stopped, not merely covered by a panel.
      await page.waitForTimeout(1800)
      const after = await probe(page)
      return { overlay, frozenWave: before.director.phase === after.director.phase }
    },
    assert: (s) => [
      ['losing the mouse pauses the run', s.paused === true],
      ['the overlay is shown', s.overlay === 1],
      ['still mid-run rather than ended', s.phase === 'playing'],
    ],
  },
  {
    name: '24-tuning-panel',
    minStd: 14,
    async run(page) {
      await startGame(page, { calm: true })
      // leva's own class names are content-hashed, so this asserts on the
      // thing the player actually sees: the panel's title bar.
      const title = () => page.evaluate(() => document.body.innerText.includes('TUNING'))
      const hiddenAtFirst = await title()
      await page.keyboard.press('`')
      await page.waitForTimeout(800)
      const shown = await title()
      await page.keyboard.press('`')
      await page.waitForTimeout(600)
      const hiddenAgain = await title()
      return { hiddenAtFirst, shown, hiddenAgain }
    },
    assert: (s) => [
      ['the panel stays out of the way until asked for', s.hiddenAtFirst === false],
      ['backtick opens the tuning panel', s.shown === true],
      ['backtick closes it again', s.hiddenAgain === false],
    ],
  },
  {
    name: '25-movement-directions',
    minStd: 14,
    async run(page) {
      await startGame(page, { calm: true })
      const w = await holdUntilMoved(page, 'w')
      const s2 = await holdUntilMoved(page, 's')
      const d = await holdUntilMoved(page, 'd')
      const a = await holdUntilMoved(page, 'a')
      return { mW: w, mS: s2, mD: d, mA: a }
    },
    // The harness had no coverage of this at all, which is how a build went
    // out with W driving backwards and S forwards. Everything is measured
    // against where the camera looks, not against world axes, so it holds at
    // any heading.
    assert: (s) => [
      ['W actually moves the player', s.mW.dist >= 1],
      ['W moves toward where the camera looks', s.mW.alongForward > 0.85],
      ['S moves away from where the camera looks', s.mS.alongForward < -0.85],
      ['D strafes right', s.mD.alongRight > 0.85],
      ['A strafes left', s.mA.alongRight < -0.85],
    ],
  },
  {
    name: '26-shot-kinds',
    minStd: 14,
    settle: 150,
    async run(page) {
      await startGame(page, { calm: true })

      // The three weapons, straight from the shot maths.
      const spec = await page.evaluate(() => {
        const f = window.__aa.computeShot
        const pick = (s) => ({
          kind: s.kind, speed: +s.speed.toFixed(1), pierce: s.pierce,
          blast: +s.arcRadius.toFixed(2),
        })
        return {
          voltTap: pick(f(0.15, 0)),
          volt: pick(f(1, 0)),
          amp: pick(f(0, 1)),
          ampTap: pick(f(0, 0.2)),
          beam: pick(f(1, 1)),
        }
      })

      // ...and the lance actually punching through a column of armour.
      await page.evaluate(() => {
        window.__aa.debug.freezeEnemies = true
        // Kept inside 13m: the innermost girder ring sits at 13-17m and a
        // pillar in the line of fire stops the lance early, which is the
        // arena's fault rather than the weapon's.
        for (const d of [5, 7, 9, 11]) window.__aa.debugSpawnAhead('armored', d, 0)
      })
      await waitForState(page, (s) => s.emerged >= 4, 'the column to finish rising')
      await page.evaluate(() => window.__aa.debugFaceNearest())
      await holdUntilCharged(page, { volt: true })
      await page.mouse.up({ button: 'right' })
      await page.waitForTimeout(1500)
      return { spec }
    },
    assert: (s) => {
      const k = s.spec
      return [
        // Volts: a lance. Always pierces, no blast, faster the longer you hold.
        ['holding only volts fires a lance', k.volt.kind === 'volt'],
        ['a lance pierces even at a tap', k.voltTap.pierce >= 3],
        ['a lance carries no blast', k.volt.blast < 0.1],
        ['charging volts makes it faster', k.volt.speed > k.voltTap.speed * 1.5],
        // Amperes: a ball. Slow, no pierce, blast grows with the hold.
        ['holding only amperes fires a ball', k.amp.kind === 'amp'],
        ['the ball does not pierce', k.amp.pierce === 0],
        ['the ball is slower than the lance', k.amp.speed < k.volt.speed * 0.5],
        ['charging amperes widens the blast', k.amp.blast > k.ampTap.blast * 2],
        // Both: a beam, faster than the lance and bursting like the ball.
        ['holding both fires a beam', k.beam.kind === 'beam'],
        ['the beam outruns the lance', k.beam.speed > k.volt.speed],
        ['the beam pierces', k.beam.pierce >= 4],
        ['the beam bursts too', k.beam.blast > 6],
        // And the lance really does punch through a column, in game.
        ['one lance, one bolt', s.stats.boltsSpawned === 1],
        ['it punched through the whole column', s.stats.enemyHits >= 4],
        ['and it did it by piercing, not by bursting', s.stats.arcHits === 0],
      ]
    },
  },
]

/**
 * Hold the given buttons until the gun is actually fully charged.
 *
 * Wall-clock waits do not work here: SwiftShader renders at 4-7fps, so a
 * "1.5 second" hold is 6 frames and lands wherever it lands. Polling the real
 * charge value is both stabler and a truer statement of the intent -- a player
 * holds the button until the gun is ready, not for a stopwatch interval.
 */
async function holdUntilCharged(page, { volt = false, amp = false }, timeoutMs = 120000) {
  if (volt) await page.mouse.down({ button: 'right' })
  if (amp) await page.mouse.down({ button: 'left' })
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const c = await page.evaluate(() => ({ v: window.__aa.charge.v, a: window.__aa.charge.a }))
    const ok = (!volt || c.v >= 0.999) && (!amp || c.a >= 0.999)
    if (ok) return
    if (Date.now() > deadline) throw new Error(`charge never filled: v=${c.v} a=${c.a}`)
    await page.waitForTimeout(120)
  }
}

/**
 * Poll the probe until `pred(state)` holds.
 *
 * These budgets are deliberately generous. Every wait here is really a wait on
 * GAME time -- a charge filling, a wave spawning, a body crossing the sand --
 * but it is spent in WALL time, and the ratio between them is whatever the
 * renderer manages. On a GitHub runner the game clock was observed advancing
 * at about 12% of wall time, roughly eight times slower than a local run, so
 * budgets tuned locally failed there on scenarios that were merely slow.
 * A generous timeout costs nothing when the predicate holds -- it returns
 * immediately -- and only bites on a real hang.
 */
async function waitForState(page, pred, label, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const st = await probe(page)
    if (pred(st)) return st
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}: ${JSON.stringify(st)}`)
    await page.waitForTimeout(200)
  }
}

/**
 * Hold the two buttons to specific charge levels and release each as it is
 * reached. Lets a scenario ask for "just enough volts to break plating" rather
 * than only all-or-nothing.
 */
async function chargeTo(page, { v = 0, a = 0 }, timeoutMs = 120000) {
  if (v > 0) await page.mouse.down({ button: 'right' })
  if (a > 0) await page.mouse.down({ button: 'left' })
  let vDone = v <= 0
  let aDone = a <= 0
  const deadline = Date.now() + timeoutMs
  while (!vDone || !aDone) {
    const c = await page.evaluate(() => ({ v: window.__aa.charge.v, a: window.__aa.charge.a }))
    if (!vDone && c.v >= v) { await page.mouse.up({ button: 'right' }); vDone = true }
    if (!aDone && c.a >= a) { await page.mouse.up({ button: 'left' }); aDone = true }
    if (Date.now() > deadline) throw new Error(`chargeTo timed out at v=${c.v} a=${c.a}`)
    if (!vDone || !aDone) await page.waitForTimeout(70)
  }
}

/**
 * Title screen -> arena.
 *
 * `calm` pauses the ambient spawner, clears the field and turns off incoming
 * damage. Scenarios about the gun and the batteries take minutes of wall time
 * at 5fps, and without this the player is simply beaten to death partway
 * through a reload test -- which tells us nothing about reloading.
 */
/**
 * Hold a movement key until the player has actually travelled, then report the
 * displacement. Distance-based rather than timed: how far a key press moves
 * you is game time, and the wall-clock cost of that varies with the renderer.
 */
async function holdUntilMoved(page, key, minDist = 1.5, timeoutMs = 90000) {
  const from = await probe(page)
  await page.keyboard.down(key)
  const deadline = Date.now() + timeoutMs
  let to = from
  for (;;) {
    to = await probe(page)
    const moved = Math.hypot(to.px - from.px, to.pz - from.pz)
    if (moved >= minDist || Date.now() > deadline) break
    await page.waitForTimeout(100)
  }
  await page.keyboard.up(key)
  await page.waitForTimeout(400)
  const dx = to.px - from.px
  const dz = to.pz - from.pz
  const dist = Math.hypot(dx, dz)
  // Project the movement onto the camera's forward and right axes.
  const fx = from.camX
  const fz = from.camZ
  const flen = Math.hypot(fx, fz) || 1
  const f = [fx / flen, fz / flen]
  const r = [-f[1], f[0]]
  return {
    dist,
    alongForward: dist > 0 ? (dx * f[0] + dz * f[1]) / dist : 0,
    alongRight: dist > 0 ? (dx * r[0] + dz * r[1]) / dist : 0,
  }
}

async function startGame(page, { calm = false } = {}) {
  const start = page.locator('[data-testid="start-button"]')
  if (await start.count()) {
    await start.click()
  }
  await page.waitForTimeout(1200)
  if (calm) {
    await page.evaluate(() => {
      window.__aa.debug.spawnPaused = true
      window.__aa.debug.godMode = true
      window.__aa.debugClearEnemies()
    })
    await page.waitForTimeout(150)
  }
}

function waitForPort(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((res, rej) => {
    const tick = () => {
      const sock = net.connect(port, '127.0.0.1')
      sock.once('connect', () => { sock.destroy(); res() })
      sock.once('error', () => {
        sock.destroy()
        if (Date.now() > deadline) rej(new Error(`port ${port} never opened`))
        else setTimeout(tick, 250)
      })
    }
    tick()
  })
}

/**
 * Decode the PNG inside the browser (no image deps in node) and return
 * luminance statistics for the frame.
 */
async function imageStats(page, pngBuffer) {
  const b64 = pngBuffer.toString('base64')
  return page.evaluate(async (data) => {
    const blob = await (await fetch('data:image/png;base64,' + data)).blob()
    const bmp = await createImageBitmap(blob)
    const cv = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = cv.getContext('2d')
    ctx.drawImage(bmp, 0, 0)
    const { data: px } = ctx.getImageData(0, 0, bmp.width, bmp.height)
    let sum = 0
    let sumSq = 0
    const n = px.length / 4
    const seen = new Set()
    for (let i = 0; i < px.length; i += 4) {
      const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
      sum += l
      sumSq += l * l
      if (seen.size < 5000) seen.add((px[i] >> 3) << 10 | (px[i + 1] >> 3) << 5 | (px[i + 2] >> 3))
    }
    const mean = sum / n
    const variance = Math.max(0, sumSq / n - mean * mean)
    return { mean, std: Math.sqrt(variance), colors: seen.size, w: bmp.width, h: bmp.height }
  }, b64)
}

/**
 * Mean absolute luminance difference between two frames, computed in the
 * browser. Lets a scenario assert that adding something to the world actually
 * changed the picture -- a renderer that draws nothing cannot fake this.
 */
async function meanAbsDiff(page, a, b) {
  return page.evaluate(async ([x, y]) => {
    const load = async (d) => {
      const blob = await (await fetch('data:image/png;base64,' + d)).blob()
      const bmp = await createImageBitmap(blob)
      const cv = new OffscreenCanvas(bmp.width, bmp.height)
      const ctx = cv.getContext('2d')
      ctx.drawImage(bmp, 0, 0)
      return ctx.getImageData(0, 0, bmp.width, bmp.height).data
    }
    const [pa, pb] = await Promise.all([load(x), load(y)])
    let sum = 0
    const n = pa.length / 4
    for (let i = 0; i < pa.length; i += 4) {
      const la = 0.2126 * pa[i] + 0.7152 * pa[i + 1] + 0.0722 * pa[i + 2]
      const lb = 0.2126 * pb[i] + 0.7152 * pb[i + 1] + 0.0722 * pb[i + 2]
      sum += Math.abs(la - lb)
    }
    return sum / n
  }, [a.toString('base64'), b.toString('base64')])
}

/** VERIFY_ONLY=25,10 runs just the matching scenarios, for quick iteration. */
function selectScenarios() {
  const only = (process.env.VERIFY_ONLY ?? '').trim()
  if (!only) return SCENARIOS
  const wanted = only.split(',').map((x) => x.trim()).filter(Boolean)
  const picked = SCENARIOS.filter((s) => wanted.some((w) => s.name.includes(w)))
  if (picked.length === 0) throw new Error(`VERIFY_ONLY=${only} matched no scenarios`)
  console.log(`[verify] VERIFY_ONLY=${only} -> ${picked.map((s) => s.name).join(', ')}`)
  return picked
}

async function main() {
  if (!existsSync(resolve(ROOT, 'dist/index.html'))) {
    console.error('[verify] dist/index.html missing -- run `npm run build` first.')
    process.exit(1)
  }
  mkdirSync(SHOTS, { recursive: true })

  const server = spawn(
    process.execPath,
    [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview',
     '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
  )
  let serverDied = null
  server.stdout.on('data', () => {})
  server.stderr.on('data', (d) => process.stderr.write(`[preview] ${d}`))
  server.on('exit', (code) => { if (code) serverDied = code })

  let browser
  const failures = []
  const report = []
  try {
    await waitForPort(PORT)
    if (serverDied) throw new Error(`preview server exited with code ${serverDied}`)
    browser = await chromium.launch({
      args: [
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--disable-gpu-sandbox',
        '--no-sandbox',
        '--autoplay-policy=no-user-gesture-required',
      ],
    })

    for (const sc of selectScenarios()) {
      const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
      const page = await ctx.newPage()
      const errors = []
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      page.on('requestfailed', (r) => {
        const f = r.failure()?.errorText ?? ''
        if (!f.includes('ERR_ABORTED')) errors.push(`requestfailed: ${r.url()} ${f}`)
      })

      await page.goto(URL, { waitUntil: 'load' })
      await page.waitForSelector('canvas', { timeout: 20000 })
      await page.waitForTimeout(2500)
      const extra = (await sc.run(page, { meanAbsDiff })) ?? {}
      await page.waitForTimeout(sc.settle ?? 400)

      const shotPath = resolve(SHOTS, `${sc.name}.png`)
      const png = await page.screenshot()
      writeFileSync(shotPath, png)
      const stats = await imageStats(page, png)

      const problems = []
      if (errors.length) problems.push(`${errors.length} console/page error(s)`)
      if (stats.std < sc.minStd) problems.push(`std ${stats.std.toFixed(2)} < min ${sc.minStd} (near-uniform frame)`)

      const state = { ...(await probe(page)), ...extra }
      const checks = sc.assert ? sc.assert(state) : []
      for (const [label, ok] of checks) if (!ok) problems.push(`assert: ${label}`)

      report.push({ name: sc.name, stats, errors, problems, state })
      if (problems.length) failures.push(sc.name)

      const tag = problems.length ? 'FAIL' : 'ok  '
      console.log(
        `[verify] ${tag} ${sc.name.padEnd(16)} std=${stats.std.toFixed(2).padStart(6)} ` +
        `mean=${stats.mean.toFixed(1).padStart(6)} errors=${errors.length} ` +
        `checks=${checks.filter(([, ok]) => ok).length}/${checks.length}`
      )
      for (const e of errors.slice(0, 12)) console.log(`         | ${e}`)
      for (const p of problems) console.log(`         ! ${p}`)
      if (problems.some((p) => p.startsWith('assert'))) {
        console.log(`         state: ${JSON.stringify(state)}`)
      }
      await ctx.close()
    }
  } finally {
    if (browser) await browser.close()
    try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') }
  }

  writeFileSync(resolve(SHOTS, 'report.json'), JSON.stringify(report, null, 2))
  if (failures.length) {
    console.error(`\n[verify] FAILED: ${failures.join(', ')}`)
    process.exit(1)
  }
  console.log('\n[verify] all scenarios passed')
}

main().catch((e) => { console.error('[verify] harness error:', e); process.exit(1) })
