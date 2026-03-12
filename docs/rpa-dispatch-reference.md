# RPA 投送与启动参考

启动命令统一总表见：

- [rpa-startup-reference.md](./rpa-startup-reference.md)

## 目的

这份文档只记录两类内容：

1. 如何启动 `frontend.rpa.simulation`
2. 如何用“投送指令”的方式触发四个机器人

实现细节仍然看：

1. [rpa-outreach-implementation.md](./rpa-outreach-implementation.md)
2. [rpa-chatbot-implementation.md](./rpa-chatbot-implementation.md)
3. [rpa-creator-detail-implementation.md](./rpa-creator-detail-implementation.md)
4. [rpa-sample-management-implementation.md](./rpa-sample-management-implementation.md)

## 前置条件

1. 已安装依赖
2. 已启动 `frontend.rpa.simulation`
3. 已先执行店铺登录，且确认登录成功
4. TikTok 店铺区域可正常识别

强制约束：

1. 建联机器人必须先登录成功。
2. 样品管理机器人必须先登录成功。
3. 聊天机器人必须先登录成功。
4. 达人详情机器人也必须先登录成功。
5. 当前不推荐通过显式界面按钮触发任务，统一走终端命令或 IPC 投送。

## 启动应用

当前 `apps/frontend.rpa.simulation/package.json` 里的 `dev` 脚本包含 Windows 的 `chcp 65001`，在 macOS 终端下不可用。

在当前开发环境里，建议用下面的方式启动：

```bash
cd apps/frontend.rpa.simulation
npx electron-vite dev --mode dev
```

类型检查：

```bash
cd apps/frontend.rpa.simulation
npm run typecheck
```

## 建议的统一测试顺序

1. 启动应用
2. 先登录店铺
3. 确认店铺区域正确
4. 再投送对应机器人指令

## 四个机器人启动方法

### 1. 建联机器人

终端最小启动：

```text
login
outreach
```

终端 demo：

```text
login
outreach-demo
```

终端 JSON：

```text
login
outreach-json docs/examples/outreach-demo-payload.json
```

IPC：

```ts
window.ipc.send(IPC_CHANNELS.RPA_SELLER_OUT_REACH, payload)
```

建联任务示例：

```text
login
outreach-json docs/examples/outreach-demo-payload.json
```

最小示例 payload：

```json
{
  "creatorFilters": {
    "productCategorySelections": [
      "Home Supplies"
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

完整示例文件：

`docs/examples/outreach-demo-payload.json`

### 2. 样品管理机器人

终端最小启动：

```text
login
sample-management
```

如果现在要执行样品管理当前的 4 tab API 抓取：

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

1. 样品管理当前没有单独 JSON payload 投送入口。
2. 当前主要通过终端命令触发。
3. 当前 `sample-management` 默认抓 `To review + Ready to ship + Shipped + In progress + Completed`。

### 3. 聊天机器人

终端最小启动：

```text
login
chatbot <creator_id>
```

示例：

```text
login
chatbot 7493999107359083121
```

终端 demo：

```text
login
chatbot-demo
```

终端 JSON：

```text
login
chatbot-json docs/examples/chatbot-demo-payload.json
```

IPC：

```ts
window.ipc.send(IPC_CHANNELS.RPA_SELLER_CHATBOT, payload)
```

### 4. 达人详情机器人

终端最小启动：

```text
login
creator-detail <creator_id>
```

示例：

```text
login
creator-detail 7495400123324336701
```

终端 demo：

```text
login
creator-detail-demo
```

终端 JSON：

```text
login
creator-detail-json docs/examples/creator-detail-demo-payload.json
```

IPC：

```ts
window.ipc.send(IPC_CHANNELS.RPA_SELLER_CREATOR_DETAIL, payload)
```

## 界面按钮说明

当前界面只保留最小登录入口：

1. `登录店铺`

说明：

1. 其他机器人任务不再推荐通过显式按钮触发。
2. 建联、样品管理、聊天机器人、达人详情统一使用终端命令或 IPC。

## 启动方式二：终端命令

开发模式下，主进程会开启终端命令行：

```text
xunda-rpa>
```

可用命令：

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
help
exit
```

推荐测试顺序：

```text
login
outreach-demo
```

如果要投送 JSON 文件：

```text
outreach-json docs/examples/outreach-demo-payload.json
```

聊天机器人推荐测试顺序：

```text
login
chatbot-demo
```

如果只给达人 id，系统会使用默认消息：

```text
chatbot 7493999107359083121
```

如果要投送聊天 JSON：

```text
chatbot-json docs/examples/chatbot-demo-payload.json
```

达人详情机器人推荐测试顺序：

```text
login
creator-detail-demo
```

如果只给达人 id：

```text
creator-detail 7495400123324336701
```

如果现在要抓取达人 `7494007128896931516`：

```text
login
creator-detail 7494007128896931516
```

如果要投送详情 JSON：

```text
creator-detail-json docs/examples/creator-detail-demo-payload.json
```

## 启动方式三：渲染进程 IPC 投送

建联通道：

```ts
IPC_CHANNELS.RPA_SELLER_OUT_REACH
```

发送方式：

```ts
window.ipc.send(IPC_CHANNELS.RPA_SELLER_OUT_REACH, payload)
```

其中 `payload` 类型为：

```ts
OutreachFilterConfigInput
```

聊天机器人通道：

```ts
IPC_CHANNELS.RPA_SELLER_CHATBOT
```

发送方式：

