import test from 'ava'

import { setupPptrTab, teardownPptrTab, getActiveTool, pptrMetaKey }
from '../../../tests/helpers'

test.beforeEach(setupPptrTab)

test('Should have selector as default tool', async t => {
  const { page } = t.context
  t.is(await getActiveTool(page), 'selector')
  t.pass()
})

test('Should have 14 tools', async t => {
  const { page } = t.context
  const tools = await page.evaluate(`
    document
      .querySelector('vis-bug')
      .$shadow
      .querySelectorAll('li[data-tool]:not([data-tool="toggle-collapse"]):not([data-tool="toggle-preview"])')
      .length
  `)

  t.is(tools, 14)
  t.pass()
})

test('Should have 13 key trainers', async t => {
  const { page } = t.context
  const trainers = await page.evaluate(`document.querySelector('vis-bug').$shadow.querySelectorAll('visbug-hotkeys > *').length`)

  t.is(trainers, 13)
  t.pass()
})

test('Should have 3 color pickers', async t => {
  const { page } = t.context
  const pickers = await page.evaluate(`document.querySelector('vis-bug').$shadow.querySelectorAll('li.color').length`)

  t.is(pickers, 3)
  t.pass()
})

test('Should allow selecting 1 element', async t => {
  const { page } = t.context

  await page.click(`[intro]`)

  const handles_elements = await page.evaluate(`document.querySelectorAll('visbug-handles').length`)

  t.is(handles_elements, 1)

  t.pass()
})

test('Should allow multi-selection', async t => {
  const { page } = t.context

  await page.click(`.artboard:nth-of-type(1)`)
  await page.keyboard.down('Shift')
  await page.click(`.artboard:nth-of-type(2)`)
  await page.keyboard.up('Shift')

  const handles_elements = await page.evaluate(`document.querySelectorAll('visbug-handles').length`)

  t.is(handles_elements, 2)

  t.pass()
})

test('Should allow deselecting', async t => {
  const { page } = t.context

  await page.click(`.artboard:nth-of-type(1)`)
  const handles_elements = await page.evaluate(`document.querySelectorAll('visbug-handles').length`)
  t.is(handles_elements, 1)

  await page.keyboard.press('Escape')
  const new_handles_elements = await page.evaluate(`document.querySelectorAll('visbug-handles').length`)
  t.is(new_handles_elements, 0)

  t.pass()
})

test('Should preserve the active tool after reload', async t => {
  const { page } = t.context

  await page.evaluate(() => {
    document.querySelector('vis-bug').toolSelected('guides')
  })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.evaluateHandle(`document.body.setAttribute('testing', true)`)
  await page.waitForSelector('vis-bug')

  t.is(await getActiveTool(page), 'guides')
  t.pass()
})

test('Should preserve a deselected state after reload', async t => {
  const { page } = t.context

  await page.evaluate(() => {
    const visbug = document.querySelector('vis-bug')
    visbug.toolSelected('guides')
    visbug.deselectTool()
  })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.evaluateHandle(`document.body.setAttribute('testing', true)`)
  await page.waitForSelector('vis-bug')

  t.is(await getActiveTool(page), null)
  t.pass()
})

test('Should show target and container overlays in selector mode', async t => {
  const { page } = t.context

  const { x, y } = await page.$eval('[intro] h1', el => {
    const rect = el.getBoundingClientRect()
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
  })

  await page.mouse.move(x, y)

  const hoverCounts = await page.evaluate(() => ({
    target: document.querySelectorAll('visbug-hover[data-hover-kind="selector-target"]').length,
    container: document.querySelectorAll('visbug-hover[data-hover-kind="selector-container"]').length,
  }))

  t.is(hoverCounts.target, 1)
  t.is(hoverCounts.container, 1)
  t.pass()
})

test('Should show gap overlays in selector mode', async t => {
  const { page } = t.context

  const gapInfo = await page.evaluate(() => {
    const host = document.createElement('div')
    host.style.cssText = `
      position: fixed;
      top: 80px;
      left: 80px;
      display: flex;
      flex-direction: column;
      row-gap: 24px;
      width: 240px;
      margin: 0;
      padding: 8px;
      background: white;
      z-index: 10;
    `

    const first = document.createElement('div')
    first.textContent = 'A'
    first.style.cssText = 'height: 40px; background: #ddd;'

    const second = document.createElement('div')
    second.textContent = 'B'
    second.style.cssText = 'height: 40px; background: #ccc;'

    host.appendChild(first)
    host.appendChild(second)
    document.body.appendChild(host)

    const firstRect = first.getBoundingClientRect()
    const secondRect = second.getBoundingClientRect()

    return {
      x: firstRect.left + 10,
      y: firstRect.bottom + ((secondRect.top - firstRect.bottom) / 2),
    }
  })

  await page.mouse.move(gapInfo.x, gapInfo.y)

  const gapOverlays = await page.evaluate(() =>
    document.querySelectorAll('[data-visbug-gap-overlay]').length
  )

  t.true(gapOverlays >= 1)
  t.pass()
})

test('Should keep default cursor in selector mode for clickable elements', async t => {
  const { page } = t.context

  const cursors = await page.evaluate(() => {
    const button = document.createElement('button')
    button.textContent = 'click me'
    button.style.cursor = 'pointer'
    document.body.appendChild(button)

    const inSelector = getComputedStyle(button).cursor

    document.querySelector('vis-bug').toolSelected('guides')
    const inGuides = getComputedStyle(button).cursor

    button.remove()

    return { inSelector, inGuides }
  })

  t.is(cursors.inSelector, 'default')
  t.is(cursors.inGuides, 'pointer')
  t.pass()
})

test('Should be hideable', async t => {
  const { page } = t.context
  const metaKey = await pptrMetaKey(page)

  await page.keyboard.down(metaKey)
  await page.keyboard.down('.')
  await page.keyboard.up(metaKey)
  await page.keyboard.up('.')

  const visibility = await page.evaluate(`document.querySelector('vis-bug').$shadow.host.style.display`)

  t.is(visibility, 'none')
  t.pass()
})

test('Should accept valid execCommand', async t => {
  const { page } = t.context
  const execCommand = await page.evaluate(`document.querySelector('vis-bug').execCommand('shuffle')`)

  t.is(execCommand, undefined)
  t.pass()
})

test('Should throw on invalid execCommand', async t => {
  const { page } = t.context
  const execCommand = await page.evaluate(`document.querySelector('vis-bug').execCommand('invalid command')`)

  t.deepEqual(execCommand, {})
  t.pass()
})

test.afterEach(teardownPptrTab)
