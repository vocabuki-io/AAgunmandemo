import { useEffect, useState } from 'react'
import { Leva, useControls, folder } from 'leva'
import { BATTERY, CAMERA, ENEMIES, PLAYER, SHOT } from '../config'
import { analyseEconomy } from '../game/economy'
import { debug } from '../game/runtime'

/**
 * Live tuning panel, hidden behind the backtick key.
 *
 * Every control writes straight into the config objects the systems read each
 * frame, so changes apply immediately without a reload. "log economy" prints
 * the same analysis verify asserts on, which is how the numbers in
 * PROGRESS.md were arrived at.
 */
export function Tuner() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Backquote') setOpen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useControls({
    shot: folder({
      voltChargeTime: { value: SHOT.voltChargeTime, min: 0.2, max: 4, step: 0.05, onChange: (v: number) => { SHOT.voltChargeTime = v } },
      ampChargeTime: { value: SHOT.ampChargeTime, min: 0.2, max: 4, step: 0.05, onChange: (v: number) => { SHOT.ampChargeTime = v } },
      cooldown: { value: SHOT.cooldown, min: 0.05, max: 1.5, step: 0.01, onChange: (v: number) => { SHOT.cooldown = v } },
      voltMax: { value: SHOT.voltMax, min: 60, max: 900, step: 5, onChange: (v: number) => { SHOT.voltMax = v } },
      ampMax: { value: SHOT.ampMax, min: 1, max: 30, step: 0.5, onChange: (v: number) => { SHOT.ampMax = v } },
      damagePerAmp: { value: SHOT.damagePerAmp, min: 1, max: 40, step: 0.5, onChange: (v: number) => { SHOT.damagePerAmp = v } },
      arcRadiusPerA: { value: SHOT.arcRadiusPerA, min: 0, max: 16, step: 0.25, onChange: (v: number) => { SHOT.arcRadiusPerA = v } },
      pierceMax: { value: SHOT.pierceMax, min: 0, max: 10, step: 1, onChange: (v: number) => { SHOT.pierceMax = v } },
      costDivisor: { value: SHOT.costDivisor, min: 5, max: 200, step: 1, onChange: (v: number) => { SHOT.costDivisor = v } },
    }, { collapsed: true }),

    battery: folder({
      unitsPerCell: { value: BATTERY.unitsPerCell, min: 20, max: 400, step: 10, onChange: (v: number) => { BATTERY.unitsPerCell = v } },
      waveRefill: { value: BATTERY.waveRefill, min: 0, max: 10, step: 1, onChange: (v: number) => { BATTERY.waveRefill = v } },
      reloadTime: { value: BATTERY.reloadTime, min: 0.2, max: 4, step: 0.05, onChange: (v: number) => { BATTERY.reloadTime = v } },
    }, { collapsed: true }),

    player: folder({
      moveSpeed: { value: PLAYER.moveSpeed, min: 2, max: 20, step: 0.1, onChange: (v: number) => { PLAYER.moveSpeed = v } },
      chargeSpeedMul: { value: PLAYER.chargeSpeedMul, min: 0.1, max: 1, step: 0.02, onChange: (v: number) => { PLAYER.chargeSpeedMul = v } },
      jumpSpeed: { value: PLAYER.jumpSpeed, min: 3, max: 20, step: 0.2, onChange: (v: number) => { PLAYER.jumpSpeed = v } },
    }, { collapsed: true }),

    camera: folder({
      baseFov: { value: CAMERA.baseFov, min: 45, max: 110, step: 1, onChange: (v: number) => { CAMERA.baseFov = v } },
      zoomFov: { value: CAMERA.zoomFov, min: 10, max: 70, step: 1, onChange: (v: number) => { CAMERA.zoomFov = v } },
      sensitivity: { value: CAMERA.sensitivity, min: 0.0004, max: 0.008, step: 0.0002, onChange: (v: number) => { CAMERA.sensitivity = v } },
    }, { collapsed: true }),

    enemies: folder({
      armorVolts: { value: ENEMIES.armored.armorVolts, min: 20, max: 400, step: 5, onChange: (v: number) => { ENEMIES.armored.armorVolts = v } },
      armoredHp: { value: ENEMIES.armored.hp, min: 10, max: 400, step: 5, onChange: (v: number) => { ENEMIES.armored.hp = v } },
      swarmHp: { value: ENEMIES.swarm.hp, min: 2, max: 120, step: 1, onChange: (v: number) => { ENEMIES.swarm.hp = v } },
      swarmArcTaken: { value: ENEMIES.swarm.arcTaken, min: 0.1, max: 3, step: 0.05, onChange: (v: number) => { ENEMIES.swarm.arcTaken = v } },
      runnerHp: { value: ENEMIES.runner.hp, min: 2, max: 200, step: 1, onChange: (v: number) => { ENEMIES.runner.hp = v } },
      runnerSpeed: { value: ENEMIES.runner.speed, min: 1, max: 18, step: 0.1, onChange: (v: number) => { ENEMIES.runner.speed = v } },
    }, { collapsed: true }),

    dev: folder({
      spawnPaused: { value: debug.spawnPaused, onChange: (v: boolean) => { debug.spawnPaused = v } },
      freezeEnemies: { value: debug.freezeEnemies, onChange: (v: boolean) => { debug.freezeEnemies = v } },
      godMode: { value: debug.godMode, onChange: (v: boolean) => { debug.godMode = v } },
      infiniteBattery: { value: debug.infiniteBattery, onChange: (v: boolean) => { debug.infiniteBattery = v } },
      timeScale: { value: debug.timeScale, min: 0.05, max: 1, step: 0.05, onChange: (v: number) => { debug.timeScale = v } },
      // Prints the same table verify asserts on: cheapest shot per threat,
      // and whether full-charge spam can still finish a run.
      'log economy': { value: false, onChange: (v: boolean) => { if (v) console.info(analyseEconomy()) } },
    }, { collapsed: true }),
  })

  return <Leva hidden={!open} collapsed={false} titleBar={{ title: 'AA GUNMAN — TUNING' }} />
}
