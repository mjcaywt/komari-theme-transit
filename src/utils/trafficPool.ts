/**
 * 几台机器共用一份流量（比如甲骨文一个账号每月 10 TB 出站，东京 3 台一起用）。
 *
 * 主题设置 `trafficPools` 存一个数组（JSON 字符串或数组）：
 *   [{ name: '东京 3 台', limitTB: 10 | limitGB: 500, type: 'up'|'down'|'sum'|'max'|'min', members: [uuid...] }]
 * 卡片上组里每台的流量一行都显示整组合计 / 组上限，告警也按合计算；Komari 自己的单机上限不受影响。
 */
import type { NodeData } from '@/stores/nodes'
import { getTrafficUsed } from '@/utils/nodeMetricsHelper'

export type TrafficPoolType = 'up' | 'down' | 'sum' | 'max' | 'min'

export interface TrafficPool {
  name: string
  limit: number
  type: TrafficPoolType
  members: string[]
}

export interface TrafficPoolUsage {
  used: number
  limit: number
  percentage: number
  memberCount: number
}

const GiB = 1024 ** 3
const TiB = 1024 ** 4
const MAX_POOLS = 100
const MAX_MEMBERS = 200
const TYPES = new Set<TrafficPoolType>(['up', 'down', 'sum', 'max', 'min'])

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export function parseTrafficPools(value: unknown): TrafficPool[] {
  let parsed: unknown = value
  try {
    if (typeof value === 'string')
      parsed = JSON.parse(value)
  }
  catch {
    return []
  }
  if (!Array.isArray(parsed))
    return []
  const pools: TrafficPool[] = []
  for (const raw of parsed.slice(0, MAX_POOLS)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      continue
    const item = raw as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 40) : ''
    const tb = positive(item.limitTB)
    const gb = positive(item.limitGB)
    const limit = tb !== null ? tb * TiB : gb !== null ? gb * GiB : 0
    const members = Array.isArray(item.members)
      ? [...new Set(item.members.filter((m): m is string => typeof m === 'string' && m.trim() !== ''))].slice(0, MAX_MEMBERS)
      : []
    if (!name || limit <= 0 || members.length === 0)
      continue
    const type = typeof item.type === 'string' && TYPES.has(item.type as TrafficPoolType) ? item.type as TrafficPoolType : 'sum'
    pools.push({ name, limit, type, members })
  }
  return pools
}

export function findTrafficPool(pools: TrafficPool[], uuid: string): TrafficPool | null {
  return pools.find(pool => pool.members.includes(uuid)) ?? null
}

type TrafficFields = Pick<NodeData, 'net_total_up' | 'net_total_down'>

export function getTrafficPoolUsage(pool: TrafficPool, nodesByUuid: Map<string, TrafficFields>): TrafficPoolUsage {
  let used = 0
  for (const uuid of pool.members) {
    const node = nodesByUuid.get(uuid)
    if (node)
      used += getTrafficUsed({ net_total_up: node.net_total_up || 0, net_total_down: node.net_total_down || 0, traffic_limit_type: pool.type })
  }
  return { used, limit: pool.limit, percentage: used / pool.limit * 100, memberCount: pool.members.length }
}
