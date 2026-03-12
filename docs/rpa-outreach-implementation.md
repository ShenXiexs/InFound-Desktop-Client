# XunDa RPA 建联任务实现说明

启动命令统一见：

- [rpa-startup-reference.md](./rpa-startup-reference.md)

运行方式、投送 payload 和测试示例见 [rpa-dispatch-reference.md](./rpa-dispatch-reference.md)。

## 1. 本次实现范围

当前先实现建联任务第一阶段（页面链路 + Creator/Follower/Performance 筛选）：

1. 完成登录后，只需确认已检测到登录成功，不要求停留在 affiliate 首页。
2. 读取当前 URL 中的 `shop_region`（例如 `MX`）。
3. 自动跳转到建联页面：
   - `https://affiliate.tiktok.com/connection/creator?shop_region=<region>`
4. 进入 `Creators` 板块后，按顺序完成筛选：
   - `Product category`（多选，按顺序勾选后点击该大项本身关闭下拉；面板内支持滚动查找）
   - `Avg. commission rate`（单选，选中后点击 `Find creators` 文本区域关闭下拉）
   - `Content type`（单选，选中后点击 `Find creators` 文本区域关闭下拉）
   - `Creator agency`（单选，选中后点击 `Find creators` 文本区域关闭下拉）
   - `Spotlight Creator`（可选复选）
   - `Fast growing`（可选复选）
   - `Not invited in past 90 days`（可选复选）
5. 进入 `Followers` 板块后，按顺序完成筛选：
   - `Follower age`（多选，按顺序勾选后点击 `Find creators` 文本区域关闭下拉）
   - `Follower gender`（单选，选中后点击 `Find creators` 文本区域关闭下拉）
   - `Follower count`（输入下限与上限后点击 `Find creators` 文本区域关闭下拉）
6. 进入 `Performance` 板块后，按顺序完成筛选：
   - `GMV`（多选，按顺序勾选后点击 `Find creators` 文本区域关闭下拉）
   - `Items sold`（多选，按顺序勾选后点击 `Find creators` 文本区域关闭下拉）
   - `Average views per video`（输入最小值，可选勾选 `Filter by shoppable videos`，随后关闭）
   - `Average viewers per LIVE`（输入最小值，可选勾选 `Filter by shoppable LIVE streams`，随后关闭）
   - `Engagement rate`（输入最小百分比，可选勾选 `Filter by shoppable videos`，随后关闭）
   - `Est. post rate`（单选，选中后点击 `Find creators` 文本区域关闭下拉）
   - `Brand collaborations`（多选，按品牌名精确匹配并自动滚动到可点击区域；页面当前不存在的品牌会跳过）
7. 全部筛选完成后，先启动匹配 `POST /api/v1/oec/affiliate/creator/marketplace/find` 的 JSON 响应捕获，再向顶部搜索框提交最终搜索：
   - 搜索框 selector：`input[data-tid="m4b_input_search"]`
   - 当前实现使用通用 `startJsonResponseCapture(method="POST") + fillSelector + clickSelector + pressKey`
8. 搜索提交后，额外等待数秒拿到首批达人，再在 `#modern_sub_app_container_connection` 容器中持续下划页面。
9. 停止条件以网络响应为主：
   - 每次都把 `#modern_sub_app_container_connection` 直接下划到底
   - 每次下划后都等待一段时间，观察是否有新的 `find` 响应返回
   - 连续 3 次下划都没有新的 `find` 响应，才认为真的没有更多达人
   - 如果最新响应中的 `next_pagination.has_more = false`，则提前停止
10. 采集所有 `creator/marketplace/find` 响应中的 `creator_profile_list`，提取并导出：
   - `creator_id = creator_oecuid.value`
   - `avatar_url = avatar.value.thumb_url_list[0]`
   - `category = category.value[].name` 用 `,` 拼接
   - `creator_name = handle.value`
11. 导出文件写入：
   - `data/outreach/creator_marketplace_<timestamp>.xlsx`
   - `data/outreach/creator_marketplace_<timestamp>.json`
   - `data/outreach/creator_marketplace_raw_<timestamp>.json`
   - `data/outreach/creator_marketplace_raw_items_<timestamp>/` 目录，每个达人单独一个 `creator_id.json`

