// Selector generation utilities.
//
// Two strategies are provided:
//   - generateSelector:      short & readable, stops as soon as the selector
//                            is unique on the page (e.g. `div.cc-topic-card.active`).
//   - generateFullSelector:  Chrome-DevTools-style full path, anchored at the
//                            nearest ancestor with an id (e.g.
//                            `#app > div > div.content > ... > div`). More stable
//                            and carries structural context — better for AI code
//                            navigation.
//
// Plus an absolute XPath for a fallback locator.

const cssEscape = sel =>
  (window.CSS && CSS.escape)
    ? CSS.escape(sel)
    : (sel || '').replace(/([^\w-])/g, '\\$1')

const matchesUnique = sel => {
  try {
    return document.querySelectorAll(sel).length === 1
  } catch (e) {
    return false
  }
}

const classSegment = el => {
  if (!el.classList || !el.classList.length) return ''
  return '.' + Array.from(el.classList).map(cssEscape).join('.')
}

// ---- Short readable selector (stops at first unique match) ----
export const generateSelector = el => {
  if (!el || el.nodeType !== 1) return ''

  if (el.id && matchesUnique(`#${cssEscape(el.id)}`))
    return `#${cssEscape(el.id)}`

  const parts = []
  let current = el

  while (current && current.nodeType === 1 &&
         current !== document.documentElement &&
         current !== document.body) {
    if (current.id && matchesUnique(`#${cssEscape(current.id)}`)) {
      parts.unshift(`#${cssEscape(current.id)}`)
      return parts.join(' > ')
    }

    let segment = current.nodeName.toLowerCase() + classSegment(current)

    if (current.parentElement) {
      const sameTag = Array.from(current.parentElement.children)
        .filter(n => n.nodeName === current.nodeName)
      if (sameTag.length > 1)
        segment += `:nth-of-type(${sameTag.indexOf(current) + 1})`
    }

    parts.unshift(segment)
    const candidate = parts.join(' > ')
    if (matchesUnique(candidate)) return candidate

    current = current.parentElement
  }

  return parts.length ? parts.join(' > ') : el.nodeName.toLowerCase()
}

// ---- Chrome-style full path (anchored at nearest id, no short-circuit) ----
export const generateFullSelector = el => {
  if (!el || el.nodeType !== 1) return ''

  if (el.id && matchesUnique(`#${cssEscape(el.id)}`))
    return `#${cssEscape(el.id)}`

  // Find nearest ancestor (inclusive) with a unique id to anchor the path.
  let anchor = null
  let walker = el
  while (walker && walker.nodeType === 1) {
    if (walker.id && matchesUnique(`#${cssEscape(walker.id)}`)) {
      anchor = walker
      break
    }
    walker = walker.parentElement
  }

  // Collect nodes between anchor (exclusive) and el (inclusive).
  const chain = []
  let current = el
  while (current && current !== anchor) {
    chain.unshift(current)
    current = current.parentElement
  }

  const rootPrefix = anchor ? `#${cssEscape(anchor.id)}` : ''

  // Build a clean path (tag + classes, nth-of-type only when needed).
  const buildPath = useNth =>
    chain.map(node => {
      let seg = node.nodeName.toLowerCase() + classSegment(node)
      if (useNth && node.parentElement) {
        const sameTag = Array.from(node.parentElement.children)
          .filter(n => n.nodeName === node.nodeName)
        if (sameTag.length > 1)
          seg += `:nth-of-type(${sameTag.indexOf(node) + 1})`
      }
      return seg
    }).join(' > ')

  // First try without nth-of-type (Chrome often yields a clean path).
  let path = buildPath(false)
  let full = rootPrefix ? `${rootPrefix} > ${path}` : path
  if (matchesUnique(full)) return full

  // Otherwise disambiguate with nth-of-type at every level.
  path = buildPath(true)
  full = rootPrefix ? `${rootPrefix} > ${path}` : path
  if (matchesUnique(full)) return full

  // Last resort: absolute path from <html>.
  return generateSelector(el)
}

// ---- Absolute XPath ----
export const generateXPath = el => {
  if (!el || el.nodeType !== 1) return ''

  if (el.id)
    return `//*[@id="${el.id}"]`

  const parts = []
  let current = el
  while (current && current.nodeType === 1 && current !== document.documentElement) {
    const parent = current.parentElement
    if (parent) {
      const sameTag = Array.from(parent.children)
        .filter(n => n.nodeName === current.nodeName)
      const index = sameTag.indexOf(current) + 1
      const needsIndex = sameTag.length > 1
      parts.unshift(
        `${current.nodeName.toLowerCase()}${needsIndex ? `[${index}]` : ''}`)
    } else {
      parts.unshift(current.nodeName.toLowerCase())
    }
    current = parent
  }
  return '/' + parts.join('/')
}
