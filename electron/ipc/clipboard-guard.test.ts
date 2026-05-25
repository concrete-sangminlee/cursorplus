import { describe, expect, it } from 'vitest'
import {
  MAX_CLIPBOARD_IMAGE_PIXELS,
  MAX_CLIPBOARD_IMAGE_PNG_BYTES,
  MAX_CLIPBOARD_TEXT_BYTES,
  UnsafeClipboardPayloadError,
  validateClipboardImageSize,
  validateClipboardPngBuffer,
  validateClipboardText,
} from './clipboard-guard'

describe('validateClipboardText', () => {
  it('accepts ordinary text', () => {
    expect(validateClipboardText('hello')).toBe('hello')
  })

  it('accepts text up to the byte limit', () => {
    expect(validateClipboardText('a'.repeat(MAX_CLIPBOARD_TEXT_BYTES))).toHaveLength(MAX_CLIPBOARD_TEXT_BYTES)
  })

  it('counts UTF-8 bytes, not UTF-16 code units', () => {
    expect(() => validateClipboardText('\u00a2'.repeat(Math.floor(MAX_CLIPBOARD_TEXT_BYTES / 2) + 1))).toThrow(UnsafeClipboardPayloadError)
  })

  it('rejects non-string text payloads', () => {
    expect(() => validateClipboardText(null)).toThrow('must be a string')
    expect(() => validateClipboardText(123)).toThrow('must be a string')
  })

  it('rejects text over the byte limit', () => {
    expect(() => validateClipboardText('a'.repeat(MAX_CLIPBOARD_TEXT_BYTES + 1))).toThrow('exceeds')
  })
})

describe('validateClipboardImageSize', () => {
  it('accepts empty and ordinary image dimensions', () => {
    expect(() => validateClipboardImageSize({ width: 0, height: 0 })).not.toThrow()
    expect(() => validateClipboardImageSize({ width: 1920, height: 1080 })).not.toThrow()
  })

  it('accepts dimensions exactly at the pixel limit', () => {
    expect(() => validateClipboardImageSize({ width: MAX_CLIPBOARD_IMAGE_PIXELS, height: 1 })).not.toThrow()
  })

  it('rejects dimensions over the pixel limit', () => {
    expect(() => validateClipboardImageSize({ width: MAX_CLIPBOARD_IMAGE_PIXELS + 1, height: 1 })).toThrow('pixels')
  })

  it('rejects invalid dimensions', () => {
    expect(() => validateClipboardImageSize({ width: -1, height: 100 })).toThrow('invalid dimensions')
    expect(() => validateClipboardImageSize({ width: 100.5, height: 100 })).toThrow('invalid dimensions')
    expect(() => validateClipboardImageSize({ width: Number.NaN, height: 100 })).toThrow('invalid dimensions')
  })
})

describe('validateClipboardPngBuffer', () => {
  it('accepts buffers up to the byte limit', () => {
    const buffer = Buffer.alloc(MAX_CLIPBOARD_IMAGE_PNG_BYTES)
    expect(validateClipboardPngBuffer(buffer)).toBe(buffer)
  })

  it('rejects non-buffer values', () => {
    expect(() => validateClipboardPngBuffer('not a buffer')).toThrow('must be a buffer')
  })

  it('rejects PNG buffers over the byte limit', () => {
    expect(() => validateClipboardPngBuffer(Buffer.alloc(MAX_CLIPBOARD_IMAGE_PNG_BYTES + 1))).toThrow('exceeds')
  })
})
