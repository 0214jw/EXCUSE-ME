import test from 'node:test'
import assert from 'node:assert/strict'
import { observeHeaderTheme } from '../src/headerTheme.js'

function environment({ observers = true, intro = true } = {}) {
  const headerBounds = { top: 0, height: 101 }
  const introBounds = { top: 0, bottom: 900 }
  const styles = new Map()
  const header = { getBoundingClientRect: () => headerBounds, style: { setProperty: (key, value) => styles.set(key, value) } }
  const section = intro ? { getBoundingClientRect: () => introBounds } : null
  const intersections = [], resizes = [], listeners = new Map(), frames = new Map(), colors = []
  let nextFrame = 0
  const viewport = {
    innerHeight: 900,
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame },
    cancelAnimationFrame(id) { frames.delete(id) },
    addEventListener(type, callback, options) { listeners.set(type, { callback, options }) },
    removeEventListener(type, callback) { if (listeners.get(type)?.callback === callback) listeners.delete(type) },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; this.targets = []; resizes.push(this) }
      observe(target) { this.targets.push(target) }
      disconnect() { this.disconnected = true }
    },
  }
  if (observers) viewport.IntersectionObserver = class {
    constructor(callback, options) { this.callback = callback; this.options = options; intersections.push(this) }
    observe(target) { this.target = target }
    disconnect() { this.disconnected = true }
  }
  const dispose = observeHeaderTheme(header, section, (dark) => colors.push(dark), viewport)
  const flush = () => { const queued = [...frames.values()]; frames.clear(); queued.forEach((callback) => callback()) }
  return { header, section, headerBounds, introBounds, styles, intersections, resizes, listeners, frames, colors, viewport, dispose, flush }
}

test('intro header starts white, becomes ink at the actual section boundary, and returns to white on upward scroll', () => {
  const env = environment()
  assert.equal(env.colors.at(-1), true)
  assert.equal(env.intersections.at(-1).target, env.section)
  assert.deepEqual(env.listeners.get('scroll').options, { passive: true })
  const observer = env.intersections.at(-1)
  env.introBounds.bottom = 50
  observer.callback()
  assert.equal(env.colors.at(-1), false)
  env.introBounds.bottom = 51
  observer.callback()
  assert.equal(env.colors.at(-1), true)
  env.dispose()
})

test('scroll geometry corrects a clipped embedded observer without rebuilding it on every scroll', () => {
  const env = environment()
  env.introBounds.bottom = 20
  env.listeners.get('scroll').callback()
  env.listeners.get('scroll').callback()
  assert.equal(env.frames.size, 1)
  env.flush()
  assert.equal(env.colors.at(-1), false)
  assert.equal(env.intersections.length, 1)
  env.introBounds.bottom = 500
  env.listeners.get('scroll').callback()
  env.flush()
  assert.equal(env.colors.at(-1), true)
  env.dispose()
})

test('mobile wrapping and viewport/intro resizing rebuild the observer from measured geometry', () => {
  const env = environment()
  const original = env.intersections.at(-1)
  env.viewport.innerHeight = 650
  env.headerBounds.height = 170
  env.introBounds.bottom = 84
  env.resizes[0].callback()
  env.listeners.get('resize').callback()
  assert.equal(env.frames.size, 1)
  env.flush()
  assert.equal(env.styles.get('--site-header-height'), '170px')
  assert.equal(env.colors.at(-1), false)
  assert.equal(original.disconnected, true)
  assert.equal(env.intersections.at(-1).options.rootMargin, '-85px 0px -564px 0px')
  assert.deepEqual(env.resizes[0].targets, [env.header, env.section])
  env.introBounds.bottom = 650
  env.resizes[0].callback()
  env.flush()
  assert.equal(env.colors.at(-1), true)
  env.dispose()
})

test('pages without BrandIntro remain ink and do not install scroll observation', () => {
  const env = environment({ intro: false })
  assert.equal(env.colors.at(-1), false)
  assert.equal(env.intersections.length, 0)
  assert.equal(env.listeners.has('scroll'), false)
  env.listeners.get('pageshow').callback()
  assert.equal(env.colors.at(-1), false)
  env.dispose()
})

test('restored scroll position and an intro starting below the header are measured immediately', () => {
  const env = environment()
  env.introBounds.bottom = -600
  env.listeners.get('pageshow').callback()
  assert.equal(env.colors.at(-1), false)
  env.introBounds.top = 80
  env.introBounds.bottom = 980
  env.listeners.get('pageshow').callback()
  assert.equal(env.colors.at(-1), false)
  env.dispose()
})

test('fallback scroll reads the section bounds with passive, batched updates and cleans up on unmount', () => {
  const env = environment({ observers: false })
  assert.deepEqual(env.listeners.get('scroll').options, { passive: true })
  env.introBounds.bottom = 0
  env.listeners.get('scroll').callback()
  env.listeners.get('scroll').callback()
  assert.equal(env.frames.size, 1)
  env.flush()
  assert.equal(env.colors.at(-1), false)
  env.listeners.get('scroll').callback()
  env.dispose()
  assert.equal(env.frames.size, 0)
  assert.equal(env.listeners.size, 0)
  assert.equal(env.resizes[0].disconnected, true)
})

test('observer cleanup disconnects both observers and ignores late callbacks', () => {
  const env = environment()
  const previous = env.colors.length
  env.dispose()
  assert.ok(env.intersections.every((observer) => observer.disconnected))
  env.intersections[0].callback()
  env.resizes[0].callback()
  assert.equal(env.colors.length, previous)
  assert.equal(env.frames.size, 0)
})
