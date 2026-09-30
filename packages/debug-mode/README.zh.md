# @deepseek-ai/dsh-debug-mode

[English](README.md) | 中文

证据驱动调试模式的 Host 插件。按会话把状态写到磁盘，四个调试工具始终留在请求目录里，并通过 Typert Remote 交给 composer 面板驱动。没有 `/debug-*` 斜杠指令。

本包是工作区源码。请安装并启用公开 Bundle [`@siuver/dsh-debug-mode`](../../README.zh.md)。

## 使用

1. 从 Web 插件管理页安装 `@siuver/dsh-debug-mode`。
2. 启用「调试模式」，然后**新开会话**。
3. 点击 composer 上的「调试」，描述问题，然后用面板上的「继续」「已修复」「退出调试」。

## 行为

激活时，每次请求包含 `debug:policy` 段以及一条标明绝对 JSONL 路径的快照用户消息。开始、继续、标记已修复会注入方法论提示。一轮在没有调用 `hand_off_to_user` 的情况下结束时，可能收到一次提醒，随后回合交给用户。

进入或离开调试模式会添加或移除 `debug:policy` 段。四个调试工具在两种状态下都留在目录中。

## 实现

状态位于 `<cwd>/.dsh/debug/<sessionId>/`，包括 `state.json` 与 `current.jsonl`（继续时轮转为 `<runId>.jsonl`）。插件不写入自定义会话事件。

四个工具（`hand_off_to_user`、`get_debug_logs`、`list_debug_probes`、`list_debug_evidence`）在未激活时仍然注册，进入或离开调试模式只改变 `debug:policy` 提示词段（顺序 501），不改变工具目录。子代理会话不能启动或改写调试模式。

Remote 变更结果为 `committed` | `queued` | `cancelled` | `noop`。进行中的回合会把 start/abort 排队到下一次被接受的 `agent/pre-step`。结算发生在 `agent/turn-stopping`，以便缺少交接时可以用 `steer` 再走一步。探针标记是 `@dsh-probe <id>`。

若组合了 plan mode，进入调试会调用 `planMode.set(agent, false)`，且不导入该包。

## 限制

- 已有会话保持其生成；启用 Bundle 后请新开会话。
- 中断的 investigating 回合恢复为 `user_turn`，避免重新加载后自动催促模型。
