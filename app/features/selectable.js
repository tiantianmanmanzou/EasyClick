import $ from 'blingblingjs'
import hotkeys from 'hotkeys-js'

import { preferredNotation } from './color'
import { canMoveLeft, canMoveRight, canMoveUp } from './move'
import { watchImagesForUpload } from './imageswap'
import { queryPage } from './search'
import { createMeasurements, clearMeasurements } from './measurements'
import { createMarginVisual } from './margin'
import { createPaddingVisual } from './padding'

import { showTip as showMetaTip, removeAll as removeAllMetaTips } from './metatip'
import { showTip as showAccessibilityTip, removeAll as removeAllAccessibilityTips } from './accessibility'

import {
  metaKey, htmlStringToDom, createClassname, camelToDash,
  isOffBounds, getStyle, getStyles, deepElementFromPoint, getShadowValues,
  isSelectorValid, findNearestChildElement, findNearestParentElement,
  getTextShadowValues, isFixed, onRemove, generateSelector, generateFullSelector,
  expandBorders
} from '../utilities/'

export function Selectable(visbug) {
  const page              = document.body
  let selected            = []
  let selectedCallbacks   = []
  let labels              = []
  let handles             = []

  const hover_state       = {
    target:            null,
    element:           null,
    label:             null,
    kind:              null,
    containerTarget:   null,
    containerElement:  null,
    gapTarget:         null,
    gapElements:       [],
  }

  const listen = () => {
    page.addEventListener('click', on_click, true)
    page.addEventListener('dblclick', on_dblclick, true)

    page.on('selectstart', on_selection)
    page.on('mousemove', on_hover)
    document.addEventListener('copy', on_copy)
    document.addEventListener('cut', on_cut)
    document.addEventListener('paste', on_paste)

    watchCommandKey()

    hotkeys(`${metaKey}+alt+c`, on_copy_styles)
    hotkeys(`${metaKey}+alt+v`, e => on_paste_styles())
    hotkeys('esc', on_esc)
    hotkeys(`${metaKey}+d`, on_duplicate)
    hotkeys('backspace,del,delete', on_delete)
    hotkeys('alt+del,alt+backspace', on_clearstyles)
    hotkeys(`${metaKey}+e,${metaKey}+shift+e`, on_expand_selection)
    hotkeys(`${metaKey}+g,${metaKey}+shift+g`, on_group)
    hotkeys('tab,shift+tab,enter,shift+enter', on_keyboard_traversal)
    hotkeys(`${metaKey}+shift+enter`, on_select_children)
    hotkeys(`shift+'`, on_select_parent)
  }

  const unlisten = () => {
    page.removeEventListener('click', on_click, true)
    page.removeEventListener('dblclick', on_dblclick, true)

    page.off('selectstart', on_selection)
    page.off('mousemove', on_hover)

    document.removeEventListener('copy', on_copy)
    document.removeEventListener('cut', on_cut)
    document.removeEventListener('paste', on_paste)

    hotkeys.unbind(`esc,${metaKey}+d,backspace,del,delete,alt+del,alt+backspace,${metaKey}+e,${metaKey}+shift+e,${metaKey}+g,${metaKey}+shift+g,tab,shift+tab,enter,shift+enter`)
  }

  const getEventOrigin = e =>
    e.composedPath
      ? e.composedPath()[0]
      : e.target

  const on_click = e => {
    if (!visbug.activeTool) return

    const eventOrigin = getEventOrigin(e)
    if (isOffBounds(eventOrigin)) return

    const $target = deepElementFromPoint(e.clientX, e.clientY)

    if (isOffBounds($target) && !selected.filter(el => el == $target).length)
      return

    e.preventDefault()
    if (!e.altKey) e.stopPropagation()

    if (!e.shiftKey) {
      unselect_all({silent:true})
      clearMeasurements()
    }

    if(e.shiftKey && $target.hasAttribute('data-selected'))
      unselect($target.getAttribute('data-label-id'))
    else
      select($target)
  }

  const unselect = id => {
    [...labels, ...handles]
      .filter(node =>
          node.getAttribute('data-label-id') === id)
        .forEach(node =>
          node.remove())

    selected.filter(node =>
      node.getAttribute('data-label-id') === id)
      .forEach(node =>
        $(node).attr({
          'data-selected':      null,
          'data-selected-hide': null,
          'data-label-id':      null,
          'data-pseudo-select':         null,
          'data-measuring':     null,
          'data-outward':       null,
      }))

    selected = selected.filter(node => node.getAttribute('data-label-id') !== id)

    tellWatchers()
  }

  const on_dblclick = e => {
    if (!visbug.activeTool) return

    e.preventDefault()
    e.stopPropagation()
    if (isOffBounds(getEventOrigin(e))) return
    visbug.toolSelected('text')
  }

  const watchCommandKey = e => {
    let did_hide = false

    document.onkeydown = function(e) {
      if (hotkeys.ctrl && selected.length) {
        $('visbug-handles, visbug-label, visbug-hover, visbug-grip').forEach(el =>
          el.style.display = 'none')

        did_hide = true
      }
    }

    document.onkeyup = function(e) {
      if (did_hide) {
        $('visbug-handles, visbug-label, visbug-hover, visbug-grip').forEach(el =>
          el.style.display = null)

        did_hide = false
      }
    }
  }

  const on_esc = _ =>
    unselect_all()

  const on_duplicate = e => {
    const root_node = selected[0]
    if (!root_node) return

    const deep_clone = root_node.cloneNode(true)
    deep_clone.removeAttribute('data-selected')
    root_node.parentNode.insertBefore(deep_clone, root_node.nextSibling)
    e.preventDefault()
  }

  const on_delete = e =>
    selected.length && delete_all()

  const on_clearstyles = e =>
    selected.forEach(el =>
      el.attr('style', null))

  const on_copy = async e => {
    // if user has selected text, dont try to copy an element
    if (window.getSelection().toString().length)
      return

    if (selected[0] && window.node_clipboard !== selected[0]) {
      e.preventDefault()
      let $node = selected[0].cloneNode(true)
      $node.removeAttribute('data-selected')

      window.copy_backup = $node.outerHTML
      e.clipboardData.setData('text/html', window.copy_backup)

      const {state} = await navigator.permissions.query({name:'clipboard-write'})

      if (state === 'granted')
        await navigator.clipboard.writeText(window.copy_backup)
    }
  }

  const on_cut = e => {
    if (selected[0] && window.node_clipboard !== selected[0]) {
      let $node = selected[0].cloneNode(true)
      $node.removeAttribute('data-selected')
      window.copy_backup = $node.outerHTML
      e.clipboardData.setData('text/html', window.copy_backup)
      selected[0].remove()
    }
  }

  const on_paste = async (e, index = 0) => {
    const clipData = e.clipboardData.getData('text/html')
    const globalClipboard = await navigator.clipboard.readText()
    const potentialHTML = clipData || globalClipboard || window.copy_backup

    if (selected.length && potentialHTML) {
      e.preventDefault()

      selected.forEach(el =>
        el.appendChild(
          htmlStringToDom(potentialHTML)))
    }
  }

  const on_copy_styles = async e => {
    e.preventDefault()

    window.copied_styles = selected.map(el =>
      getStyles(el))

    try {
      const colormode = $('vis-bug').attr('color-mode')

      const styles = window.copied_styles[0]
        .map(({prop,value}) => {
          if (prop.includes('color') || prop.includes('background-color') || prop.includes('border-color') || prop.includes('Color') || prop.includes('fill') || prop.includes('stroke'))
            value = preferredNotation(value, colormode)

          if (prop.includes('boxShadow')) {
            const [, color, x, y, blur, spread] = getShadowValues(value)
            value = `${preferredNotation(color, colormode)} ${x} ${y} ${blur} ${spread}`
          }

          if (prop.includes('textShadow')) {
            const [, color, x, y, blur] = getTextShadowValues(value)
            value = `${preferredNotation(color, colormode)} ${x} ${y} ${blur}`
          }
          return {prop,value}
        })
        .reduce((message, item) =>
          [...message, `${camelToDash(item.prop)}: ${item.value};`]
        , []).join('\n')

      const {state} = await navigator.permissions.query({name:'clipboard-write'})

      if (styles && state === 'granted') {
        await navigator.clipboard.writeText(styles)
      }
    } catch(e) {
      console.warn(e)
    }
  }

  const on_paste_styles = async (e, index = 0) => {
    if (window.copied_styles) {
      selected.forEach(el => {
        window.copied_styles[index]
          .map(({prop, value}) =>
            el.style[prop] = value)

        index >= window.copied_styles.length - 1
          ? index = 0
          : index++
      })
    }
    else {
      const potentialStyles = await navigator.clipboard.readText()

      if (selected.length && potentialStyles)
        selected.forEach(el =>
          el.style = potentialStyles)
    }
  }

  const on_expand_selection = (e, {key}) => {
    e.preventDefault()

    const [root] = selected
    if (!root) return

    const query = combineNodeNameAndClass(root)

    if (isSelectorValid(query))
      expandSelection({
        query,
        all: key.includes('shift'),
      })
  }

  const on_group = (e, {key}) => {
    e.preventDefault()

    if (key.split('+').includes('shift')) {
      let $selected = [...selected]
      unselect_all()
      $selected.reverse().forEach(el => {
        let l = el.children.length
        while (el.children.length > 0) {
          var node = el.childNodes[el.children.length - 1]
          if (node.nodeName !== '#text')
            select(node)
          el.parentNode.prepend(node)
        }
        el.parentNode.removeChild(el)
      })
    }
    else {
      let div = document.createElement('div')
      selected[0].parentNode.prepend(
        selected.reverse().reduce((div, el) => {
          div.appendChild(el)
          return div
        }, div)
      )
      unselect_all()
      select(div)
    }
  }

  const on_selection = e =>
    !isOffBounds(getEventOrigin(e))
    && selected.length
    && selected[0].textContent != e.target.textContent
    && e.preventDefault()

  const on_keyboard_traversal = (e, {key}) => {
    if (!selected.length) return

    e.preventDefault()
    e.stopPropagation()

    const targets = selected.reduce((flat_n_unique, node) => {
      const element_to_left     = canMoveLeft(node)
      const element_to_right    = canMoveRight(node)
      const has_parent_element  = findNearestParentElement(node)
      const has_child_elements  = findNearestChildElement(node)

      if (key.includes('shift')) {
        if (key.includes('tab') && element_to_left)
          flat_n_unique.add(element_to_left)
        else if (key.includes('enter') && has_parent_element)
          flat_n_unique.add(has_parent_element)
        else
          flat_n_unique.add(node)
      }
      else {
        if (key.includes('tab') && element_to_right)
          flat_n_unique.add(element_to_right)
        else if (key.includes('enter') && has_child_elements)
          flat_n_unique.add(has_child_elements)
        else
          flat_n_unique.add(node)
      }

      return flat_n_unique
    }, new Set())

    if (targets.size) {
      unselect_all({silent:true})
      targets.forEach(node => {
        select(node)
        show_tip(node)
      })
    }
  }

  const show_tip = el => {
    const active_tool = visbug.activeTool
    let tipFactory

    if (active_tool === 'accessibility') {
      removeAllAccessibilityTips()
      tipFactory = showAccessibilityTip
    }
    else if (active_tool === 'inspector') {
      removeAllMetaTips()
      tipFactory = showMetaTip
    }

    if (!tipFactory) return

    const {top, left} = el.getBoundingClientRect()
    const { pageYOffset, pageXOffset } = window

    tipFactory(el, {
      clientY:  top,
      clientX:  left,
      pageY:    pageYOffset + top - 10,
      pageX:    pageXOffset + left + 20,
    })
  }

  const on_hover = e => {
    const $target = deepElementFromPoint(e.clientX, e.clientY)
    const tool = visbug.activeTool

    // No active tool (deselected) — don't render any hover UI.
    if (!tool) {
      clearMeasurements()
      return clearHover()
    }

    if (isOffBounds($target) || $target.hasAttribute('data-selected') || $target.hasAttribute('draggable')) {
      clearMeasurements()
      return clearHover()
    }

    overlayHoverUI({
      el: $target,
      // no_hover: tool === 'guides',
      no_label:
           (tool === 'guides'
        || tool === 'accessibility'
        || tool === 'margin'
        || tool === 'padding'
        || tool === 'inspector'
        || tool === 'selector'),
      kind: tool === 'selector' ? 'selector-target' : 'default',
      backdropFactory: tool === 'selector' ? createSelectorTargetBackdrop : null,
    })

    if (tool === 'selector')
      overlayContainerHoverUI(getHoverContainer($target))
    else
      clearContainerHover()

    if (tool === 'selector')
      overlayGapHoverUI(getGapHost($target))
    else
      clearGapHover()

    if (tool === 'guides' && selected.length >= 1 && !selected.includes($target)) {
      $target.setAttribute('data-measuring', true)
      const [$anchor] = selected
      createMeasurements({$anchor, $target})
    }
    else if (tool === 'margin' && !hover_state.element.$shadow.querySelector('visbug-boxmodel')) {
      hover_state.element.$shadow.appendChild(
        createMarginVisual(hover_state.target, true))
    }
    else if (tool === 'padding' && !hover_state.element.$shadow.querySelector('visbug-boxmodel')) {
      hover_state.element.$shadow.appendChild(
        createPaddingVisual(hover_state.target, true))
    }
    else if ($target.hasAttribute('data-measuring') || selected.includes($target)) {
      clearMeasurements()
    }

    // force promote into top layer
    if (tool === 'guides') {
      handles.forEach(handle => {
        handle.hidePopover &&  handle.hidePopover()
        handle.showPopover && handle.showPopover()
      })
    }
  }

  const select = el => {
    const id = handles.length
    const tool = visbug.activeTool

    el.setAttribute('data-selected', true)
    el.setAttribute('data-label-id', id)

    clearHover()

    overlayMetaUI({
      el,
      id,
      no_label: 
           tool === 'inspector' 
        || tool === 'guides' 
        || tool === 'margin' 
        || tool === 'move' 
        || tool === 'accessibility',
    })

    $('visbug-metatip, visbug-ally').forEach(tip => {
      tip.hidePopover && tip.hidePopover()
      tip.showPopover && tip.showPopover()
    })

    selected.unshift(el)
    tellWatchers()
  }

  const selection = () =>
    selected

  const unselect_all = ({silent = false} = {}) => {
    selected
      .forEach(el =>
        $(el).attr({
          'data-selected':      null,
          'data-selected-hide': null,
          'data-label-id':      null,
          'data-pseudo-select': null,
          'data-outward':       null,
        }))

    $('[data-pseudo-select]').forEach(hover =>
      hover.removeAttribute('data-pseudo-select'))

    Array.from([
      ...$('visbug-handles'),
      ...$('visbug-label'),
      ...$('visbug-hover'),
      ...$('visbug-distance'),
    ]).forEach(el =>
      el.remove())

    labels    = []
    handles   = []
    selected  = []

    !silent && tellWatchers()
  }

  const delete_all = () => {
    const selected_after_delete = selected.map(el => {
      if (canMoveRight(el))     return canMoveRight(el)
      else if (canMoveLeft(el)) return canMoveLeft(el)
      else if (el.parentNode)   return el.parentNode
    })

    Array.from([...selected, ...labels, ...handles]).forEach(el =>
      el.remove())

    labels    = []
    handles   = []
    selected  = []

    selected_after_delete.forEach(el =>
      select(el))
  }

  const expandSelection = ({query, all = false}) => {
    if (all) {
      const unselecteds = $(query + ':not([data-selected])')
      unselecteds.forEach(select)
    }
    else {
      const potentials = $(query)
      if (!potentials) return

      const [anchor] = selected
      const root_node_index = potentials.reduce((index, node, i) =>
        node == anchor
          ? index = i
          : index
      , null)

      if (root_node_index !== null) {
        if (!potentials[root_node_index + 1]) {
          const potential = potentials.filter(el => !el.attr('data-selected'))[0]
          if (potential) select(potential)
        }
        else {
          select(potentials[root_node_index + 1])
        }
      }
    }
  }

  const combineNodeNameAndClass = node =>
    `${node.nodeName.toLowerCase()}${createClassname(node)}`

  const overlayHoverUI = ({el, no_hover = false, no_label = true, kind = 'default', backdropFactory = null}) => {
    if (hover_state.target === el && hover_state.kind === kind) {
      if (hover_state.element) {
        hover_state.element.position = {el}
        syncHoverBackdrop(hover_state.element, el, backdropFactory)
      }
      return
    }

    hover_state.element && hover_state.element.remove()
    hover_state.label && hover_state.label.remove()

    hover_state.target = el
    hover_state.kind = kind

    hover_state.element = no_hover
      ? null
      : createHover(el, {kind, backdropFactory})

    hover_state.label   = no_label
      ? null
      : createHoverLabel(el, handleLabelText(el, visbug.activeTool))
  }

  const clearHover = () => {
    if (!hover_state.target && !hover_state.containerTarget) return

    hover_state.element && hover_state.element.remove()
    hover_state.label && hover_state.label.remove()
    hover_state.containerElement && hover_state.containerElement.remove()
    hover_state.gapElements.forEach(el => el.remove())

    hover_state.target  = null
    hover_state.element = null
    hover_state.label   = null
    hover_state.kind = null
    hover_state.containerTarget = null
    hover_state.containerElement = null
    hover_state.gapTarget = null
    hover_state.gapElements = []
  }

  const clearContainerHover = () => {
    if (!hover_state.containerTarget) return

    hover_state.containerElement && hover_state.containerElement.remove()
    hover_state.containerTarget = null
    hover_state.containerElement = null
  }

  const clearGapHover = () => {
    if (!hover_state.gapTarget && !hover_state.gapElements.length) return

    hover_state.gapElements.forEach(el => el.remove())
    hover_state.gapTarget = null
    hover_state.gapElements = []
  }

  const overlayMetaUI = ({el, id, no_label = true}) => {
    let handle = createHandle({el, id})
    let label  = no_label
      ? null
      : createLabel({
          el,
          id,
          template: handleLabelText(el, visbug.activeTool)
        })

    let observer        = createObserver(el, {handle,label})
    let parentObserver  = createObserver(el, {handle,label})

    observer.observe(el, { attributes: true })
    parentObserver.observe(el.parentNode, { childList:true, subtree:true })

    if (label !== null) {
      onRemove(label, () => {
        observer.disconnect()
        parentObserver.disconnect()
      })
    }
  }

  const setLabel = (el, label) => {
    label.text = handleLabelText(el, visbug.activeTool)
    label.update = {boundingRect: el.getBoundingClientRect(), isFixed: isFixed(el)}

    handles.forEach(handle => {
      handle.hidePopover && handle.hidePopover()
      handle.showPopover && handle.showPopover()
    })
  }

  const createLabel = ({el, id, template}) => {
    if (!labels[id]) {
      const label = document.createElement('visbug-label')

      label.text = template
      label.position = {
        boundingRect:   el.getBoundingClientRect(),
        node_label_id:  id,
        isFixed: isFixed(el),
      }

      document.body.appendChild(label)

      $(label).on('query', ({detail}) => {
        if (!detail.text) return

        queryPage('[data-pseudo-select]', el =>
          el.removeAttribute('data-pseudo-select'))

        queryPage(detail.text + ':not([data-selected])', el =>
          detail.activator === 'mouseenter'
            ? el.setAttribute('data-pseudo-select', true)
            : select(el))
      })

      $(label).on('mouseleave', e => {
        e.preventDefault()
        e.stopPropagation()
        queryPage('[data-pseudo-select]', el =>
          el.removeAttribute('data-pseudo-select'))
      })

      labels[labels.length] = label

      handles.forEach(handle => {
        handle.hidePopover && handle.hidePopover()
        handle.showPopover && handle.showPopover()
      })

      return label
    }
  }

  const createHandle = ({el, id}) => {
    if (!handles[id]) {
      const handle = document.createElement('visbug-handles')

      handle.position = { el, node_label_id: id }

      document.body.appendChild(handle)

      handles[handles.length] = handle
      return handle
    }
  }

  const createHover = (el, {kind = 'default', backdropFactory = null} = {}) => {
    if (!el.hasAttribute('data-pseudo-select') && !el.hasAttribute('data-label-id')) {
      const hover = document.createElement('visbug-hover')
      if (kind !== 'default')
        hover.setAttribute('data-hover-kind', kind)
      document.body.appendChild(hover)
      hover.position = {el}
      syncHoverBackdrop(hover, el, backdropFactory)

      return hover
    }
  }

  const overlayContainerHoverUI = el => {
    if (!el) {
      clearContainerHover()
      return
    }

    if (hover_state.containerTarget === el) {
      if (hover_state.containerElement) {
        hover_state.containerElement.position = {el}
        syncHoverBackdrop(hover_state.containerElement, el, createSelectorContainerBackdrop)
      }
      return
    }

    clearContainerHover()
    hover_state.containerTarget = el
    hover_state.containerElement = createHover(el, {
      kind: 'selector-container',
      backdropFactory: createSelectorContainerBackdrop,
    })
  }

  const overlayGapHoverUI = el => {
    if (!el) {
      clearGapHover()
      return
    }

    if (hover_state.gapTarget === el) return

    clearGapHover()

    const rects = getGapRects(el)
    if (!rects.length) return

    hover_state.gapTarget = el
    hover_state.gapElements = rects
      .map(rect => createGapOverlay(rect, isFixed(el)))
      .filter(Boolean)
  }

  const syncHoverBackdrop = (hover, el, backdropFactory) => {
    if (!hover) return
    if (!backdropFactory) return

    const backdrop = backdropFactory(el)
    if (!backdrop) return

    hover.backdrop = {
      element: backdrop,
      update: backdropFactory,
    }
  }

  const getHoverContainer = el => {
    if (!el || !el.parentElement) return null

    const sourceBounds = el.getBoundingClientRect()
    let current = el.parentElement
    let depth = 0

    while (current && depth < 5) {
      if (!isOffBounds(current) && !['BODY', 'HTML'].includes(current.nodeName)) {
        const bounds = current.getBoundingClientRect()
        const noticeablyLarger =
          bounds.width >= sourceBounds.width + 8
          || bounds.height >= sourceBounds.height + 8

        const notTooLarge =
          bounds.width <= window.innerWidth * 0.96
          && bounds.height <= window.innerHeight * 0.96

        if (noticeablyLarger && notTooLarge)
          return current
      }

      current = current.parentElement
      depth++
    }

    return null
  }

  const parsePx = value =>
    Number.isFinite(parseFloat(value))
      ? parseFloat(value)
      : 0

  const getContentBounds = el => {
    const bounds = el.getBoundingClientRect()
    const borders = expandBorders(getStyle(el, 'border-width') || '0')
    const paddingTop = parsePx(getStyle(el, 'paddingTop'))
    const paddingRight = parsePx(getStyle(el, 'paddingRight'))
    const paddingBottom = parsePx(getStyle(el, 'paddingBottom'))
    const paddingLeft = parsePx(getStyle(el, 'paddingLeft'))

    return {
      left: bounds.left + borders.left + paddingLeft,
      right: bounds.right - borders.right - paddingRight,
      top: bounds.top + borders.top + paddingTop,
      bottom: bounds.bottom - borders.bottom - paddingBottom,
    }
  }

  const groupRectsByAxis = (rects, axis = 'row', tolerance = 4) => {
    const edge = axis === 'row' ? 'top' : 'left'
    const sorted = [...rects].sort((a, b) => a[edge] - b[edge])

    return sorted.reduce((groups, rect) => {
      const prev = groups[groups.length - 1]
      if (!prev || Math.abs(prev.anchor - rect[edge]) > tolerance) {
        groups.push({
          anchor: rect[edge],
          rects: [rect],
        })
      } else {
        prev.rects.push(rect)
      }
      return groups
    }, [])
  }

  const getGapRects = el => {
    if (!el || ['BODY', 'HTML'].includes(el.nodeName)) return []

    const display = getStyle(el, 'display')
    const rowGap = parsePx(getStyle(el, 'rowGap'))
    const columnGap = parsePx(getStyle(el, 'columnGap'))
    const isGapLayout = /flex|grid/.test(display)

    if (!isGapLayout || (rowGap <= 0 && columnGap <= 0)) return []

    const children = Array.from(el.children)
      .filter(child => !isOffBounds(child))
      .map(child => child.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0)

    if (children.length < 2) return []

    const content = getContentBounds(el)
    const rects = []

    if (rowGap > 0) {
      const rows = groupRectsByAxis(children, 'row')
      rows.sort((a, b) => a.anchor - b.anchor)

      rows.slice(0, -1).forEach((row, index) => {
        const nextRow = rows[index + 1]
        const top = Math.max(...row.rects.map(rect => rect.bottom))
        const bottom = Math.min(...nextRow.rects.map(rect => rect.top))
        const height = bottom - top

        if (height > 1) {
          rects.push({
            left: content.left,
            top,
            width: Math.max(0, content.right - content.left),
            height,
          })
        }
      })
    }

    if (columnGap > 0) {
      const cols = groupRectsByAxis(children, 'column')
      cols.sort((a, b) => a.anchor - b.anchor)

      cols.slice(0, -1).forEach((col, index) => {
        const nextCol = cols[index + 1]
        const left = Math.max(...col.rects.map(rect => rect.right))
        const right = Math.min(...nextCol.rects.map(rect => rect.left))
        const width = right - left

        if (width > 1) {
          rects.push({
            left,
            top: content.top,
            width,
            height: Math.max(0, content.bottom - content.top),
          })
        }
      })
    }

    return rects
      .filter(rect => rect.width > 1 && rect.height > 1)
  }

  const getGapHost = el => {
    let current = el
    let depth = 0

    while (current && depth < 6) {
      if (!isOffBounds(current) && getGapRects(current).length)
        return current

      current = current.parentElement
      depth++
    }

    return null
  }

  const createGapOverlay = ({left, top, width, height}, fixed = false) => {
    if (width <= 1 || height <= 1) return null

    const overlay = document.createElement('div')
    overlay.setAttribute('data-visbug-gap-overlay', '')
    overlay.style.cssText = `
      position: ${fixed ? 'fixed' : 'absolute'};
      left: ${left}px;
      top: ${top + (fixed ? 0 : window.scrollY)}px;
      width: ${width}px;
      height: ${height}px;
      pointer-events: none;
      z-index: 2147483643;
      box-sizing: border-box;
      border: 1px dashed hsl(270 100% 58% / 95%);
      background:
        repeating-linear-gradient(
          45deg,
          hsl(270 100% 58% / 0.45) 0 2px,
          transparent 2px 12px
        ),
        hsl(255 100% 76% / 0.18);
    `
    document.body.appendChild(overlay)
    return overlay
  }

  const hasVisiblePadding = el =>
    ['Top', 'Right', 'Bottom', 'Left']
      .some(side => parseFloat(getStyle(el, `padding${side}`)) > 0)

  const createSelectorTargetBackdrop = el =>
    hasVisiblePadding(el)
      ? createPaddingVisual(el, true)
      : null

  const createSelectorContainerBackdrop = el =>
    hasVisiblePadding(el)
      ? createPaddingVisual(el, true)
      : null

  const createHoverLabel = (el, text) => {
    if (!el.hasAttribute('data-pseudo-select') && !el.hasAttribute('data-label-id')) {
      if (hover_state.label)
        hover_state.label.remove()

      hover_state.label = document.createElement('visbug-label')
      document.body.appendChild(hover_state.label)

      hover_state.label.text = text
      hover_state.label.position = {
        boundingRect:   el.getBoundingClientRect(),
        node_label_id:  'hover',
      }

      hover_state.label.style.setProperty(`--label-bg`, `hsl(267, 100%, 58%)`)


      return hover_state.label
    }
  }

  const createCorners = el => {
    if (!el.hasAttribute('data-pseudo-select') && !el.hasAttribute('data-label-id')) {
      if (hover_state.element)
        hover_state.element.remove()

      hover_state.element = document.createElement('visbug-corners')
      document.body.appendChild(hover_state.element)
      hover_state.element.position = {el}

      return hover_state.element
    }
  }

  const setHandle = (el, handle) => {
    handle.position = {
      el,
      node_label_id:  el.getAttribute('data-label-id'),
    }
  }

  const createObserver = (node, {label,handle}) =>
    new MutationObserver(list => {
      label && setLabel(node, label)
      handle && setHandle(node, handle)
    })

  const onSelectedUpdate = (cb, immediateCallback = true) => {
    selectedCallbacks.push(cb)
    if (immediateCallback) cb(selected)
  }

  const removeSelectedCallback = cb =>
    selectedCallbacks = selectedCallbacks.filter(callback => callback != cb)

  const tellWatchers = () =>
    selectedCallbacks.forEach(cb => cb(selected))

  const disconnect = () => {
    unselect_all()
    unlisten()
  }

  const on_select_children = (e, {key}) => {
    const targets = selected
      .filter(node => node.children.length)
      .reduce((flat, {children}) =>
        [...flat, ...Array.from(children)], [])

    if (targets.length) {
      e.preventDefault()
      e.stopPropagation()

      unselect_all()
      targets.forEach(node => select(node))
    }
  }

  const on_select_parent = (e, {key}) => {
    const targets = selected.reduce((parents, node) => {
      const parent_element = node.parentElement;

      if (parent_element.hasAttribute('data-outward'))
        return parents

      parent_element.setAttribute('data-outward', true)
      parents.push(parent_element)

      return parents
    }, [])

    if (targets.length) {
      e.preventDefault()
      e.stopPropagation()

      targets.forEach(node => {
        if (node && node !== document.body) {
          select(node)
        }
      })
    }
  }

  watchImagesForUpload()
  listen()

  return {
    select,
    selection,
    unselect_all,
    onSelectedUpdate,
    removeSelectedCallback,
    disconnect,
  }
}

export const handleLabelText = (el, activeTool) => {
  switch(activeTool) {
    case 'align':
      return getStyle(el, 'display')

    case 'selector':
      return `<a node>${generateFullSelector(el)}</a>`

    default:
      return `
        <a node>${el.nodeName.toLowerCase()}</a>
        <a>${el.id && '#' + el.id}</a>
        ${createClassname(el).split('.')
          .filter(name => name != '')
          .reduce((links, name) => `
            ${links}
            <a>.${name}</a>
          `, '')
        }
      `
  }
}
