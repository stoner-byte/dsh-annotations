# dsh-aside

DeepSeek Harness 插件。选中会话文字，加旁注，或开临时侧边讨论。
交互参考 Codex 客户端，代码独立实现，不 fork。

## 交互

**选中文字**（已完成、可见的单条消息）→ 选区上方浮出工具条：

- 添加到对话
- 在侧边聊天中提问

工具条位置优先在选区上方。上方空间不够时翻到下方。始终夹在会话滚动区与输入框之间。

**添加到对话** → 浮出编辑器：所选文本、评论（可选）、取消、保存、删除。
保存后：

- 草稿里插入一个引用芯片。芯片被 CSS 压成 0 尺寸，草稿文字不受影响。
- 输入框上方出现胶囊「N 条注释」。点击展开列表，可编辑或删除。
- 原文选区高亮，右侧显示编号徽标。点徽标回到编辑器。

输入框为空时也显示胶囊。胶囊和芯片同为注释来源；芯片是唯一持久数据。

**发送后**：

- 模型收到展开的 `<aside_context>` XML（含所选文本与评论）。
- 用户看到自己的消息上方是一张折叠卡片「N 条注释」，可展开。消息正文照常显示。

**在侧边聊天中提问** → 打开原生右侧边栏标签页「旁注讨论」。

- 临时。关闭标签页即丢弃。
- 只读。不创建 Session，不写历史，不执行工具。
- 上下文截止到选区所在 turn 结束。
- 沿用父会话当前模型，面板只显示模型名。

## 结构

Host 半边：

| 文件 | 职责 |
| --- | --- |
| `lib/index.js` | `DshAsidePlugin extends TypertRemoteService`，服务名 `aside` |
| `lib/host-service.js` | 只读讨论：读父上下文、调 LLM、流式回传、限额与回收 |
| `lib/typert.js` | 4 个 invocation 的线上描述（create / stream / cancel / close），zod 严格模式 |
| `lib/remote.js` | 给客户端 `ctx.remote.$mount` 的声明 |

只读取父会话：`sessionQuery.observeSession(..., {projectionMode:'none'})`，取事件到选区之后第一个 `turn/end`。
上下文序列化为 JSON（`parentConversation` + `selectedPassage`），上限 2MB，不静默截断。
回复走 `llm.prepareCall` 流式，上限 256KB；工具调用直接报错。
空闲 30 分钟回收；每个 owner 最多 2 个讨论；全局 16 个。

Client 半边（`client.js`，无构建步骤，`window.__ModuleLoader__.load`）：

- **选区**：单条消息、可见、已结算、≤16KB。存 `nodeKey`、文本起止偏移、`seq`。任一条件不满足就不弹工具条（fail-closed）。
- **工具条 / 编辑器**：`shell.overlay`，fixed 定位，rAF 节流。
- **胶囊**：`conversation.input.dock`，order 40（Todo 0、Goal 10、Queue 20 之后）。计数从芯片 `ref` 反解，不另存状态。
- **引用芯片**：`inputTriggers.registerSource` 注册 source `aside-annotations`。
  - `ref` = JSON：`{version, sessionId, annotations:[{text, comment?, anchor?}]}`。
  - `clipboardText` 只做草稿占位。
  - `serialize` 产出模型看到的 XML。
- **消息渲染**：shadow `conversation.chat.node`（key `user` / `steering`，priority -100）。发现 `<aside_context>` 前缀时剥掉，交回原生渲染器，上方加折叠卡片。
- **高亮与徽标**：CSS Custom Highlight API（`dsh-aside-annotation`）。徽标 fixed 定位，滚动与 DOM 变化时重算。
- **侧边栏**：`sidebarRightTabs.register({id:'dsh-aside', kind:'aside'})` + `sidebar.right.pane.tab`。用 `ctx.sidebarRight.openTab('aside', {params})` 打开。面板通过 `ctx.remote` 调 Host。

注释持久化：不另存。草稿本身由 DSH 存到 localStorage，芯片 `ref` 随草稿走。

## 安装（未执行）

```sh
cd ~/code/dsh-aside
pnpm install
```

然后在 DSH 里安装本目录（`plugin_manager install_bundle`，target 为本目录）。
要求 DSH `0.2.1-rc.2`，profile `desktop`。

## 测试

```sh
npm test
```

`node --test`，无框架。覆盖：XML 序列化/解析往返、转义、芯片原子 span 换算（含多引用）、注释反解、工具条定位（上方 / 翻下 / 夹边）。

## 已知限制与风险

- **私有契约**：`data-chat-anchor-key`、`data-composer-chip`、`data-conversation-scroll`、`data-composer-seat`、`InputState`（`draft` / `occurrences` / `insertReference` / `replaceText`）、`sidebar.right.pane.tab` 的注入 props。DSH 升级要回归。
- **侧边栏参数通道未在真机验证**：面板从 `props.tab.navigation.params` 取选区。取不到时显示错误，不崩溃。若该版本不传，需要改为会话级内存表。
- 只支持单条消息内选择。跨消息选择不弹工具条。
- 芯片被压成 0 尺寸。Lexical 光标通常正常。若某版本异常，退回可见胶囊：删掉 `[data-composer-chip="aside-annotations"]` 那条 CSS。
- 无模型选择器。侧栏沿用父会话模型。
- 发送后的卡片依赖消息原文里的 `<aside_context>` 前缀。被压缩或改写过的历史消息不显示卡片。
