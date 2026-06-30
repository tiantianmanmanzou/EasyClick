#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/extension/build/store-assets"
TMP_DIR="$OUT_DIR/.tmp"
SCREENSHOT_DIR="$OUT_DIR/screenshots"
SOURCE_DIR="$OUT_DIR/source"

ICON_128="$ROOT_DIR/extension/icons/visbug-128.png"
ICON_512="$ROOT_DIR/extension/icons/visbug.png"
ICON_ACTIVE_512="$ROOT_DIR/extension/icons/visbug-active.png"

mkdir -p "$TMP_DIR" "$SCREENSHOT_DIR" "$SOURCE_DIR"
find "$TMP_DIR" -type f -delete
find "$SCREENSHOT_DIR" -type f -delete
find "$SOURCE_DIR" -type f -delete

require_bin() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_bin ffmpeg
require_bin magick
require_bin rsvg-convert

extract_frame() {
  local gif_path="$1"
  local frame_index="$2"
  local output_path="$3"

  ffmpeg -y -i "$gif_path" \
    -vf "select='eq(n,${frame_index})'" \
    -vframes 1 \
    -update 1 \
    "$output_path" >/dev/null 2>&1
}

render_svg() {
  local svg_path="$1"
  local output_path="$2"

  rsvg-convert "$svg_path" | magick png:- \
    -background white \
    -alpha remove \
    -alpha off \
    "PNG24:$output_path"
}

