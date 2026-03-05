# INFound Desktop 非前端专项说明

本文只聚焦非前端部分（Electron 主进程、Preload 桥接、共享底层库、自动化/RPA、持久化、网络通信、打包发布）。

## 1. 项目整体框架（先给全局）

这是一个 `pnpm` monorepo：

- `apps/frontend.desktop`：主桌面应用（含 Electron main/preload + Vue renderer）
- `apps/frontend.rpa.simulation`：RPA 模拟器（含 Electron main/preload + 简单 renderer）
- `apps/frontend.embed`：纯前端嵌入页（本说明不展开）
- `packages/frontend.desktop.shared`：主应用与模拟器共用的底层模块（日志、类型、RPA 执行引擎、工具）

Workspace 定义见 `pnpm-workspace.yaml`，打包与运行都以应用包为单位。

## 2. 非前端边界定义

本项目“非前端”主要包含：

- Electron 主进程：应用生命周期、窗口管理、协议与外链拦截、IPC 接收端
- Preload：`contextBridge` 暴露受控 API（`window.ipc` / `window.logger`）
- 进程间协议：IPC channel、类型契约、控制器注册机制
- 状态与存储：内存全局状态、`electron-store`、`keytar`
- 网络通信：基于 Electron `net` 的请求封装、Cookie/Token 注入、STOMP over WebSocket
- 自动化执行：Playwright 持久化上下文、动作编排、人类化交互策略、trace 产物
- 构建发布：`electron-vite` 三端构建 + `electron-builder` 资源打包

## 3. 主应用（frontend.desktop）非前端架构

### 3.1 启动与生命周期

入口在 `src/main/index.ts`：

1. 根据 `MODE` 设置 `userData` 路径（非生产追加后缀，并忽略证书错误）
2. `app.whenReady()` 后注册 IPC 控制器
3. 先启动 Splash，再初始化主窗口
4. 主窗口显示后关闭 Splash
5. 处理 macOS `activate` 与全窗口关闭退出逻辑

### 3.2 窗口系统

- `MainWindow`：主窗口（无边框、自定义标题栏、分区 `persist:main`）
- `SplashWindow`：启动页，向渲染进程推送启动进度
- `AppWindowsAndViewsManager`：统一持有主窗口与 Splash
- `TkWcv`：封装 TikTok 站点 `WebContentsView`（目前在 desktop 主链路未实际接入）

### 3.3 IPC 机制（装饰器 + 注册器）

核心思想：

- 在 controller 方法上通过 `@IPCHandle(channel, type)` 标注
- `IPCManager.register()` 扫描元数据并注册到 `ipcMain.handle/on`
- 统一避免重复 channel 注册

通道协议在 `common/types/ipc-type.ts`，包括：

- 窗口控制（最小化/最大化/关闭）
- 全局状态拉取和写入
- 主进程到渲染进程的状态广播
- WebSocket 消息转发通道
- RPA 通道（在 desktop 里定义但当前未接入控制器）

### 3.4 状态与持久化

`GlobalState` 是主进程状态源：

- 初始化 `appInfo`（含设备 ID / session）
- 初始化 `appSetting`（资源路径、UI 配置）
- 初始化 `currentUser` 与登录态

写入流程 `saveState(path, value)`：

1. 更新内存状态
2. 分流持久化：
   - `currentUser.tokenValue` -> `keytar`
   - `appSetting/currentUser` -> `electron-store`
3. 广播到所有 `webContents`，让渲染进程同步

存储层：

- `AppStore`：JSON schema +（生产环境）设备绑定加密 key
- `CredentialStore`：系统密钥链存储 token

### 3.5 网络与消息

HTTP：

- `NetRequest` 基于 Electron `net` 封装，不依赖 axios
- 自动附带 Cookie，并从 Cookie 解析 tokenName/tokenValue 注入头
- 接收 `set-cookie` 后回写 `AppStore`
- 支持请求/响应拦截器

OpenAPI：

- 在 request interceptor 注入设备/应用头（`xunda-device-id` 等）
- 非生产环境打印请求响应日志

WebSocket：

- `WebSocketService` 使用 `@stomp/stompjs + ws`
- 基于 Cookie 中 token 建立带 header 的连接
- 具备重连、心跳、主题订阅能力
- 目前主应用未看到实际调用入口，属于已实现但未接线状态

## 4. RPA 模拟器（frontend.rpa.simulation）非前端架构

### 4.1 启动与安全拦截

`src/main/index.ts` 在 `whenReady` 内做了两层拦截：

- `protocol.handle('bytedance', ...)` 直接拦截自定义协议
- 重写 `shell.openExternal`，阻止 `bytedance://` 与 `ms-windows-store://`

然后注册 `LoggerController`、`AppController`、`RPAController`，初始化主窗口和 `TkWcv`。

### 4.2 窗口与 WebContentsView

- `AppWindowsAndViewsManager` 在主窗口初始化后立刻创建 `TkWcv`
- `TkWcv` 使用独立 partition（`persist:TKWindow`）
- 拦截非 `http/https` 子框架跳转
- 监听崩溃与无响应并记录日志

### 4.3 RPA 控制器到执行器

`RPAController` 暴露两个 IPC 动作：

- `RPA_SELLER_LOGIN`：打开 TikTok seller 页面
- `RPA_SELLER_OUT_REACH`：构造任务并交给 `AutomationRunner`

任务结构：

- `taskId/taskName/version/config/steps`
- 当前 steps 包含 `goto`、`clickElement`、`fillElement`

## 5. shared 包：非前端核心复用层

`packages/frontend.desktop.shared` 是关键基础设施：

- `LoggerService`：统一日志级别、按天文件、7 天清理
- `rpa-type.ts`：动作与定位协议定义（强类型）
- `ActionManager`：动作类型 -> 执行器映射
- `AutomationRunner`：初始化浏览器上下文、执行步骤、失败 trace 归档
- `LocatorEngine`：支持 role/text/data-test/链式子定位/filter
- `HumanInteractionEngine`：生成平滑鼠标轨迹，降低机械感
- `ClickElementExecutor` / `FillElementExecutor`：重试、滚动、容错、输入节奏模拟

## 6. 构建与发布链路（非前端视角）

构建：

- 使用 `electron-vite` 分别构建 `main` / `preload` / `renderer`
- 配置了路径别名（`@main`、`@common`、`@renderer`）
- `bytecode: true` 开启字节码产物选项

发布：

- `electron-builder` 配置多平台（win/mac/linux）
- `extraResources` 将 Playwright Chromium 打包进安装包
- `asarUnpack` 显式放开 `resources` 和 `chromium` 目录

## 7. 当前实现状态与注意点（非前端）

1. IPC 参数约定与 controller 签名存在不一致风险：`APP_GLOBAL_STATE_SET_ITEM` 协议是 `{path,value}` 单对象，但 controller 方法签名是 `(path, value)`，经 `ipcMain.on` 实际收到的第一个参数是 `event`。
2. `frontend.desktop` 中 `TkWcv` 已实现但尚未纳入 `AppWindowsAndViewsManager` 主流程，当前主应用子视图能力未启用。
3. `user-service` / `web-socket-service` 代码已具备，但在当前主流程中未看到调用入口，属于预留或待接线。
4. RPA 模拟器 `RPAController` 中含任务账号密码硬编码，不适合生产环境，建议改为外部配置或安全输入链路。
5. 两个应用都设置了不少安全项，但也存在 `webSecurity: false`、`sandbox: false` 的场景，后续若进入生产强化阶段需专项审计。

