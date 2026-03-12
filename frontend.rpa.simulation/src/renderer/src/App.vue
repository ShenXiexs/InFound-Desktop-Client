<script lang="ts" setup>
import { ref } from 'vue'
import { darkTheme, dateZhCN, zhCN } from 'naive-ui'
import { IPC_CHANNELS } from '@common/types/ipc-type'

const isMaximized = ref(false)

const onMinimize = (): void => {
  window.ipc.send(IPC_CHANNELS.APP_MINIMIZED)
}

const onMaximize = async (): Promise<void> => {
  const result = await window.ipc.invoke(IPC_CHANNELS.APP_MAXIMIZED)
  if (result.success) {
    isMaximized.value = result.isMaximized
  }
}

const onClose = (): void => {
  window.ipc.send(IPC_CHANNELS.APP_CLOSED)
}

const onOpenDevTools = (): void => {
  window.ipc.send(IPC_CHANNELS.APP_OPEN_WINDOW_DEV_TOOLS, 'undocked')
}

const onOpenSubDevTools = (): void => {
  window.ipc.send(IPC_CHANNELS.APP_OPEN_SUB_WINDOW_DEV_TOOLS, 'undocked')
}

const loginRPA = (): void => {
  window.logger.info('开始登录店铺')
  window.ipc.send(IPC_CHANNELS.RPA_SELLER_LOGIN)
}
</script>

<template>
  <n-config-provider :date-locale="dateZhCN" :locale="zhCN" :theme="darkTheme" :theme-overrides="{ common: { fontWeightStrong: '600' } }">
    <n-global-style />
    <n-message-provider>
      <n-layout>
        <n-layout-header class="header">
          <div class="header-left">
            <span class="header-title">寻达 RPA 模拟器</span>
          </div>
          <div class="header-right">
            <n-button :focusable="false" circle quaternary @click="onOpenDevTools">
              <template #icon>
                <n-icon>
                  <i-hugeicons-code-simple />
                </n-icon>
              </template>
            </n-button>
            <n-button :focusable="false" circle quaternary @click="onOpenSubDevTools">
              <template #icon>
                <n-icon>
                  <i-hugeicons-source-code />
                </n-icon>
              </template>
            </n-button>
            <n-button :focusable="false" circle quaternary @click="onMinimize">
              <template #icon>
                <n-icon>
                  <i-hugeicons-minus-sign />
                </n-icon>
              </template>
            </n-button>
            <n-button :focusable="false" circle quaternary @click="onMaximize">
              <template #icon>
                <n-icon>
                  <i-hugeicons-full-screen v-if="!isMaximized" />
                  <i-hugeicons-arrow-shrink v-if="isMaximized" />
                </n-icon>
              </template>
            </n-button>
            <n-button :focusable="false" circle quaternary @click="onClose">
              <template #icon>
                <n-icon>
                  <i-hugeicons-cancel-01 />
                </n-icon>
              </template>
            </n-button>
          </div>
        </n-layout-header>
        <n-layout-content>
          <n-flex vertical style="padding: 20px; gap: 16px">
            <n-button @click="loginRPA">登录店铺</n-button>
            <n-alert type="info" title="任务触发方式">
              建联、样品管理、聊天机器人、达人详情任务统一通过终端命令或 IPC 投送触发。
              请先完成登录，再执行任何机器人任务。
            </n-alert>
          </n-flex>
        </n-layout-content>
      </n-layout>
    </n-message-provider>
  </n-config-provider>
</template>

<style lang="scss" scoped>
.header {
  -webkit-app-region: drag; // 允许拖拽窗口
  height: 40px;
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e5e7eb;
  z-index: 10;

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;

    .header-title {
      font-size: 18px;
      font-weight: 600;
    }
  }

  .header-right {
    -webkit-app-region: no-drag;
    display: flex;
    align-items: center;
    gap: 16px;
  }
}
</style>
const outreachDemoPayload: OutreachFilterConfigInput = {
  creatorFilters: {
    productCategorySelections: ['Home Supplies', 'Beauty & Personal Care', 'Phones & Electronics'],
    avgCommissionRate: 'Less than 20%',
    contentType: 'Video',
    creatorAgency: 'Independent creators',
    spotlightCreator: true,
    fastGrowing: true,
    notInvitedInPast90Days: true
  },
  followerFilters: {
    followerAgeSelections: ['18 - 24', '25 - 34'],
    followerGender: 'Female',
    followerCountMin: '10000',
    followerCountMax: '200000'
  },
  performanceFilters: {
    gmvSelections: ['MX$100-MX$1K', 'MX$1K-MX$10K'],
    itemsSoldSelections: ['10-100', '100-1K'],
    averageViewsPerVideoMin: '1000',
    averageViewsPerVideoShoppableVideosOnly: true,
    averageViewersPerLiveMin: '300',
    averageViewersPerLiveShoppableLiveOnly: true,
    engagementRateMinPercent: '5',
    engagementRateShoppableVideosOnly: true,
    estPostRate: 'Good',
    brandCollaborationSelections: ['L\'Oréal Paris', 'Maybelline New York', 'NYX Professional Makeup']
  },
  searchKeyword: 'lipstick'
}
