# dsh-annotations

DeepSeek Harness 插件。选中会话文字，添加到对话旁注。
交互参考 Codex 客户端，代码独立实现，不 fork。

## 交互

**选中文字**（已完成、可见的单条消息）→ 选区上方浮出工具条：

- 添加到对话

工具条和编辑器都距选区 18px。上方空间不够时翻到下方，始终夹在会话滚动区与输入框之间。

**双击一行** → 选中该行文字并弹出工具条。双击一个词仍按浏览器原生选词。双击行尾空白也选中整行。

**添加到对话** → 浮出编辑器：所选文本、评论（可选）、取消、保存、删除。
保存后：

- 草稿里插入一个引用芯片。芯片被 CSS 压成 0 尺寸，草稿文字不受影响。
- 会话输入框内出现胶囊「N 条注释」：有附件时跟在缩略图旁，空间不足则移到附件下方；悬停（或键盘聚焦）显示列表和关闭图标，关闭图标清空全部注释。回退键不会删除隐藏的注释芯片。
- 原文选区高亮，编号徽标始终跟在所选文字末端上方。点徽标或输入胶囊的列表项，都使用原文附近的同一个浮层编辑器，不会撑高输入框。

输入框为空时也显示胶囊。胶囊和芯片同为注释来源；芯片是唯一持久数据。

**发送后**：

- 模型收到展开的 `<annotation_context>` XML（含所选文本与评论）。
- 用户看到紧凑的「N 条注释」胶囊：有附件时跟在附件预览后，没有附件时位于消息文字上方；悬停或键盘聚焦显示所选文本和评论，消息正文照常显示。

## 结构

Client 半边（`client.js`，无构建步骤，`window.__ModuleLoader__.load`）：

- **选区**：单条消息、可见、已结算、≤16KB。存 `nodeKey`、文本起止偏移、`seq`。任一条件不满足就不弹工具条（fail-closed）。
- **工具条 / 编辑器**：随选区挂在会话滚动内容内，绝对定位。
- **胶囊**：`conversation.input.overlay`，order 40，显示在输入框卡片内；编辑时按实际高度为输入文字留出空间。计数从芯片 `ref` 反解，不另存状态。
- **引用芯片**：`inputTriggers.registerSource` 注册 source `dsh-annotations`。
  - `ref` = JSON：`{version, sessionId, annotations:[{text, comment?, anchor?}]}`。
  - `clipboardText` 只做草稿占位。
  - `serialize` 产出模型看到的 XML。普通退格/Delete 越过隐藏芯片删相邻正文；全选删除保留注释芯片（可带一个分隔空格），其他跨芯片编辑继续保护。
- **消息渲染**：shadow `conversation.chat.node`（key `user` / `steering`，priority -100）。严格识别正文前、中、后的完整 `<annotation_context>`，仅在展示副本中剥掉；原生渲染器保留文字块与附件顺序，并显示注释胶囊。
- **高亮与徽标**：CSS Custom Highlight API（`dsh-annotations`）。徽标挂在会话滚动内容内，随原文滚动。

注释持久化：不另存。草稿本身由 DSH 存到 localStorage，芯片 `ref` 随草稿走。旧来源 `aside-annotations`（含旧芯片标签）和历史消息的 `<aside_context>` 仍可读取；新数据使用 `dsh-annotations` 和 `<annotation_context>`。

## 安装

```sh
cd ~/code/dsh-annotations
npm run test:install
npm pack
```

`test:install` 会将生成的 `.tgz` 安装到隔离 profile 并启动检查。安装时使用打包文件或 GitHub 包。要求 DSH `0.2.1-rc.2`。

## 测试

```sh
npm test
npm run test:install
```

`npm test` 检查注释与选区逻辑。`test:install` 在 `/tmp` 创建独立 profile，将当前源码打包安装，检查首次启动与冷重启；不修改 desktop profile。

文本框为空时“保存”也可用，此时只收集所选文本，不带评论。

## 已知限制与风险

- **私有契约**：`data-chat-anchor-key`、`data-composer-chip`、`data-conversation-scroll`、`data-composer-seat`、`InputState`（`draft` / `occurrences` / `caretSpan` / `insertReference` / `replaceText`）。DSH 升级要回归。
- 只支持单条消息内选择。跨消息选择不弹工具条。
- 新旧芯片都被压成 0 尺寸。Lexical 光标通常正常。若某版本异常，退回可见胶囊：删掉 `[data-composer-chip]` 的隐藏 CSS。
- 已发送胶囊只识别恰好一个符合插件序列化格式的完整 `<annotation_context>` 或旧 `<aside_context>`；被改写过的历史消息保留原文。旧日志没有来源元数据，手写同形 XML 无法区分。
