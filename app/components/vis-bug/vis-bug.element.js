import $          from 'blingblingjs'
import hotkeys    from 'hotkeys-js'

import {
  Handles, Handle, Label, Overlay, Gridlines, Corners,
  Hotkeys, Metatip, Ally, Distance, BoxModel, Grip
} from '../'

import {
  Selectable, Moveable, Padding, Margin, EditText, Font,
  Flex, Search, ColorPicker, BoxShadow, HueShift, MetaTip,
  Guides, Screenshot, Position, Accessibility, Selector, draggable
} from '../../features/'

import {
  VisBugStyles,
  VisBugLightStyles,
  VisBugDarkStyles
} from '../styles.store'

import { VisBugModel }            from './model'
import * as Icons                 from './vis-bug.icons'
import { provideSelectorEngine }  from '../../features/search'
import { PluginRegistry }         from '../../plugins/_registry'
import {
  getSelectorFields, SELECTOR_OPTIONS, selectorConfig, setSelectorField, setSelectorFieldOrder,
  SELECTOR_HEADER_TEXT_DEFAULT, SELECTOR_CUSTOM_TEXT_DEFAULT
} from '../../features/selector'
import {
  metaKey,
  isPolyfilledCE,
  constructibleStylesheetSupport,
  schemeRule
} from '../../utilities/'

const escapeHTML = value => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

export default class VisBug extends HTMLElement {
  constructor() {
    super()

    this.toolbar_model  = VisBugModel
    this.$shadow        = this.attachShadow({mode: 'closed'})
    this.toolbarPositionStorageKey = 'visbug_toolbar_position'
    this.handleViewportChange = () => this.updatePreviewSide()
    this.handleSelectorConfigApplied = () => this.refreshSelectorConfigUI()
    this.applyScheme    = schemeRule(
      this.$shadow,
      VisBugStyles, VisBugLightStyles, VisBugDarkStyles
    )
  }

  static get observedAttributes() {
    return ['color-scheme', 'tutsbaseurl']
  }

  connectedCallback() {
    this._tutsBaseURL = this.getAttribute('tutsBaseURL') || 'tuts'

    this.setup()
    window.addEventListener('easyclick-selector-config-applied', this.handleSelectorConfigApplied)
    this.restoreToolbarPosition()
    this.updatePreviewSide()
    window.addEventListener('resize', this.handleViewportChange)

    this.selectorEngine = Selectable(this)
    this.colorPicker    = ColorPicker(this.$shadow, this.selectorEngine)

    provideSelectorEngine(this.selectorEngine)

    let savedTool = null
    let savedCollapsed = null
    let savedVisible = null
    try {
      savedTool = localStorage.getItem('visbug_active_tool')
      savedCollapsed = localStorage.getItem('visbug_collapsed')
      savedVisible = localStorage.getItem('visbug_visible')
    } catch(e) {}

    // 默认是折叠状态
    if (savedCollapsed === 'false') {
      this.removeAttribute('collapsed')
    } else {
      this.setAttribute('collapsed', '')
    }

    if (savedCollapsed === null) {
      try {
        localStorage.setItem('visbug_collapsed', 'true')
      } catch(e) {}
    }

    // 初始化显示状态
    if (savedVisible === 'true') {
      this.style.display = 'block'
      this.reportToolbarVisibility(true)
    } else {
      this.style.display = 'none'
      this.reportToolbarVisibility(false)
      if (savedVisible === null) {
        try {
          localStorage.setItem('visbug_visible', 'false')
        } catch(e) {}
      }
    }

    if (savedTool && savedTool !== 'null') {
      const toolEl = $(`[data-tool="${savedTool}"]`, this.$shadow)[0]
      if (toolEl) {
        this.toolSelected(toolEl)
      } else {
        this.toolSelected($('[data-tool="selector"]', this.$shadow)[0])
      }
    } else if (savedTool === null) {
      this.toolSelected($('[data-tool="selector"]', this.$shadow)[0])
    }
  }

