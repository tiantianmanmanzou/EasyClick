import {
  gimmeToggle,
  setToolbarVisibilityState,
  setEnabledState,
} from "./contextmenu/launcher.js"
import {getColorMode} from "./contextmenu/colormode.js"
import {getColorScheme} from "./contextmenu/colorscheme.js"

const state = {
  loaded:   {},
  injected: {},
}

var platform = typeof browser === 'undefined'
  ? chrome
  : browser

// --- Working-state extension icon ---
// When VisBug is active in a tab, swap that tab's toolbar icon to the active
// target variant so the toolbar state is visible from the browser chrome.
const ACTIVE_ICON = {
  '16': 'icons/visbug-active-16.png',
  '32': 'icons/visbug-active-32.png',
  '48': 'icons/visbug-active-48.png',
  '128': 'icons/visbug-active-128.png',
}
const NORMAL_ICON = {
  '16': 'icons/visbug-16.png',
  '32': 'icons/visbug-32.png',
  '48': 'icons/visbug-48.png',
  '128': 'icons/visbug-128.png',
}

const setToolbarIcon = async (tab_id, path) => {
  try {
    await platform.action.setIcon({ tabId: tab_id, path })
    await platform.action.setIcon({ path })
  } catch (e) {
    console.warn('Unable to update VisBug action icon', e)
  }
}

const setActiveIcon  = tab_id => {
  return setToolbarIcon(tab_id, ACTIVE_ICON)
}
const setNormalIcon  = tab_id => {
  return setToolbarIcon(tab_id, NORMAL_ICON)
}

// --- Diagnostics ---
// While debugging the "icon click does nothing" symptom, surface state on the
// toolbar badge so we can tell — without opening the service-worker console —
// whether the click handler fired and whether injection succeeded/failed.
const setBadge = (tab_id, text, color = '#000') => {
  try {
    platform.action.setBadgeText({ tabId: tab_id, text })
    platform.action.setBadgeBackgroundColor({ tabId: tab_id, color })
  } catch (e) {}
}
const clearBadge = tab_id => setBadge(tab_id, '')

console.log('[VisBug] service worker booted')

// --- Auto-inject persistence (per origin) ---
// Once VisBug is injected in a tab, that tab's origin is remembered so the
// toolbar survives page refreshes / navigations within that origin.
const AUTO_KEY = 'visbug_auto_origins'

const getAutoOrigins = () =>
  new Promise(resolve => {
    platform.storage.local.get([AUTO_KEY], res => {
      resolve(new Set(res[AUTO_KEY] || []))
    })
  })

const syncAutoOriginsToTabs = async () => {
  const autoOrigins = await getAutoOrigins()
  if (!autoOrigins.size) return

  const tabs = await platform.tabs.query({})
  await Promise.all(tabs.map(async tab => {
    const origin = await getTabOrigin(tab.id)
    if (!origin || !autoOrigins.has(origin)) return

    if (await isVisBugInPage(tab.id)) {
      state.loaded[tab.id]   = true
      state.injected[tab.id] = true
      return
    }

    await injectIntoTab(tab.id, true)
  }))
}

const setAutoOrigin = async origin => {
  if (!origin) return
  const origins = await getAutoOrigins()
  origins.add(origin)
  platform.storage.local.set({ [AUTO_KEY]: [...origins] })
}

const clearAutoOrigin = async origin => {
  if (!origin) return
  const origins = await getAutoOrigins()
  origins.delete(origin)
  platform.storage.local.set({ [AUTO_KEY]: [...origins] })
}

const getTabOrigin = async tab_id => {
  try {
    const tab = await platform.tabs.get(tab_id)
    if (!tab || !tab.url) return ''
    const u = new URL(tab.url)
    // Only persist for http(s) pages, not chrome:// etc.
    if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'file:') return ''
    return u.origin
  } catch (e) {
    return ''
  }
}

// Ask the page itself whether a <vis-bug> element currently lives in it.
// The service worker's in-memory `state` is unreliable across MV3 service
// worker restarts (it's wiped when the worker sleeps) and across page
// refreshes (the DOM is gone but `state.injected` may still be true). Querying
// the page is the only source of truth for "is VisBug actually injected here?"
const isVisBugInPage = async tab_id => {
  try {
    const [res] = await platform.scripting.executeScript({
      target: {tabId: tab_id},
      func: () => !!document.querySelector('vis-bug'),
    })
    return !!(res && res.result)
  } catch (e) {
    return false
  }
}

