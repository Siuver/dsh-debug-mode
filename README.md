# @siuver/dsh-debug-mode

English | [中文](README.zh.md)

An optional [DeepSeek Harness](https://github.com/deepseek-ai) Web bundle that adds evidence-driven, human-in-the-loop debugging as a collaboration stance next to plan mode.

There are no `/debug-*` slash commands. The composer Debug chip and the debug dock drive enter, reproduce or proceed, evidence, done, and abort.

## Requirements

- A running DeepSeek Harness Web profile
- Peer `@deepseek-ai/*` Harness packages already present in that profile (this package does not vendor them)

## Install

From a running DSH Web profile:

1. Open Plugins and add `@siuver/dsh-debug-mode` (npm name, local path, or git URL).
2. Enable Debug mode.
3. Start a **new Session**.
4. Click Debug in the composer.

For a local checkout, add the **repository root**, not a path under `packages/`. The root package declares `dsh.bundle`.

Existing sessions keep their generation. Enable the bundle, then start a new session.

## Usage

1. Click Debug next to the composer submit row.
2. Describe the symptom.
3. Use the dock to reproduce or capture evidence, Proceed, Mark fixed, or Leave debug.

Inactive sessions keep the dock closed until that click. Active sessions keep the dock visible for the current round.

Debug mode and plan mode are mutually exclusive on the Host: entering debug asks plan mode to leave when that service is present.

## Behavior

While debug mode is active, each request includes a `debug:policy` prompt section and a snapshot that names the on-disk debug log. Start, proceed, and mark-fixed inject methodology prompts. A turn that settles without handing off to the user may receive one reminder, then the round moves to you.

Entering or leaving debug mode adds or removes the `debug:policy` section. The four debug tools stay in the catalog in both states.

Subagent sessions cannot start or mutate debug mode.

## Development

```sh
pnpm install
pnpm test
pnpm build
```

| Path | Role |
| --- | --- |
| `.` | Installable bundle: Host plugin, Client chip/dock, `cordis.patch.yml` |
| [`packages/debug-mode`](packages/debug-mode) | Host plugin sources |
| [`packages/client-ui-debug`](packages/client-ui-debug) | Client chip/dock sources |

## License

[MIT](LICENSE)
