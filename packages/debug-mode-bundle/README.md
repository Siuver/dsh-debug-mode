# @siuver/dsh-debug-mode

English | [中文](README.zh.md)

Optional bundle that adds evidence-driven debug mode and its composer dock. There are no `/debug-*` slash commands.

The installable package is the **repository root**, not this directory. See the [root README](../../README.md).

## Use

1. Open Plugins in the Web sidebar and add `@siuver/dsh-debug-mode`, or the repository root.
2. Enable Debug mode, then start a **new Session**.
3. Click Debug in the composer, describe the symptom, then follow the dock: reproduce or capture, Proceed, Mark fixed, or Leave debug.

Peer DeepSeek Harness packages must already be present in the running profile.

## Behavior

While debug mode is active, the Host plugin adds the `debug:policy` section and debug snapshot/notice user messages. See [`@deepseek-ai/dsh-debug-mode`](../debug-mode/README.md).

Entering or leaving debug mode adds or removes the `debug:policy` section. The debug tools remain in the catalog in both states.

Plan mode and debug mode are mutually exclusive on the Host: entering debug asks plan mode to leave when that service is present.

## Implementation

The static `cordis.patch.yml` inserts `debug-mode`. The Host half owns on-disk session state, the stable debug tools, and the Remote. The Client half is the composer chip and dock.

## Limitations

- Enable the bundle, then start a new session. Existing sessions keep their generation.