const injectIntoTab = async (tab_id, isAuto = false) => {
  try {
    const origin = await getTabOrigin(tab_id)

    await platform.scripting.insertCSS({
      target: {tabId: tab_id},
      files: ['toolbar/bundle.css'],
    })

    await platform.scripting.executeScript({
      target: {tabId: tab_id},
      files: ['toolbar/inject.js'],
    })

    state.loaded[tab_id]    = true
    state.injected[tab_id]  = true
    // Don't force a visibility state here: inject.js restores the persisted
    // state from localStorage and reports it back via TOOLBAR_VISIBILITY_STATE,
    // which drives the radio menu. Forcing `true` would briefly desync the
    // radio when the saved state is "hidden".
    setEnabledState(tab_id, true)

    getColorMode()
    getColorScheme()
    await setActiveIcon(tab_id)

    if (origin) setAutoOrigin(origin)
    if (!isAuto) clearBadge(tab_id)
  } catch (err) {
    console.error('[VisBug Background injectIntoTab Error]:', err)
    // Surface the failure on the badge so "click does nothing" becomes a
    // visible signal instead of a silent SW-console-only error.
    setBadge(tab_id, 'ERR', '#d33')
  }
}

const ejectFromTab = async tab_id => {
  try {
    await platform.scripting.executeScript({
      target: {tabId: tab_id},
      files: ['toolbar/eject.js'],
    })
  } catch (e) {}
  state.injected[tab_id] = false
  // NOTE: do NOT reset the toolbar-visibility preference here. Disabling
  // VisBug must not change the "启用后工具栏状态" setting — it should persist so
  // the next launch honors it. Only swap the browser-toolbar icon back.
  setEnabledState(tab_id, false)
  await setNormalIcon(tab_id)

  const origin = await getTabOrigin(tab_id)
  if (origin) clearAutoOrigin(origin)
}

// Explicit enable/disable for the right-click 启用/停用 menu item (and reusable
// elsewhere). Unlike toggleIn (which picks based on page presence), these force
// a target state so the menu's stated transition is always honored.
const enableVisBug = async ({id:tab_id} = {}) => {
  if (tab_id == null) return
  try {
    if (!(await isVisBugInPage(tab_id))) await injectIntoTab(tab_id, false)
    else setEnabledState(tab_id, true)
  } catch (err) {
    console.error('[VisBug enableVisBug Error]:', err)
  }
}

const disableVisBug = async ({id:tab_id} = {}) => {
  if (tab_id == null) return
  try {
    if (await isVisBugInPage(tab_id)) await ejectFromTab(tab_id)
    else setEnabledState(tab_id, false)
  } catch (err) {
    console.error('[VisBug disableVisBug Error]:', err)
  }
}

const toggleIn = async ({id:tab_id} = {}) => {
  if (tab_id == null) return
  // Diagnostic: confirm the click handler actually ran.
  console.log('[VisBug] icon clicked, tab_id =', tab_id)
  setBadge(tab_id, 'clk', '#5b3')
  try {
    // Decide from the page itself, not the service worker's in-memory `state`:
    // the worker sleeps and restarts (wiping `state`), and `state` can drift
    // out of sync with the DOM after refreshes/ejects. Trusting it is what made
    // a click land in the eject branch against an already-absent element → the
    // "click does nothing" regression. The page is the source of truth.
    const in_page = await isVisBugInPage(tab_id)
    console.log('[VisBug] in_page =', in_page)

    if (in_page) {
      // Present → remove it.
      await ejectFromTab(tab_id)
      clearBadge(tab_id)
    } else {
      // Absent → inject (manual launch → toolbar visible).
      await injectIntoTab(tab_id, false)
    }
  } catch (err) {
    console.error('[VisBug Background toggleIn Error]:', err)
    setBadge(tab_id, 'ERR', '#d33')
  }
}

// --- Auto-inject on page load / refresh ---
// When a page finishes loading, if its origin is remembered, re-inject VisBug.
platform.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    state.loaded[tabId] = false
    state.injected[tabId] = false
    // Don't reset the visibility preference on refresh — it must survive so the
    // re-injected toolbar honors the user's "启用后工具栏状态" choice.
    await setNormalIcon(tabId)
    return
  }

  if (changeInfo.status !== 'complete') return

  const origin = await getTabOrigin(tabId)
  if (!origin) return

  const autoOrigins = await getAutoOrigins()
  if (!autoOrigins.has(origin)) return

  // Re-inject only if VisBug isn't actually in the page right now. We check the
  // page (not `state.injected`) because a refresh wipes the DOM while the
  // service worker's `state` may still claim it's injected — and if the worker
  // slept and restarted, `state` is empty anyway. The page is the source of
  // truth, which is what makes Copy Selector survive a refresh.
  if (await isVisBugInPage(tabId)) {
    // Avoid double-injection if already present in this tab.
    if (state.injected[tabId]) {
      state.loaded[tabId] = true
      return
    }

    state.loaded[tabId]   = true
    state.injected[tabId] = true
    await setActiveIcon(tabId)
    return
  }

  await injectIntoTab(tabId, true)
})

platform.runtime.onStartup.addListener(() => {
  syncAutoOriginsToTabs()
})

platform.runtime.onInstalled.addListener(() => {
  syncAutoOriginsToTabs()
})

gimmeToggle(toggleIn, { enable: enableVisBug, disable: disableVisBug })
