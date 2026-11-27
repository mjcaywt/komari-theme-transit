<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import NodeCardInsightPanel from '@/components/NodeCardInsightPanel.vue'
import NodeRoutePanel from '@/components/NodeRoutePanel.vue'
import { ProgressThin } from '@/components/ui/progress-thin'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useNodeAlert } from '@/composables/useNodeAlertState'
import { useAppStore } from '@/stores/app'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatDateTime, getStatus, getUptimeDays } from '@/utils/helper'
import { formatMbps, formatTrafficLimit, resolveBandwidth, trafficModeLabel } from '@/utils/nodeBandwidth'
import { getDiskPercentage, getMemoryPercentage, getTrafficUsed, getTrafficUsedPercentage, hasTrafficLimit } from '@/utils/nodeMetricsHelper'
import { getOwnedDays, resolveOwnedSince } from '@/utils/nodeOwnedSince'
import { getConfiguredNodeRole, getNodeRole } from '@/utils/nodeRoleHelper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'
import { parseNodeRouteTag } from '@/utils/routeTag'
import { formatCardPrice, getDaysUntilExpired, getExpireStatus, parseTags } from '@/utils/tagHelper'

const props = defineProps<{ node: NodeData }>()
const emit = defineEmits<{ click: [], manage: [] }>()
const appStore = useAppStore()
const formatBytes = (value: number) => formatBytesWithConfig(value, appStore.byteDecimals)
const formatSpeed = (value: number) => formatBytesPerSecondWithConfig(value, appStore.byteDecimals)
const nodeControl = computed(() => appStore.nodeControls[props.node.uuid])
const isMaintenance = computed(() => Boolean(nodeControl.value?.maintenanceUntil))
const isSilenced = computed(() => Boolean(nodeControl.value?.silenceUntil))

const memoryPercentage = computed(() => getMemoryPercentage(props.node))
const diskPercentage = computed(() => getDiskPercentage(props.node))
const trafficUsed = computed(() => getTrafficUsed(props.node))
const trafficPercentage = computed(() => getTrafficUsedPercentage(props.node))
const trafficLimited = computed(() => hasTrafficLimit(props.node))
// 进度条封顶 100%，文字写真实比例（超额时能看出超了多少）。
const trafficPercentText = computed(() => trafficLimited.value ? (trafficUsed.value / props.node.traffic_limit * 100).toFixed(1) : '0.0')
const trafficLimitText = computed(() => formatTrafficLimit(props.node.traffic_limit) || formatBytes(props.node.traffic_limit))
const trafficMode = computed(() => trafficModeLabel(props.node.traffic_limit_type))
// 带宽来自主题设置 nodeBandwidth（Mbps）；note 是流量一行下面的小注（比如「东京 3 台共用」）。
const bandwidthPlan = computed(() => appStore.nodeBandwidth[props.node.uuid])
const bandwidth = computed(() => resolveBandwidth(bandwidthPlan.value, appStore.minuteTick.getTime()))
const trafficFootnote = computed(() => bandwidthPlan.value?.note ?? '')
const showPrice = computed(() => appStore.isLoggedIn || !appStore.hidePriceWhenLoggedOut)
const role = computed(() => getNodeRole(props.node.tags, props.node.groups)
  ?? getConfiguredNodeRole(props.node.name, appStore.topologyRoute))
/** 有回程数据时右边那一格才存在，没有的话网络概览独占整行。 */
const hasReturnRoute = computed(() => parseNodeRouteTag(props.node.tags) !== null)
const tags = computed(() => parseTags(props.node.tags)
  .map(tag => tag.text)
  .filter(tag => tag !== role.value)
  .slice(0, 5))

const price = computed(() => showPrice.value
  ? formatCardPrice(props.node.price, props.node.billing_cycle, props.node.currency, appStore.lang)
  : '')
