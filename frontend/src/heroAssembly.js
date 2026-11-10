// Geometry belongs to the existing Hero, never to a hard-coded document scrollY.
const clamp = (value) => Math.max(0, Math.min(1, value))

export function selectHeroArtworks(artworks) {
  // artworkRequest has already validated the real Gallery API response.
  return Array.isArray(artworks) ? artworks.slice(0, 4) : []
}

export function assemblyProgress({ top, height, viewportHeight, distance, pinned, reduced }) {
  if (reduced) return 1
  const progress = pinned
    ? -top / Math.max(1, distance)
    : (viewportHeight * .8 - top) / Math.max(1, height * .65)
  const value = clamp(progress)
  return value * value * (3 - 2 * value)
}

export function artworkPlacement({ index, count, width, height, cardWidth, cardHeight, compact }) {
  const bounded = (value, extent, size) => Math.max(size / 2 + 8, Math.min(extent - size / 2 - 8, value))
  const slot = (count === 1 ? [0] : count === 2 ? [0, 2] : count === 3 ? [0, 2, 3] : [0, 1, 2, 3])[index]
  const wide = width / height >= 1.65
  const finalX = compact ? (count === 1 ? .5 : [.22, .78][index])
    : wide ? [.09, .265, .735, .91][slot] : [.17, .17, .83, .83][slot]
  const finalY = compact ? height - cardHeight / 2 - 12
    : height * (wide || count <= 2 ? .64 : [.45, .80, .45, .80][slot])
  const x = bounded(width * finalX, width, cardWidth)
  const y = bounded(finalY, height, cardHeight)
  const startX = compact ? x : width * (wide ? [.04, .15, .85, .96][slot] : [.08, .05, .92, .95][slot])
  const startY = compact ? y - [48, 36][index] : height * [.34, .82, .34, .82][slot]
  return { x, y, travelX: bounded(startX, width, cardWidth) - x,
    travelY: bounded(startY, height, cardHeight) - y, turn: compact ? 0 : [-2, 2, 2, -2][slot] }
}

export function observeHeroAssembly(scene, pin, installation, header, viewport = window) {
  const reduced = viewport.matchMedia('(prefers-reduced-motion: reduce)')
  const compact = viewport.matchMedia('(max-width: 800px)')
  const cards = [...installation.querySelectorAll('.hero-donation')]
  let disposed = false, frame = null, needsMeasure = true
  let geometry = {}, lastProgress = null

  function measure() {
    const headerHeight = header?.getBoundingClientRect().height || 0
    pin.style.setProperty('--hero-header-height', `${headerHeight}px`)
    const height = pin.offsetHeight
    const pinned = cards.length > 0 && !compact.matches && !reduced.matches && height <= viewport.innerHeight + 1
    const distance = pinned ? viewport.innerHeight : 0
    geometry = { height, pinned, distance }
    scene.dataset.pinned = String(pinned)
    scene.style.setProperty('--assembly-height', `${height + distance}px`)
    const visible = cards.slice(0, compact.matches ? 2 : 4)
    cards.forEach((card, index) => {
      if (index >= visible.length) return
      const placement = artworkPlacement({ index, count: visible.length, width: installation.offsetWidth,
        height: installation.offsetHeight, cardWidth: card.offsetWidth, cardHeight: card.offsetHeight, compact: compact.matches })
      card.style.setProperty('--artwork-x', `${placement.x}px`)
      card.style.setProperty('--artwork-y', `${placement.y}px`)
      card.style.setProperty('--travel-x', `${placement.travelX}px`)
      card.style.setProperty('--travel-y', `${placement.travelY}px`)
      card.style.setProperty('--travel-turn', `${placement.turn}deg`)
    })
    needsMeasure = false
  }

  function update() {
    frame = null
    if (disposed) return
    if (needsMeasure) measure()
    const bounds = scene.getBoundingClientRect()
    scene.dataset.assemblyActive = String(!reduced.matches && bounds.top < viewport.innerHeight && bounds.bottom > 0)
    const progress = assemblyProgress({ ...geometry, top: bounds.top, viewportHeight: viewport.innerHeight, reduced: reduced.matches })
    const value = progress.toFixed(4)
    if (value !== lastProgress) {
      installation.style.setProperty('--assembly-progress', value)
      lastProgress = value
    }
  }
  function schedule() {
    if (!disposed && frame === null) frame = viewport.requestAnimationFrame(update)
  }
  function resize() { needsMeasure = true; schedule() }

  viewport.addEventListener('scroll', schedule, { passive: true })
  viewport.addEventListener('resize', resize)
  reduced.addEventListener('change', resize)
  compact.addEventListener('change', resize)
  const observer = viewport.ResizeObserver ? new viewport.ResizeObserver(resize) : null
  observer?.observe(pin)
  observer?.observe(installation)
  if (header) observer?.observe(header)
  update()

  return () => {
    disposed = true
    if (frame !== null) viewport.cancelAnimationFrame(frame)
    observer?.disconnect()
    viewport.removeEventListener('scroll', schedule)
    viewport.removeEventListener('resize', resize)
    reduced.removeEventListener('change', resize)
    compact.removeEventListener('change', resize)
    scene.style.removeProperty('--assembly-height')
    pin.style.removeProperty('--hero-header-height')
    installation.style.removeProperty('--assembly-progress')
    delete scene.dataset.pinned
    delete scene.dataset.assemblyActive
  }
}
