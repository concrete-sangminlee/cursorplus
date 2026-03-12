/**
 * Text encoding detection and conversion.
 * Supports UTF-8, UTF-16, Latin-1, Windows codepages,
 * CJK encodings, and BOM detection.
 */

/* ── Types ─────────────────────────────────────────────── */

export type Encoding =
  | 'utf-8' | 'utf-8-bom'
  | 'utf-16le' | 'utf-16be'
  | 'ascii'
  | 'iso-8859-1' | 'iso-8859-2' | 'iso-8859-15'
  | 'windows-1250' | 'windows-1251' | 'windows-1252' | 'windows-1253' | 'windows-1254' | 'windows-1256'
  | 'shift-jis' | 'euc-jp' | 'iso-2022-jp'
  | 'euc-kr'
  | 'gb2312' | 'gbk' | 'gb18030'
  | 'big5'
  | 'koi8-r' | 'koi8-u'

export interface EncodingInfo {
  encoding: Encoding
  confidence: number  // 0-1
  hasBOM: boolean
  bomBytes?: number
  language?: string
}

export interface EncodingOption {
  encoding: Encoding
  label: string
  aliases: string[]
}

/* ── BOM Detection ───────────────────────────────────── */

export function detectBOM(bytes: Uint8Array): EncodingInfo | null {
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return { encoding: 'utf-8-bom', confidence: 1, hasBOM: true, bomBytes: 3 }
  }
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return { encoding: 'utf-16le', confidence: 1, hasBOM: true, bomBytes: 2 }
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return { encoding: 'utf-16be', confidence: 1, hasBOM: true, bomBytes: 2 }
  }
  return null
}

/* ── UTF-8 Validation ────────────────────────────────── */

export function isValidUTF8(bytes: Uint8Array): boolean {
  let i = 0
  while (i < bytes.length) {
    const b = bytes[i]
    let expected = 0

    if (b <= 0x7F) { i++; continue }
    else if ((b & 0xE0) === 0xC0) expected = 1
    else if ((b & 0xF0) === 0xE0) expected = 2
    else if ((b & 0xF8) === 0xF0) expected = 3
    else return false

    if (i + expected >= bytes.length) return false

    for (let j = 1; j <= expected; j++) {
      if ((bytes[i + j] & 0xC0) !== 0x80) return false
    }
    i += expected + 1
  }
  return true
}

function utf8Score(bytes: Uint8Array): number {
  let valid = 0
  let total = 0
  let i = 0

  while (i < bytes.length) {
    const b = bytes[i]
    total++

    if (b <= 0x7F) { valid++; i++; continue }

    let expected = 0
    if ((b & 0xE0) === 0xC0) expected = 1
    else if ((b & 0xF0) === 0xE0) expected = 2
    else if ((b & 0xF8) === 0xF0) expected = 3
    else { i++; continue }

    let ok = true
    for (let j = 1; j <= expected && i + j < bytes.length; j++) {
      if ((bytes[i + j] & 0xC0) !== 0x80) { ok = false; break }
    }

    if (ok) { valid++; i += expected + 1 }
    else { i++ }
  }

  return total > 0 ? valid / total : 0
}

/* ── ASCII Check ─────────────────────────────────────── */

export function isASCII(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] > 0x7E || (bytes[i] < 0x20 && bytes[i] !== 0x09 && bytes[i] !== 0x0A && bytes[i] !== 0x0D)) {
      return false
    }
  }
  return true
}

/* ── Binary Detection ────────────────────────────────── */

export function isBinary(bytes: Uint8Array, sampleSize: number = 8192): boolean {
  const size = Math.min(bytes.length, sampleSize)
  let nullCount = 0
  let controlCount = 0

  for (let i = 0; i < size; i++) {
    const b = bytes[i]
    if (b === 0x00) nullCount++
    if (b < 0x08 || (b > 0x0D && b < 0x20 && b !== 0x1B)) controlCount++
  }

  // If >1% null bytes or >10% control chars → binary
  if (nullCount > size * 0.01) return true
  if (controlCount > size * 0.1) return true
  return false
}

/* ── Heuristic Encoding Detection ────────────────────── */

function detectShiftJIS(bytes: Uint8Array): number {
  let score = 0
  let total = 0
  for (let i = 0; i < bytes.length - 1; i++) {
    const b1 = bytes[i]
    const b2 = bytes[i + 1]
    if ((b1 >= 0x81 && b1 <= 0x9F) || (b1 >= 0xE0 && b1 <= 0xEF)) {
      if ((b2 >= 0x40 && b2 <= 0x7E) || (b2 >= 0x80 && b2 <= 0xFC)) {
        score++
        i++
      }
    }
    total++
  }
  return total > 0 ? score / total : 0
}