const expiryStatus = computed(() => getExpireStatus(props.node.expired_at))
const expiryDays = computed(() => getDaysUntilExpired(props.node.expired_at))
const expiryText = computed(() => {
  if (expiryStatus.value === 'unknown')
    return '未设置到期'
  if (expiryStatus.value === 'expired')
    return '已过期'
  if (expiryStatus.value === 'long_term')
    return '长期'
  return `${Math.max(0, expiryDays.value)} 天`
})
// 只有 7 天内（含已过期）才算即将到期，标红；其余正常显示。
const expiryUrgent = computed(() => expiryStatus.value === 'expired'
  || ((expiryStatus.value === 'critical' || expiryStatus.value === 'warning' || expiryStatus.value === 'normal') && expiryDays.value <= 7))
const expiryTextClass = computed(() => expiryUrgent.value
  ? 'font-semibold text-rose-600 dark:text-rose-400'
  : expiryStatus.value === 'unknown'
    ? 'text-slate-500'
    : 'font-semibold text-slate-700 dark:text-slate-200')
const expiryDate = computed(() => expiryStatus.value === 'unknown' || expiryStatus.value === 'long_term'
  ? ''
  : formatDateTime(props.node.expired_at, 'YYYY-MM-DD'))

// 状态行左边：拿到手的天数（主题设置 nodeOwnedSince，没配就用加进面板的日期），开机时长放悬停提示里。
const ownedSince = computed(() => resolveOwnedSince(appStore.nodeOwnedSince, props.node.uuid, props.node.created_at))
const ownedDays = computed(() => ownedSince.value ? getOwnedDays(ownedSince.value.date, appStore.minuteTick.getTime()) : null)
const uptimeDays = computed(() => getUptimeDays(props.node.uptime))
const statusText = computed(() => {
  if (isMaintenance.value)
    return '维护中'
  if (!props.node.online)
    return '离线'
  return ownedDays.value === null ? `在线 ${uptimeDays.value} 天` : `已拥有 ${ownedDays.value} 天`
})
const statusHint = computed(() => {
  if (!ownedSince.value)
    return ''
  const since = `${ownedSince.value.date} 起${ownedSince.value.source === 'created' ? '（加进面板的日期）' : ''}`
  return props.node.online ? `${since} · 开机 ${uptimeDays.value} 天` : since
})

const primaryAlert = useNodeAlert(() => props.node.uuid)
const visibleAlert = computed(() => isMaintenance.value ? null : primaryAlert.value)

function resourceStatus(value: number) {
  return getStatus(value)
}

const alertTone = computed(() => visibleAlert.value?.severity === 'critical'
  ? 'text-rose-600 dark:text-rose-400'
  : 'text-amber-700 dark:text-amber-300')
const statusEdgeTone = computed(() => {
  if (!props.node.online)
    return 'var(--destructive)'
  if (isMaintenance.value)
    return 'var(--warning)'
  if (visibleAlert.value?.severity === 'critical')
    return 'var(--destructive)'
  if (visibleAlert.value)
    return 'var(--warning)'
  return 'var(--success)'
})
const statusEdgeStyle = computed(() => ({ '--node-status-tone': statusEdgeTone.value }))
</script>

