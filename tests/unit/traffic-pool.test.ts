import { describe, expect, test } from 'bun:test'
import { findTrafficPool, getTrafficPoolUsage, parseTrafficPools } from '../../src/utils/trafficPool'

const GiB = 1024 ** 3
const TiB = 1024 ** 4

function n(uuid: string, up: number, down: number) {
  return { uuid, net_total_up: up, net_total_down: down }
}

describe('parseTrafficPools', () => {
  test('reads name, limit (TB or GB), billing type and members', () => {
    const raw = JSON.stringify([
      { name: '东京 3 台', limitTB: 10, type: 'up', members: ['a', 'b', 'c'] },
      { name: '小组', limitGB: 500, type: 'sum', members: ['d', 'e'] },
    ])
    expect(parseTrafficPools(raw)).toEqual([
      { name: '东京 3 台', limit: 10 * TiB, type: 'up', members: ['a', 'b', 'c'] },
      { name: '小组', limit: 500 * GiB, type: 'sum', members: ['d', 'e'] },
    ])
  })

  test('drops pools without a name, a positive limit or at least one member; unknown type → sum', () => {
    const parsed = parseTrafficPools([
      { name: '', limitTB: 1, members: ['a'] },
      { name: 'x', limitTB: 0, members: ['a'] },
      { name: 'y', limitTB: 1, members: [] },
      { name: 'z', limitTB: 1, type: 'weird', members: ['a', '', 5, 'a'] },
    ])
    expect(parsed).toEqual([{ name: 'z', limit: TiB, type: 'sum', members: ['a'] }])
    expect(parseTrafficPools('not json')).toEqual([])
    expect(parseTrafficPools('{}')).toEqual([])
    expect(parseTrafficPools(undefined)).toEqual([])
  })
})

describe('findTrafficPool / getTrafficPoolUsage', () => {
  const pools = parseTrafficPools([{ name: '东京 3 台', limitTB: 10, type: 'up', members: ['a', 'b', 'c'] }])

  test('finds the pool a node belongs to', () => {
    expect(findTrafficPool(pools, 'b')?.name).toBe('东京 3 台')
    expect(findTrafficPool(pools, 'zz')).toBeNull()
  })

  test('sums every member by the pool billing type; missing members count as 0', () => {
    const nodes = new Map([
      ['a', n('a', 6 * GiB, 12 * GiB)],
      ['b', n('b', 2 * GiB, 2 * GiB)],
    ])
    const usage = getTrafficPoolUsage(pools[0]!, nodes)
    expect(usage.used).toBe(8 * GiB)
    expect(usage.limit).toBe(10 * TiB)
    expect(usage.percentage).toBeCloseTo(8 / 10240 * 100, 6)
    expect(usage.memberCount).toBe(3)
  })

  test('percentage is not capped at 100', () => {
    const small = parseTrafficPools([{ name: 'p', limitGB: 10, type: 'sum', members: ['a'] }])[0]!
    const usage = getTrafficPoolUsage(small, new Map([['a', n('a', 8 * GiB, 7 * GiB)]]))
    expect(usage.percentage).toBe(150)
  })
})