  disconnectedCallback() {
    if (typeof this.deactivate_feature === 'function') {
      this.deactivate_feature()
    }
    this.cleanup()
    this.selectorEngine.disconnect()
    window.removeEventListener('resize', this.handleViewportChange)
    window.removeEventListener('easyclick-selector-config-applied', this.handleSelectorConfigApplied)
    hotkeys.unbind(
      Object.keys(this.toolbar_model).reduce((events, key) =>
        events += ',' + key, ''))
    hotkeys.unbind(`${metaKey}+/`)
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'color-scheme')
      this.applyScheme(newValue)
    else if (name.toLowerCase() === 'tutsbaseurl')
      this.updateTutorialBase(newValue || 'tuts')
  }

  setup() {
    this.$shadow.innerHTML = this.render()

    this.hasAttribute('color-mode')
      ? this.getAttribute('color-mode')
      : this.setAttribute('color-mode', 'hex')

    this.hasAttribute('color-scheme')
      ? this.getAttribute('color-scheme')
      : this.setAttribute('color-scheme', 'auto')

    this.setAttribute('popover', 'manual')
    this.showPopover && this.showPopover()

    const main_ol = this.$shadow.querySelector('ol.toolbar')
    const toolButtons = this.$shadow.querySelectorAll('li[data-tool]')

    toolButtons.forEach(toolButton => {
      if (['toggle-collapse', 'toggle-preview', 'toggle-visibility'].includes(toolButton.dataset.tool)) return
      toolButton.addEventListener('click', e => {
        e.stopPropagation()
        this.toolSelected(toolButton)
      })
    })

    draggable({
      el:this,
      surface: main_ol,
      cursor: 'grab',
      dragEndEvent: ({x, y}) => {
        this.persistToolbarPosition({x, y})
        this.updatePreviewSide()
      },
    })

    Object.entries(this.toolbar_model).forEach(([key, value]) =>
      hotkeys(key, e => {
        e.preventDefault()
        this.toolSelected(
          $(`[data-tool="${value.tool}"]`, this.$shadow)[0]
        )
      })
    )

    hotkeys(`${metaKey}+/,${metaKey}+.`, e =>
      this.toggleToolbarVisibility())

    this.setupSelectorConfig()

    // Collapse/expand toggle button.
    const toggleBtn = $('[data-tool="toggle-collapse"]', this.$shadow)[0]
    if (toggleBtn) {
      toggleBtn.addEventListener('click', e => {
        e.stopPropagation()
        this.toggleCollapsed()
      })
    }

    const previewToggleBtn = $('[data-tool="toggle-preview"]', this.$shadow)[0]
    if (previewToggleBtn) {
      previewToggleBtn.addEventListener('click', e => {
        e.stopPropagation()
        this.togglePreview()
      })
      this.updatePreviewToggleButton(previewToggleBtn)
    }

    const visibilityToggleBtn = $('[data-tool="toggle-visibility"]', this.$shadow)[0]
    if (visibilityToggleBtn) {
      visibilityToggleBtn.addEventListener('click', e => {
        e.stopPropagation()
        this.toggleToolbarVisibility()
      })
    }
  }

  refreshSelectorConfigUI() {
    const fieldsPanel = this.$shadow.querySelector('[data-selector-checkbox]')
    if (!fieldsPanel) return

    const rowsByKey = new Map(
      Array.from(fieldsPanel.querySelectorAll('[data-selector-field-row]'))
        .map(row => [row.dataset.field, row])
    )
    getSelectorFields().forEach(field => {
      const row = rowsByKey.get(field.key)
      if (row) fieldsPanel.appendChild(row)
    })

    this.$shadow.querySelectorAll('[data-selector-checkbox] input[type="checkbox"]')
      .forEach(box => {
        box.checked = Boolean(selectorConfig[box.dataset.field])
      })

    const headerEditor = this.$shadow.querySelector('[data-selector-header-text]')
    if (headerEditor)
      headerEditor.textContent = selectorConfig.headerText ?? SELECTOR_HEADER_TEXT_DEFAULT

    const footerEditor = this.$shadow.querySelector('[data-selector-custom-text]')
    if (footerEditor)
      footerEditor.textContent = selectorConfig.customTextValue ?? SELECTOR_CUSTOM_TEXT_DEFAULT
  }

  // Wire up the Copy Selector preview checkboxes.
  setupSelectorConfig() {
    this.$shadow.querySelectorAll('[data-selector-checkbox]').forEach(panel => {
      const keepPanelOpen = e => {
        e.stopPropagation()
        this.setAttribute('data-selector-configuring', '')
      }

      // Keep label clicks inside the panel so they cannot toggle the toolbar
      // button and deselect Copy Selector.
      panel.addEventListener('pointerdown', keepPanelOpen)
      panel.addEventListener('click', keepPanelOpen)
      panel.addEventListener('dragstart', keepPanelOpen)
      panel.addEventListener('dragover', keepPanelOpen)
      panel.addEventListener('drop', keepPanelOpen)
    })

    const boxes = this.$shadow.querySelectorAll('[data-selector-checkbox] input[type="checkbox"]')
    boxes.forEach(box => {
      box.addEventListener('change', e => {
        e.stopPropagation()
        e.preventDefault()
        setSelectorField(box.dataset.field, box.checked)
      })
      // Stop toolbar drag/click handlers from firing when interacting here.
      box.addEventListener('mousedown', e => e.stopPropagation())
      box.addEventListener('click', e => e.stopPropagation())
    })

    const fieldRows = this.$shadow.querySelectorAll('[data-selector-field-row]')
    let draggedRow = null
    fieldRows.forEach(row => {
      row.addEventListener('dragstart', e => {
        draggedRow = row
        row.setAttribute('data-dragging', '')
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', row.dataset.field)
      })
      row.addEventListener('dragover', e => {
        if (!draggedRow || draggedRow === row) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      })
      row.addEventListener('drop', e => {
        e.preventDefault()
        if (!draggedRow || draggedRow === row) return

        const insertBefore = e.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2
        const parent = row.parentElement
        parent.insertBefore(draggedRow, insertBefore ? row : row.nextSibling)
        setSelectorFieldOrder(
          Array.from(parent.querySelectorAll('[data-selector-field-row]'))
            .map(fieldRow => fieldRow.dataset.field)
        )
      })
      row.addEventListener('dragend', () => {
        draggedRow?.removeAttribute('data-dragging')
        draggedRow = null
      })
    })

    const startEditing = editor => {
      this.setAttribute('data-selector-editing', '')
      editor.setAttribute('contenteditable', 'true')
      editor.focus()

      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(editor)
      selection.removeAllRanges()
      selection.addRange(range)
    }

    const readEditorValue = editor =>
      editor.textContent
        .replace(/\r\n/g, '\n')
        .replace(/\u00a0/g, ' ')

    const writeEditorValue = (editor, value) => {
      editor.textContent = value
    }

    const insertEditorText = (editor, text) => {
      const shadowSelection = this.$shadow.getSelection?.()
      const selection = shadowSelection?.rangeCount
        ? shadowSelection
        : window.getSelection()
      if (!selection?.rangeCount) {
        editor.textContent += text
        return
      }

      const range = selection.getRangeAt(0)
      if (!editor.contains(range.commonAncestorContainer)) {
        editor.textContent += text
        return
      }
      range.deleteContents()
      const textNode = document.createTextNode(text)
      range.insertNode(textNode)
      range.setStartAfter(textNode)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }

    const bindEditableText = ({ selector, field, fallback }) => {
      const editor = this.$shadow.querySelector(selector)
      if (!editor) return
      const trigger = editor
        .closest('[data-selector-edit-row]')
        ?.querySelector('[data-selector-edit]')
      const saveTrigger = editor
        .closest('[data-selector-edit-row]')
        ?.querySelector('[data-selector-save]')

      const finishEditing = () => {
        if (!editor.hasAttribute('contenteditable')) return

        const nextText = readEditorValue(editor)
        const savedText = nextText === '' ? fallback : nextText
        writeEditorValue(editor, savedText)
        editor.removeAttribute('contenteditable')
        this.removeAttribute('data-selector-editing')
        setSelectorField(field, savedText)
      }

      editor.addEventListener('mousedown', e => e.stopPropagation())
      editor.addEventListener('click', e => {
        e.preventDefault()
        e.stopPropagation()
      })
      editor.addEventListener('dblclick', e => {
        e.preventDefault()
        e.stopPropagation()
        startEditing(editor)
      })
      editor.addEventListener('beforeinput', e => {
        if (!['insertLineBreak', 'insertParagraph'].includes(e.inputType)) return

        e.preventDefault()
        insertEditorText(editor, '\n')
      })
      editor.addEventListener('paste', e => {
        e.preventDefault()
        insertEditorText(editor, e.clipboardData?.getData('text/plain') || '')
      })
      editor.addEventListener('blur', finishEditing)
      editor.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          finishEditing()
          return
        }

        if (e.key === 'Enter') {
          e.preventDefault()
          insertEditorText(editor, '\n')
          return
        }

        if (e.key === 'Escape') {
          e.preventDefault()
          writeEditorValue(editor, selectorConfig[field] ?? fallback)
          editor.removeAttribute('contenteditable')
          this.removeAttribute('data-selector-editing')
        }
      })

      if (trigger) {
        trigger.addEventListener('mousedown', e => e.stopPropagation())
        trigger.addEventListener('click', e => {
          e.preventDefault()
          e.stopPropagation()
          startEditing(editor)
        })
      }

      if (saveTrigger) {
        saveTrigger.addEventListener('mousedown', e => {
          e.preventDefault()
          e.stopPropagation()
        })
        saveTrigger.addEventListener('click', e => {
          e.preventDefault()
          e.stopPropagation()
          finishEditing()
        })
      }
    }

    bindEditableText({
      selector: '[data-selector-header-text]',
      field: 'headerText',
      fallback: SELECTOR_HEADER_TEXT_DEFAULT,
    })
    bindEditableText({
      selector: '[data-selector-custom-text]',
      field: 'customTextValue',
      fallback: SELECTOR_CUSTOM_TEXT_DEFAULT,
    })
  }

  updateTutorialBase(baseURL = 'tuts') {
    this._tutsBaseURL = baseURL

    this.$shadow.querySelectorAll('li[data-tool] > aside img').forEach(img => {
      const li = img.closest('li[data-tool]')
      if (!li || !li.dataset.tool) return
      img.src = `${baseURL}/${li.dataset.tool}.gif`
    })
  }

  restoreToolbarPosition() {
    try {
      const saved = localStorage.getItem(this.toolbarPositionStorageKey)
      if (!saved) return

      const { x, y } = JSON.parse(saved)
      this.persistToolbarPosition({ x, y })
    } catch (e) {}
  }

  clampToolbarPosition({x, y} = {}) {
    // Keep the drag handle reachable when a saved position came from a larger
    // monitor, a browser zoom change, or an invalid older value.
    const minimumVisibleSize = 48
    const maxX = Math.max(0, window.innerWidth - minimumVisibleSize)
    const maxY = Math.max(0, window.innerHeight - minimumVisibleSize)
    const currentX = Number.isFinite(x) ? x : parseInt(this.style.left, 10) || 0
    const currentY = Number.isFinite(y) ? y : parseInt(this.style.top, 10) || 0

    return {
      x: Math.min(Math.max(0, currentX), maxX),
      y: Math.min(Math.max(0, currentY), maxY),
    }
  }

  updatePreviewSide() {
    const rect = this.getBoundingClientRect()
    if (!rect.width || !window.innerWidth) return

    const toolbarCenter = rect.left + rect.width / 2
    const viewportCenter = window.innerWidth / 2
    const side = toolbarCenter >= viewportCenter ? 'left' : 'right'
    this.setAttribute('preview-side', side)
  }

  persistToolbarPosition({x, y} = {}) {
    try {
      const { x: nextX, y: nextY } = this.clampToolbarPosition({x, y})

      this.style.left = `${nextX}px`
      this.style.top = `${nextY}px`
      localStorage.setItem(this.toolbarPositionStorageKey, JSON.stringify({
        x: nextX,
        y: nextY,
      }))
    } catch (e) {}
  }

  cleanup() {
    this.hidePopover && this.hidePopover()

    Array.from(document.body.children)
      .filter(node => node.nodeName.includes('VISBUG'))
      .forEach(el => el.remove())

    this.teardown()

    document.querySelectorAll('[data-pseudo-select=true]')
      .forEach(el =>
        el.removeAttribute('data-pseudo-select'))
  }

  toolSelected(el) {
    if (typeof el === 'string')
      el = $(`[data-tool="${el}"]`, this.$shadow)[0]

    this.$shadow.querySelectorAll('li[data-tool][data-active="true"]')
      .forEach(toolButton => {
        if (toolButton !== el)
          toolButton.setAttribute('data-active', 'false')
      })

    // Second activation of the active tool deselects it (toggles off).
    if (this.active_tool && this.active_tool.dataset.tool === el.dataset.tool) {
      this.deselectTool()
      try {
        localStorage.setItem('visbug_active_tool', null)
      } catch(e) {}
      return
    }

    if (this.active_tool) {
      if (this.active_tool.dataset.tool === 'selector')
        this.removeAttribute('data-selector-configuring')
      this.active_tool.setAttribute('data-active', 'false')
      if (this.deactivate_feature) this.deactivate_feature()
    }

    el.setAttribute('data-active', 'true')
    this.active_tool = el
    this[el.dataset.tool]()
    try {
      localStorage.setItem('visbug_active_tool', el.dataset.tool)
    } catch(e) {}
  }

  // Deselect the active tool, deactivating its feature.
  deselectTool() {
    if (!this.active_tool) return
    if (this.active_tool.dataset.tool === 'selector')
      this.removeAttribute('data-selector-configuring')
    this.active_tool.setAttribute('data-active', 'false')
    if (this.deactivate_feature) this.deactivate_feature()
    this.active_tool = null
    try {
      localStorage.setItem('visbug_active_tool', null)
    } catch(e) {}
  }

  // Collapse / expand the toolbar. Collapsed shows only the first button.
  toggleCollapsed(force) {
    const next = typeof force === 'boolean' ? force : !this.hasAttribute('collapsed')
    next
      ? this.setAttribute('collapsed', '')
      : this.removeAttribute('collapsed')
    try {
      localStorage.setItem('visbug_collapsed', next ? 'true' : 'false')
    } catch(e) {}
  }

  togglePreview(force) {
    const next = typeof force === 'boolean' ? force : !this.hasAttribute('preview-open')
    next
      ? this.setAttribute('preview-open', '')
      : this.removeAttribute('preview-open')
    this.updatePreviewToggleButton()
  }

  updatePreviewToggleButton(button = $('[data-tool="toggle-preview"]', this.$shadow)[0]) {
    if (!button) return
    const open = this.hasAttribute('preview-open')
    button.innerHTML = open ? Icons.preview_close : Icons.preview_open
    button.setAttribute(
      'aria-label',
      open ? 'Collapse previews' : 'Expand previews'
    )
    button.setAttribute(
      'aria-description',
      open
        ? 'Hide the right-side tool preview panel'
        : 'Show the right-side tool preview panel'
    )
  }

  toggleToolbarVisibility() {
    const visible = this.$shadow.host.style.display === 'none'
    this.$shadow.host.style.display = visible ? 'block' : 'none'
    try {
      localStorage.setItem('visbug_visible', visible ? 'true' : 'false')
    } catch(e) {}
    this.reportToolbarVisibility(visible)
  }

  reportToolbarVisibility(visible) {
    try {
      const platform = typeof browser === 'undefined'
        ? (typeof chrome === 'undefined' ? null : chrome)
        : browser
      if (platform && platform.runtime && platform.runtime.sendMessage) {
        platform.runtime.sendMessage({
          action: 'TOOLBAR_VISIBILITY_STATE',
          visible,
        }).catch(() => {})
      }
    } catch (e) {}
  }

  render() {
    return `
      <visbug-hotkeys></visbug-hotkeys>
      <ol class="toolbar" constructible-support="${constructibleStylesheetSupport ? 'false':'true'}">
        ${Object.entries(this.toolbar_model).reduce((list, [key, tool]) => `
          ${list}
          <li aria-label="${tool.label} Tool" aria-description="${tool.description}" aria-hotkey="${key}" data-tool="${tool.tool}" data-active="false">
            ${tool.icon}
            ${this.demoTip({key, ...tool})}
          </li>
        `,'')}
        <li class="color" id="foreground" aria-label="Text" aria-description="Change the text color">
          <input type="color">
          ${Icons.color_text}
        </li>
        <li class="color" id="background" aria-label="Background or Fill" aria-description="Change the background color or fill of svg">
          <input type="color">
          ${Icons.color_background}
        </li>
        <li class="color" id="border" aria-label="Border or Stroke" aria-description="Change the border color or stroke of svg">
          <input type="color">
          ${Icons.color_border}
        </li>
        <li data-tool="toggle-preview" aria-label="Expand previews" aria-description="Show the right-side tool preview panel">
          ${Icons.preview_open}
        </li>
        <li data-tool="toggle-collapse" aria-label="Collapse/Expand toolbar" aria-description="Show or hide all tools">
          ${Icons.collapse}
        </li>
        <li data-tool="toggle-visibility" aria-label="Hide toolbar" aria-description="Hide the EasyClick toolbar">
          ${Icons.hide_toolbar}
        </li>
      </ol>
    `
  }

  demoTip({key, tool, label, description, instruction}) {
    return `
      <aside ${tool}>
        <figure>
          <img src="${this._tutsBaseURL}/${tool}.gif" alt="${description}" />
          <figcaption>
            <h2>
              ${label}
              <span hotkey>${key}</span>
            </h2>
            <p>${description}</p>
            ${tool === 'selector' ? this.selectorConfigUI() : instruction}
          </figcaption>
        </figure>
      </aside>
    `
  }

  // Checkbox UI for choosing which context-block fields get copied.
  selectorConfigUI() {
    return `
      <fieldset data-selector-checkbox>
        <legend>Clipboard content</legend>
        ${getSelectorFields().map(f => `
          <label data-selector-field-row data-field="${f.key}" draggable="true" title="Drag to reorder">
            <input type="checkbox" data-field="${f.key}" ${selectorConfig[f.key] ? 'checked' : ''}>
            ${f.key === 'header'
              ? `<span data-selector-edit-row><span data-selector-edit-text>Header: [<span data-selector-header-text title="Double-click to edit header">${escapeHTML(selectorConfig.headerText ?? SELECTOR_HEADER_TEXT_DEFAULT)}</span>]</span>${this.selectorEditButton('Edit header')}${this.selectorSaveButton('Save header')}</span>`
              : f.key === 'customText'
                ? `<span data-selector-edit-row><span data-selector-edit-text>Footer: [<span data-selector-custom-text title="Double-click to edit footer">${escapeHTML(selectorConfig.customTextValue ?? SELECTOR_CUSTOM_TEXT_DEFAULT)}</span>]</span>${this.selectorEditButton('Edit footer')}${this.selectorSaveButton('Save footer')}</span>`
              : `<span>${f.label}</span>`
            }
          </label>
        `).join('')}
      </fieldset>
      <fieldset data-selector-checkbox>
        <legend>Settings</legend>
        ${SELECTOR_OPTIONS.map(f => `
          <label>
            <input type="checkbox" data-field="${f.key}" ${selectorConfig[f.key] ? 'checked' : ''}>
            <span>${f.label}</span>
          </label>
        `).join('')}
      </fieldset>
    `
  }

  selectorEditButton(label) {
    return `
      <button type="button" data-selector-edit aria-label="${label}" title="${label}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.96 1.96 3.75 3.75 2.13-1.79z"/>
        </svg>
      </button>
    `
  }

  selectorSaveButton(label) {
    return `
      <button type="button" data-selector-save aria-label="${label}" title="${label}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM6 8V5h9v3H6z"/>
        </svg>
      </button>
    `
  }

  move() {
    this.deactivate_feature = Moveable(this.selectorEngine)
  }

  margin() {
    this.deactivate_feature = Margin(this.selectorEngine)
  }

  padding() {
    this.deactivate_feature = Padding(this.selectorEngine)
  }

  font() {
    this.deactivate_feature = Font(this.selectorEngine)
  }

  text() {
    this.selectorEngine.onSelectedUpdate(EditText)
    this.deactivate_feature = () =>
      this.selectorEngine.removeSelectedCallback(EditText)
  }

  align() {
    this.deactivate_feature = Flex(this.selectorEngine)
  }

  search() {
    this.deactivate_feature = Search($('[data-tool="search"]', this.$shadow))
  }

  boxshadow() {
    this.deactivate_feature = BoxShadow(this.selectorEngine)
  }

  hueshift() {
    this.deactivate_feature = HueShift({
      Color:  this.colorPicker,
      Visbug: this.selectorEngine,
    })
  }

  inspector() {
    const teardownMetaTip = MetaTip(this.selectorEngine)
    this.deactivate_feature = () => {
      teardownMetaTip()
      this.selectorEngine.unselect_all({silent: true})
    }
  }

  accessibility() {
    this.deactivate_feature = Accessibility(this.selectorEngine)
  }

  guides() {
    this.deactivate_feature = Guides(this.selectorEngine)
  }

  selector() {
    this.deactivate_feature = Selector(this.selectorEngine, this)
  }

  screenshot() {
    this.deactivate_feature = Screenshot()
  }

  position() {
    let feature = Position()
    this.selectorEngine.onSelectedUpdate(feature.onNodesSelected)
    this.deactivate_feature = () => {
      this.selectorEngine.removeSelectedCallback(feature.onNodesSelected)
      feature.disconnect()
    }
  }

  execCommand(command) {
    const query = `/${command}`

    if (PluginRegistry.has(query))
      return PluginRegistry.get(query)({
        selected: this.selectorEngine.selection(),
        query
      })

    return Promise.resolve(new Error("Query not found"))
  }

  get activeTool() {
    return this.active_tool ? this.active_tool.dataset.tool : null
  }
}

customElements.define('vis-bug', VisBug)
