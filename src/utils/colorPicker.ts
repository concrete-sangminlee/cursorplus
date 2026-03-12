/**
 * Color utilities and picker logic.
 * HSL/RGB/HEX conversion, color palettes,
 * contrast checking (WCAG), and CSS color parsing.
 */

/* ── Types ─────────────────────────────────────────────── */

export interface RGB { r: number; g: number; b: number }
export interface HSL { h: number; s: number; l: number }
export interface HSV { h: number; s: number; v: number }
export interface RGBA extends RGB { a: number }
export interface HSLA extends HSL { a: number }

export interface ColorInfo {
  hex: string
  hex8: string
  rgb: RGB
  rgba: RGBA
  hsl: HSL
  hsla: HSLA
  hsv: HSV
  css: string
  luminance: number
  isDark: boolean
}

/* ── Conversion: RGB ←→ HEX ──────────────────────────── */

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function rgbaToHex8(r: number, g: number, b: number, a: number): string {
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a * 255)}`
}

export function hexToRgb(hex: string): RGB | null {
  const cleaned = hex.replace('#', '')
  let r: number, g: number, b: number

  if (cleaned.length === 3) {
    r = parseInt(cleaned[0] + cleaned[0], 16)
    g = parseInt(cleaned[1] + cleaned[1], 16)
    b = parseInt(cleaned[2] + cleaned[2], 16)
  } else if (cleaned.length === 6) {
    r = parseInt(cleaned.slice(0, 2), 16)
    g = parseInt(cleaned.slice(2, 4), 16)
    b = parseInt(cleaned.slice(4, 6), 16)
  } else if (cleaned.length === 8) {
    r = parseInt(cleaned.slice(0, 2), 16)
    g = parseInt(cleaned.slice(2, 4), 16)
    b = parseInt(cleaned.slice(4, 6), 16)
  } else {
    return null
  }

  if (isNaN(r) || isNaN(g) || isNaN(b)) return null
  return { r, g, b }
}

export function hexToRgba(hex: string): RGBA | null {
  const cleaned = hex.replace('#', '')
  const rgb = hexToRgb(hex)
  if (!rgb) return null

  let a = 1
  if (cleaned.length === 8) {
    a = parseInt(cleaned.slice(6, 8), 16) / 255
    if (isNaN(a)) a = 1
  }

  return { ...rgb, a }
}

/* ── Conversion: RGB ←→ HSL ──────────────────────────── */

export function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255; g /= 255; b /= 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  h /= 360; s /= 100; l /= 100

  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1/6) return p + (q - p) * 6 * t
    if (t < 1/2) return q
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
    return p
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return {
    r: Math.round(hue2rgb(p, q, h + 1/3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1/3) * 255),
  }
}

/* ── Conversion: RGB ←→ HSV ──────────────────────────── */

export function rgbToHsv(r: number, g: number, b: number): HSV {
  r /= 255; g /= 255; b /= 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  const s = max === 0 ? 0 : d / max
  const v = max

  if (max !== min) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    v: Math.round(v * 100),
  }
}

export function hsvToRgb(h: number, s: number, v: number): RGB {
  h /= 360; s /= 100; v /= 100

  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)

  let r: number, g: number, b: number
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break
    case 1: r = q; g = v; b = p; break
    case 2: r = p; g = v; b = t; break
    case 3: r = p; g = q; b = v; break
    case 4: r = t; g = p; b = v; break
    default: r = v; g = p; b = q; break
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  }
}

/* ── HSL ←→ HSV ──────────────────────────────────────── */

export function hslToHsv(h: number, s: number, l: number): HSV {
  const rgb = hslToRgb(h, s, l)
  return rgbToHsv(rgb.r, rgb.g, rgb.b)
}

export function hsvToHsl(h: number, s: number, v: number): HSL {
  const rgb = hsvToRgb(h, s, v)
  return rgbToHsl(rgb.r, rgb.g, rgb.b)
}

/* ── Luminance & Contrast ────────────────────────────── */

export function relativeLuminance(r: number, g: number, b: number): number {
  const sRGB = [r, g, b].map(c => {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2]
}

export function contrastRatio(color1: RGB, color2: RGB): number {
  const l1 = relativeLuminance(color1.r, color1.g, color1.b)
  const l2 = relativeLuminance(color2.r, color2.g, color2.b)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

export type WCAGLevel = 'AAA' | 'AA' | 'AA-large' | 'fail'

export function checkWCAGContrast(foreground: RGB, background: RGB): {
  ratio: number
  normalText: WCAGLevel
  largeText: WCAGLevel
} {
  const ratio = contrastRatio(foreground, background)

  let normalText: WCAGLevel = 'fail'
  if (ratio >= 7) normalText = 'AAA'
  else if (ratio >= 4.5) normalText = 'AA'

  let largeText: WCAGLevel = 'fail'
  if (ratio >= 4.5) largeText = 'AAA'
  else if (ratio >= 3) largeText = 'AA-large'

  return { ratio: Math.round(ratio * 100) / 100, normalText, largeText }
}

export function isDarkColor(r: number, g: number, b: number): boolean {
  return relativeLuminance(r, g, b) < 0.179
}

/* ── CSS Color Parsing ───────────────────────────────── */

const CSS_NAMED_COLORS: Record<string, string> = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff',
  aquamarine: '#7fffd4', azure: '#f0ffff', beige: '#f5f5dc',
  bisque: '#ffe4c4', black: '#000000', blanchedalmond: '#ffebcd',
  blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a',
  burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00',
  chocolate: '#d2691e', coral: '#ff7f50', cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc', crimson: '#dc143c', cyan: '#00ffff',
  darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9', darkgreen: '#006400', darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b', darkolivegreen: '#556b2f', darkorange: '#ff8c00',
  darkorchid: '#9932cc', darkred: '#8b0000', darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f', darkslateblue: '#483d8b', darkslategray: '#2f4f4f',
  darkturquoise: '#00ced1', darkviolet: '#9400d3', deeppink: '#ff1493',
  deepskyblue: '#00bfff', dimgray: '#696969', dodgerblue: '#1e90ff',
  firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22',
  fuchsia: '#ff00ff', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff',
  gold: '#ffd700', goldenrod: '#daa520', gray: '#808080',
  green: '#008000', greenyellow: '#adff2f', honeydew: '#f0fff0',
  hotpink: '#ff69b4', indianred: '#cd5c5c', indigo: '#4b0082',
  ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa',
  lavenderblush: '#fff0f5', lawngreen: '#7cfc00', lemonchiffon: '#fffacd',
  lightblue: '#add8e6', lightcoral: '#f08080', lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3', lightgreen: '#90ee90',
  lightpink: '#ffb6c1', lightsalmon: '#ffa07a', lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa', lightslategray: '#778899', lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32',
  linen: '#faf0e6', magenta: '#ff00ff', maroon: '#800000',
  mediumaquamarine: '#66cdaa', mediumblue: '#0000cd', mediumorchid: '#ba55d3',
  mediumpurple: '#9370db', mediumseagreen: '#3cb371', mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc', mediumvioletred: '#c71585',
  midnightblue: '#191970', mintcream: '#f5fffa', mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5', navajowhite: '#ffdead', navy: '#000080',
  oldlace: '#fdf5e6', olive: '#808000', olivedrab: '#6b8e23',
  orange: '#ffa500', orangered: '#ff4500', orchid: '#da70d6',
  palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee',
  palevioletred: '#db7093', papayawhip: '#ffefd5', peachpuff: '#ffdab9',
  peru: '#cd853f', pink: '#ffc0cb', plum: '#dda0dd',
  powderblue: '#b0e0e6', purple: '#800080', rebeccapurple: '#663399',
  red: '#ff0000', rosybrown: '#bc8f8f', royalblue: '#4169e1',
  saddlebrown: '#8b4513', salmon: '#fa8072', sandybrown: '#f4a460',
  seagreen: '#2e8b57', seashell: '#fff5ee', sienna: '#a0522d',
  silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd',
  slategray: '#708090', snow: '#fffafa', springgreen: '#00ff7f',
  steelblue: '#4682b4', tan: '#d2b48c', teal: '#008080',
  thistle: '#d8bfd8', tomato: '#ff6347', turquoise: '#40e0d0',
  violet: '#ee82ee', wheat: '#f5deb3', white: '#ffffff',
  whitesmoke: '#f5f5f5', yellow: '#ffff00', yellowgreen: '#9acd32',
  transparent: '#00000000',
}

export function parseCSSColor(input: string): RGBA | null {
  const trimmed = input.trim().toLowerCase()

  // Named colors
  if (CSS_NAMED_COLORS[trimmed]) {
    const rgb = hexToRgb(CSS_NAMED_COLORS[trimmed])
    if (rgb) return { ...rgb, a: trimmed === 'transparent' ? 0 : 1 }
  }

  // Hex
  if (trimmed.startsWith('#')) {
    return hexToRgba(trimmed)
  }

  // rgb() / rgba()
  const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/)
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]),
      g: parseInt(rgbMatch[2]),
      b: parseInt(rgbMatch[3]),
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    }
  }

  // Modern rgb syntax: rgb(r g b / a)
  const rgbModern = trimmed.match(/^rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+%?))?\s*\)$/)
  if (rgbModern) {
    let a = 1
    if (rgbModern[4]) {
      a = rgbModern[4].endsWith('%') ? parseFloat(rgbModern[4]) / 100 : parseFloat(rgbModern[4])
    }
    return {
      r: parseInt(rgbModern[1]),
      g: parseInt(rgbModern[2]),
      b: parseInt(rgbModern[3]),
      a,
    }
  }

  // hsl() / hsla()
  const hslMatch = trimmed.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*\)$/)
  if (hslMatch) {
    const rgb = hslToRgb(parseFloat(hslMatch[1]), parseFloat(hslMatch[2]), parseFloat(hslMatch[3]))
    return { ...rgb, a: hslMatch[4] !== undefined ? parseFloat(hslMatch[4]) : 1 }
  }

  // Modern hsl syntax: hsl(h s l / a)
  const hslModern = trimmed.match(/^hsla?\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*(?:\/\s*([\d.]+%?))?\s*\)$/)
  if (hslModern) {
    const rgb = hslToRgb(parseFloat(hslModern[1]), parseFloat(hslModern[2]), parseFloat(hslModern[3]))
    let a = 1
    if (hslModern[4]) {
      a = hslModern[4].endsWith('%') ? parseFloat(hslModern[4]) / 100 : parseFloat(hslModern[4])
    }
    return { ...rgb, a }
  }

  return null
}

/* ── Color formatting ────────────────────────────────── */

export function formatHex(color: RGB): string {
  return rgbToHex(color.r, color.g, color.b)
}

export function formatRgb(color: RGBA): string {
  if (color.a < 1) {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${Math.round(color.a * 100) / 100})`
  }
  return `rgb(${color.r}, ${color.g}, ${color.b})`
}