function detectEUCJP(bytes: Uint8Array): number {
  let score = 0
  let total = 0
  for (let i = 0; i < bytes.length - 1; i++) {
    const b1 = bytes[i]
    const b2 = bytes[i + 1]
    if (b1 >= 0xA1 && b1 <= 0xFE && b2 >= 0xA1 && b2 <= 0xFE) {
      score++
      i++
    }
    total++
  }
  return total > 0 ? score / total : 0
}

function detectGB(bytes: Uint8Array): number {
  let score = 0
  let total = 0
  for (let i = 0; i < bytes.length - 1; i++) {
    const b1 = bytes[i]
    const b2 = bytes[i + 1]
    if (b1 >= 0xA1 && b1 <= 0xF7 && b2 >= 0xA1 && b2 <= 0xFE) {
      score++
      i++
    } else if (b1 >= 0x81 && b1 <= 0xFE && b2 >= 0x40 && b2 <= 0xFE && b2 !== 0x7F) {
      score += 0.5
      i++
    }
    total++
  }
  return total > 0 ? score / total : 0
}

function detectBig5(bytes: Uint8Array): number {
  let score = 0
  let total = 0
  for (let i = 0; i < bytes.length - 1; i++) {
    const b1 = bytes[i]
    const b2 = bytes[i + 1]
    if (b1 >= 0xA1 && b1 <= 0xF9) {
      if ((b2 >= 0x40 && b2 <= 0x7E) || (b2 >= 0xA1 && b2 <= 0xFE)) {
        score++
        i++
      }
    }
    total++
  }
  return total > 0 ? score / total : 0
}

function detectKOI8(bytes: Uint8Array): number {
  let score = 0
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    // KOI8-R Cyrillic range
    if (b >= 0xC0 && b <= 0xFF) score++
  }
  return bytes.length > 0 ? score / bytes.length : 0
}

function detectWindows1251(bytes: Uint8Array): number {
  let score = 0
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b >= 0xC0 && b <= 0xFF) score++
    if (b >= 0x80 && b <= 0xBF) score += 0.3
  }
  return bytes.length > 0 ? score / bytes.length : 0
}

function detectWindows1252(bytes: Uint8Array): number {
  let score = 0
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    // Common Western European chars
    if (b >= 0xC0 && b <= 0xFF) score++
    // Smart quotes, em-dash, etc.
    if (b === 0x93 || b === 0x94 || b === 0x96 || b === 0x97 || b === 0x92) score += 2
  }
  return bytes.length > 0 ? score / bytes.length : 0
}

/* ── Main Detection ──────────────────────────────────── */

export function detectEncoding(bytes: Uint8Array): EncodingInfo {
  // Check BOM first
  const bom = detectBOM(bytes)
  if (bom) return bom

  // Check ASCII
  if (isASCII(bytes)) {
    return { encoding: 'ascii', confidence: 1, hasBOM: false }
  }

  // Check UTF-8
  const u8Score = utf8Score(bytes)
  if (u8Score > 0.95 && isValidUTF8(bytes)) {
    return { encoding: 'utf-8', confidence: Math.min(u8Score + 0.05, 1), hasBOM: false }
  }

  // Score various encodings
  const scores: { encoding: Encoding; score: number; language?: string }[] = [
    { encoding: 'utf-8', score: u8Score },
    { encoding: 'shift-jis', score: detectShiftJIS(bytes), language: 'Japanese' },
    { encoding: 'euc-jp', score: detectEUCJP(bytes), language: 'Japanese' },
    { encoding: 'gb2312', score: detectGB(bytes), language: 'Chinese' },
    { encoding: 'big5', score: detectBig5(bytes), language: 'Chinese Traditional' },
    { encoding: 'koi8-r', score: detectKOI8(bytes), language: 'Russian' },
    { encoding: 'windows-1251', score: detectWindows1251(bytes), language: 'Cyrillic' },
    { encoding: 'windows-1252', score: detectWindows1252(bytes), language: 'Western' },
  ]

  scores.sort((a, b) => b.score - a.score)
  const best = scores[0]

  if (best.score > 0.1) {
    return {
      encoding: best.encoding,
      confidence: Math.min(best.score, 0.95),
      hasBOM: false,
      language: best.language,
    }
  }

  // Fallback to UTF-8
  return { encoding: 'utf-8', confidence: 0.5, hasBOM: false }
}

