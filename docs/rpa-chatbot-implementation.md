# XunDa RPA 聊天机器人实现说明

启动命令统一见：

- [rpa-startup-reference.md](./rpa-startup-reference.md)

## 1. 本次实现范围

当前先实现单达人聊天机器人的第一阶段：

1. 复用现有登录成功监控。
2. 登录成功后保留当前页面，不自动跳转。
3. 接到聊天任务后，读取当前店铺 `shop_region`。
4. 跳转到：
   - `https://affiliate.tiktok.com/seller/im?creator_id=<creator_id>&shop_region=<region>`
5. 以聊天输入框 `textarea` 可见作为 IM 页加载完成信号。
6. 页面加载完成后读取：
   - 达人显示名
   - 当前聊天记录文本
7. 将指定消息填入聊天输入框。
8. 先校验输入字数不是 `0/2000`。
9. 先用原生点击方式点击 `Send` 按钮发送消息。
10. 按钮发送后，检查输入字数是否从非 0 变回 `0`。
11. 如果输入字数未归零，则认为本轮发送失败并重试，最多 3 次。
12. 最后再次读取完整聊天记录文本。
13. 将本次关键内容写入：
   - `data/chatbot/seller_chatbot_session_<timestamp>.md`

## 2. 关键页面元素

当前实现使用以下 selector：

1. 就绪输入框 / 聊天输入框：
   - `textarea[data-e2e="798845f5-2eb9-0980"], textarea#imTextarea, #im_sdk_chat_input textarea, textarea[placeholder="Send a message"]`
2. 发送按钮：
   - `#im_sdk_chat_input > div.footer-zRiuSb > div > button`
3. 输入字数计数：
   - `div[data-e2e="6981c08f-68cc-5df6"] span[data-e2e="76868bb0-0a54-15ad"]`
   - 发送成功时预期从非 `0` 变回 `0`
4. 聊天记录容器：
   - `div[data-e2e="4c874cc7-9725-d612"], div.messageList-tkdtcN, div.chatd-scrollView`
5. 达人显示名：
   - `div[data-e2e="4e0becc3-a040-a9d2"], div.personInfo-qNFxKc .text-body-m-medium`

## 3. 任务执行链路

当前聊天机器人任务步骤如下：

1. `goto`
2. `waitForSelector(chat input visible)`
3. `waitForSelector(chat input)`
4. `readText(creator name)`
5. `readText(transcript before send)`
6. `fillSelector(chat input)`
7. `clickSelector(chat input)` 保证输入框聚焦
8. `readText(input count)`
9. `assertData(input count != 0)`
10. `clickSelector(send button, native=true)`
11. `waitForTextChange(input count -> input count after)`
12. `readText(input count after)`
13. 比较“输入字数是否归零”
14. `readText(transcript after send)`

说明：

1. 当前发送主路径是原生点击 `Send` 按钮。
2. 发送前会先校验输入字数不是 `0`，用于确认消息确实已经写入输入框。
3. 发送成功的主信号是输入字数从非 `0` 变回 `0`。
4. 聊天记录读取使用 `innerText` 保留换行，便于落地到 markdown。
5. 当前最多发送重试 3 次。

## 4. 会话日志落盘

每次聊天任务完成后，会生成一份 markdown：

- `data/chatbot/seller_chatbot_session_<timestamp>.md`

内容包括：

1. `creator_id`
2. `creator_name`
3. `region`
4. `target_url`
5. 就绪输入框 selector
6. 输入框 selector
7. 发送按钮 selector
8. 输入字数 selector
9. 聊天记录 selector
10. 发送消息正文
11. 发送前聊天记录
12. 发送是否校验通过
13. 发送尝试次数
14. 发送后聊天记录
15. 发送后聊天记录是否变化

## 5. 默认消息

当前如果 payload 不传 `message`，会使用内置默认消息：

```text
Hola 😊

Soy Natalie Cueto, Social Media Partnership Specialist de GOKOCO México.
Estamos buscando creadores con un estilo auténtico para colaborar con nosotros en contenido de cuidado personal y belleza inteligente.

Nos encantaría enviarte uno de nuestros productos para que lo pruebes y, si te gusta, compartir tu experiencia con tu comunidad.
Además, la colaboración incluye comisión por cada venta generada a través de tus recomendaciones.

Si te interesa, con gusto te comparto más detalles.
Quedo atenta.
```

## 6. 当前限制

1. 当前一次只处理一个 `creator_id`。
2. 当前发送校验基于输入字数归零，没有再保留额外的消息内容级兜底分支。
3. 当前没有实现批量调度、去重发送、消息模板切换、产品卡片发送。
4. 当前只实现主进程 CLI / IPC 入口，没有单独做聊天机器人页面 UI 配置器。