export function formatHsl(color: RGBA): string {
  const hsl = rgbToHsl(color.r, color.g, color.b)
  if (color.a < 1) {
    return `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${Math.round(color.a * 100) / 100})`
  }
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`
}

export type ColorFormat = 'hex' | 'hex8' | 'rgb' | 'rgba' | 'hsl' | 'hsla'

export function formatColor(color: RGBA, format: ColorFormat): string {
  switch (format) {
    case 'hex': return rgbToHex(color.r, color.g, color.b)
    case 'hex8': return rgbaToHex8(color.r, color.g, color.b, color.a)
    case 'rgb': return `rgb(${color.r}, ${color.g}, ${color.b})`
    case 'rgba': return `rgba(${color.r}, ${color.g}, ${color.b}, ${Math.round(color.a * 100) / 100})`
    case 'hsl': {
      const hsl = rgbToHsl(color.r, color.g, color.b)
      return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`
    }
    case 'hsla': {
      const hsl = rgbToHsl(color.r, color.g, color.b)
      return `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${Math.round(color.a * 100) / 100})`
    }
  }
}

/* ── Color manipulation ──────────────────────────────── */

export function lighten(color: RGB, amount: number): RGB {
  const hsl = rgbToHsl(color.r, color.g, color.b)
  hsl.l = Math.min(100, hsl.l + amount)
  return hslToRgb(hsl.h, hsl.s, hsl.l)
}