<template>
  <article
    :data-transit-node-card-size="appStore.nodeCardSize"
    :data-node-status-edge="node.online ? '' : undefined"
    :data-node-alert-edge="node.online && visibleAlert ? '' : undefined"
    class="transit-node-card group relative h-full min-w-0 cursor-pointer overflow-hidden rounded-2xl p-3.5 pl-6 transition duration-200 hover:-translate-y-px hover:border-emerald-400/25"
    :class="!node.online ? 'opacity-75' : ''"
    :style="statusEdgeStyle"
  >
    <span aria-hidden="true" data-node-status-rail class="transit-node-card__status-rail" />

    <button
      type="button"
      class="absolute inset-0 z-0 cursor-pointer rounded-2xl border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/70"
      :aria-label="`查看节点 ${node.name} 详情`"
      @click="emit('click')"
    />

    <header class="transit-node-card__header pointer-events-none relative z-1 min-h-[2.65rem]">
      <div class="flex min-w-0 items-start justify-between gap-3">
        <div data-node-title-row class="relative flex min-w-0 flex-1 items-baseline gap-2">
          <span data-node-status-dot class="absolute -left-2.5 top-[0.4rem] size-1.5 rounded-full" :class="isMaintenance ? 'bg-amber-400' : node.online ? 'bg-emerald-400' : 'bg-rose-400'" />
          <h3
            data-node-name
            class="node-card-name min-w-0 text-[15px] font-semibold leading-[1.25] tracking-[-0.01em] text-slate-900 dark:text-slate-100"
            :title="node.name"
            :aria-label="node.name"
          >
            {{ node.name }}
          </h3>
          <span v-if="role" data-node-role class="shrink-0 text-[10px] leading-[1.25] text-slate-500">· {{ role }}</span>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button
            v-if="appStore.privateFeaturesAllowed"
            type="button"
            data-node-control-button
            class="pointer-events-auto grid size-6 place-items-center rounded-md text-slate-500 transition-colors hover:bg-slate-500/10 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60 dark:hover:text-slate-200"
            :class="(isMaintenance || isSilenced) && 'text-amber-700 dark:text-amber-300'"
            :aria-label="`管理节点 ${node.name}`"
            :title="isMaintenance ? '维护中' : isSilenced ? '告警已静默' : '节点运维'"
            @click.stop="emit('manage')"
          >
            <Icon :icon="isMaintenance ? 'tabler:tools' : isSilenced ? 'tabler:bell-off' : 'tabler:dots'" :width="14" />
          </button>
          <img :src="getOSImage(node.os)" :alt="getOSName(node.os)" class="size-3.5 opacity-75">
          <img
            v-if="node.region"
            :src="`/images/flags/${getRegionCode(node.region)}.svg`"
            :alt="getRegionDisplayName(node.region)"
            class="h-4 w-6 rounded-[2px] object-cover"
          >
        </div>
      </div>
      <div data-node-status-row class="mt-1.5 flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 text-[10px] text-slate-500">
        <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <TooltipProvider v-if="statusHint && !isMaintenance" :delay-duration="160">
            <Tooltip>
              <TooltipTrigger as-child>
                <span data-node-uptime :data-node-owned-since="ownedSince?.date" class="pointer-events-auto break-words tabular-nums">
                  {{ statusText }}
                </span>
              </TooltipTrigger>
              <TooltipContent data-node-owned-tooltip side="top" :side-offset="7" class="max-w-[260px] text-[10px] tabular-nums">
                {{ statusHint }}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span v-else data-node-uptime class="break-words" :class="isMaintenance && 'font-medium text-amber-700 dark:text-amber-300'">
            {{ statusText }}
          </span>
          <span v-if="isSilenced && !isMaintenance" data-node-maintenance-state class="break-words font-medium text-slate-600 dark:text-slate-300">已静默</span>
        </div>
        <!-- 右侧：告警（有的话）在前，价格固定贴右边。 -->
        <div v-if="(visibleAlert && node.online) || price" class="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
          <TooltipProvider v-if="visibleAlert && node.online" :delay-duration="160">
            <Tooltip>
              <TooltipTrigger as-child>
                <span
                  data-node-alert-reason
                  class="pointer-events-auto flex min-w-0 max-w-full items-center gap-1.5 font-medium tabular-nums"
                  :class="alertTone"
                  @click="emit('click')"
                >
                  <span class="size-1.5 shrink-0 rounded-full bg-current" />
                  <span class="truncate">{{ visibleAlert.detail }}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent data-node-alert-tooltip side="top" :side-offset="7" class="max-w-[260px] text-[10px] tabular-nums">
                {{ visibleAlert.detail }}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span v-if="price" data-node-price class="whitespace-nowrap">{{ price }}</span>
        </div>
      </div>
    </header>

    <div data-node-resource-grid class="transit-divider pointer-events-none relative z-1 mt-3 grid grid-cols-3 gap-3 border-y py-2.5">
      <div>
        <div class="flex items-center justify-between gap-2 text-[10px]">
          <span class="text-slate-500">CPU</span>
          <strong class="font-medium tabular-nums text-slate-700 dark:text-slate-200">{{ (node.cpu ?? 0).toFixed(1) }}%</strong>
        </div>
        <ProgressThin class="mt-1.5" :percentage="node.cpu" :status="resourceStatus(node.cpu)" :height="3" />
        <div data-node-resource-value class="mt-1 break-words text-[9px] leading-tight tabular-nums text-slate-500 dark:text-slate-600">
          {{ node.cpu_cores > 0 ? `${node.cpu_cores} 线程` : '-' }}
        </div>
      </div>
      <div>
        <div class="flex items-center justify-between gap-2 text-[10px]">
          <span class="text-slate-500">内存</span>
          <strong class="font-medium tabular-nums text-slate-700 dark:text-slate-200">{{ memoryPercentage.toFixed(1) }}%</strong>
        </div>
        <ProgressThin class="mt-1.5" :percentage="memoryPercentage" :status="resourceStatus(memoryPercentage)" :height="3" />
        <div data-node-resource-value class="mt-1 break-words text-[9px] leading-tight tabular-nums text-slate-500 dark:text-slate-600">
          {{ formatBytes(node.ram) }} / {{ formatBytes(node.mem_total) }}
        </div>
      </div>
      <div>
        <div class="flex items-center justify-between gap-2 text-[10px]">
          <span class="text-slate-500">硬盘</span>
          <strong class="font-medium tabular-nums text-slate-700 dark:text-slate-200">{{ diskPercentage.toFixed(1) }}%</strong>
        </div>
        <ProgressThin class="mt-1.5" :percentage="diskPercentage" :status="resourceStatus(diskPercentage)" :height="3" />
        <div data-node-resource-value class="mt-1 break-words text-[9px] leading-tight tabular-nums text-slate-500 dark:text-slate-600">
          {{ formatBytes(node.disk) }} / {{ formatBytes(node.disk_total) }}
        </div>
      </div>
    </div>

    <div data-node-card-detail-grid class="node-card-detail-grid pointer-events-none relative z-1 mt-2.5 grid gap-2">
      <!--
        网络概览：上下行、累计流量和到期并成一格，让右边空出位置给三网回程。
        没有回程数据时这一格独占整行，不留半格空白。
      -->
      <div
        data-node-network-cell
        class="node-card-cell min-w-0 overflow-hidden p-0 text-[9px]"
        :class="!hasReturnRoute && 'node-card-cell--full'"
      >
        <div class="flex items-center justify-between gap-2 px-2.5 py-2 text-slate-500">
          <span>网络概览</span>
        </div>

        <!--
          上行/下行各自带累计量，带宽和到期一组；四格半宽时 2×2，整行时摊成一排。
          下面两行占满整宽：流量（用量 / 上限 + 计费方式 + 进度条，没上限写不限量）、连接数。
        -->
        <div data-node-network-grid class="node-card-network-grid grid">
          <div data-node-speed-cell class="min-w-0 px-2.5 py-1.5">
            <div class="text-slate-500">
              上行
            </div>
            <div class="mt-0.5 break-words text-[10px] tabular-nums text-emerald-600 dark:text-emerald-400">
              ↑ {{ formatSpeed(node.net_out) }}
            </div>
            <div data-node-total-up class="mt-0.5 break-words text-[9px] tabular-nums text-slate-500">
              累计 {{ formatBytes(node.net_total_up ?? 0) }}
            </div>
          </div>
          <div class="min-w-0 px-2.5 py-1.5">
            <div class="text-slate-500">
              下行
            </div>
            <div class="mt-0.5 break-words text-[10px] tabular-nums text-slate-700 dark:text-slate-300">
              ↓ {{ formatSpeed(node.net_in) }}
            </div>
            <div data-node-total-down class="mt-0.5 break-words text-[9px] tabular-nums text-slate-500">
              累计 {{ formatBytes(node.net_total_down ?? 0) }}
            </div>
          </div>
          <div data-node-bandwidth-cell class="min-w-0 px-2.5 py-1.5">
            <div class="text-slate-500">
              带宽
            </div>
            <template v-if="bandwidth">
              <div data-node-bandwidth-value class="mt-0.5 break-words text-[10px] font-medium leading-snug tabular-nums text-slate-700 dark:text-slate-200">
                <div>↑ {{ formatMbps(bandwidth.current.up) }}</div>
                <div>↓ {{ formatMbps(bandwidth.current.down) }}</div>
              </div>
            </template>
            <div v-else data-node-bandwidth-value class="mt-0.5 text-[10px] text-slate-500">
              未设置
            </div>
          </div>
          <div class="min-w-0 px-2.5 py-1.5">
            <div class="text-slate-500">
              到期
            </div>
            <div data-node-expiry-row class="mt-0.5 flex min-h-[1.65rem] min-w-0 flex-col items-start gap-y-0.5 text-slate-500">
              <span data-node-expiry-text class="max-w-full whitespace-nowrap text-[10px] tabular-nums" :class="expiryTextClass">{{ expiryText }}</span>
              <span v-if="expiryDate" data-node-expiry-date class="max-w-full whitespace-nowrap text-[8px] tabular-nums" :class="expiryUrgent && 'text-rose-600/80 dark:text-rose-400/80'">{{ expiryDate }}</span>
            </div>
          </div>
          <div data-node-traffic-row class="node-card-network-row min-w-0 px-2.5 py-1.5">
            <div class="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <span class="text-slate-500">流量<template v-if="trafficLimited"> · {{ trafficMode }}</template></span>
              <span v-if="trafficLimited" data-node-traffic-value class="text-[10px] font-medium tabular-nums text-slate-700 dark:text-slate-200">
                {{ formatBytes(trafficUsed) }} / {{ trafficLimitText }}<span class="ml-1.5 font-normal" :class="trafficPercentage >= 100 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'">{{ trafficPercentText }}%</span>
              </span>
              <span v-else data-node-traffic-value class="text-[10px] font-medium text-slate-700 dark:text-slate-200">不限量</span>
            </div>
            <ProgressThin v-if="trafficLimited" class="mt-1" :percentage="trafficPercentage" :status="resourceStatus(trafficPercentage)" :height="3" />
            <div v-if="trafficFootnote" data-node-traffic-note class="mt-1 break-words text-[8px] text-slate-500">
              {{ trafficFootnote }}
            </div>
          </div>
          <div data-node-connections-cell class="node-card-network-row node-card-network-conn flex min-w-0 items-center justify-between gap-2 px-2.5 py-1.5">
            <span class="text-slate-500">连接数</span>
            <span class="text-[10px] tabular-nums text-slate-700 dark:text-slate-200">TCP {{ Math.max(0, node.connections || 0) }}<span class="mx-1.5 text-slate-400">·</span>UDP {{ Math.max(0, node.connections_udp || 0) }}</span>
          </div>
        </div>
      </div>

      <NodeRoutePanel :tags="node.tags" />

      <NodeCardInsightPanel :node="node" />
    </div>

    <footer v-if="tags.length" data-node-tag-row class="pointer-events-none relative z-1 mt-2.5 flex min-w-0 items-center gap-1 overflow-hidden">
      <span v-for="tag in tags" :key="tag" class="transit-divider shrink-0 rounded-full border px-2 py-0.5 text-[9px] text-slate-500">
        {{ tag }}
      </span>
    </footer>

    <div v-if="!node.online" class="pointer-events-none absolute inset-0 z-2 grid place-items-center bg-slate-200/70 backdrop-blur-[1px] dark:bg-[#080c11]/55">
      <div class="rounded-lg border border-rose-500/20 bg-white/90 px-3 py-2 text-center dark:border-rose-400/20 dark:bg-[#11161d]">
        <div class="text-xs font-semibold text-rose-600 dark:text-rose-400">
          离线
        </div>
        <div class="mt-1 text-[9px] text-slate-500">
          {{ formatDateTime(node.time) }}
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.transit-node-card__header {
  background: transparent !important;
  border-bottom: 0 !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.transit-node-card {
  container-type: inline-size;
}

.transit-node-card__status-rail {
  position: absolute;
  z-index: 3;
  inset-block: 0;
  inset-inline-start: 0;
  width: 0.4375rem;
  pointer-events: none;
  background: var(--node-status-tone);
  box-shadow: inset -1px 0 0 rgb(255 255 255 / 0.18);
}

.node-card-name {
  display: -webkit-box;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.node-card-detail-grid {
  grid-template-columns: minmax(0, 1fr);
}

.node-card-cell {
  border: 1px solid var(--transit-divider);
  border-radius: 0.65rem;
  background: var(--transit-cell-bg);
}

/* 上行/下行/带宽/到期默认 2×2；只有在卡片本身很宽、且这一格独占整行时才摊成一排。
   `--full` 只说明这个节点没有回程数据，不代表容器很宽——不加宽度条件的话，窄卡上
   会得到四个五十几像素的窄列。 */
.node-card-network-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid var(--transit-divider);
}

.node-card-network-grid > div:nth-child(odd) {
  border-right: 1px solid var(--transit-divider);
}

.node-card-network-grid > div:nth-child(-n + 2) {
  border-bottom: 1px solid var(--transit-divider);
}

/* 整宽的行（流量、连接数）。用 div.xxx 把优先级抬到和 nth-child(odd) 一样，否则奇数位的行会多出一条右边框。 */
.node-card-network-grid > div.node-card-network-row {
  grid-column: 1 / -1;
  border-top: 1px solid var(--transit-divider);
  border-right: 0;
  border-bottom: 0;
}

/*
 * 两列：网络概览 | 三网回程，三网质量占满整行。
 * 三网质量是一整排采样格，挤进半列会读不出来，所以不像以前那样在宽卡上并成三列。
 */
@container (min-width: 22rem) {
  .node-card-detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  [data-node-insight-panel],
  .node-card-cell--full {
    grid-column: 1 / -1;
  }
}

/* 每格有两三行（速度+累计、带宽+变化日期），一格至少要 160px 左右才不折行，
   所以只有很宽的卡才摊成一排四格；平常的卡（370px 上下）保持 2×2。 */
@container (min-width: 40rem) {
  .node-card-cell--full .node-card-network-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .node-card-cell--full .node-card-network-grid > div {
    border-bottom: 0;
    border-right: 1px solid var(--transit-divider);
  }

  .node-card-cell--full .node-card-network-grid > div:last-child {
    border-right: 0;
  }

  .node-card-cell--full .node-card-network-grid > div:nth-child(4),
  .node-card-cell--full .node-card-network-grid > div.node-card-network-row {
    border-right: 0;
  }
}

@container (min-width: 35rem) {
  .node-card-detail-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  }
}

@container (max-width: 21rem) {
  .transit-node-card__header > div:first-child {
    gap: 0.5rem;
  }

  [data-node-resource-grid] {
    gap: 0.45rem;
  }

  [data-node-resource-value] {
    font-size: 0.5rem;
  }

  .node-card-cell {
    padding-inline: 0.6rem;
  }
}

.transit-node-card[data-transit-node-card-size='mini'] {
  padding: 0.75rem;
  padding-left: 1.375rem;
}

.transit-node-card[data-transit-node-card-size='mini'] [data-node-resource-grid] {
  gap: 0.55rem;
}

.transit-node-card[data-transit-node-card-size='mini'] footer {
  display: none;
}

.transit-node-card[data-transit-node-card-size='comfortable'] {
  padding: 1rem;
  padding-left: 1.625rem;
}

.transit-node-card[data-transit-node-card-size='large'] {
  padding: 1.1rem;
  padding-left: 1.75rem;
}
</style>