write_common_defs() {
  cat <<'SVG'
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f7fbff"/>
      <stop offset="55%" stop-color="#edf4ff"/>
      <stop offset="100%" stop-color="#f3f7fc"/>
    </linearGradient>
    <linearGradient id="panel" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f4f8ff"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#274f8f"/>
      <stop offset="100%" stop-color="#4f86d9"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="22" stdDeviation="18" flood-color="#24416d" flood-opacity="0.12"/>
    </filter>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#24416d" flood-opacity="0.10"/>
    </filter>
    <style>
      .title { font: 700 64px Helvetica, Arial, sans-serif; fill: #15294a; letter-spacing: -0.02em; }
      .subtitle { font: 400 28px Helvetica, Arial, sans-serif; fill: #4f6486; }
      .eyebrow { font: 700 22px Helvetica, Arial, sans-serif; fill: #3768b8; letter-spacing: 0.14em; }
      .cardTitle { font: 700 30px Helvetica, Arial, sans-serif; fill: #183058; }
      .cardText { font: 400 20px Helvetica, Arial, sans-serif; fill: #5f7292; }
      .bullet { font: 600 22px Helvetica, Arial, sans-serif; fill: #254577; }
      .bulletText { font: 400 22px Helvetica, Arial, sans-serif; fill: #4a6288; }
      .keycap { font: 700 24px Helvetica, Arial, sans-serif; fill: #1c3360; }
      .smallTitle { font: 700 40px Helvetica, Arial, sans-serif; fill: #15294a; letter-spacing: -0.02em; }
      .smallText { font: 400 18px Helvetica, Arial, sans-serif; fill: #5b7191; }
    </style>
  </defs>
SVG
}

extract_frame "$ROOT_DIR/app/tuts/search.gif" 80 "$TMP_DIR/search.png"
extract_frame "$ROOT_DIR/app/tuts/inspector.gif" 100 "$TMP_DIR/inspector.png"
extract_frame "$ROOT_DIR/app/tuts/accessibility.gif" 80 "$TMP_DIR/accessibility.png"
extract_frame "$ROOT_DIR/app/tuts/text.gif" 100 "$TMP_DIR/text.png"
extract_frame "$ROOT_DIR/app/tuts/margin.gif" 20 "$TMP_DIR/margin.png"

cp "$ICON_128" "$OUT_DIR/store-icon-128.png"

cat > "$SOURCE_DIR/01-hero.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
$(write_common_defs)
  <rect width="1280" height="800" fill="url(#bg)"/>
  <circle cx="1095" cy="108" r="166" fill="none" stroke="#dce8fa" stroke-width="18"/>
  <circle cx="1095" cy="108" r="124" fill="none" stroke="#c4d8f6" stroke-width="12"/>
  <circle cx="1095" cy="108" r="86" fill="none" stroke="#dce8fa" stroke-width="10"/>
  <circle cx="116" cy="704" r="180" fill="#ebf3ff"/>
  <rect x="72" y="86" width="488" height="628" rx="36" fill="url(#panel)" filter="url(#softShadow)"/>
  <text class="eyebrow" x="118" y="154">BROWSER EXTENSION</text>
  <text class="title" x="118" y="248">EasyClick</text>
  <text class="subtitle" x="118" y="302">Pick, inspect and copy selectors on any live page.</text>
  <g transform="translate(118, 358)">
    <circle cx="14" cy="14" r="14" fill="#274f8f"/>
    <text class="bullet" x="48" y="22">Precise element picking</text>
    <text class="bulletText" x="48" y="54">Target components directly in the browser.</text>
  </g>
  <g transform="translate(118, 448)">
    <circle cx="14" cy="14" r="14" fill="#4f86d9"/>
    <text class="bullet" x="48" y="22">Live visual inspection</text>
    <text class="bulletText" x="48" y="54">See boundaries, structure and context immediately.</text>
  </g>
  <g transform="translate(118, 538)">
    <circle cx="14" cy="14" r="14" fill="#89b2ef"/>
    <text class="bullet" x="48" y="22">Shortcut-ready workflow</text>
    <text class="bulletText" x="48" y="54">Launch fast and work without leaving the page.</text>
  </g>
  <image href="$ICON_512" x="320" y="474" width="180" height="180"/>

  <rect x="630" y="108" width="572" height="584" rx="34" fill="#ffffff" filter="url(#shadow)"/>
  <rect x="630" y="108" width="572" height="50" rx="34" fill="#eff5ff"/>
  <circle cx="668" cy="133" r="8" fill="#ffb6b6"/>
  <circle cx="694" cy="133" r="8" fill="#ffd88b"/>
  <circle cx="720" cy="133" r="8" fill="#92d39c"/>
  <text class="cardText" x="758" y="140">Search and target real page elements</text>
  <image href="$TMP_DIR/search.png" x="676" y="188" width="480" height="456" preserveAspectRatio="xMidYMid meet"/>

  <rect x="798" y="624" width="368" height="104" rx="24" fill="#f2f7ff"/>
  <text class="cardTitle" x="836" y="680">Built for real pages</text>
  <text class="cardText" x="836" y="710">Inspect production states, not static mocks.</text>
</svg>
SVG

cat > "$SOURCE_DIR/02-copy-select.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
$(write_common_defs)
  <rect width="1280" height="800" fill="url(#bg)"/>
  <rect x="76" y="78" width="1128" height="644" rx="38" fill="#ffffff" filter="url(#shadow)"/>
  <text class="eyebrow" x="124" y="154">COPY SELECT</text>
  <text class="title" x="124" y="236">Target the right element faster</text>
  <text class="subtitle" x="124" y="286">Use on-page targeting and inspection together to identify exactly what you need.</text>

  <rect x="124" y="344" width="420" height="286" rx="28" fill="#f4f8ff"/>
  <text class="cardTitle" x="156" y="392">Search &amp; pick</text>
  <text class="cardText" x="156" y="426">Jump to elements and highlight matches directly on the page.</text>
  <image href="$TMP_DIR/search.png" x="164" y="452" width="340" height="154" preserveAspectRatio="xMidYMid meet"/>

  <rect x="582" y="188" width="560" height="428" rx="28" fill="#f7faff"/>
  <text class="cardTitle" x="622" y="240">Inspect before you copy</text>
  <text class="cardText" x="622" y="276">Confirm the selected node, its size and its surrounding context.</text>
  <image href="$TMP_DIR/inspector.png" x="654" y="308" width="416" height="252" preserveAspectRatio="xMidYMid meet"/>

  <rect x="582" y="646" width="560" height="72" rx="22" fill="#edf4ff"/>
  <text class="cardText" x="622" y="691">Accurate targeting makes selector copying much more reliable.</text>
</svg>
SVG

cat > "$SOURCE_DIR/03-structure.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
$(write_common_defs)
  <rect width="1280" height="800" fill="url(#bg)"/>
  <circle cx="214" cy="646" r="132" fill="#e9f2ff"/>
  <circle cx="1128" cy="170" r="98" fill="#eef5ff"/>

  <text class="eyebrow" x="108" y="130">INSPECT</text>
  <text class="title" x="108" y="212">Understand structure at a glance</text>
  <text class="subtitle" x="108" y="262">Reveal element context, dimensions and surrounding containers without opening DevTools first.</text>

  <rect x="108" y="320" width="724" height="392" rx="34" fill="#ffffff" filter="url(#shadow)"/>
  <image href="$TMP_DIR/inspector.png" x="156" y="374" width="628" height="284" preserveAspectRatio="xMidYMid meet"/>

  <rect x="874" y="320" width="298" height="186" rx="30" fill="#ffffff" filter="url(#softShadow)"/>
  <text class="cardTitle" x="910" y="382">Element details</text>
  <text class="cardText" x="910" y="418">Read key properties right next to the hovered target.</text>

  <rect x="874" y="536" width="298" height="176" rx="30" fill="#edf4ff"/>
  <text class="cardTitle" x="910" y="598">Container context</text>
  <text class="cardText" x="910" y="634">See how components sit inside the larger layout.</text>
</svg>
SVG

cat > "$SOURCE_DIR/04-accessibility.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
$(write_common_defs)
  <rect width="1280" height="800" fill="url(#bg)"/>
  <rect x="84" y="88" width="1112" height="624" rx="38" fill="#ffffff" filter="url(#shadow)"/>

  <text class="eyebrow" x="128" y="158">ACCESSIBILITY</text>
  <text class="title" x="128" y="240">Check readability and semantics</text>
  <text class="subtitle" x="128" y="290">Use the built-in overlays to review element meaning, contrast and reading context.</text>

  <rect x="128" y="348" width="432" height="284" rx="30" fill="#f4f8ff"/>
  <text class="cardTitle" x="162" y="398">A11y snapshot</text>
  <text class="cardText" x="162" y="434">Surface accessibility hints on top of the current page.</text>
  <image href="$TMP_DIR/accessibility.png" x="184" y="468" width="320" height="128" preserveAspectRatio="xMidYMid meet"/>

  <rect x="612" y="180" width="512" height="452" rx="30" fill="#f7faff"/>
  <image href="$TMP_DIR/accessibility.png" x="660" y="248" width="416" height="308" preserveAspectRatio="xMidYMid meet"/>

  <rect x="612" y="654" width="512" height="58" rx="18" fill="#edf4ff"/>
  <text class="cardText" x="644" y="692">Review meaningful page details without breaking your browsing flow.</text>
</svg>
SVG

cat > "$SOURCE_DIR/05-edit-measure.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
$(write_common_defs)
  <rect width="1280" height="800" fill="url(#bg)"/>
  <text class="eyebrow" x="104" y="140">TEXT &amp; LAYOUT</text>
  <text class="title" x="104" y="222">Edit content and review spacing</text>
  <text class="subtitle" x="104" y="272">Validate copy changes and spacing issues directly against the live interface.</text>

  <rect x="104" y="334" width="474" height="352" rx="32" fill="#ffffff" filter="url(#shadow)"/>
  <text class="cardTitle" x="140" y="390">Edit text on page</text>
  <text class="cardText" x="140" y="426">Try content updates instantly in the real UI.</text>
  <image href="$TMP_DIR/text.png" x="166" y="472" width="350" height="170" preserveAspectRatio="xMidYMid meet"/>

  <rect x="640" y="334" width="536" height="352" rx="32" fill="#ffffff" filter="url(#shadow)"/>
  <text class="cardTitle" x="676" y="390">Spot spacing issues</text>
  <text class="cardText" x="676" y="426">Review margins, gaps and element boundaries visually.</text>
  <image href="$TMP_DIR/margin.png" x="720" y="466" width="376" height="184" preserveAspectRatio="xMidYMid meet"/>
</svg>
SVG

cat > "$SOURCE_DIR/promo-small-440x280.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
$(write_common_defs)
  <rect width="440" height="280" fill="url(#bg)"/>
  <circle cx="358" cy="70" r="62" fill="none" stroke="#d7e5fb" stroke-width="10"/>
  <circle cx="358" cy="70" r="42" fill="none" stroke="#bfd4f6" stroke-width="7"/>
  <text class="smallTitle" x="34" y="82">EasyClick</text>
  <text class="smallText" x="34" y="116">Pick, inspect and</text>
  <text class="smallText" x="34" y="140">copy selectors fast.</text>
  <rect x="34" y="168" width="186" height="68" rx="18" fill="#ffffff" filter="url(#softShadow)"/>
  <text class="smallText" x="52" y="196">Built for real pages</text>
  <text class="smallText" x="52" y="220">and fast browser workflows.</text>
  <image href="$ICON_512" x="264" y="70" width="136" height="136"/>
</svg>
SVG

cat > "$SOURCE_DIR/promo-marquee-1400x560.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="560" viewBox="0 0 1400 560">
$(write_common_defs)
  <rect width="1400" height="560" fill="url(#bg)"/>
  <circle cx="196" cy="442" r="136" fill="#e8f1ff"/>
  <circle cx="1218" cy="84" r="116" fill="#eef5ff"/>
  <text class="eyebrow" x="84" y="112">EASYCLICK</text>
  <text class="title" x="84" y="194">Inspect and target</text>
  <text class="title" x="84" y="264">live page elements</text>
  <text class="subtitle" x="84" y="318">A focused browser extension for picking elements,</text>
  <text class="subtitle" x="84" y="354">reading structure and accelerating selector workflows.</text>

  <rect x="84" y="404" width="330" height="78" rx="22" fill="#ffffff" filter="url(#softShadow)"/>
  <text class="keycap" x="112" y="452">Shortcut ready</text>
  <text class="smallText" x="258" y="452">Alt+Shift+D</text>

  <image href="$ICON_ACTIVE_512" x="410" y="292" width="128" height="128"/>

  <rect x="690" y="62" width="300" height="194" rx="24" fill="#ffffff" filter="url(#shadow)"/>
  <image href="$TMP_DIR/search.png" x="724" y="96" width="232" height="126" preserveAspectRatio="xMidYMid meet"/>

  <rect x="1016" y="136" width="300" height="194" rx="24" fill="#ffffff" filter="url(#shadow)"/>
  <image href="$TMP_DIR/inspector.png" x="1050" y="170" width="232" height="126" preserveAspectRatio="xMidYMid meet"/>

  <rect x="820" y="340" width="300" height="194" rx="24" fill="#ffffff" filter="url(#shadow)"/>
  <image href="$TMP_DIR/accessibility.png" x="854" y="374" width="232" height="126" preserveAspectRatio="xMidYMid meet"/>
</svg>
SVG

render_svg "$SOURCE_DIR/01-hero.svg" "$SCREENSHOT_DIR/01-hero.png"
render_svg "$SOURCE_DIR/02-copy-select.svg" "$SCREENSHOT_DIR/02-copy-select.png"
render_svg "$SOURCE_DIR/03-structure.svg" "$SCREENSHOT_DIR/03-structure.png"
render_svg "$SOURCE_DIR/04-accessibility.svg" "$SCREENSHOT_DIR/04-accessibility.png"
render_svg "$SOURCE_DIR/05-edit-measure.svg" "$SCREENSHOT_DIR/05-edit-measure.png"
render_svg "$SOURCE_DIR/promo-small-440x280.svg" "$OUT_DIR/promo-small-440x280.png"
render_svg "$SOURCE_DIR/promo-marquee-1400x560.svg" "$OUT_DIR/promo-marquee-1400x560.png"

cat > "$OUT_DIR/README.txt" <<EOF
Chrome Web Store assets generated from existing EasyClick images.

Store icon:
- $OUT_DIR/store-icon-128.png

Screenshots:
- $SCREENSHOT_DIR/01-hero.png
- $SCREENSHOT_DIR/02-copy-select.png
- $SCREENSHOT_DIR/03-structure.png
- $SCREENSHOT_DIR/04-accessibility.png
- $SCREENSHOT_DIR/05-edit-measure.png

Promotional images:
- $OUT_DIR/promo-small-440x280.png
- $OUT_DIR/promo-marquee-1400x560.png
EOF

echo "Generated store assets in: $OUT_DIR"