export function darken(color: RGB, amount: number): RGB {
  const hsl = rgbToHsl(color.r, color.g, color.b)
  hsl.l = Math.max(0, hsl.l - amount)
  return hslToRgb(hsl.h, hsl.s, hsl.l)
}

export function saturate(color: RGB, amount: number): RGB {
  const hsl = rgbToHsl(color.r, color.g, color.b)
  hsl.s = Math.min(100, hsl.s + amount)
  return hslToRgb(hsl.h, hsl.s, hsl.l)
}

export function desaturate(color: RGB, amount: number): RGB {
  const hsl = rgbToHsl(color.r, color.g, color.b)
  hsl.s = Math.max(0, hsl.s - amount)
  return hslToRgb(hsl.h, hsl.s, hsl.l)
}

export function adjustHue(color: RGB, degrees: number): RGB {
  const hsl = rgbToHsl(color.r, color.g, color.b)
  hsl.h = ((hsl.h + degrees) % 360 + 360) % 360
  return hslToRgb(hsl.h, hsl.s, hsl.l)
}

export function complement(color: RGB): RGB {
  return adjustHue(color, 180)
}

export function invert(color: RGB): RGB {
  return { r: 255 - color.r, g: 255 - color.g, b: 255 - color.b }
}

export function grayscale(color: RGB): RGB {
  const gray = Math.round(0.299 * color.r + 0.587 * color.g + 0.114 * color.b)
  return { r: gray, g: gray, b: gray }
}

