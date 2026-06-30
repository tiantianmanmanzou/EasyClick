import $ from 'blingblingjs'
import hotkeys from 'hotkeys-js'
import {
  generateFullSelector, generateXPath, generateSelector
} from '../utilities/'

// "Copy Selector" tool — enriched for AI code navigation.
//
// Hovering an element shows its full CSS selector in the standard visbug
// hover label (handled by selectable.js -> handleLabelText). Clicking the
// element selects it (handled by selectable.js), which fires onSelectedUpdate;
// we then build a rich "AI context block" (url, route, full selector, xpath,
// tag/id/classes, text, data-* attributes, outerHTML snippet) and copy it to
// the clipboard, flashing a short toast.

const MAX_TEXT   = 12
const MAX_INNER  = 12    // max chars of inner content shown before collapsing to …

// ---- Configurable fields ----
// Each block item is toggleable from the Copy Selector toolbar preview.
// `key` matches a line builder below; persisted to localStorage.
export const SELECTOR_FIELDS = [
  { key: 'header',   label: '[EasyClick Element Context] 标题', default: true },
  { key: 'url',      label: 'URL',                            default: true },
  { key: 'route',    label: 'Route',                          default: true },
  { key: 'title',    label: 'Title',                          default: true },
  { key: 'selector', label: 'Selector',                       default: true },
  { key: 'xpath',    label: 'XPath',                          default: true },
  { key: 'meta',     label: 'Tag / ID / Classes',             default: true },
  { key: 'text',     label: 'Text',                           default: true },
  { key: 'data',     label: 'Data attributes',                default: true },
  { key: 'html',     label: 'OuterHTML',                      default: true },
  { key: 'errors',   label: 'Console errors',                 default: true },
]

const STORAGE_KEY = 'visbug_selector_config'

const loadConfig = () => {
  const defaults = {}
  SELECTOR_FIELDS.forEach(f => defaults[f.key] = f.default)
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return Object.assign(defaults, JSON.parse(saved))
  } catch (e) {}
  return defaults
}

export const selectorConfig = loadConfig()

export const setSelectorField = (key, value) => {
  selectorConfig[key] = value
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(selectorConfig)) }
  catch (e) {}
}

const truncate = (str, max) => {
  if (!str) return ''
  const collapsed = str.replace(/\s+/g, ' ').trim()
  return collapsed.length > max
    ? collapsed.slice(0, max) + '…'
    : collapsed
}

// ---- Console error capture ----
// Collects console.error output (and uncaught errors) from the page so the
// copied context block can optionally include them.
// Stored on `window` (not module-local) so it survives re-injection within a
// page session and can be inspected at runtime via `window.__visbugErrors`.
const MAX_ERRORS = 50

const getErrors = () => {
  if (!window.__visbugErrors) window.__visbugErrors = []
  return window.__visbugErrors
}

const pushError = args => {
  const errors = getErrors()
  if (errors.length >= MAX_ERRORS) return
  const text = args.map(a => {
    if (a instanceof Error) return a.stack || `${a.name}: ${a.message}`
    if (typeof a === 'object') {
      try { return JSON.stringify(a) } catch (e) { return String(a) }
    }
    return String(a)
  }).join(' ')
  errors.push(text)
}

const installErrorCapture = () => {
  if (window.__visbugErrorCapture) return
  window.__visbugErrorCapture = true

  const origError = console.error
  console.error = function(...args) {
    try { pushError(args) } catch (e) {}
    return origError.apply(this, args)
  }

  // Capture unhandled promise rejections too.
  window.addEventListener('unhandledrejection', e => {
    try {
      const reason = e.reason
      const msg = reason instanceof Error
        ? (reason.stack || `${reason.name}: ${reason.message}`)
        : (typeof reason === 'object' ? JSON.stringify(reason) : String(reason))
      pushError(['Unhandled rejection: ' + msg])
    } catch (err) {}
  }, true)

  window.addEventListener('error', e => {
    try {
      pushError([e.message + (e.filename ? ` (${e.filename}:${e.lineno})` : '')])
    } catch (err) {}
  }, true)
}

installErrorCapture()

// Render an element's outerHTML but collapse long inner content to "…",
// keeping the opening tag (with attributes) and the closing tag intact so
// the structure stays readable for AI code navigation.
//   e.g. <div class="cc-topic-card active" data-topic-id="123">…</div>
const truncateOuterHTML = el => {
  const tag       = el.nodeName.toLowerCase()
  const openTag   = '<' + tag +
    Array.from(el.attributes)
      .reduce((s, a) => `${s} ${a.name}="${a.value}"`, '') +
    '>'
  const voidTags  = ['area','base','br','col','embed','hr','img','input',
                     'link','meta','param','source','track','wbr']
  if (voidTags.includes(tag)) return openTag

  const closeTag  = `</${tag}>`
  const inner     = truncate(el.innerHTML, MAX_INNER)
  // If inner content was collapsed (ends with our ellipsis) or is non-trivial,
  // show it; otherwise (empty element) just emit open+close with nothing.
  if (!inner) return openTag + closeTag
  return `${openTag}${inner}${closeTag}`
}

const getDataAttrs = el => {
  const attrs = {}
  for (const attr of el.attributes)
    if (attr.name.startsWith('data-'))
      attrs[attr.name] = attr.value
  return attrs
}

