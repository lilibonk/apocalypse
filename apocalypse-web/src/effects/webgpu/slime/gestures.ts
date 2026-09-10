/** Adapted from yuanyang749/softie-webgpu, MIT, Copyright (c) 2026 yuanyang749.
 * Source: https://github.com/yuanyang749/softie-webgpu/tree/977a60844ac6ffe6824531900cf15bd5403e408f
 * Changes: TypeScript, Apocalypse host/lifecycle integration. See public/licenses/softie-webgpu.txt.
 */
interface Sample {
  x: number
  y: number
  at: number
}
/** Source path-vs-displacement detector; the host owns one rAF, never intervals/timeouts. */
export class SlimeGestures {
  private samples: Sample[] = []
  private down: Sample | null = null
  private moved = false
  private shakenUntil = 0
  private landingUntil = 0
  private scale = 1
  begin(x: number, y: number, at: number, stageWidth: number) {
    this.cancel()
    // The source thresholds were tuned for a 640 CSS-pixel stage.
    this.scale = 640 / Math.max(1, stageWidth)
    this.down = { x, y, at }
    this.samples = [{ x, y, at }]
  }
  move(x: number, y: number, at: number) {
    if (!this.down) return
    if (Math.hypot(x - this.down.x, y - this.down.y) * this.scale > 8) this.moved = true
    const last = this.samples[this.samples.length - 1]
    this.samples.push({ x, y, at })
    this.samples = this.samples.filter((sample) => at - sample.at <= 420)
    if (!last || at <= last.at || this.samples.length < 3) return
    const speed = (Math.hypot(x - last.x, y - last.y) * this.scale) / (at - last.at)
    if (speed < 0.6) return
    let path = 0
    for (let i = 1; i < this.samples.length; i++)
      path +=
        Math.hypot(
          this.samples[i].x - this.samples[i - 1].x,
          this.samples[i].y - this.samples[i - 1].y,
        ) * this.scale
    const first = this.samples[0]
    const direct = Math.hypot(x - first.x, y - first.y) * this.scale
    if (path > 220 && path - direct > 150) this.shakenUntil = at + 2000
  }
  release(at: number): 'poke' | 'happy' | 'landing' | null {
    if (!this.down) return null
    const poke = !this.moved && at - this.down.at < 160
    const shaken = this.shakenUntil > at
    this.down = null
    this.samples = []
    this.shakenUntil = 0
    if (shaken) {
      this.landingUntil = at + 900
      return 'landing'
    }
    return poke ? 'poke' : 'happy'
  }
  land(at: number) {
    const trigger = this.landingUntil > at
    this.landingUntil = 0
    return trigger
  }
  update(at: number, height: number) {
    if (!this.landingUntil) return false
    if (at >= this.landingUntil) {
      this.landingUntil = 0
      return false
    }
    return height <= 0.08 ? this.land(at) : false
  }
  cancel() {
    this.down = null
    this.samples = []
    this.moved = false
    this.shakenUntil = 0
    this.landingUntil = 0
  }
  get pendingLanding() {
    return this.landingUntil > 0
  }
}