说明：

- `shop_region` 不是写死 `MX`，而是从当前登录链路动态解析。
- 当 URL 中没有 `shop_region` 时，使用最近一次缓存值（默认 `MX`）。

## 2. 代码结构

- 建联任务定义与入口（保留顶层 `taskData`、筛选配置、筛选步骤构造与执行触发）：
  - `apps/frontend.rpa.simulation/src/main/modules/ipc/rpa-controller.ts`
- 通用 DSL 执行器：
  - `apps/frontend.rpa.simulation/src/main/modules/rpa/task-dsl/browser-actions.ts`
  - `apps/frontend.rpa.simulation/src/main/modules/rpa/task-dsl/browser-action-runner.ts`
  - `apps/frontend.rpa.simulation/src/main/modules/rpa/task-dsl/types.ts`
  - `apps/frontend.rpa.simulation/src/main/modules/rpa/task-dsl/runner.ts`
- 页面能力：
  - `apps/frontend.rpa.simulation/src/main/windows/tk-wcv.ts`

## 3. DSL 任务定义（当前版本）

## 3.1 本次新增的通用控件级 DSL

在保留基础浏览器动作的前提下，本次把建联里稳定复用的控件交互下沉为通用 `actionType`：

1. `setCheckbox`
2. `selectDropdownSingle`
3. `selectDropdownMultiple`
4. `selectCascaderOptionsByValue`
5. `fillDropdownRange`
6. `fillDropdownThreshold`

这些 actionType 的定位是“通用页面控件模式”，不是业务动作。

例如：

1. `selectDropdownSingle` 只表达“打开一个下拉、单选一个项、再关闭”
2. `selectDropdownMultiple` 只表达“打开一个下拉、多选若干项、再关闭”
3. `selectCascaderOptionsByValue` 只表达“按 value 勾选级联 checkbox”
4. `fillDropdownThreshold` 只表达“输入阈值并可选勾一个附加 checkbox”

因此：

- `Creators`
- `GMV`
- `Brand collaborations`

这些都仍然只是业务配置，不是 DSL 名词。

```ts
const creatorFilters: CreatorFilterConfig = {
  productCategorySelections: ['Home Supplies'],
  avgCommissionRate: 'All',
  contentType: 'All',
  creatorAgency: 'All',
  spotlightCreator: false,
  fastGrowing: false,
  notInvitedInPast90Days: false
}

const followerFilters: FollowerFilterConfig = {
  followerAgeSelections: [],
  followerGender: 'All',
  followerCountMin: '0',
  followerCountMax: '10,000,000+'
}

const performanceFilters: PerformanceFilterConfig = {
  gmvSelections: [],
  itemsSoldSelections: [],
  averageViewsPerVideoMin: '0',
  averageViewsPerVideoShoppableVideosOnly: false,
  averageViewersPerLiveMin: '0',
  averageViewersPerLiveShoppableLiveOnly: false,
  engagementRateMinPercent: '0',
  engagementRateShoppableVideosOnly: false,
  estPostRate: 'All',
  brandCollaborationSelections: []
}

const searchKeyword = ''

const taskData = {
  taskId: randomUUID(),
  taskName: '建联任务',
  version: '1.0.0',
  config: {
    enableTrace: true,
    retryCount: 0
  },
  steps: [
    {
      actionType: 'goto',
      payload: {
        url: 'https://affiliate.tiktok.com/connection/creator?shop_region=MX',
        postLoadWaitMs: 2500
      },
      options: {
        retryCount: 1
      },
      onError: 'abort'
    },
    {
      actionType: 'waitForBodyText',
      payload: {
        text: 'Find creators',
        timeoutMs: 30000,
        intervalMs: 500,
        retryGotoUrl: 'https://affiliate.tiktok.com/connection/creator?shop_region=MX',
        retryGotoPostLoadMs: 2500
      },
      options: {
        retryCount: 5
      },
      onError: 'abort'
    },
    ...this.buildCreatorFilterSteps(creatorFilters),
    ...this.buildFollowerFilterSteps(followerFilters),
    ...this.buildPerformanceFilterSteps(performanceFilters),
    ...this.buildSearchKeywordSteps(searchKeyword),
    ...this.buildCreatorCollectionSteps()
  ]
} as BrowserTask
```

