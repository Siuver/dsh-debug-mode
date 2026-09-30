# @deepseek-ai/dsh-client-ui-debug

English | [中文](README.zh.md)

Composer Debug chip (`conversation.input.right`) and dock (`conversation.input.dock`). The chip opens the start form; the dock drives start, proceed, attach, clear logs, mark fixed, and abort. Copy is locale-owned (`zh` is the key-set source).

This package is a workspace source tree. The public bundle [`@siuver/dsh-debug-mode`](../../README.md) ships the compiled client half.

## Use

Click Debug next to the composer submit row. Inactive sessions keep the dock closed until that click. Active sessions keep the dock visible for the current round.

The chip does not occupy `conversation.input.plan` or `conversation.input.activity`.

## Behavior

Dock actions call the Host Remote. Model-visible text is produced by [`@deepseek-ai/dsh-debug-mode`](../debug-mode/README.md). The Client half has no direct KV-cache effect.

## Implementation

The browser half mounts the `debug` Remote contribution with `ctx.remote.$mount`, then injects into the two conversation slots. It follows `debug.follow(sessionId)` through `$stream`. Styles use `--dsw-*` tokens via an injected stylesheet.
