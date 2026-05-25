export const MAX_CLIPBOARD_TEXT_BYTES = 5 * 1024 * 1024
export const MAX_CLIPBOARD_IMAGE_PIXELS = 16_777_216
export const MAX_CLIPBOARD_IMAGE_PNG_BYTES = 25 * 1024 * 1024

export class UnsafeClipboardPayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeClipboardPayloadError'
  }
}

export function validateClipboardText(value: unknown): string {
  if (typeof value !== 'string') {
    throw new UnsafeClipboardPayloadError('Clipboard text must be a string')
  }

  const byteLength = Buffer.byteLength(value, 'utf8')
  if (byteLength > MAX_CLIPBOARD_TEXT_BYTES) {
    throw new UnsafeClipboardPayloadError(`Clipboard text exceeds ${MAX_CLIPBOARD_TEXT_BYTES} bytes`)
  }

  return value
}

export function validateClipboardImageSize(size: { width: number; height: number }): void {
  if (!Number.isSafeInteger(size.width) || !Number.isSafeInteger(size.height) || size.width < 0 || size.height < 0) {
    throw new UnsafeClipboardPayloadError('Clipboard image has invalid dimensions')
  }

  const pixels = size.width * size.height
  if (pixels > MAX_CLIPBOARD_IMAGE_PIXELS) {
    throw new UnsafeClipboardPayloadError(`Clipboard image exceeds ${MAX_CLIPBOARD_IMAGE_PIXELS} pixels`)
  }
}

export function validateClipboardPngBuffer(value: unknown): Buffer {
  if (!Buffer.isBuffer(value)) {
    throw new UnsafeClipboardPayloadError('Clipboard image payload must be a buffer')
  }

  if (value.length > MAX_CLIPBOARD_IMAGE_PNG_BYTES) {
    throw new UnsafeClipboardPayloadError(`Clipboard image PNG exceeds ${MAX_CLIPBOARD_IMAGE_PNG_BYTES} bytes`)
  }

  return value
}