const buildContextBlock = el => {
  const url       = location.href
  const route     = location.pathname + location.search
  const title     = document.title
  const fullSel   = generateFullSelector(el)
  const xpath     = generateXPath(el)
  const tag       = el.nodeName.toLowerCase()
  const id        = el.id || '-'
  const classes   = el.classList.length ? Array.from(el.classList).join(' ') : '-'
  const text      = truncate(el.textContent, MAX_TEXT)
  const dataAttrs = getDataAttrs(el)
  const outerHTML = truncateOuterHTML(el)

  // Only include lines whose field is enabled in the config.
  const lines = []
  if (selectorConfig.header)   lines.push('[EasyClick Element Context]')
  if (selectorConfig.url)      lines.push(`URL: ${url}`)
  if (selectorConfig.route)    lines.push(`Route: ${route}`)
  if (selectorConfig.title)    lines.push(`Title: ${title}`)
  if (selectorConfig.selector) lines.push(`Selector: ${fullSel}`)
  if (selectorConfig.xpath)    lines.push(`XPath: ${xpath}`)
  if (selectorConfig.meta)     lines.push(`Tag: ${tag}   ID: ${id}   Classes: ${classes}`)
  if (selectorConfig.text)     lines.push(`Text: ${text ? JSON.stringify(text) : '(empty)'}`)
  if (selectorConfig.data) {
    lines.push(`Data attributes:`)
    lines.push(Object.keys(dataAttrs).length
      ? Object.entries(dataAttrs).map(([k, v]) => `  ${k} = ${JSON.stringify(v)}`).join('\n')
      : '  (none)')
  }
  if (selectorConfig.html) {
    lines.push(`OuterHTML:`)
    lines.push(outerHTML)
  }
  if (selectorConfig.errors) {
    const errors = getErrors()
    lines.push(`Console errors:`)
    if (errors.length) {
      errors.forEach((err, i) => {
        const trimmed = err.length > 300 ? err.slice(0, 300) + '…' : err
        lines.push(`  [${i + 1}] ${trimmed}`)
      })
    } else {
      lines.push('  (none)')
    }
  }
  lines.push('')

  const block = lines.join('\n')

  return { block, fullSel }
}

const toast = () => {
  const host = document.createElement('div')
  host.setAttribute('data-visbug-selector-toast', '')
  host.style.cssText = `
    all: initial;
    position: fixed;
    z-index: 2147483647;
    top: 16px;
    left: 50%;
    transform: translateX(-50%) translateY(-12px);
    opacity: 0;
    pointer-events: none;
    transition: opacity .12s ease, transform .12s ease;
  `
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `
    <style>
      :host { all: initial; }
      span {
        display: inline-block;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        font-weight: 600;
        color: #fff;
        background: hsl(267, 100%, 58%);
        padding: 6px 12px;
        border-radius: 6px;
        box-shadow: 0 4px 14px rgba(0,0,0,.25);
        max-width: 80vw;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    </style>
    <span></span>
  `
  return host
}

export function Selector(visbug) {
  const $toast = toast()
  let toast_timer
  let appended = false
  const CURSOR_LOCK_ATTR = 'data-visbug-selector-cursor-lock'

  const setCursorLock = locked => {
    if (!document.body) return
    if (locked) document.body.setAttribute(CURSOR_LOCK_ATTR, '')
    else document.body.removeAttribute(CURSOR_LOCK_ATTR)
  }

  const flash = message => {
    if (!appended) {
      document.body.appendChild($toast)
      appended = true
    }
    $toast.shadowRoot.querySelector('span').textContent = message

    requestAnimationFrame(() => {
      $toast.style.opacity = '1'
      $toast.style.transform = 'translateX(-50%) translateY(0)'
    })

    clearTimeout(toast_timer)
    toast_timer = setTimeout(() => {
      $toast.style.opacity = '0'
      $toast.style.transform = 'translateX(-50%) translateY(-12px)'
    }, 1800)
  }

  const copyToClipboard = async text => {
    try {
      const { state } = await navigator.permissions.query({ name: 'clipboard-write' })
      if (state === 'granted') {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch (e) {}

    // Fallback: execCommand copy.
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch (e) {
      return false
    }
  }

  let clear_timer

  // After copying, briefly keep the selection visible so the user sees what
  // was captured, then auto-clear it so the element's label/info disappears.
  const clearSelectionSoon = delay => {
    clearTimeout(clear_timer)
    clear_timer = setTimeout(() => {
      if (typeof visbug.unselect_all === 'function')
        visbug.unselect_all()
    }, delay)
  }

  const onSelect = async selected => {
    const el = selected && selected[0]
    if (!el) return

    const { block, fullSel } = buildContextBlock(el)
    const ok = await copyToClipboard(block)

    const errCount = getErrors().length
    flash(ok
      ? `✓ 已复制${errCount ? ` (${errCount} errors)` : ''}`
      : '复制失败 — 请允许剪贴板访问')

    // Hide the selected element's info shortly after copying.
    if (ok) clearSelectionSoon(1200)
  }

  setCursorLock(true)
  visbug.onSelectedUpdate(onSelect, false)

  hotkeys('esc', _ => {
    clearTimeout(toast_timer)
    clearTimeout(clear_timer)
    if (typeof visbug.unselect_all === 'function')
      visbug.unselect_all()
    $toast.style.opacity = '0'
  })

  return () => {
    setCursorLock(false)
    visbug.removeSelectedCallback(onSelect)
    hotkeys.unbind('esc')
    clearTimeout(toast_timer)
    clearTimeout(clear_timer)
    if (appended) $toast.remove()
    appended = false
  }
}
