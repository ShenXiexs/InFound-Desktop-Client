# XunDa RPA 启动总表

## 1. 目的

这份文档只保留一类信息：

1. 如何启动 `frontend.rpa.simulation`
2. 如何登录
3. 四个机器人的直接启动命令
4. 常用 demo / JSON 示例命令

实现细节、字段说明、DOM 规则分别看各机器人实现文档。

## 2. 启动应用

在项目根目录执行：

```bash
cd apps/frontend.rpa.simulation
npx electron-vite dev --mode dev
```

类型检查：

```bash
cd apps/frontend.rpa.simulation
npm run typecheck
```

## 3. 登录前置

所有机器人都必须先登录成功。

终端执行：

```text
login
```

登录成功后的当前行为：

1. 系统会记录登录态和 `shop_region`
2. 页面保持当前页，不再自动跳到 affiliate 首页
3. 后续任务会自己跳到目标页面

建议以这条日志作为登录成功标志：

```text
已记录登录态与店铺区域: shop_region=<region>，等待后续任务指令
```

## 4. 建联机器人

最小启动：

```text
login
outreach
```

demo：

```text
login
outreach-demo
```

JSON：

```text
login
outreach-json docs/examples/outreach-demo-payload.json
```

## 5. 样品管理机器人

当前 4 tab API 抓取：

```text
login
sample-management
```

只打开页面：

```text
login
open-sample-management
```

说明：

1. 样品管理当前没有单独的 JSON payload 启动命令
2. 当前 `sample-management` 默认抓 `To review + Ready to ship + Shipped + In progress + Completed`

## 6. 聊天机器人

最小启动：

```text
login
chatbot <creator_id>
```

示例：

```text
login
chatbot 7493999107359083121
```

demo：

```text
login
chatbot-demo
```

JSON：

```text
login
chatbot-json docs/examples/chatbot-demo-payload.json
```

自定义消息示例：

```text
login
chatbot-json docs/examples/chatbot-halo-payload.json
```

## 7. 达人详情机器人

最小启动：

```text
login
creator-detail <creator_id>
```

示例：

```text
login
creator-detail 7494007128896931516
```

demo：

```text
login
creator-detail-demo
```

JSON：

```text
login
creator-detail-json docs/examples/creator-detail-demo-payload.json
```

## 8. 常用完整顺序

### 8.1 建联

```text
login
outreach-json docs/examples/outreach-demo-payload.json
```

其他常用建联写法：

```text
login
outreach
```

```text
login
outreach-demo
```

### 8.2 样品管理

```text
login
sample-management
```

当前含义：抓取 `To review + Ready to ship + Shipped + In progress + Completed` 的 API 数据并导出 Excel。

```text
login
open-sample-management
```

### 8.3 聊天

```text
login
chatbot-json docs/examples/chatbot-demo-payload.json
```

```text
login
chatbot 7493999107359083121
```

```text
login
chatbot-json docs/examples/chatbot-halo-payload.json
```

### 8.4 达人详情

```text
login
creator-detail 7494007128896931516
```

```text
login
creator-detail-demo
```

```text
login
creator-detail-json docs/examples/creator-detail-demo-payload.json
```

## 9. 命令示例速查

下面这些命令都在应用启动后，输入到 `xunda-rpa>` 提示符里。

### 9.1 建联机器人

```text
login
outreach
```

```text
login
outreach-demo
```

```text
login
outreach-json docs/examples/outreach-demo-payload.json
```

### 9.2 样品管理机器人

```text
login
sample-management
```

```text
login
open-sample-management
```

### 9.3 聊天机器人

```text
login
chatbot 7493999107359083121
```

```text
login
chatbot-demo
```

```text
login
chatbot-json docs/examples/chatbot-demo-payload.json
```

```text
login
chatbot-json docs/examples/chatbot-halo-payload.json
```

### 9.4 达人详情机器人

```text
login
creator-detail 7494007128896931516
```

```text
login
creator-detail-demo
```

```text
login
creator-detail-json docs/examples/creator-detail-demo-payload.json
```

## 10. 示例文件

1. 建联：`docs/examples/outreach-demo-payload.json`
2. 聊天：`docs/examples/chatbot-demo-payload.json`
3. 聊天自定义：`docs/examples/chatbot-halo-payload.json`
4. 达人详情：`docs/examples/creator-detail-demo-payload.json`

## 11. 可用终端命令总览

```text
login
sample-management
open-sample-management
outreach
outreach-demo
outreach-json <payload.json>
chatbot <creator_id>
chatbot-demo
chatbot-json <payload.json>
creator-detail <creator_id>
creator-detail-demo
creator-detail-json <payload.json>
```