/* ── Encoding/Decoding ───────────────────────────────── */

export function decode(bytes: Uint8Array, encoding: Encoding): string {
  // Strip BOM if present
  let data = bytes
  if (encoding === 'utf-8-bom' && bytes.length >= 3 &&
      bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    data = bytes.slice(3)
    encoding = 'utf-8'
  }
  if (encoding === 'utf-16le' && bytes.length >= 2 &&
      bytes[0] === 0xFF && bytes[1] === 0xFE) {
    data = bytes.slice(2)
  }
  if (encoding === 'utf-16be' && bytes.length >= 2 &&
      bytes[0] === 0xFE && bytes[1] === 0xFF) {
    data = bytes.slice(2)
  }

  try {
    const decoder = new TextDecoder(normalizeEncodingName(encoding))
    return decoder.decode(data)
  } catch {
    // Fallback: try utf-8
    return new TextDecoder('utf-8', { fatal: false }).decode(data)
  }
}

export function encode(text: string, encoding: Encoding): Uint8Array {
  const encoder = new TextEncoder() // always UTF-8

  if (encoding === 'utf-8') {
    return encoder.encode(text)
  }

  if (encoding === 'utf-8-bom') {
    const encoded = encoder.encode(text)
    const result = new Uint8Array(encoded.length + 3)
    result[0] = 0xEF; result[1] = 0xBB; result[2] = 0xBF
    result.set(encoded, 3)
    return result
  }

  if (encoding === 'utf-16le') {
    const buf = new ArrayBuffer(text.length * 2 + 2)
    const view = new DataView(buf)
    view.setUint8(0, 0xFF)
    view.setUint8(1, 0xFE)
    for (let i = 0; i < text.length; i++) {
      view.setUint16(2 + i * 2, text.charCodeAt(i), true)
    }
    return new Uint8Array(buf)
  }

  if (encoding === 'utf-16be') {
    const buf = new ArrayBuffer(text.length * 2 + 2)
    const view = new DataView(buf)
    view.setUint8(0, 0xFE)
    view.setUint8(1, 0xFF)
    for (let i = 0; i < text.length; i++) {
      view.setUint16(2 + i * 2, text.charCodeAt(i), false)
    }
    return new Uint8Array(buf)
  }

  if (encoding === 'ascii') {
    const result = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i++) {
      result[i] = text.charCodeAt(i) & 0x7F
    }
    return result
  }

  // For other encodings, use TextEncoder (UTF-8) as fallback
  // In a real implementation, you'd use a proper encoding library
  return encoder.encode(text)
}

/* ── Encoding name normalization ─────────────────────── */

function normalizeEncodingName(encoding: Encoding): string {
  const map: Record<string, string> = {
    'utf-8': 'utf-8',
    'utf-8-bom': 'utf-8',
    'utf-16le': 'utf-16le',
    'utf-16be': 'utf-16be',
    'ascii': 'ascii',
    'iso-8859-1': 'iso-8859-1',
    'iso-8859-2': 'iso-8859-2',
    'iso-8859-15': 'iso-8859-15',
    'windows-1250': 'windows-1250',
    'windows-1251': 'windows-1251',
    'windows-1252': 'windows-1252',
    'windows-1253': 'windows-1253',
    'windows-1254': 'windows-1254',
    'windows-1256': 'windows-1256',
    'shift-jis': 'shift_jis',
    'euc-jp': 'euc-jp',
    'iso-2022-jp': 'iso-2022-jp',
    'euc-kr': 'euc-kr',
    'gb2312': 'gb2312',
    'gbk': 'gbk',
    'gb18030': 'gb18030',
    'big5': 'big5',
    'koi8-r': 'koi8-r',
    'koi8-u': 'koi8-u',
  }
  return map[encoding] || encoding
}

/* ── Encoding list for UI ────────────────────────────── */

