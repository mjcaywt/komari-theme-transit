import { describe, expect, test } from 'bun:test'
import {
  formatMbps,
  formatTrafficLimit,
  parseNodeBandwidth,
  resolveBandwidth,
  trafficModeLabel,
} from '../../src/utils/nodeBandwidth'

/** 新加坡时间某天某刻对应的毫秒时间戳。 */
function sgt(iso: string): number {
  return Date.parse(`${iso}+08:00`)
}

const GiB = 1024 ** 3
const TiB = 1024 ** 4

describe('parseNodeBandwidth', () => {
  test('reads up/down Mbps, note and dated changes from a JSON string or object', () => {
    const raw = JSON.stringify({
      'node-1': { up: 534, down: 534, changes: [{ date: '2027-05-05', up: 406, down: 406, trafficLimitGB: 814 }] },
      'node-2': { up: 50, down: 1000, note: '东京 3 台共用' },
    })
    expect(parseNodeBandwidth(raw)).toEqual({
      'node-1': { up: 534, down: 534, note: '', changes: [{ date: '2027-05-05', up: 406, down: 406, trafficLimitGB: 814 }] },
      'node-2': { up: 50, down: 1000, note: '东京 3 台共用', changes: [] },
    })
    expect(parseNodeBandwidth({ 'node-3': { up: 1000, down: 1000 } })['node-3']?.up).toBe(1000)
  })

  test('a single number means the same speed both ways', () => {
    expect(parseNodeBandwidth({ n: 2500 })).toEqual({ n: { up: 2500, down: 2500, note: '', changes: [] } })
  })

  test('drops bad entries, bad changes and prototype keys; sorts changes by date', () => {
    const parsed = parseNodeBandwidth(JSON.parse(JSON.stringify({
      '__proto__': 100,
      'bad-1': { up: -1, down: 10 },
      'bad-2': 'fast',
      'ok': {
        up: 441,
        down: 441,
        changes: [
          { date: '2028-01-01', up: 300, down: 300 },
          { date: '2027-02-30', up: 1, down: 1 },
          { date: '2027-05-05', up: 376, down: 376, trafficLimitGB: 757 },
          { date: '2027-06-01', up: 0, down: 10 },
        ],
      },
    })))
    expect(Object.keys(parsed)).toEqual(['ok'])
    expect(parsed.ok?.changes.map(c => c.date)).toEqual(['2027-05-05', '2028-01-01'])
    expect(parseNodeBandwidth('not json')).toEqual({})
    expect(parseNodeBandwidth('[]')).toEqual({})
    expect(parseNodeBandwidth(undefined)).toEqual({})
  })
})

describe('resolveBandwidth', () => {
  const plan = parseNodeBandwidth({
    n: { up: 534, down: 534, changes: [{ date: '2027-05-05', up: 406, down: 406, trafficLimitGB: 814 }] },
  }).n!

  test('before the change date: base speed, the change is upcoming', () => {
    const r = resolveBandwidth(plan, sgt('2027-05-04T23:59:00'))
    expect(r.current).toEqual({ up: 534, down: 534 })
    expect(r.next?.date).toBe('2027-05-05')
    expect(r.next?.trafficLimitGB).toBe(814)
  })

  test('from 00:00 SGT on the change date: new speed, nothing upcoming', () => {
    const r = resolveBandwidth(plan, sgt('2027-05-05T00:00:00'))
    expect(r.current).toEqual({ up: 406, down: 406 })
    expect(r.next).toBeNull()
  })

  test('no plan → null', () => {
    expect(resolveBandwidth(undefined, Date.now())).toBeNull()
  })
})

describe('formatMbps', () => {
  test('Mbps below 1000, Gbps from 1000 without trailing zeros', () => {
    expect(formatMbps(50)).toBe('50 Mbps')
    expect(formatMbps(534)).toBe('534 Mbps')
    expect(formatMbps(1000)).toBe('1 Gbps')
    expect(formatMbps(2500)).toBe('2.5 Gbps')
    expect(formatMbps(4000)).toBe('4 Gbps')
    expect(formatMbps(10000)).toBe('10 Gbps')
  })
})

describe('formatTrafficLimit', () => {
  test('keeps the exact plan number: whole TB as TB, otherwise whole GB', () => {
    expect(formatTrafficLimit(10 * TiB)).toBe('10 TB')
    expect(formatTrafficLimit(2 * TiB)).toBe('2 TB')
    expect(formatTrafficLimit(1226 * GiB)).toBe('1226 GB')
    expect(formatTrafficLimit(972 * GiB)).toBe('972 GB')
    expect(formatTrafficLimit(500 * GiB)).toBe('500 GB')
    expect(formatTrafficLimit(0)).toBe('')
    expect(formatTrafficLimit(1234567)).toBe('')
  })
})

describe('trafficModeLabel', () => {
  test('plain-language billing mode', () => {
    expect(trafficModeLabel('max')).toBe('单向取大')
    expect(trafficModeLabel('sum')).toBe('双向合计')
    expect(trafficModeLabel('up')).toBe('只算上行')
    expect(trafficModeLabel('down')).toBe('只算下行')
    expect(trafficModeLabel('min')).toBe('单向取小')
    expect(trafficModeLabel('')).toBe('双向合计')
  })
})
