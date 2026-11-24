/**
 * 节点「已拥有 N 天」。
 *
 * 主题设置 `nodeOwnedSince` 存一张 `{ uuid: 'YYYY-MM-DD' }` 的表（JSON 字符串或对象），
 * 日期是拿到这台机器的那一天。没配的节点退回用 Komari 里加进面板的时间。
 * 天数按新加坡时间（UTC+8）的自然日算：拿到当天是 0 天，第二天 0 点变 1 天。
 */

export type NodeOwnedSinceMap = Record<string, string>

export interface ResolvedOwnedSince {
  date: string
  source: 'configured' | 'created'
}

const DAY_MS = 86_400_000
const SGT_OFFSET_MS = 8 * 3_600_000
const MIN_YEAR = 2000
const MAX_ENTRIES = 5_000
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function utcDayIndex(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day) / DAY_MS
}

/** 只认真实存在的 `YYYY-MM-DD`，其余一律 null。 */
export function parseOwnedSinceDate(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const text = value.trim()
  const match = DATE_PATTERN.exec(text)
  if (!match)
    return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (year < MIN_YEAR)
    return null
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day)
    return null
  return text
}

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

export function parseNodeOwnedSince(value: unknown): NodeOwnedSinceMap {
  const parsed = readMap(value)
  if (!parsed)
    return {}
  const result: NodeOwnedSinceMap = {}
  for (const [uuid, raw] of Object.entries(parsed).slice(0, MAX_ENTRIES)) {
    if (!uuid.trim() || UNSAFE_KEYS.has(uuid))
      continue
    const date = parseOwnedSinceDate(raw)
    if (date)
      result[uuid] = date
  }
  return result
}

/** Komari 的 created_at（UTC）换成新加坡时间的日期。 */
function createdAtToSgtDate(createdAt: string | null | undefined): string | null {
  if (typeof createdAt !== 'string' || !createdAt.trim())
    return null
  const ms = Date.parse(createdAt.trim().replace(' ', 'T'))
  if (!Number.isFinite(ms))
    return null
  const sgt = new Date(ms + SGT_OFFSET_MS)
  if (sgt.getUTCFullYear() < MIN_YEAR)
    return null
  return sgt.toISOString().slice(0, 10)
}

export function resolveOwnedSince(
  map: NodeOwnedSinceMap,
  uuid: string,
  createdAt: string | null | undefined,
): ResolvedOwnedSince | null {
  const configured = Object.hasOwn(map, uuid) ? parseOwnedSinceDate(map[uuid]) : null
  if (configured)
    return { date: configured, source: 'configured' }
  const created = createdAtToSgtDate(createdAt)
  return created ? { date: created, source: 'created' } : null
}

export function getOwnedDays(date: string, nowMs: number): number {
  const parsed = parseOwnedSinceDate(date)
  if (!parsed || !Number.isFinite(nowMs))
    return 0
  const [year, month, day] = parsed.split('-').map(Number) as [number, number, number]
  const today = Math.floor((nowMs + SGT_OFFSET_MS) / DAY_MS)
  return Math.max(0, today - utcDayIndex(year, month, day))
}