export const ENCODING_OPTIONS: EncodingOption[] = [
  { encoding: 'utf-8', label: 'UTF-8', aliases: ['utf8'] },
  { encoding: 'utf-8-bom', label: 'UTF-8 with BOM', aliases: ['utf8bom'] },
  { encoding: 'utf-16le', label: 'UTF-16 LE', aliases: ['utf16le', 'ucs-2'] },
  { encoding: 'utf-16be', label: 'UTF-16 BE', aliases: ['utf16be'] },
  { encoding: 'ascii', label: 'ASCII', aliases: ['us-ascii'] },
  { encoding: 'iso-8859-1', label: 'Western (ISO 8859-1)', aliases: ['latin1', 'latin-1'] },
  { encoding: 'iso-8859-2', label: 'Central European (ISO 8859-2)', aliases: ['latin2'] },
  { encoding: 'iso-8859-15', label: 'Western (ISO 8859-15)', aliases: ['latin9'] },
  { encoding: 'windows-1250', label: 'Central European (Windows 1250)', aliases: ['cp1250'] },
  { encoding: 'windows-1251', label: 'Cyrillic (Windows 1251)', aliases: ['cp1251'] },
  { encoding: 'windows-1252', label: 'Western (Windows 1252)', aliases: ['cp1252'] },
  { encoding: 'windows-1253', label: 'Greek (Windows 1253)', aliases: ['cp1253'] },
  { encoding: 'windows-1254', label: 'Turkish (Windows 1254)', aliases: ['cp1254'] },
  { encoding: 'windows-1256', label: 'Arabic (Windows 1256)', aliases: ['cp1256'] },
  { encoding: 'shift-jis', label: 'Japanese (Shift JIS)', aliases: ['sjis', 'shiftjis', 'ms932'] },
  { encoding: 'euc-jp', label: 'Japanese (EUC-JP)', aliases: ['eucjp'] },
  { encoding: 'iso-2022-jp', label: 'Japanese (ISO 2022-JP)', aliases: ['jis'] },
  { encoding: 'euc-kr', label: 'Korean (EUC-KR)', aliases: ['euckr', 'ks_c_5601'] },
  { encoding: 'gb2312', label: 'Chinese Simplified (GB2312)', aliases: ['chinese', 'csiso58gb231280'] },
  { encoding: 'gbk', label: 'Chinese Simplified (GBK)', aliases: ['cp936'] },
  { encoding: 'gb18030', label: 'Chinese Simplified (GB18030)', aliases: [] },
  { encoding: 'big5', label: 'Chinese Traditional (Big5)', aliases: ['cn-big5'] },
  { encoding: 'koi8-r', label: 'Cyrillic (KOI8-R)', aliases: ['koi8r'] },
  { encoding: 'koi8-u', label: 'Cyrillic (KOI8-U)', aliases: ['koi8u'] },
]

export function findEncodingByAlias(alias: string): EncodingOption | undefined {
  const lower = alias.toLowerCase().replace(/[_\s-]/g, '')
  return ENCODING_OPTIONS.find(opt =>
    opt.encoding.replace(/[_\s-]/g, '') === lower ||
    opt.aliases.some(a => a.replace(/[_\s-]/g, '') === lower)
  )
}

export function getEncodingLabel(encoding: Encoding): string {
  return ENCODING_OPTIONS.find(o => o.encoding === encoding)?.label || encoding
}

/* ── EOL Detection ───────────────────────────────────── */

export type EOL = 'LF' | 'CRLF' | 'CR'

export function detectEOL(content: string): EOL {
  let lf = 0, crlf = 0, cr = 0

  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\r') {
      if (content[i + 1] === '\n') { crlf++; i++ }
      else cr++
    } else if (content[i] === '\n') {
      lf++
    }
  }

  if (crlf >= lf && crlf >= cr) return 'CRLF'
  if (cr > lf) return 'CR'
  return 'LF'
}

export function normalizeEOL(content: string, eol: EOL): string {
  // First normalize all to LF
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  switch (eol) {
    case 'LF': return normalized
    case 'CRLF': return normalized.replace(/\n/g, '\r\n')
    case 'CR': return normalized.replace(/\n/g, '\r')
  }
}

export function getEOLString(eol: EOL): string {
  switch (eol) {
    case 'LF': return '\n'
    case 'CRLF': return '\r\n'
    case 'CR': return '\r'
  }
}

export function getEOLLabel(eol: EOL): string {
  switch (eol) {
    case 'LF': return 'LF (Unix)'
    case 'CRLF': return 'CRLF (Windows)'
    case 'CR': return 'CR (Classic Mac)'
  }
}

/* ── File size formatting ────────────────────────────── */

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/* ── Encoding conversion ─────────────────────────────── */

export function convertEncoding(
  content: string,
  fromEncoding: Encoding,
  toEncoding: Encoding
): Uint8Array {
  // The content is already a JS string (UTF-16 internal)
  // Just encode to the target encoding
  return encode(content, toEncoding)
}

export function reinterpret(bytes: Uint8Array, fromEncoding: Encoding, toEncoding: Encoding): string {
  const text = decode(bytes, fromEncoding)
  // Re-encode and decode doesn't change the string, but validates
  const reencoded = encode(text, toEncoding)
  return decode(reencoded, toEncoding)
}
