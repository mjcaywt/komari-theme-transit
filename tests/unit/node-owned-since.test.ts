import { describe, expect, test } from 'bun:test'
import {
  getOwnedDays,
  parseNodeOwnedSince,
  parseOwnedSinceDate,
  resolveOwnedSince,
} from '../../src/utils/nodeOwnedSince'

/** 新加坡时间某天某刻对应的毫秒时间戳。 */
function sgt(iso: string): number {
  return Date.parse(`${iso}+08:00`)
}

describe('parseOwnedSinceDate', () => {
  test('accepts real calendar dates only', () => {
    expect(parseOwnedSinceDate('2026-02-09')).toBe('2026-02-09')
    expect(parseOwnedSinceDate(' 2025-06-30 ')).toBe('2025-06-30')
    expect(parseOwnedSinceDate('2026-02-30')).toBeNull()
    expect(parseOwnedSinceDate('2026-13-01')).toBeNull()
    expect(parseOwnedSinceDate('2026/02/09')).toBeNull()
    expect(parseOwnedSinceDate('1999-12-31')).toBeNull()
    expect(parseOwnedSinceDate(20260209)).toBeNull()
    expect(parseOwnedSinceDate(null)).toBeNull()
  })
})

describe('parseNodeOwnedSince', () => {
  test('keeps valid uuid → date entries from a JSON string or object', () => {
    const raw = JSON.stringify({ 'node-1': '2026-02-09', 'node-2': 'bad', 'node-3': 5, '': '2026-01-01' })
    expect(parseNodeOwnedSince(raw)).toEqual({ 'node-1': '2026-02-09' })
    expect(parseNodeOwnedSince({ 'node-1': '2025-06-30' })).toEqual({ 'node-1': '2025-06-30' })
  })

  test('ignores prototype keys and garbage input', () => {
    const parsed = parseNodeOwnedSince(JSON.parse('{"__proto__":"2026-01-01","node-1":"2026-01-02"}'))
    expect(parsed).toEqual({ 'node-1': '2026-01-02' })
    expect(Object.hasOwn(parsed, '__proto__')).toBe(false)
    expect(parseNodeOwnedSince('not json')).toEqual({})
    expect(parseNodeOwnedSince('[]')).toEqual({})
    expect(parseNodeOwnedSince(undefined)).toEqual({})
  })
})

describe('resolveOwnedSince', () => {
  test('prefers the configured date', () => {
    expect(resolveOwnedSince({ 'node-1': '2026-02-09' }, 'node-1', '2026-11-16T13:25:41Z'))
      .toEqual({ date: '2026-02-09', source: 'configured' })
  })

  test('falls back to the Komari add date in Singapore time', () => {
    // 2026-03-11 17:19 UTC = 2026-03-12 01:19 新加坡时间
    expect(resolveOwnedSince({}, 'node-1', '2026-03-11T17:19:22.0432698+00:00'))
      .toEqual({ date: '2026-03-12', source: 'created' })
    expect(resolveOwnedSince({}, 'node-1', '2026-06-24 06:44:07.7949939+00:00'))
      .toEqual({ date: '2026-06-24', source: 'created' })
  })

  test('returns null when nothing usable exists', () => {
    expect(resolveOwnedSince({}, 'node-1', '')).toBeNull()
    expect(resolveOwnedSince({}, 'node-1', '0001-01-01T00:00:00Z')).toBeNull()
    expect(resolveOwnedSince({}, 'node-1', undefined)).toBeNull()
  })
})

describe('getOwnedDays', () => {
  test('counts whole calendar days in Singapore time', () => {
    expect(getOwnedDays('2026-11-24', sgt('2026-11-24T00:00:00'))).toBe(0)
    expect(getOwnedDays('2026-11-24', sgt('2026-11-24T23:59:59'))).toBe(0)
    expect(getOwnedDays('2026-11-24', sgt('2026-11-25T00:00:00'))).toBe(1)
    expect(getOwnedDays('2026-02-09', sgt('2026-11-25T12:00:00'))).toBe(289)
    expect(getOwnedDays('2025-06-30', sgt('2026-06-30T09:00:00'))).toBe(365)
  })

  test('never goes negative for a future date', () => {
    expect(getOwnedDays('2027-01-01', sgt('2026-11-25T12:00:00'))).toBe(0)
  })
})