说明：

1. 分类勾选使用 `value` 作为稳定标识，不依赖文案语言。
2. 当前建联任务以 `OutreachFilterConfig` 统一配置三大模块筛选参数。
3. `searchKeyword` 用于全部筛选后的最终关键词搜索；即使为空，也会提交一次空搜索以触发最终结果集加载和采集。
4. 运行时支持两种输入：
   - 类目名称（如 `Home Supplies`）
   - 类目 value（如 `600001`）
5. 后续你给多个项时，会按数组顺序逐个点击并校验 `:checked`。
6. 当前 `frontend.rpa.simulation` 作为本地开发模拟，建联顶层 `taskData`、默认配置和筛选步骤构造都放回 `RPAController`，与样品管理风格一致。
7. `RPAController` 内部使用的仍然是通用控件级 DSL，不是业务 actionType。
8. 达人列表采集结果会落盘到 `data/outreach/*.json`，执行完成后日志会输出文件路径。
9. 当前同时落两份文件：
   - 摘要字段文件
   - 每个达人原始 JSON 文件

## 3.2 Creator Filters 配置（当前）

```ts
const creatorFilters: CreatorFilterConfig = {
  productCategorySelections: ['Home Supplies'],
  avgCommissionRate: 'All',
  contentType: 'All',
  creatorAgency: 'All',
  spotlightCreator: false,
  fastGrowing: false,
  notInvitedInPast90Days: false
}
```

说明：

1. `productCategorySelections` 支持名称或 value 混传，执行前会统一归一化为 value。
2. 三个单选项会执行“打开下拉 -> 选择 -> 点击标题关闭下拉”。
3. 三个复选项在值为 `true` 时点击并校验选中状态，`false` 时跳过。

## 3.3 Follower Filters 配置（当前）

```ts
const followerFilters: FollowerFilterConfig = {
  followerAgeSelections: [],
  followerGender: 'All',
  followerCountMin: '0',
  followerCountMax: '10,000,000+'
}
```

说明：

1. `followerAgeSelections` 支持多选，顺序与配置数组保持一致。
2. `followerGender` 为单选，执行“打开下拉 -> 选择 -> 点击标题关闭下拉”。
3. `followerCountMin` / `followerCountMax` 使用通用 `fillSelector` 动作填入输入框。
4. `followerCountMax = '10,000,000+'` 表示保留页面默认的无上限写法。

## 3.4 其余筛选项可选值

`Avg. commission rate`（单选）：

1. `All`
2. `Less than 20%`
3. `Less than 15%`
4. `Less than 10%`
5. `Less than 5%`

`Content type`（单选）：

1. `All`
2. `Video`
3. `LIVE`

`Creator agency`（单选）：

1. `All`
2. `Managed by Agency`
3. `Independent creators`

`Follower age`（多选）：

1. `18 - 24`
2. `25 - 34`
3. `35 - 44`
4. `45 - 54`
5. `55+`

`Follower gender`（单选）：

1. `All`
2. `Female`
3. `Male`

`GMV`（多选）：

1. `MX$0-MX$100`
2. `MX$100-MX$1K`
3. `MX$1K-MX$10K`
4. `MX$10K+`

`Items sold`（多选）：

1. `0-10`
2. `10-100`
3. `100-1K`
4. `1K+`

`Est. post rate`（单选）：

1. `All`
2. `OK`
3. `Good`
4. `Better`

## 3.5 Performance Filters 配置（当前）

```ts
const performanceFilters: PerformanceFilterConfig = {
  gmvSelections: [],
  itemsSoldSelections: [],
  averageViewsPerVideoMin: '0',
  averageViewsPerVideoShoppableVideosOnly: false,
  averageViewersPerLiveMin: '0',
  averageViewersPerLiveShoppableLiveOnly: false,
  engagementRateMinPercent: '0',
  engagementRateShoppableVideosOnly: false,
  estPostRate: 'All',
  brandCollaborationSelections: []
}
```

