# @deepseek-ai/dsh-client-ui-debug

[English](README.md) | 中文

Composer 调试芯片（`conversation.input.right`）与面板（`conversation.input.dock`）。芯片打开起始表单；面板驱动开始、继续、添加附件、清空日志、标记已修复和退出。文案由 locale 拥有（`zh` 为键集合来源）。

本包是工作区源码。公开 Bundle [`@siuver/dsh-debug-mode`](../../README.zh.md) 提供编译后的 Client 半边。

## 使用

点击 composer 提交行附近的「调试」。未激活时面板保持关闭，直到这次点击。激活后面板保持可见，用于当前回合。

芯片不占用 `conversation.input.plan` 或 `conversation.input.activity`。

## 行为

面板动作调用 Host Remote。模型可见文本由 [`@deepseek-ai/dsh-debug-mode`](../debug-mode/README.zh.md) 产生。Client 半边对 KV 缓存无直接效果。

## 实现

浏览器半边用 `ctx.remote.$mount` 挂上 `debug` Remote 贡献，再注入两个 conversation 槽位。通过 `$stream` 订阅 `debug.follow(sessionId)`。样式使用 `--dsw-*` 令牌，由注入的样式表提供。
