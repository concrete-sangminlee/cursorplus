/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useAutoSave } from './useAutoSave'

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    ;(globalThis as unknown as { api: { writeFile: ReturnType<typeof vi.fn> } }).api = {
      writeFile: vi.fn().mockResolvedValue({ success: true }),
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedules auto-save independently per file', async () => {
    const { result } = renderHook(() => useAutoSave())
    const apiWrite = (globalThis as unknown as { api: { writeFile: ReturnType<typeof vi.fn> } }).api.writeFile

    act(() => {
      result.current.scheduleAutoSave('/workspace/a.ts', 'A')
      result.current.scheduleAutoSave('/workspace/b.ts', 'B')
      vi.advanceTimersByTime(999)
    })
    expect(apiWrite).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
      // timer callbacks are async; flush promise queue
      await Promise.resolve()
    })

    expect(apiWrite).toHaveBeenCalledTimes(2)
    expect(apiWrite).toHaveBeenNthCalledWith(1, '/workspace/a.ts', 'A')
    expect(apiWrite).toHaveBeenNthCalledWith(2, '/workspace/b.ts', 'B')
  })

  it('debounces repeated changes for the same file', async () => {
    const { result } = renderHook(() => useAutoSave())
    const apiWrite = (globalThis as unknown as { api: { writeFile: ReturnType<typeof vi.fn> } }).api.writeFile

    act(() => {
      result.current.scheduleAutoSave('/workspace/a.ts', 'first')
      vi.advanceTimersByTime(500)
      result.current.scheduleAutoSave('/workspace/a.ts', 'second')
      vi.advanceTimersByTime(500)
    })
    expect(apiWrite).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    expect(apiWrite).toHaveBeenCalledTimes(1)
    expect(apiWrite).toHaveBeenLastCalledWith('/workspace/a.ts', 'second')
  })

  it('cancels all pending timers when hook unmounts', async () => {
    const { result, unmount } = renderHook(() => useAutoSave())
    const apiWrite = (globalThis as unknown as { api: { writeFile: ReturnType<typeof vi.fn> } }).api.writeFile

    act(() => {
      result.current.scheduleAutoSave('/workspace/a.ts', 'A')
      result.current.scheduleAutoSave('/workspace/b.ts', 'B')
    })

    unmount()

    await act(async () => {
      vi.advanceTimersByTime(2000)
      await Promise.resolve()
    })

    expect(apiWrite).not.toHaveBeenCalled()
  })
})
