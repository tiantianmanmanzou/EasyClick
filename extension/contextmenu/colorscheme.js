const schemestoragekey = 'visbug-color-scheme';
const defaultcolorscheme = 'auto';

const scheme_option = [
  'auto',
  'light',
  'dark',
]

const colorschemestate = {
  mode: defaultcolorscheme
}

var platform = typeof browser === 'undefined'
  ? chrome
  : browser

// See launcher.js: a duplicate-id contextMenus.create() throws synchronously
// and would abort this module on service-worker restart. Guard every create.
const safeCreate = props => {
  try {
    platform.contextMenus.create(props, () => void chrome.runtime.lastError)
  } catch (e) {}
}

const sendColorScheme = () => {
  platform.tabs.query({active: true, currentWindow: true}, ([tab]) => {
    tab && platform.tabs.sendMessage(tab.id, {
      action: 'COLOR_SCHEME',
      params: {mode:colorschemestate.mode},
    }).catch(() => {})  // no VisBug listener in this tab yet — ignore
  })
}

export const getColorScheme = () => {
  platform.storage.sync.get([schemestoragekey], value => {
    let found_value = value[schemestoragekey];

    // first run
    if (!found_value) {
      found_value = defaultcolorscheme;
      platform.storage.sync.set({ [schemestoragekey]: defaultcolorscheme });
    }

    // update checked state of scheme contextmenu radio list
    scheme_option.forEach(option => {
      platform.contextMenus.update(option, {
        checked: option === found_value
      })
    })

    // send visbug user preference
    colorschemestate.mode = found_value
    sendColorScheme()

    return found_value
  })
}

// load synced scheme choice on load
getColorScheme()

safeCreate({
  id:     'color-scheme',
  title:  'Theme',
  contexts: ['all'],
})

scheme_option.forEach(option => {
  safeCreate({
    id:       option,
    parentId: 'color-scheme',
    title:    ' '+option,
    checked:  false,
    type:     'radio',
    contexts: ['all'],
  })
})

platform.contextMenus.onClicked.addListener(({parentMenuItemId, menuItemId}, tab) => {
  if (parentMenuItemId !== 'color-scheme') return

  platform.storage.sync.set({[schemestoragekey]: menuItemId})
  colorschemestate.mode = menuItemId

  sendColorScheme()
})
