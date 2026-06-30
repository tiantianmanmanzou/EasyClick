const storagekey = 'visbug-color-mode'
const defaultcolormode = 'hex'

const color_options = [
  'hsl',
  'hex',
  'rgb',
  // 'hsv',
  // 'lch',
  // 'lab',
  // 'hcl',
  // 'cmyk',
  // 'gl',
  // 'as authored',
]

const colormodestate = {
  mode: defaultcolormode
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

const sendColorMode = () => {
  platform.tabs.query({active: true, currentWindow: true}, ([tab]) => {
    tab && platform.tabs.sendMessage(tab.id, {
      action: 'COLOR_MODE',
      params: {mode:colormodestate.mode},
    }).catch(() => {})  // no VisBug listener in this tab yet — ignore
  })
}

export const getColorMode = () => {
  platform.storage.sync.get([storagekey], value => {
    let found_value = value[storagekey]

    const is_default = found_value
      ? value[storagekey] === defaultcolormode
      : false

    // first run
    if (!found_value && !is_default) {
      found_value = defaultcolormode
      platform.storage.sync.set({[storagekey]: defaultcolormode})
    }

    // migrate old choices
    if (found_value === 'hsla') {
      found_value = 'hsl'
      platform.storage.sync.set({[storagekey]: found_value})
    }
    if (found_value === 'rgba') {
      found_value = 'rgb'
      platform.storage.sync.set({[storagekey]: found_value})
    }

    // update checked state of color contextmenu radio list
    color_options.forEach(option => {
      platform.contextMenus.update(option, {
        checked: option === found_value
      })
    })

    // send visbug user preference
    colormodestate.mode = found_value
    sendColorMode()

    return found_value
  })
}

// load synced color choice on load
getColorMode()

safeCreate({
  id:     'color-mode',
  title:  'Colors',
  contexts: ['all'],
})

color_options.forEach(option => {
  safeCreate({
    id:       option,
    parentId: 'color-mode',
    title:    ' '+option,
    checked:  false,
    type:     'radio',
    contexts: ['all'],
  })
})

platform.contextMenus.onClicked.addListener(({parentMenuItemId, menuItemId}, tab) => {
  if (parentMenuItemId !== 'color-mode') return

  platform.storage.sync.set({[storagekey]: menuItemId})
  colormodestate.mode = menuItemId

  sendColorMode()
})
