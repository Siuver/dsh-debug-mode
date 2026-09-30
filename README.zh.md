# @siuver/dsh-debug-mode

[English](README.md) | 中文

可选的 [DeepSeek Harness](https://github.com/deepseek-ai) Web Bundle，把证据驱动、人在回路的调试做成与 plan mode 并列的协作姿态。

没有 `/debug-*` 斜杠指令。composer 上的调试芯片和调试面板驱动进入、复现或继续、证据、完成和退出。

## 环境要求

- 已经运行的 DeepSeek Harness Web 配置
- 该配置中已经提供 DeepSeek Harness 的 `@deepseek-ai/*` peer 包（本包不内置这些依赖）

## 安装

在已经运行的 DSH Web 配置上：

1. 打开插件页，添加 `@siuver/dsh-debug-mode`（npm 包名、本地路径或 git URL）。
2. 启用「调试模式」。
3. **新开会话**。
4. 点击 composer 上的「调试」。

本地仓库请添加**仓库根目录**，不要填 `packages/` 下的路径。根包声明了 `dsh.bundle`。

已有会话保持其生成。启用 Bundle 后请新开会话。

## 使用

1. 点击 composer 提交行附近的「调试」。
2. 描述症状。
3. 用面板复现或采集证据，然后「继续」「已修复」，或「退出调试」。

未激活时面板保持关闭，直到这次点击。激活后面板保持可见，用于当前回合。

Plan mode 与 debug mode 在 Host 上互斥：进入调试时，若存在 plan-mode 服务则请其离开。

## 行为

调试模式激活时，每次请求包含 `debug:policy` 提示词段，以及一条标明磁盘调试日志路径的快照。开始、继续、标记已修复会注入方法论提示。一轮在没有交接给用户的情况下结束时，可能收到一次提醒，随后回合交给你。

进入或离开调试模式会添加或移除 `debug:policy` 段。四个调试工具在两种状态下都留在目录中。

子代理会话不能启动或改写调试模式。

## 开发

```sh
pnpm install
pnpm test
pnpm build
```

| 路径 | 职责 |
| --- | --- |
| `.` | 可安装 Bundle：Host 插件、Client 芯片/面板、`cordis.patch.yml` |
| [`packages/debug-mode`](packages/debug-mode) | Host 插件源码 |
| [`packages/client-ui-debug`](packages/client-ui-debug) | Client 芯片/面板源码 |

## 许可证

[MIT](LICENSE)
