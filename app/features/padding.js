import hotkeys from 'hotkeys-js'
import { metaKey, getStyle, getSide, showHideSelected, expandBorders } from '../utilities/'

const key_events = 'up,down,left,right'
  .split(',')
  .reduce((events, event) =>
    `${events},${event},alt+${event},shift+${event},shift+alt+${event}`
  , '')
  .substring(1)

const command_events = `${metaKey}+up,${metaKey}+shift+up,${metaKey}+down,${metaKey}+shift+down`

export function Padding(visbug) {
  hotkeys(key_events, (e, handler) => {
    if (e.cancelBubble) return

    e.preventDefault()
    padElement(visbug.selection(), handler.key)
  })

  hotkeys(command_events, (e, handler) => {
    e.preventDefault()
    padAllElementSides(visbug.selection(), handler.key)
  })

  visbug.onSelectedUpdate(paintBackgrounds)

  return () => {
    hotkeys.unbind(key_events)
    hotkeys.unbind(command_events)
    hotkeys.unbind('up,down,left,right') // bug in lib?
    visbug.removeSelectedCallback(paintBackgrounds)
    removeBackgrounds(visbug.selection())
  }
}

export function padElement(els, direction) {
  els
    .map(el => showHideSelected(el))
    .map(el => ({
      el,
      style:    'padding' + getSide(direction),
      current:  parseInt(getStyle(el, 'padding' + getSide(direction)), 10),
      amount:   direction.split('+').includes('shift') ? 10 : 1,
      negative: direction.split('+').includes('alt'),
    }))
    .map(payload =>
      Object.assign(payload, {
        padding: payload.negative
          ? payload.current - payload.amount
          : payload.current + payload.amount
      }))
    .forEach(({el, style, padding}) =>
      el.style[style] = `${padding < 0 ? 0 : padding}px`)
}

export function padAllElementSides(els, keycommand) {
  const combo = keycommand.split('+')
  let spoof = ''

  if (combo.includes('shift'))  spoof = 'shift+' + spoof
  if (combo.includes('down'))   spoof = 'alt+' + spoof

  'up,down,left,right'.split(',')
    .forEach(side => padElement(els, spoof + side))
}

function paintBackgrounds(els) {
  els.forEach(el => {
    const label_id = el.getAttribute('data-label-id')

    document
      .querySelector(`visbug-handles[data-label-id="${label_id}"]`)
      .backdrop = {
        element:  createPaddingVisual(el),
        update:   createPaddingVisual,
      }
  })
}

function removeBackgrounds(els) {
  els.forEach(el => {
    const label_id = el.getAttribute('data-label-id')
    const boxmodel = document.querySelector(`visbug-handles[data-label-id="${label_id}"]`)
      .$shadow.querySelector('visbug-boxmodel')

    if (boxmodel) boxmodel.remove()
  })
}

export function createPaddingVisual(el, hover = false) {
  const bounds            = el.getBoundingClientRect()
  const calculatedStyle   = getStyle(el, 'padding')
  const calculatedBorder   = expandBorders(getStyle(el, 'border-width'))
  const boxdisplay        = document.createElement('visbug-boxmodel')

  if (calculatedStyle !== '0px') {
    const sides = {
      top:    getStyle(el, 'paddingTop'),
      right:  getStyle(el, 'paddingRight'),
      bottom: getStyle(el, 'paddingBottom'),
      left:   getStyle(el, 'paddingLeft'),
    }

    Object.entries(sides).forEach(([side, val]) => {
      if (typeof val !== 'number')
        val = parseInt(getStyle(el, 'padding'+'-'+side).slice(0, -2))

      sides[side] = Math.round(val.toFixed(1) * 100) / 100
    })

    boxdisplay.position = { 
      mode: 'padding',
      color: hover ? 'purple' : 'pink',
      bounds, 
      sides: {
        ...sides,
        borders: calculatedBorder,
      },
    }
  }

  return boxdisplay
}

// Flex/Grid free space belongs to the current element, unlike parent padding.
// Show it when the element itself has no CSS padding.
export function createFlexLayoutVisual(el, hover = false) {
  const display = getStyle(el, 'display') || ''
  if (!/flex|grid/.test(display)) return null

  const bounds = el.getBoundingClientRect()
  const children = Array.from(el.children)
    .map(child => child.getBoundingClientRect())
    .filter(rect => rect.width > 0 && rect.height > 0)
  if (!children.length) return null

  const content = {
    top: Math.min(...children.map(rect => rect.top)),
    right: Math.max(...children.map(rect => rect.right)),
    bottom: Math.max(...children.map(rect => rect.bottom)),
    left: Math.min(...children.map(rect => rect.left)),
  }
  const sides = {
    top: Math.max(0, content.top - bounds.top),
    right: Math.max(0, bounds.right - content.right),
    bottom: Math.max(0, bounds.bottom - content.bottom),
    left: Math.max(0, content.left - bounds.left),
  }

  if (!Object.values(sides).some(side => side > 1)) return null

  const boxdisplay = document.createElement('visbug-boxmodel')
  boxdisplay.setAttribute('data-layout-space', '')
  boxdisplay.position = {
    mode: 'padding',
    color: hover ? 'purple' : 'pink',
    bounds,
    sides: {
      ...sides,
      borders: expandBorders(getStyle(el, 'border-width')),
    },
  }

  return boxdisplay
}
