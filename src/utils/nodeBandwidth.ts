/**
 * 节点带宽（主题设置 `nodeBandwidth`），以及卡片上「流量」一行用到的格式化。
 *
 * 主题设置存一张表（JSON 字符串或对象），单位 Mbps：
 *   { uuid: { up, down, note?, changes?: [{ date: 'YYYY-MM-DD', up, down, trafficLimitGB? }] } }
 * 只写一个数字表示上下行一样。`changes` 是到某天起带宽变了（比如加购的带宽到期），
 * 从那天新加坡时间 0 点起卡片自动换成新值；`trafficLimitGB` 只用来提示到期后的流量上限，
 * 真正的上限还是 Komari 里的 traffic_limit。`note` 显示在流量一行下面（比如「东京 3 台共用」）。
 */
import { parseOwnedSinceDate } from '@/utils/nodeOwnedSince'

export interface BandwidthSpeed {
  up: number
  down: number
}

export interface BandwidthChange extends BandwidthSpeed {
  date: string
  trafficLimitGB?: number
}

export interface BandwidthPlan extends BandwidthSpeed {
  note: string
  changes: BandwidthChange[]
}

export type NodeBandwidthMap = Record<string, BandwidthPlan>

export interface ResolvedBandwidth {
  current: BandwidthSpeed
  next: BandwidthChange | null
}

const DAY_MS = 86_400_000
const SGT_OFFSET_MS = 8 * 3_600_000
const MAX_ENTRIES = 5_000
const MAX_CHANGES = 20
const MAX_NOTE = 60
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const GiB = 1024 ** 3
const TiB = 1024 ** 4

function readMap(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return null
    return parsed as Record<string, unknown>
  }
  catch {
    return null
  }
}

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function readSpeed(raw: unknown): BandwidthSpeed | null {
  const single = positive(raw)
  if (single !== null)
    return { up: single, down: single }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null
  const { up, down } = raw as Record<string, unknown>
  const u = positive(up)
  const d = positive(down)
  return u !== null && d !== null ? { up: u, down: d } : null
}

function readChanges(raw: unknown): BandwidthChange[] {
  if (!Array.isArray(raw))
    return []
  const result: BandwidthChange[] = []
  for (const item of raw.slice(0, MAX_CHANGES)) {
    const speed = readSpeed(item)
    const date = item && typeof item === 'object' ? parseOwnedSinceDate((item as Record<string, unknown>).date) : null
    if (!speed || !date)
      continue
    const change: BandwidthChange = { date, ...speed }
    const limit = positive((item as Record<string, unknown>).trafficLimitGB)
    if (limit !== null)
      change.trafficLimitGB = limit
    result.push(change)
  }
  return result.sort((a, b) => a.date.localeCompare(b.date))
}

export function parseNodeBandwidth(value: unknown): NodeBandwidthMap {
  const parsed = readMap(value)
  if (!parsed)
    return {}
  const result: NodeBandwidthMap = {}
  for (const [uuid, raw] of Object.entries(parsed).slice(0, MAX_ENTRIES)) {
    if (!uuid.trim() || UNSAFE_KEYS.has(uuid))
      continue
    const speed = readSpeed(raw)
    if (!speed)
      continue
    const obj = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const note = typeof obj.note === 'string' ? obj.note.trim().slice(0, MAX_NOTE) : ''
    result[uuid] = { ...speed, note, changes: readChanges(obj.changes) }
  }
  return result
}

function sgtDay(ms: number): number {
  return Math.floor((ms + SGT_OFFSET_MS) / DAY_MS)
}

function dateDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d) / DAY_MS
}

/** 按新加坡时间的日期挑出当前带宽，以及下一次要发生的变化（没有就是 null）。 */
export function resolveBandwidth(plan: BandwidthPlan | undefined, nowMs: number): ResolvedBandwidth | null {
  if (!plan)
    return null
  const today = sgtDay(nowMs)
  let current: BandwidthSpeed = { up: plan.up, down: plan.down }
  let next: BandwidthChange | null = null
  for (const change of plan.changes) {
    if (dateDay(change.date) <= today) {
      current = { up: change.up, down: change.down }
    }
    else {
      next = change
      break
    }
  }
  return { current, next }
}

function trimNumber(value: number): string {
  return String(Number(value.toFixed(2)))
}

export function formatMbps(mbps: number): string {
  return mbps >= 1000 ? `${trimNumber(mbps / 1000)} Gbps` : `${trimNumber(mbps)} Mbps`
}

/** 套餐上限按商家给的整数显示：整 TB 写 TB，否则写整 GB；对不上整数的返回空串，交给通用格式化。 */
export function formatTrafficLimit(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0)
    return ''
  if (bytes % TiB === 0)
    return `${bytes / TiB} TB`
  if (bytes % GiB === 0)
    return `${bytes / GiB} GB`
  return ''
}

export function trafficModeLabel(type: string | null | undefined): string {
  switch ((type ?? '').toLowerCase()) {
    case 'max': return '单向取大'
    case 'min': return '单向取小'
    case 'up': return '只算上行'
    case 'down': return '只算下行'
    default: return '双向合计'
  }
}
