try {
  const platform = typeof browser === 'undefined'
    ? chrome
    : browser

  if (!document.getElementById('visbug-extension-bundle')) {
    const script = document.createElement('script')
    script.id = 'visbug-extension-bundle'
    script.type = 'module'
    script.src = platform.runtime.getURL('toolbar/bundle.min.js')
    document.body.appendChild(script)
  }

  const src_path = platform.runtime.getURL(`tuts/guides.gif`)
  const tutsBaseURL = src_path.slice(0, src_path.lastIndexOf('/'))

  let visbug = document.querySelector('vis-bug')
  if (!visbug) {
    visbug = document.createElement('vis-bug')
    visbug.setAttribute('tutsBaseURL', tutsBaseURL)
    document.body.prepend(visbug)
  } else {
    visbug.setAttribute('tutsBaseURL', tutsBaseURL)
  }

  // Toolbar visibility is persisted in localStorage so it survives page
  // refreshes and is honored on the next launch (manual or auto-reinject),
  // instead of always defaulting to visible. This is the single source of
  // truth for "should the toolbar be shown".
  const VIS_KEY = 'visbug_visible'
  const readVisible = () => {
    try { return localStorage.getItem(VIS_KEY) !== 'false' } catch (e) { return true }
  }
  const writeVisible = v => {
    try { localStorage.setItem(VIS_KEY, v ? 'true' : 'false') } catch (e) {}
  }

  // data-visbug-is-auto was a per-inject hint; visibility now always comes from
  // localStorage, so just clean it up.
  if (document.body) document.body.removeAttribute('data-visbug-is-auto')

  const reportToolbarVisibility = visible => {
    platform.runtime.sendMessage({
      action: 'TOOLBAR_VISIBILITY_STATE',
      visible,
    }).catch(() => {})
  }

  const applyVisible = visible => {
    // Query the live <vis-bug> each time rather than capturing a closure
    // reference: after an eject + re-inject the runtime listener (attached only
    // once via globalThis.__visbugRuntimeListenerAttached) would otherwise keep
    // targeting the original, now-detached element. If no element is present
    // (e.g. ejected), we still persist the preference + report so the choice
    // takes effect on the next launch.
    const node = document.querySelector('vis-bug')
    if (node) node.style.display = visible ? 'block' : 'none'
    writeVisible(visible)
    reportToolbarVisibility(visible)
  }

  // Restore the previously saved state on every inject (refresh auto-reinject
  // AND manual launch alike).
  applyVisible(readVisible())

  // Always operate on the current <vis-bug> in the page so restore/re-inject
  // paths keep a single toolbar instance in sync.
  if (!globalThis.__visbugRuntimeListenerAttached) {
    globalThis.__visbugRuntimeListenerAttached = true
    platform.runtime.onMessage.addListener(request => {
      // TOOLBAR_VISIBILITY sets the launch preference (absolute when `visible`
      // is provided by the radio menu, toggle otherwise for the keyboard
      // shortcut). The preference is persisted even when no <vis-bug> is
      // present yet, so the choice takes effect on the next launch. Applying it
      // to the live element (if any) is a side effect, not the source of truth.
      if (request.action === 'TOOLBAR_VISIBILITY') {
        const node = document.querySelector('vis-bug')
        const next = typeof request.visible === 'boolean'
          ? request.visible
          : (node ? node.style.display === 'none' : readVisible())
        applyVisible(next)
        return
      }

      const node = document.querySelector('vis-bug')
      if (!node) return

      if (request.action === 'COLOR_MODE')
        node.setAttribute('color-mode', request.params.mode)
      else if (request.action === 'COLOR_SCHEME')
        node.setAttribute("color-scheme", request.params.mode)
    })
  }
} catch (e) {
  console.error('[VisBug Inject Error]:', e)
}
