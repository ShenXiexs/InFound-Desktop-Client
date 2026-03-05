<script lang="ts" setup>
import { reactive } from 'vue'
import { IPC_CHANNELS } from '@common/types/ipc-type'
import { rendererStore } from '@renderer/store/renderer-store'
import { AppState } from '@infound/desktop-shared'

const globalState: AppState = rendererStore.currentState
const logo = globalState.appSetting.resourcesPath + '/logo.png'
const version = globalState.appInfo.version

const progressModel = reactive({
  percent: 0,
  status: '启动中...'
})

window.ipc.on(IPC_CHANNELS.RENDERER_MONITOR_APP_SPLASH_WINDOW_STATE_SYNC, (data: { percent: number; status: string }) => {
  progressModel.percent = data.percent
  progressModel.status = data.status
})
</script>

<template>
  <n-config-provider :theme="null">
    <n-global-style />
    <n-message-provider>
      <n-flex align="center" justify="center" style="height: 100vh; width: 100%" vertical>
        <n-image :src="logo" height="160" preview-disabled />
        <n-h2>v{{ version }}</n-h2>
        <n-text>{{ progressModel.status }}</n-text>
        <n-progress :percentage="progressModel.percent" :show-indicator="false" style="width: 400px" type="line" />
      </n-flex>
    </n-message-provider>
  </n-config-provider>
</template>

<style lang="scss" scoped></style>
