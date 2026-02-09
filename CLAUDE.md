# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

OpenClaw channel plugin for VK (VKontakte). Uses VK Bot Long Poll API with zero dependencies (raw `fetch`). Early WIP — not yet stable.

## Architecture

Plugin follows the OpenClaw `ChannelPlugin` interface. Flow:

1. **`index.ts`** — entry point. Registers plugin with OpenClaw via `api.registerChannel()`, stashes the `PluginRuntime` singleton.
2. **`src/channel.ts`** — the `ChannelPlugin<VkResolvedAccount>` object. Implements `config` (account CRUD), `outbound` (send messages via `messages.send`), `gateway` (starts long poll monitor), `status` (probes group connectivity).
3. **`src/monitor.ts`** — long poll loop. Polls VK, deduplicates via bounded `Set` (cap 2000), enforces `allowFrom` auth, routes through `core.channel.routing` → `core.channel.reply.dispatchReplyWithBufferedBlockDispatcher`.
4. **`src/vk-api.ts`** — thin VK API wrapper. All calls go through `vkApi(token, method, params)` which POSTs URLSearchParams to `api.vk.com`. API version: `5.199`.
5. **`src/types.ts`** — `VkAccount`/`VkResolvedAccount` interfaces + `resolveVkAccount()` config helper.
6. **`src/runtime.ts`** — singleton holder for `PluginRuntime`.

Config path in OpenClaw: `cfg.channels.vk.accounts[accountId]` → `{ token, groupId, allowFrom, enabled, dmPolicy }`.

## OpenClaw Reference

OpenClaw sources at `c:\users\alexander\sync-pc\PyCharm\openclaw\` — read-only, never modify.

## Key Conventions

- ESM (`"type": "module"` in package.json). All local imports use `.js` extension.
- No build step — TypeScript is consumed directly by OpenClaw's runtime.
- No test framework. Standalone connectivity test via `VK_TOKEN=... VK_GROUP_ID=... node test-vk.mjs`.
- VK peer_id >= 2,000,000,000 means group chat; below that means DM.
- `random_id` is required by VK `messages.send` to prevent duplicates.
