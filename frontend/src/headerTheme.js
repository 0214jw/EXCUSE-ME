// Track the actual section behind the sticky header, including responsive
// header wrapping and changes to the intro's viewport-relative height.
export function observeHeaderTheme(header, intro, onDarkChange, viewport = window) {
  let intersectionObserver
  let resizeObserver
  let frame = 0
  let rebuildPending = false
  let previousHeight
  let disposed = false

  const measure = () => {
    if (disposed) return 0
    const headerBounds = header.getBoundingClientRect()
    if (headerBounds.height !== previousHeight) {
      previousHeight = headerBounds.height
      header.style.setProperty('--site-header-height', `${headerBounds.height}px`)
    }
    const probe = Math.max(0, Math.min(viewport.innerHeight - 1, headerBounds.top + headerBounds.height / 2))
    const bounds = intro?.getBoundingClientRect()
    onDarkChange(Boolean(bounds && bounds.top <= probe && bounds.bottom > probe))
    return probe
  }

  const rebuild = () => {
    if (disposed) return
    const probe = measure()
    intersectionObserver?.disconnect()
    if (intro && viewport.IntersectionObserver) {
      // A one-pixel observation strip at the header's center, rather than
      // checking whether any part of the full-screen intro remains visible.
      intersectionObserver = new viewport.IntersectionObserver(measure, {
        root: null,
        rootMargin: `-${probe}px 0px -${Math.max(0, viewport.innerHeight - probe - 1)}px 0px`,
        threshold: 0,
      })
      intersectionObserver.observe(intro)
    }
  }

  const schedule = (needsRebuild) => {
    if (disposed) return
    rebuildPending ||= needsRebuild
    if (frame) return
    frame = viewport.requestAnimationFrame(() => {
      frame = 0
      const shouldRebuild = rebuildPending
      rebuildPending = false
      if (shouldRebuild) rebuild()
      else measure()
    })
  }
  const scheduleResize = () => schedule(true)
  const scheduleScroll = () => schedule(false)

  rebuild()
  if (viewport.ResizeObserver) {
    resizeObserver = new viewport.ResizeObserver(scheduleResize)
    resizeObserver.observe(header)
    if (intro) resizeObserver.observe(intro)
  }
  viewport.addEventListener('resize', scheduleResize)
  viewport.addEventListener('pageshow', rebuild)
  // A passive, rAF-batched geometry correction also covers embedded viewports
  // where an implicit IntersectionObserver root can be clipped by its parent.
  // This uses the same bounds in older browsers without IntersectionObserver.
  if (intro) viewport.addEventListener('scroll', scheduleScroll, { passive: true })

  return () => {
    disposed = true
    intersectionObserver?.disconnect()
    resizeObserver?.disconnect()
    if (frame) viewport.cancelAnimationFrame(frame)
    viewport.removeEventListener('resize', scheduleResize)
    viewport.removeEventListener('pageshow', rebuild)
    if (intro) viewport.removeEventListener('scroll', scheduleScroll)
  }
}
