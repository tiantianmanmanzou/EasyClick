var platform = typeof browser === 'undefined'
  ? chrome
  : browser

var toggleIt
let enableApi   // () => inject VisBug into the active tab
let disableApi  // () => eject VisBug from the active tab
const toolbarVisibleByTab = {}
// Whether VisBug is currently enabled (injected) in a tab. Drives the
// 启用/停用 menu item's title — distinct from the toolbar-visibility preference,
// which only controls initial show/hide on launch.
const enabledByTab = {}

// contextMenus.create() WITHOUT a callback throws synchronously on a duplicate
// id ("Cannot create item with duplicate id"). Context menus persist across MV3
// service-worker restarts, so on every restart after the first this would throw
// at module top-level, abort module evaluation, and stop
// gimmeToggle()'s action.onClicked listener from ever being registered — which
// is exactly the "clicking the icon does nothing" symptom. Always pass a
// callback (and guard with try/catch) so a duplicate id is a harmless no-op.
const safeCreate = props => {
  try {
    platform.contextMenus.create(props, () => void chrome.runtime.lastError)
  } catch (e) {}
}

export const gimmeToggle = (toggleIn, { enable, disable } = {}) => {
  toggleIt   = toggleIn
  enableApi  = enable
  disableApi = disable
  platform.action.onClicked.addListener(toggleIn)
}

// Record whether VisBug is enabled (injected) in a tab and refresh the menu.
export const setEnabledState = (tabId, enabled) => {
  if (tabId == null) return
  enabledByTab[tabId] = !!enabled
  syncEnableMenu(tabId)
}

export const setToolbarVisibilityState = (tabId, visible) => {
  if (tabId == null) return
  toolbarVisibleByTab[tabId] = !!visible
  syncToolbarMenu(tabId)
}

// This radio group reflects a PREFERENCE — "after VisBug launches, should the
// toolbar be shown or hidden" — NOT the live runtime visibility. The preference
// is persisted in the page's localStorage (visbug_visible) and is the only
// thing that decides the toolbar's initial state on launch. Enabling/disabling
// VisBug (inject/eject) must NEVER change it; only an explicit radio choice (or
// the in-page keyboard toggle) does. toolbarVisibleByTab mirrors that
// preference per tab so the radio's checked option can reflect it.
// Default preference is "show" (undefined → visible).
const isToolbarVisible = tabId => toolbarVisibleByTab[tabId] !== false

const isEnabled = tabId => enabledByTab[tabId] === true

const syncToolbarMenu = async tabId => {
  if (tabId == null) return
  const visible = isToolbarVisible(tabId)
  try {
    await platform.contextMenus.update('toolbar-show', { checked:  visible })
    await platform.contextMenus.update('toolbar-hide', { checked: !visible })
    platform.contextMenus.refresh && platform.contextMenus.refresh()
  } catch (e) {}
}

// Update the 启用/停用 item's title to reflect a tab's enabled state. Chrome
// context-menu titles are global (not per-tab), so we resync on tab activation
// (tabs.onActivated) and on every enable/disable so the active tab's state is
// what's shown when the menu opens.
const syncEnableMenu = async tabId => {
  if (tabId == null) return
  try {
    await platform.contextMenus.update('enable-toggle', {
      title: isEnabled(tabId) ? '停用' : '启用',
    })
    platform.contextMenus.refresh && platform.contextMenus.refresh()
  } catch (e) {}
}

// Keep 启用/停用 as the first top-level item in the action menu.
safeCreate({
  id:       'enable-toggle',
  title:    '启用',
  contexts: ['all'],
})

// Right-click the extension icon → a radio group for the launch preference.
safeCreate({
  id:       'toolbar-visibility',
  title:    '启用后工具栏状态',
  contexts: ['action'],
})
safeCreate({
  id:       'toolbar-show',
  parentId: 'toolbar-visibility',
  title:    '显示',
  type:     'radio',
  checked:  true,
  contexts: ['action'],
})
safeCreate({
  id:       'toolbar-hide',
  parentId: 'toolbar-visibility',
  title:    '隐藏',
  type:     'radio',
  checked:  false,
  contexts: ['action'],
})

// onShown is Firefox-only; Chrome has no contextMenus.onShown. Accessing it on
// Chrome throws "Cannot read properties of undefined (reading 'addListener')"
// at module top-level, which aborts visbug.js's module evaluation before
// gimmeToggle() runs — leaving action.onClicked unregistered and marking the
// service worker "invalid". Only attach when the API exists.
if (platform.contextMenus.onShown) {
  platform.contextMenus.onShown.addListener((info, tab) => {
    if (tab && tab.id != null) {
      syncToolbarMenu(tab.id)
      syncEnableMenu(tab.id)
    }
  })
}

// Chrome has no onShown: resync both menus' titles to the active tab whenever
// the user switches tabs, so the menu reflects the right state when opened.
platform.tabs.onActivated.addListener(({ tabId }) => {
  syncToolbarMenu(tabId)
  syncEnableMenu(tabId)
})

platform.contextMenus.onClicked.addListener(({menuItemId}, tab) => {
  // 启用/停用 toggle → transition to the opposite enabled state.
  if (menuItemId === 'enable-toggle') {
    if (!tab || tab.id == null) return
    if (isEnabled(tab.id)) {
      disableApi && disableApi(tab)
    } else {
      enableApi && enableApi(tab)
    }
    return
  }

  // Radio choice → set the launch preference (show/hide). This is sent to the
  // page, which persists it to localStorage and applies it to the toolbar if
  // VisBug is currently present. If VisBug isn't injected, the preference is
  // still persisted and takes effect on the next launch. Either way this is an
  // explicit user choice — NOT something enable/disable should trigger.
  let visible
  if (menuItemId === 'toolbar-show') visible = true
  else if (menuItemId === 'toolbar-hide') visible = false
  else return

  if (tab && tab.id != null) {
    platform.tabs.sendMessage(tab.id, { action: 'TOOLBAR_VISIBILITY', visible })
      .catch(() => {})
    // Optimistically reflect the choice immediately (the page confirms via
    // TOOLBAR_VISIBILITY_STATE, which re-syncs).
    setToolbarVisibilityState(tab.id, visible)
  }
})

platform.runtime.onMessage.addListener((request, sender) => {
  if (request.action !== 'TOOLBAR_VISIBILITY_STATE') return

  const tabId = request.tabId ?? (sender && sender.tab && sender.tab.id)
  if (tabId == null) return

  setToolbarVisibilityState(tabId, request.visible)
})
