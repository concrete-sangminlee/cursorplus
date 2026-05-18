import { describe, expect, it } from 'vitest'
import { evaluateDebugConsoleExpression, evaluateSimpleArithmetic } from './DebugConsolePanel'

describe('DebugConsolePanel expression evaluation', () => {
  it('evaluates simple arithmetic without eval', () => {
    expect(evaluateSimpleArithmetic('1+2')).toBe('3')
    expect(evaluateSimpleArithmetic(' -2.5 * 4 ')).toBe('-10')
    expect(evaluateDebugConsoleExpression('8 / 2')).toBe('4')
  })

  it('handles supported debug console expressions', () => {
    expect(evaluateDebugConsoleExpression('process.env.NODE_ENV')).toBe('"development"')
    expect(evaluateDebugConsoleExpression('Math.PI')).toBe(String(Math.PI))
    expect(evaluateDebugConsoleExpression('Date.now()', () => 12345)).toBe('12345')
  })

  it('does not execute arbitrary JavaScript', () => {
    delete (globalThis as { __orionEvalProbe?: boolean }).__orionEvalProbe

    expect(evaluateDebugConsoleExpression('globalThis.__orionEvalProbe = true')).toBe('undefined')
    expect((globalThis as { __orionEvalProbe?: boolean }).__orionEvalProbe).toBeUndefined()
  })
})
