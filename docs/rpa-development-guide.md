# XunDa RPA 开发需求指南（Simulation First）

## 1. 文档目的

本指南用于固化 `apps/frontend.rpa.simulation` 的当前开发基线，避免后续继续被旧文档误导。

当前以 simulation 为唯一开发主战场，目标机器人共 4 个：

1. 建联机器人
2. 样品管理机器人
3. 聊天机器人
4. 达人详情机器人

## 2. 当前开发边界

1. 开发阶段先在 `apps/frontend.rpa.simulation` 完成验证。
2. 本阶段不强制下沉到 `packages/frontend.desktop.shared`。
3. 功能稳定后再考虑抽象复用与 shared 化。
4. 新增代码、日志、文档统一使用 `XunDa` 命名，禁止新增 `INFound` / `Infound`。
5. 当前仍以终端命令和 IPC 投送为主，不强制补完整配置 UI。

说明：

1. 历史遗留第三方字段名、外部依赖名如不可变更，可保留原样。
2. 业务代码允许先落在 simulation，但必须尽量保持执行边界清晰。

## 3. 当前系统结构

当前实际结构已不再沿用旧的任务执行描述，而是：

1. `src/main/modules/ipc/rpa-controller.ts`
   - 任务入口
   - 默认配置
   - 顶层 `taskData`
2. `src/main/modules/rpa/task-dsl/*`
   - `BrowserTask`
   - `BrowserActionRunner`
   - 通用 `actionType`
3. `src/main/windows/tk-wcv.ts`
   - 页面承载
   - DOM 基础动作
   - 网络响应抓取
   - 结构化提取脚本执行
4. 机器人专属模块
   - `sample-management/crawler.ts`
   - `creator-detail/extractor.ts`

## 4. 四个机器人现状

| 机器人 | 当前状态 | 当前主要入口 |
| --- | --- | --- |
| 建联机器人 | 已完成筛选、搜索、滚动抓取、JSON/Excel/raw 导出 | `runSellerOutReach()` |
| 样品管理机器人 | 已切到 4 tab API 解析与 Excel 导出：`To review / Ready to ship / Shipped / In progress` | `sampleManagement()` |
| 聊天机器人 | 已完成单达人跳转、发送、发送校验、会话 md 记录 | `runSellerChatbot()` |
| 达人详情机器人 | 已完成详情页打开、DOM 结构化提取、JSON/Excel/md 导出 | `runSellerCreatorDetailCrawler()` |

## 5. 统一非功能要求

1. 可观测性：关键步骤必须有开始/成功/失败日志。
2. 可恢复性：失败必须有重试、错误信息和必要产物。
3. 可控性：避免同一任务重复并发启动。
4. 可审计性：任务结束后必须有结果文件或会话记录。
5. 安全性：敏感信息不写死在源码，不把高风险执行能力开放为任意脚本入口。

## 6. 四个机器人启动方法

启动命令统一总表见：

- [rpa-startup-reference.md](./rpa-startup-reference.md)

### 6.1 统一前置步骤

1. 启动应用：

```bash
cd apps/frontend.rpa.simulation
npx electron-vite dev --mode dev
```

2. 在终端里先执行：

```text
login
```

3. 登录成功后，系统会保留当前页面，不再自动跳转到 affiliate 首页。
4. 在 `login` 成功之前，不要执行建联、样品管理、聊天机器人、达人详情任务。
5. 任务触发以终端命令或 IPC 投送为主，不建议依赖显式界面按钮。

### 6.2 建联机器人启动方法

前提：

1. 必须先执行 `login` 并确认登录成功。

最简单启动：

```text
outreach
```

带 demo payload 启动：

```text
outreach-demo
```

带 JSON 启动：

```text
outreach-json docs/examples/outreach-demo-payload.json
```

建联任务示例：

```text
login
outreach-json docs/examples/outreach-demo-payload.json
```

对应示例 payload：

```json
{
  "creatorFilters": {
    "productCategorySelections": [
      "Home Supplies",
      "Beauty & Personal Care"
    ],
    "avgCommissionRate": "Less than 20%",
    "contentType": "Video",
    "creatorAgency": "Independent creators"
  },
  "followerFilters": {
    "followerAgeSelections": [
      "18 - 24",
      "25 - 34"
    ],
    "followerGender": "Female"
  },
  "performanceFilters": {
    "gmvSelections": [
      "MX$100-MX$1K"
    ],
    "itemsSoldSelections": [
      "10-100"
    ],
    "estPostRate": "Good"
  },
  "searchKeyword": "lipstick"
}
```

