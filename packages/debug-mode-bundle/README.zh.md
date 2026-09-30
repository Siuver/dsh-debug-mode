# @siuver/dsh-debug-mode

[English](README.md) | 中文

可选 Bundle，加入证据驱动的调试模式及其 composer 面板。没有 `/debug-*` 斜杠指令。

可安装的包是**仓库根目录**，不是本目录。见[根 README](../../README.zh.md)。

## 使用

1. 打开 Web 侧栏的插件管理页，添加 `@siuver/dsh-debug-mode`，或添加仓库根目录。
2. 启用「调试模式」，然后**新开会话**。
3. 点击 composer 上的「调试」，描述症状，然后按面板操作：复现或采集、继续、已修复，或退出调试。

运行中的配置必须已经提供 DeepSeek Harness 的 peer 包。

## 行为

调试模式激活时，Host 插件添加 `debug:policy` 段以及调试快照/通知用户消息。见 [`@deepseek-ai/dsh-debug-mode`](../debug-mode/README.zh.md)。

进入或离开调试模式会添加或移除 `debug:policy` 段。调试工具在两种状态下都留在目录中。

Plan mode 与 debug mode 在 Host 上互斥：进入调试时，若存在 plan-mode 服务则请其离开。

## 实现

静态 `cordis.patch.yml` 插入 `debug-mode`。Host 半边拥有磁盘上的会话状态、稳定的调试工具和 Remote。Client 半边是 composer 芯片和面板。

## 限制

- 启用 Bundle 后请新开会话。已有会话保持其生成。