说明：

1. `gmvSelections` 和 `itemsSoldSelections` 都是固定文案多选。
2. `averageViewsPerVideoMin`、`averageViewersPerLiveMin`、`engagementRateMinPercent` 都通过通用 `fillSelector` 填值。
3. 三个布尔开关分别控制：
   - `Filter by shoppable videos`
   - `Filter by shoppable LIVE streams`
   - `Filter by shoppable videos`（Engagement rate）
4. `brandCollaborationSelections` 不做静态白名单，按品牌文案精确匹配；执行时会自动滚动目标选项到可点击区域，适配超长列表。
5. `Brand collaborations` 使用通用 `clickByText + scrollContainerSelector` 能力在下拉容器内持续下滚查找，不依赖写死 `#arco-select-popup-12`。
6. 默认值不再执行冗余筛选动作：
   - 单选为 `All` 时跳过
   - 数值阈值仍为默认下限时跳过
   - `Follower count` 仍为 `0 ~ 10,000,000+` 时跳过
   - 整个模块没有有效筛选项时，不再点击该模块按钮

## 3.5.1 Search Keyword 配置（当前）

```ts
const searchKeyword = ''
```

说明：

1. `searchKeyword` 无论是否为空，都会执行一次“最终搜索提交”。
2. 当 `searchKeyword` 为空时，会把搜索框清空后再按 `Enter`，用于触发最终结果集刷新。
3. 当 `searchKeyword` 非空时，执行顺序为：
   - `startJsonResponseCapture(urlIncludes="/api/v1/oec/affiliate/creator/marketplace/find", method="POST")`
   - `fillSelector(input[data-tid="m4b_input_search"])`
   - `clickSelector(input[data-tid="m4b_input_search"])`
   - `pressKey('Enter')`
4. 搜索动作位于 `Creators / Followers / Performance` 全部筛选之后。

## 3.5.2 达人列表采集（当前）

搜索提交之后，新增一段通用采集流程：

1. 先等待首批响应完成。
2. 在 `#modern_sub_app_container_connection` 内持续下划页面。
3. 停止条件为“连续 3 次下划后都没有新的 `find` 响应”，并且优先尊重响应中的 `next_pagination.has_more = false`。
4. 从所有匹配 `POST /api/v1/oec/affiliate/creator/marketplace/find` 的 JSON 响应中读取 `creator_profile_list`。
5. 对达人按 `creator_oecuid.value` 去重。
6. 当前导出字段为：
   - `creator_id`
   - `avatar_url`
   - `category`
   - `creator_name`
7. 同时导出一份 Excel：
   - `all_creators` sheet：全部去重后的达人列表
   - `request_001 / request_002 / ...` sheet：每次 `find` 请求返回的那一批达人列
8. 同时保留每个达人的原始 JSON 对象并导出。
9. 导出路径：
   - `data/outreach/creator_marketplace_<timestamp>.xlsx`
   - `data/outreach/creator_marketplace_<timestamp>.json`
   - `data/outreach/creator_marketplace_raw_<timestamp>.json`
   - `data/outreach/creator_marketplace_raw_items_<timestamp>/`

## 3.5.3 建联任务编排层变化

当前 `RPAController` 中保留的主要内容是：

1. 顶层 `taskData`
2. 建联页面跳转与首屏校验
3. 筛选配置类型与默认值
4. 建联筛选步骤顺序编排
5. 执行触发

被移出业务层、下沉到 DSL 的内容包括：

1. 打开筛选项
2. 等待下拉/面板出现
3. 单选/多选点击
4. 按 value 勾选 cascader checkbox
5. 区间输入
6. 阈值输入
7. checkbox 状态设置
8. 长列表滚动查找

## 3.6 Product Category 全量清单（Creators）

