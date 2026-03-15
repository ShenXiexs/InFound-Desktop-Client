# XunDa RPA 启动总表

## 1. 目的

这份文档只记录 `apps/frontend.rpa.simulation` 当前唯一有效的机器人启动模型：

1. 先启动一个常驻 Playwright 会话
2. 会话启动后保持待命，不自动执行机器人
3. 后续再单独投送建联、样品管理、聊天机器人、达人详情任务

参考文档：

- [rpa-dispatch-reference.md](./rpa-dispatch-reference.md)
- [rpa-development-guide.md](./rpa-development-guide.md)
- [rpa-outreach-implementation.md](./rpa-outreach-implementation.md)
- [rpa-sample-management-implementation.md](./rpa-sample-management-implementation.md)
- [rpa-chatbot-implementation.md](./rpa-chatbot-implementation.md)
- [rpa-creator-detail-implementation.md](./rpa-creator-detail-implementation.md)
- [rpa-playwright-simulation-plan.md](./rpa-playwright-simulation-plan.md)
- [../apps/frontend.rpa.simulation/rpa-playwright-simulation-plan.md](../apps/frontend.rpa.simulation/rpa-playwright-simulation-plan.md)

## 2. 当前是否已实现

当前 `frontend.rpa.simulation` 中的 4 个机器人已经接到 Playwright 会话链路：

1. `RPA_EXECUTE_SIMULATION` 只负责启动 Playwright 会话
2. `RPA_SELLER_OUT_REACH` 只负责向已启动会话投送建联任务
3. `RPA_SAMPLE_MANAGEMENT` 只负责向已启动会话投送样品管理任务
4. `RPA_SELLER_CHATBOT` 只负责向已启动会话投送聊天任务
5. `RPA_SELLER_CREATOR_DETAIL` 只负责向已启动会话投送达人详情任务

旧 Electron 机器人执行路径已从 `frontend.rpa.simulation` 主链移除；当前保留 Electron 的只有 `登录店铺` 用于登录态准备。

## 3. 启动应用

```bash
cd apps/frontend.rpa.simulation
npx electron-vite dev --mode dev
```

类型检查：

```bash
cd apps/frontend.rpa.simulation
npm run typecheck
```

## 4. 启动前置

当前 Playwright 会话默认会尝试使用：

```text
data/playwright/storage-state.json
```

说明：

1. 当前不自动桥接 Electron 登录态到 Playwright
2. `登录店铺` 不会启动机器人
3. `启动RPA模拟` 只会启动 Playwright 浏览器并待命
4. 如果 `storage-state.json` 存在，会直接带登录态进入 affiliate 首页
5. 如果 `storage-state.json` 不存在，不再报错；会直接打开登录页面等待手动操作
6. 如果请求无头启动但又找不到 `storage-state.json`，会自动切回有头模式

## 5. 如何启动 Playwright 会话

### 5.1 界面按钮

在 `frontend.rpa.simulation` 中点击：

- `启动RPA模拟`

当前行为：

1. 启动一个 Playwright Chromium 会话
2. 默认 `headless = false`，也就是默认有头
3. 如果存在 `storage-state.json`，会打开并停留在：
   - `https://affiliate.tiktok.com/platform/homepage?shop_region=<region>`
4. 如果不存在 `storage-state.json`，会打开：
   - `https://seller-mx.tiktok.com/`
   并等待手动登录
5. 会话保持待命，不自动执行任何机器人

### 5.2 IPC 启动

```ts
window.ipc.send(IPC_CHANNELS.RPA_EXECUTE_SIMULATION)
```

自定义启动 payload：

```ts
window.ipc.send(IPC_CHANNELS.RPA_EXECUTE_SIMULATION, {
  region: 'MX',
  headless: false,
  storageStatePath: 'data/playwright/storage-state.json'
})
```

当前 payload 结构：

```ts
{
  region?: string
  headless?: boolean
  storageStatePath?: string
}
```

默认值：

1. `region = 'MX'`
2. `headless = false`
3. `storageStatePath = 'data/playwright/storage-state.json'`

完整示例：

- `docs/examples/playwright-simulation-demo-payload.json`

### 5.3 终端启动

当前终端命令也遵守同一套模型：

```bash
start-simulation
start-simulation-headless
start-simulation-json docs/examples/playwright-simulation-demo-payload.json
```

## 6. 启动后如何投送任务

Playwright 会话启动完成后，再投送单独任务指令。

### 6.1 建联

```ts
window.ipc.send(IPC_CHANNELS.RPA_SELLER_OUT_REACH)
```

或带自定义 payload：

```ts
window.ipc.send(IPC_CHANNELS.RPA_SELLER_OUT_REACH, outreachPayload)
```

### 6.2 样品管理

```ts
window.ipc.send(IPC_CHANNELS.RPA_SAMPLE_MANAGEMENT)
```

页面默认会先落在 `To review`；如果指定了其他 tab，运行时会从默认页点击切过去再抓。

指定单个 tab：

```ts
window.ipc.send(IPC_CHANNELS.RPA_SAMPLE_MANAGEMENT, {
  tab: 'completed'
})
```

指定多个 tab：

```ts
window.ipc.send(IPC_CHANNELS.RPA_SAMPLE_MANAGEMENT, {
  tabs: ['to_review', 'completed']
})
```

终端写法：

```bash
sample-management
sample-management completed
sample-management to_review,completed
sample-management-json docs/examples/sample-management-completed-payload.json
```

### 6.3 聊天机器人

```ts
window.ipc.send(IPC_CHANNELS.RPA_SELLER_CHATBOT, {
  creatorId: '7493999107359083121',
  message: 'halo'
})
```

### 6.4 达人详情

```ts
window.ipc.send(IPC_CHANNELS.RPA_SELLER_CREATOR_DETAIL, {
  creatorId: '7495400123324336701'
})
```

## 7. 页面跳转是否和之前 Electron 一致

是。任务真正执行时，Playwright 会跳到和之前 Electron 机器人相同的业务页面：

1. 建联：`https://affiliate.tiktok.com/connection/creator?shop_region=<region>`
2. 样品管理：`https://affiliate.tiktok.com/product/sample-request?shop_region=<region>`
3. 聊天：`https://affiliate.tiktok.com/seller/im?creator_id=<creator_id>&shop_region=<region>`
4. 达人详情：`https://affiliate.tiktok.com/connection/creator/detail?cid=<creator_id>&shop_region=<region>`

区别只在于：

1. 现在这些页面跳转发生在已启动的 Playwright 会话里
2. 启动会话本身不会自动串行跑四个机器人

## 8. 当前边界

1. 当前所有机器人只允许走 Playwright 会话，不准走旧 Electron 机器人路径
2. 当前没有“启动会话后自动串行执行四个机器人”的入口
3. 当前如果未先启动 Playwright 会话就直接投送任务，会直接报错