```ts
window.ipc.send(IPC_CHANNELS.RPA_SELLER_CHATBOT, payload)
```

其中 `payload` 类型为：

```ts
SellerChatbotPayloadInput
```

达人详情通道：

```ts
IPC_CHANNELS.RPA_SELLER_CREATOR_DETAIL
```

发送方式：

```ts
window.ipc.send(IPC_CHANNELS.RPA_SELLER_CREATOR_DETAIL, payload)
```

其中 `payload` 类型为：

```ts
SellerCreatorDetailPayloadInput
```

## 完整测试 payload 示例

当前仓库已经放了一份完整参考：

`docs/examples/outreach-demo-payload.json`

示例内容如下：

```json
{
  "creatorFilters": {
    "productCategorySelections": [
      "Home Supplies",
      "Beauty & Personal Care",
      "Phones & Electronics"
    ],
    "avgCommissionRate": "Less than 20%",
    "contentType": "Video",
    "creatorAgency": "Independent creators",
    "spotlightCreator": true,
    "fastGrowing": true,
    "notInvitedInPast90Days": true
  },
  "followerFilters": {
    "followerAgeSelections": [
      "18 - 24",
      "25 - 34"
    ],
    "followerGender": "Female",
    "followerCountMin": "10000",
    "followerCountMax": "200000"
  },
  "performanceFilters": {
    "gmvSelections": [
      "MX$100-MX$1K",
      "MX$1K-MX$10K"
    ],
    "itemsSoldSelections": [
      "10-100",
      "100-1K"
    ],
    "averageViewsPerVideoMin": "1000",
    "averageViewsPerVideoShoppableVideosOnly": true,
    "averageViewersPerLiveMin": "300",
    "averageViewersPerLiveShoppableLiveOnly": true,
    "engagementRateMinPercent": "5",
    "engagementRateShoppableVideosOnly": true,
    "estPostRate": "Good",
    "brandCollaborationSelections": [
      "L'OREAL PROFESSIONNEL",
      "Maybelline New York",
      "NYX Professional Makeup"
    ]
  },
  "searchKeyword": "lipstick"
}
```

## 示例 payload 的测试目的

这份 demo payload 尽量覆盖了当前已实现的搜索条件：

1. `Creators`
   - 多选类目
   - 单选 commission
   - 单选 content type
   - 单选 creator agency
   - 3 个布尔 checkbox

2. `Followers`
   - 多选年龄
   - 单选性别
   - 区间 follower count

3. `Performance`
   - 多选 GMV
   - 多选 Items sold
   - 3 个 threshold 输入
   - 3 个附加 checkbox
   - 单选 Est. post rate
   - 多选 Brand collaborations

4. 最后搜索框
   - `searchKeyword = "lipstick"`

## 注意事项

1. `shop_region` 不是通过 payload 指定，而是从当前登录店铺自动解析
2. `Brand collaborations` 走文本匹配，如果页面当前品牌列表里没有对应项，会跳过该品牌并继续执行后续搜索与抓取
3. payload 允许只传局部字段，未传部分会回退到默认值
4. 空的 `searchKeyword` 不会跳过最后一步；系统会提交一次空搜索，用于触发最终结果集刷新和达人列表采集
5. 建联任务执行完成后，会额外输出两份达人采集文件：
   - `data/outreach/creator_marketplace_<timestamp>.json`
   - `data/outreach/creator_marketplace_raw_<timestamp>.json`

## 聊天机器人 payload 示例

当前仓库也放了一份聊天机器人参考：

`docs/examples/chatbot-demo-payload.json`

示例内容如下：

```json
{
  "creatorId": "7493999107359083121",
  "message": "Hola 😊\n\nSoy Natalie Cueto, Social Media Partnership Specialist de GOKOCO México.\nEstamos buscando creadores con un estilo auténtico para colaborar con nosotros en contenido de cuidado personal y belleza inteligente.\n\nNos encantaría enviarte uno de nuestros productos para que lo pruebes y, si te gusta, compartir tu experiencia con tu comunidad.\nAdemás, la colaboración incluye comisión por cada venta generada a través de tus recomendaciones.\n\nSi te interesa, con gusto te comparto más detalles.\nQuedo atenta."
}
```

## 聊天机器人注意事项

1. `shop_region` 仍然不是 payload 传入，而是从当前登录店铺自动解析。
2. 聊天任务会把发送前后的聊天内容落到：
   - `data/chatbot/seller_chatbot_session_<timestamp>.md`
3. 当前一次只支持一个 `creatorId`。
4. `message` 允许不传；不传时回退到主进程内置默认消息。
5. 当前发送成功判断规则是：读取聊天区中最下面一条商家消息，并与本次发送内容比对；最多重试 3 次。

## 达人详情机器人 payload 示例

当前仓库也放了一份达人详情机器人的参考：

`docs/examples/creator-detail-demo-payload.json`

示例内容如下：

```json
{
  "creatorId": "7495400123324336701"
}
```

## 达人详情机器人注意事项

1. `shop_region` 仍然从当前登录店铺自动解析。
2. 当前版本在详情页加载完成后，会直接抓取详情页 DOM 中的达人资料、指标卡、图例分布、视频列表和相关达人。
3. 当前执行完成后会输出：
   - `data/creator-detail/seller_creator_detail_<creator_id>_<timestamp>.json`
   - `data/creator-detail/seller_creator_detail_<creator_id>_<timestamp>.xlsx`
   - `data/creator-detail/seller_creator_detail_session_<timestamp>.md`
