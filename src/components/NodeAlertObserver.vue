<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import type { NodeAlert } from '@/utils/nodeAlert'
import { computed, onBeforeUnmount, watch } from 'vue'
import { reportNodeAlert, resetNodeAlert, suppressNodeAlert } from '@/composables/useNodeAlertState'
import { useNodeCarrierPingDisplay } from '@/composables/useNodeCarrierPingDisplay'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { getPrimaryNodeAlert } from '@/utils/nodeAlert'
import { resolveNodeCardPanelMode } from '@/utils/nodeCardPanel'
import { findTrafficPool, getTrafficPoolUsage } from '@/utils/trafficPool'

const props = defineProps<{ node: NodeData }>()
const appStore = useAppStore()
const nodesStore = useNodesStore()
const { carrierDisplays, carrierScopeLabel, loading: carrierStatsLoading } = useNodeCarrierPingDisplay(() => props.node.uuid)
const isMaintenance = computed(() => Boolean(appStore.nodeControls[props.node.uuid]?.maintenanceUntil))
// 与卡片面板（NodeCardInsightPanel）同一套判定，保证"卡片显示什么"和"按什么告警"一致。
const panelMode = computed(() => resolveNodeCardPanelMode(
  props.node,
  appStore.nodeCardPanels[props.node.uuid] ?? { mode: appStore.nodeCardPanelDefault },
  carrierDisplays.value.some(carrier => carrier.taskNames.length > 0),
  carrierStatsLoading.value,
))
// 共用流量组按整组合计告警，和卡片流量一行一致。
const poolTraffic = computed(() => {
  const pool = findTrafficPool(appStore.trafficPools, props.node.uuid)
  return pool ? getTrafficPoolUsage(pool, nodesStore.nodesByUuid) : null
})
const candidate = computed<NodeAlert | null>(() => isMaintenance.value
  ? null
  : getPrimaryNodeAlert(props.node, carrierDisplays.value, carrierScopeLabel.value, panelMode.value, poolTraffic.value))
const sampleToken = computed(() => {
  const carrierToken = carrierDisplays.value
    .map(carrier => carrier.latencyBars.at(-1)?.key ?? `${carrier.key}:empty`)
    .join('|')
  return `${props.node.time}|${candidate.value?.key ?? 'healthy'}|${candidate.value?.detail ?? ''}|${carrierToken}|maintenance:${isMaintenance.value}`
})

watch(
  [candidate, sampleToken, isMaintenance],
  ([alert, token, maintenance]) => maintenance
    ? suppressNodeAlert(props.node.uuid)
    : reportNodeAlert(props.node.uuid, alert, token),
  { immediate: true },
)

onBeforeUnmount(() => resetNodeAlert(props.node.uuid))
</script>

<template>
  <span class="hidden" aria-hidden="true" />
</template>
