import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { artworkRequest } from '../src/artworkApi.js'
import { selectHeroArtworks, artworkPlacement, assemblyProgress, observeHeroAssembly } from '../src/heroAssembly.js'

const artworks = Array.from({ length: 9 }, (_, index) => ({
  id: index + 1, title: `기증 작품 ${index + 1}`, content: '알람은 울렸지만 이불의 중력을 이기지 못했습니다.',
  category: '지각·조퇴', author: '기증자', created_at: '2026-11-05T00:00:00Z', updated_at: '2026-11-05T00:00:00Z',
}))

test('Hero reads the existing Gallery API and uses zero to four records without inserting or mutating any works', async (t) => {
  const source = structuredClone(artworks)
  const transport = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/api/artworks'))
    assert.equal(options.method, 'GET')
    return new Response(JSON.stringify(source), { status: 200 })
  })
  const selected = selectHeroArtworks(await artworkRequest('/api/artworks'))
  assert.deepEqual(selected.map(a => a.id), [1, 2, 3, 4])
  assert.deepEqual(source, artworks)
  assert.equal(transport.mock.calls.length, 1)
  for (const count of [0, 1, 3, 4]) assert.equal(selectHeroArtworks(artworks.slice(0, count)).length, count)
  assert.deepEqual(selectHeroArtworks(null), [])
})

test('progress follows the actual section boundary, clamps at the ends and reverses without drift', () => {
  const options = { height: 900, viewportHeight: 900, distance: 900, pinned: true }
  assert.equal(assemblyProgress({ ...options, top: 900 }), 0)
  assert.equal(assemblyProgress({ ...options, top: 0 }), 0)
  assert.equal(assemblyProgress({ ...options, top: -450 }), .5)
  assert.equal(assemblyProgress({ ...options, top: -900 }), 1)
  assert.equal(assemblyProgress({ ...options, top: -2000 }), 1)
  assert.equal(assemblyProgress({ ...options, top: -450 }), .5)
  assert.equal(assemblyProgress({ ...options, top: 0 }), 0)
  assert.equal(assemblyProgress({ ...options, top: 900, reduced: true }), 1)
  const before = assemblyProgress({ ...options, pinned: false, top: 1000 })
  const after = assemblyProgress({ ...options, pinned: false, top: -1000 })
  assert.equal(before, 0)
  assert.equal(after, 1)
})

test('large works retain their size at both endpoints, stay inside the stage and leave the sculpture center clear', () => {
  for (const [width, height, cardWidth, statueWidth] of [[1368, 720, 201.6, 372], [952, 720, 140, 372], [761, 720, 120, 372], [1824, 900, 268.8, 446]]) {
    const settings = { count: 4, width, height, cardWidth, cardHeight: cardWidth * 4 / 3, compact: false }
    const positions = Array.from({ length: 4 }, (_, index) => artworkPlacement({ ...settings, index }))
    assert.deepEqual(artworkPlacement({ ...settings, index: 0 }), positions[0])
    for (const p of positions) {
      for (const [x, y] of [[p.x, p.y], [p.x + p.travelX, p.y + p.travelY]]) {
        assert.ok(x - cardWidth / 2 >= 0 && x + cardWidth / 2 <= width)
        assert.ok(y - settings.cardHeight / 2 >= 0 && y + settings.cardHeight / 2 <= height)
      }
      assert.ok(p.x + cardWidth / 2 < (width - statueWidth) / 2 || p.x - cardWidth / 2 > (width + statueWidth) / 2)
      assert.ok(Math.abs(p.turn) <= 2)
    }
    if (width / height >= 1.65) assert.equal(new Set(positions.map(p => p.y)).size, 1)
    else {
      assert.equal(positions[0].x, positions[1].x)
      assert.equal(positions[2].x, positions[3].x)
      assert.ok(positions[1].y - positions[0].y > settings.cardHeight)
    }
  }
})

test('mobile retains two large works and uses only short vertical movement; fewer works use valid slots', () => {
  for (const width of [288, 358, 760]) {
    const cardWidth = Math.min(200, Math.max(90, (width + 32) * .28))
    for (let index = 0; index < 2; index++) {
      const p = artworkPlacement({ index, count: 2, width, height: 680, cardWidth, cardHeight: cardWidth * 4 / 3, compact: true })
      assert.equal(p.travelX, 0)
      assert.equal(p.turn, 0)
      assert.ok(Math.abs(p.travelY) <= 48)
      assert.ok(p.x - cardWidth / 2 >= 0 && p.x + cardWidth / 2 <= width)
    }
  }
  for (const count of [1, 2, 3]) {
    for (let index = 0; index < count; index++) {
      const p = artworkPlacement({ index, count, width: 1368, height: 720, cardWidth: 200, cardHeight: 800 / 3, compact: false })
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.travelX))
    }
  }
})