export function mix(color1: RGB, color2: RGB, weight: number = 0.5): RGB {
  return {
    r: Math.round(color1.r * weight + color2.r * (1 - weight)),
    g: Math.round(color1.g * weight + color2.g * (1 - weight)),
    b: Math.round(color1.b * weight + color2.b * (1 - weight)),
  }
}

export function setAlpha(color: RGBA, alpha: number): RGBA {
  return { ...color, a: Math.max(0, Math.min(1, alpha)) }
}

/* ── Color palettes ──────────────────────────────────── */

export function generatePalette(baseColor: RGB, steps: number = 10): RGB[] {
  const hsl = rgbToHsl(baseColor.r, baseColor.g, baseColor.b)
  const palette: RGB[] = []

  for (let i = 0; i < steps; i++) {
    const lightness = 95 - (i * 90 / (steps - 1))
    const saturation = Math.max(10, hsl.s - (Math.abs(i - steps / 2) * 5))
    palette.push(hslToRgb(hsl.h, saturation, lightness))
  }

  return palette
}

export function generateComplementary(baseColor: RGB): RGB[] {
  return [baseColor, complement(baseColor)]
}

export function generateTriadic(baseColor: RGB): RGB[] {
  return [
    baseColor,
    adjustHue(baseColor, 120),
    adjustHue(baseColor, 240),
  ]
}

export function generateTetradic(baseColor: RGB): RGB[] {
  return [
    baseColor,
    adjustHue(baseColor, 90),
    adjustHue(baseColor, 180),
    adjustHue(baseColor, 270),
  ]
}

export function generateAnalogous(baseColor: RGB, spread: number = 30): RGB[] {
  return [
    adjustHue(baseColor, -spread),
    baseColor,
    adjustHue(baseColor, spread),
  ]
}

export function generateSplitComplementary(baseColor: RGB): RGB[] {
  return [
    baseColor,
    adjustHue(baseColor, 150),
    adjustHue(baseColor, 210),
  ]
}

export function generateMonochromatic(baseColor: RGB, steps: number = 5): RGB[] {
  const hsl = rgbToHsl(baseColor.r, baseColor.g, baseColor.b)
  const palette: RGB[] = []

  for (let i = 0; i < steps; i++) {
    const l = 20 + (i * 60 / (steps - 1))
    palette.push(hslToRgb(hsl.h, hsl.s, l))
  }

  return palette
}

/* ── Color detection in code ─────────────────────────── */

export interface ColorMatch {
  color: RGBA
  format: ColorFormat
  raw: string
  startIndex: number
  endIndex: number
  line: number
  column: number
}

const COLOR_PATTERNS = [
  // Hex colors
  { regex: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, format: 'hex' as ColorFormat },
  // rgb/rgba
  { regex: /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+)?\s*\)/g, format: 'rgba' as ColorFormat },
  // hsl/hsla
  { regex: /hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(?:,\s*[\d.]+)?\s*\)/g, format: 'hsla' as ColorFormat },
]

export function findColorsInCode(content: string): ColorMatch[] {
  const matches: ColorMatch[] = []
  const lines = content.split('\n')

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]

    for (const { regex, format } of COLOR_PATTERNS) {
      const re = new RegExp(regex.source, regex.flags)
      let match: RegExpExecArray | null

      while ((match = re.exec(line)) !== null) {
        const parsed = parseCSSColor(match[0])
        if (parsed) {
          matches.push({
            color: parsed,
            format,
            raw: match[0],
            startIndex: match.index,
            endIndex: match.index + match[0].length,
            line: lineIdx,
            column: match.index,
          })
        }
      }
    }
  }

  return matches
}

