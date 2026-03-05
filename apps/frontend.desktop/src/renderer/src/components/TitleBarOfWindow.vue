<script lang="ts" setup>
import { ref } from 'vue'
import { IPC_CHANNELS } from '@common/types/ipc-type'
import { rendererStore } from '@renderer/store/renderer-store'
import { AppState } from '@infound/desktop-shared'

const globalState: AppState = rendererStore.currentState
const icon = globalState.appSetting.resourcesPath + '/icon.png'
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
</script>

<template>
  <n-layout-header class="header">
    <div class="header-left">
      <n-avatar :src="icon" size="small" style="background-color: transparent" />
      <span class="header-title">寻达</span>
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
      font-size: 16px;
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
