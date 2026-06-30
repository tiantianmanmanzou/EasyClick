{
  const platform = typeof browser === 'undefined'
    ? chrome
    : browser
  const VIS_KEY = 'visbug_visible'
  const readVisible = () => {
    try { return localStorage.getItem(VIS_KEY) !== 'false' } catch (e) { return true }
  }

  const src_path = platform.runtime.getURL(`tuts/guides.gif`)
  const tutsBaseURL = src_path.slice(0, src_path.lastIndexOf('/'))

  let visbug = document.querySelector('vis-bug')
  if (!visbug) {
    visbug = document.createElement('vis-bug')
    visbug.setAttribute('tutsBaseURL', tutsBaseURL)
    document.body.prepend(visbug)
  } else {
    visbug.setAttribute('tutsBaseURL', tutsBaseURL)
  }
  visbug.style.display = readVisible() ? 'block' : 'none'
}