/* ── Full color info builder ─────────────────────────── */

export function getColorInfo(color: RGBA): ColorInfo {
  const hsl = rgbToHsl(color.r, color.g, color.b)
  const hsv = rgbToHsv(color.r, color.g, color.b)
  const lum = relativeLuminance(color.r, color.g, color.b)

  return {
    hex: rgbToHex(color.r, color.g, color.b),
    hex8: rgbaToHex8(color.r, color.g, color.b, color.a),
    rgb: { r: color.r, g: color.g, b: color.b },
    rgba: color,
    hsl,
    hsla: { ...hsl, a: color.a },
    hsv,
    css: formatRgb(color),
    luminance: Math.round(lum * 1000) / 1000,
    isDark: isDarkColor(color.r, color.g, color.b),
  }
}

/* ── Suggested text color for background ─────────────── */

export function suggestTextColor(background: RGB): RGB {
  return isDarkColor(background.r, background.g, background.b)
    ? { r: 255, g: 255, b: 255 }
    : { r: 0, g: 0, b: 0 }
}

export function findBestContrastColor(background: RGB, candidates: RGB[]): RGB {
  let best = candidates[0] || { r: 0, g: 0, b: 0 }
  let bestRatio = 0

  for (const c of candidates) {
    const ratio = contrastRatio(c, background)
    if (ratio > bestRatio) {
      bestRatio = ratio
      best = c
    }
  }

  return best
}

/* ── Color distance (CIEDE2000 simplified) ───────────── */

export function colorDistance(c1: RGB, c2: RGB): number {
  // Simple Euclidean distance in RGB space (weighted)
  const dr = (c1.r - c2.r) * 0.30
  const dg = (c1.g - c2.g) * 0.59
  const db = (c1.b - c2.b) * 0.11
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

export function findClosestNamedColor(color: RGB): { name: string; hex: string; distance: number } {
  let closest = { name: 'black', hex: '#000000', distance: Infinity }

  for (const [name, hex] of Object.entries(CSS_NAMED_COLORS)) {
    const named = hexToRgb(hex)
    if (!named) continue

    const dist = colorDistance(color, named)
    if (dist < closest.distance) {
      closest = { name, hex, distance: Math.round(dist * 100) / 100 }
    }
  }

  return closest
}

/* ── Theme color extraction ──────────────────────────── */

export interface ExtractedThemeColors {
  primary: RGB
  secondary: RGB
  accent: RGB
  background: RGB
  surface: RGB
  text: RGB
  textSecondary: RGB
  border: RGB
  success: RGB
  warning: RGB
  error: RGB
  info: RGB
}

export function extractThemeFromBase(baseColor: RGB, isDark: boolean): ExtractedThemeColors {
  const hsl = rgbToHsl(baseColor.r, baseColor.g, baseColor.b)

  if (isDark) {
    return {
      primary: baseColor,
      secondary: hslToRgb(hsl.h, Math.max(10, hsl.s - 20), 25),
      accent: hslToRgb((hsl.h + 180) % 360, 70, 60),
      background: hslToRgb(hsl.h, 10, 8),
      surface: hslToRgb(hsl.h, 10, 12),
      text: hslToRgb(0, 0, 90),
      textSecondary: hslToRgb(0, 0, 60),
      border: hslToRgb(hsl.h, 10, 20),
      success: hslToRgb(142, 70, 45),
      warning: hslToRgb(38, 90, 50),
      error: hslToRgb(0, 84, 60),
      info: hslToRgb(210, 80, 55),
    }
  }

  return {
    primary: baseColor,
    secondary: hslToRgb(hsl.h, Math.max(10, hsl.s - 20), 45),
    accent: hslToRgb((hsl.h + 180) % 360, 70, 45),
    background: hslToRgb(0, 0, 100),
    surface: hslToRgb(hsl.h, 5, 97),
    text: hslToRgb(0, 0, 10),
    textSecondary: hslToRgb(0, 0, 40),
    border: hslToRgb(hsl.h, 10, 85),
    success: hslToRgb(142, 70, 35),
    warning: hslToRgb(38, 90, 45),
    error: hslToRgb(0, 84, 50),
    info: hslToRgb(210, 80, 45),
  }
}