1. `Home Supplies` -> `600001`
2. `Kitchenware` -> `600024`
3. `Textiles & Soft Furnishings` -> `600154`
4. `Household Appliances` -> `600942`
5. `Womenswear & Underwear` -> `601152`
6. `Shoes` -> `601352`
7. `Beauty & Personal Care` -> `601450`
8. `Phones & Electronics` -> `601739`
9. `Computers & Office Equipment` -> `601755`
10. `Pet Supplies` -> `602118`
11. `Sports & Outdoor` -> `603014`
12. `Toys & Hobbies` -> `604206`
13. `Furniture` -> `604453`
14. `Tools & Hardware` -> `604579`
15. `Home Improvement` -> `604968`
16. `Automotive & Motorcycle` -> `605196`
17. `Fashion Accessories` -> `605248`
18. `Health` -> `700645`
19. `Books, Magazines & Audio` -> `801928`
20. `Kids' Fashion` -> `802184`
21. `Menswear & Underwear` -> `824328`
22. `Luggage & Bags` -> `824584`
23. `Collectibles` -> `951432`
24. `Jewelry Accessories & Derivatives` -> `953224`

## 4. 触发方式

1. 启动应用：
   - `pnpm --filter ./apps/frontend.rpa.simulation exec electron-vite dev --mode dev`
2. 终端先登录：
   - `login`
3. 再触发建联任务：
   - `outreach`

## 5. 当前行为

`outreach` 命令执行时：

1. `RPAController.sellerOutReach()` 检查登录态，并解析 `shop_region`。
2. 生成目标 URL：`connection/creator?shop_region=<region>`。
3. 执行通用动作 DSL：
   - `goto`：跳转建联页面并等待首屏加载。
   - `waitForBodyText`：检测 `Find creators` 文案。
   - `clickByText`：点击 `Creators`。
   - `Product category`：打开、按顺序勾选、在类目面板内按需滚动查找，再点击该大项本身关闭。
   - `Avg. commission rate`：单选后点击 `Find creators` 关闭。
   - `Content type`：单选后点击 `Find creators` 关闭。
   - `Creator agency`：单选后点击 `Find creators` 关闭。
   - `Spotlight Creator / Fast growing / Not invited in past 90 days`：按布尔开关决定是否勾选。
   - `clickByText`：点击 `Followers`。
   - `Follower age`：多选后点击 `Find creators` 关闭。
   - `Follower gender`：单选后点击 `Find creators` 关闭。
   - `Follower count`：填充最小值/最大值后点击 `Find creators` 关闭。
   - `clickByText`：点击 `Performance`。
   - `GMV / Items sold`：多选后点击 `Find creators` 关闭。
   - `Average views per video / Average viewers per LIVE / Engagement rate`：填最小值，可按布尔开关勾选对应 shoppable 过滤，再关闭弹层。
   - `Est. post rate`：单选后点击 `Find creators` 关闭。
   - `Brand collaborations`：按品牌名定位，必要时自动滚动后点击；页面当前不存在的品牌会跳过，不阻断后续搜索与达人列表采集。
   - `Search keyword`：填入搜索词后，先点击一次 `Find creators` 文本区域，再点击一次搜索框本身，然后按 `Enter` 提交搜索。
4. 若未检测到 `Find creators`：
   - 在 `waitForBodyText` 的失败路径中再次 `goto` 同一 URL；
   - 抛错触发 DSL 步骤重试，直至成功或超过重试上限。
5. 建联结果导出完成后：
   - 自动跳回 `https://affiliate.tiktok.com/platform/homepage?shop_region=<region>`；
   - 回到 affiliate 首页待命，等待后续任务指令。

## 6. 从样品管理沉淀的可复用基础动作

已抽出的基础动作（仅保留可复用的浏览器基础操作，不带业务语义）：

1. `goto`
2. `wait`
3. `waitForBodyText`
4. `waitForSelector`
5. `clickSelector`
6. `clickByText`
7. `fillSelector`
8. `pressKey`
9. `assertUrlContains`

补充说明：

1. `clickByText` 已增强为点击前自动 `scrollIntoView`，用于长列表品牌项定位。
2. `clickByText` 已支持在指定滚动容器内持续下滚查找目标文案，适配超长品牌列表。
3. `waitForSelector` / `fillSelector` 已增强为优先处理可见节点，适配同类弹层反复打开关闭的场景。

## 7. 下一步可以接着做

1. 列表翻页与目标提取。
2. 建联动作执行与结果回写。
3. 失败重试与任务统计导出。
