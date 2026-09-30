# @deepseek-ai/dsh-debug-mode

English | [中文](README.zh.md)

Host plugin for evidence-driven debug mode. It stores per-session state on disk, keeps four debug tools in the request catalog at all times, and exposes a Typert Remote that the composer dock drives. There are no `/debug-*` slash commands.

This package is a workspace source tree. Install and enable the public bundle [`@siuver/dsh-debug-mode`](../../README.md).

## Use

1. Install `@siuver/dsh-debug-mode` from the Web plugin manager.
2. Enable Debug mode, then start a **new Session**.
3. Click Debug in the composer, describe the problem, then use the dock for Proceed, Mark fixed, and Leave debug.

## Behavior

While active, each request includes the `debug:policy` section and a snapshot user message naming the absolute JSONL path. Start, proceed, and mark-fixed inject methodology prompts. A turn that settles without `hand_off_to_user` may receive one reminder, then the round moves to the user.

Entering or leaving debug mode adds or removes the `debug:policy` section. The four debug tools remain in the catalog in both states.

## Implementation

State lives at `<cwd>/.dsh/debug/<sessionId>/` as `state.json` plus `current.jsonl` (rotated to `<runId>.jsonl` on proceed). The plugin does not write custom session events.

The four tools (`hand_off_to_user`, `get_debug_logs`, `list_debug_probes`, `list_debug_evidence`) stay registered while inactive so entering or leaving debug mode changes only the `debug:policy` prompt section (order 501), not the tool catalog. Subagent sessions cannot start or mutate debug mode.

`set()`-style Remote outcomes are `committed` | `queued` | `cancelled` | `noop`. An open turn queues start/abort until the next accepted `agent/pre-step`. Settle runs on `agent/turn-stopping` so a missing handoff can `steer` another step. Probe markers are `@dsh-probe <id>`.

If plan mode is composed, entering debug calls `planMode.set(agent, false)` without importing that package.

## Limitations

- Existing sessions keep their generation; enable the bundle, then start a new session.
- Interrupted investigating rounds resume as `user_turn` so a reload cannot auto-nudge the model.