function environment({ compact = false, reduced = false, height = 900, observers = true, count = 4 } = {}) {
  const listeners = new Map(), frames = new Map(), resizes = [], style = () => {
    const values = new Map()
    return { values, setProperty: (name, value) => values.set(name, value), removeProperty: name => values.delete(name) }
  }
  const media = matches => ({ matches, listeners: new Set(), addEventListener(_, listener) { this.listeners.add(listener) }, removeEventListener(_, listener) { this.listeners.delete(listener) } })
  const motion = media(reduced), small = media(compact)
  let nextFrame = 0
  const bounds = { top: 900, bottom: 2110 }
  const scene = { dataset: {}, style: style(), getBoundingClientRect: () => bounds }
  const pin = { offsetHeight: height, style: style() }
  const installation = { offsetWidth: 1368, offsetHeight: 720, style: style() }
  const cards = Array.from({ length: count }, () => ({ offsetWidth: 200, offsetHeight: 800 / 3, style: style() }))
  installation.querySelectorAll = () => cards
  const headerBounds = { height: 101 }
  const header = { getBoundingClientRect: () => headerBounds }
  const viewport = {
    innerHeight: 900,
    matchMedia: query => query.includes('reduced') ? motion : small,
    addEventListener: (name, callback, options) => listeners.set(name, { callback, options }),
    removeEventListener: name => listeners.delete(name),
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame },
    cancelAnimationFrame: id => frames.delete(id),
    ...(observers ? { ResizeObserver: class {
      constructor(callback) { this.callback = callback; resizes.push(this) }
      observe() {}
      disconnect() { this.disconnected = true }
    } } : {}),
  }
  const dispose = observeHeroAssembly(scene, pin, installation, header, viewport)
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()) }
  return { scene, pin, installation, cards, headerBounds, viewport, bounds, listeners, frames, motion, small, resizes, dispose, flush }
}

test('scroll writes one batched progress value, handles restoration/reverse and removes listeners on unmount', () => {
  const env = environment()
  assert.equal(env.scene.dataset.pinned, 'true')
  assert.equal(env.scene.style.values.get('--assembly-height'), '1800px')
  assert.deepEqual(env.listeners.get('scroll').options, { passive: true })
  env.bounds.top = -450
  for (let i = 0; i < 10; i++) env.listeners.get('scroll').callback()
  assert.equal(env.frames.size, 1)
  env.flush()
  assert.equal(env.installation.style.values.get('--assembly-progress'), '0.5000')
  env.bounds.top = 0
  env.listeners.get('scroll').callback(); env.flush()
  assert.equal(env.installation.style.values.get('--assembly-progress'), '0.0000')
  env.listeners.get('scroll').callback()
  env.dispose()
  assert.equal(env.frames.size, 0)
  assert.equal(env.listeners.size, 0)
  assert.equal(env.motion.listeners.size, 0)
  assert.equal(env.small.listeners.size, 0)
  assert.equal(env.resizes[0].disconnected, true)
  assert.equal(env.scene.style.values.size, 0)
})

test('short viewports and mobile never pin; reduced motion is immediately final with no extra scroll', () => {
  for (const options of [{ compact: true }, { reduced: true }, { height: 1000 }, { observers: false, compact: true }, { count: 0 }]) {
    const env = environment(options)
    assert.equal(env.scene.dataset.pinned, 'false')
    assert.equal(env.scene.style.values.get('--assembly-height'), `${env.pin.offsetHeight}px`)
    if (options.reduced) assert.equal(env.installation.style.values.get('--assembly-progress'), '1.0000')
    if (options.compact) assert.equal(env.cards[0].style.values.get('--travel-x'), '0px')
    env.dispose()
  }
})

test('viewport, header resize and live motion preference changes recompute geometry', () => {
  const env = environment()
  env.headerBounds.height = 180
  env.resizes[0].callback(); env.flush()
  assert.equal(env.pin.style.values.get('--hero-header-height'), '180px')
  assert.equal(env.scene.dataset.pinned, 'true')
  env.viewport.innerHeight = 700
  env.listeners.get('resize').callback(); env.flush()
  assert.equal(env.scene.dataset.pinned, 'false')
  env.motion.matches = true
  for (const callback of env.motion.listeners) callback()
  env.flush()
  assert.equal(env.scene.dataset.pinned, 'false')
  assert.equal(env.installation.style.values.get('--assembly-progress'), '1.0000')
  env.dispose()
})

test('Hero reuses Gallery image/text visuals and detail links, and empty data adds no artwork section', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' })
  try {
    const { default: Assembly } = await server.ssrLoadModule('/src/HeroArtworkAssembly.jsx')
    const selected = selectHeroArtworks(artworks)
    const html = renderToStaticMarkup(React.createElement(Assembly, { artworks: selected }))
    assert.equal((html.match(/class="hero-donation"/g) || []).length, 4)
    assert.equal((html.match(/exhibition-visual--gallery/g) || []).length, 4)
    assert.equal((html.match(/data-frame="none"/g) || []).length, 4)
    assert.doesNotMatch(html, /exhibition-frame-overlay|poster-study/)
    for (const artwork of selected) assert.ok(html.includes(`href="/artworks/${artwork.id}"`))
    const photo = renderToStaticMarkup(React.createElement(Assembly, { artworks: [{ ...artworks[0], image_url: '/api/artworks/1/image', image_mode: 'photo' }] }))
    assert.match(photo, /data-media="image"/)
    assert.equal(renderToStaticMarkup(React.createElement(Assembly, { artworks: [] })), '')
  } finally { await server.close() }
})