完整版本见：

`docs/examples/outreach-demo-payload.json`

### 6.3 样品管理机器人启动方法

前提：

1. 必须先执行 `login` 并确认登录成功。

当前执行 4 tab API 抓取：

```text
sample-management
```

如果只想先打开页面、不执行抓取：

```text
open-sample-management
```

说明：

1. 当前 `sample-management` 默认抓 `To review + Ready to ship + Shipped + In progress + Completed`。

### 6.4 聊天机器人启动方法

前提：

1. 必须先执行 `login` 并确认登录成功。

只给达人 id，使用默认消息：

```text
chatbot <creator_id>
```

示例：

```text
chatbot 7493999107359083121
```

带 demo payload 启动：

```text
chatbot-demo
```

带 JSON 启动：

```text
chatbot-json docs/examples/chatbot-demo-payload.json
```

### 6.5 达人详情机器人启动方法

前提：

1. 必须先执行 `login` 并确认登录成功。

只给达人 id：

```text
creator-detail <creator_id>
```

示例：

```text
creator-detail 7495400123324336701
```

带 demo payload 启动：

```text
creator-detail-demo
```

带 JSON 启动：

```text
creator-detail-json docs/examples/creator-detail-demo-payload.json
```

### 6.6 统一命令列表

运行 `frontend.rpa.simulation` 后，可通过终端命令触发：

1. `login`
2. `sample-management`
3. `open-sample-management`
4. `outreach`
5. `outreach-demo`
6. `outreach-json <payload.json>`
7. `chatbot <creator_id>`
8. `chatbot-demo`
9. `chatbot-json <payload.json>`
10. `creator-detail <creator_id>`
11. `creator-detail-demo`
12. `creator-detail-json <payload.json>`
13. `help`
14. `exit`

## 7. 当前开发原则

1. `RPAController` 负责入口和顶层任务声明，不负责底层 DOM 实现。
2. `task-dsl` 只承载通用浏览器动作和通用控件动作，不承载业务名词动作。
3. `TkWcv` 只承载页面执行能力，不承载业务编排。
4. 能抽成跨任务复用动作时，优先沉到 DSL。
5. 不能稳定复用、且强依赖页面结构的逻辑，允许先保留在机器人专属模块中。

## 8. 当前明确问题

1. 样品管理机器人当前主路径已切到 5 个 tab 的 API 解析，`Completed` 还会补抓 `sample/performance`，后续重点是继续补充字段变体与结构兼容。
2. `rpa-controller.ts` 已经偏大，后续新增机器人时必须控制继续膨胀。
3. `tk-wcv.ts` 目前承担职责较多，新增能力时必须优先判断是否真的应放进去。

## 9. 每个机器人的最低验收

### 9.1 建联机器人

1. 可触发。
2. 可完成筛选与搜索。
3. 可抓到达人结果并导出。
4. 有明确停止条件和采集日志。

### 9.2 样品管理机器人

1. 可触发。
2. 可稳定进入目标页。
3. 当前可跑完 5 个 tab 的 API 抓取与分页，`Completed` 额外补 `content_summary`。
4. 可输出 Excel。

### 9.3 聊天机器人

1. 可触发。
2. 可跳转 IM 页。
3. 可发送消息。
4. 可通过“最新一条商家消息”校验发送。
5. 可输出会话 md。

### 9.4 达人详情机器人

1. 可触发。
2. 可跳转详情页。
3. 可等待 `Creator details`。
4. 可提取核心字段、列表字段和图例字段。
5. 可输出 JSON、Excel、session md。

## 10. 开发完成定义（DoD）

每个模块完成时至少满足：

1. 入口可触发，主链路可跑通。
2. 有日志，失败可定位。
3. 不新增硬编码敏感信息。
4. 文档同步更新。
5. 至少保留一条成功产物样式定义。

## 11. 后续重构优先级

1. 优先继续收紧样品管理 5 个 tab 的字段兼容、`Completed` 内容抓取与异常页处理。
2. 再收紧达人详情中易漂移的 DOM 映射。
3. 最后再考虑把稳定通用能力下沉到 shared。
