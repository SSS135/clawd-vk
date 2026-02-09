# VK OpenClaw Channel Plugin — Research & Plan

## Overview

No "skill-only" or lightweight connector pattern exists in OpenClaw. Every messenger is a full `ChannelPlugin`. But the pattern is clear and repeatable.

## Minimum Viable OpenClaw Channel Plugin

| File | Purpose |
|---|---|
| `package.json` | npm package with `openclaw` manifest |
| `openclaw.plugin.json` | Plugin discovery declaration |
| `index.ts` | Entry: `api.registerChannel({ plugin })` |
| `src/runtime.ts` | Singleton `PluginRuntime` holder |
| `src/types.ts` | Account resolution from config |
| `src/channel.ts` | The `ChannelPlugin` object |
| `src/monitor/index.ts` | VK Long Poll loop + message dispatch |

## Message Flow (from Tlon reference)

```
VK Long Poll receives message
  → core.channel.routing.resolveAgentRoute()     // which agent handles this?
  → core.channel.reply.formatAgentEnvelope()      // wrap in standard envelope
  → core.channel.reply.finalizeInboundContext()    // build MsgContext
  → core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx,
      cfg,
      dispatcherOptions: {
        deliver: async (payload) => {
          // VK messages.send here
        }
      }
    })
```

The `deliver` callback is where VK `messages.send` goes. OpenClaw handles the AI agent call, session management, model selection, and buffering — you just provide inbound context and the delivery function.

## VK API (Zero Dependencies, Raw `fetch`)

The entire VK bot protocol is 3 HTTP calls in a loop:

### Helper

```js
const API_V = '5.199';

async function vkApi(method, params = {}) {
  const body = new URLSearchParams({
    ...params,
    access_token: TOKEN,
    v: API_V,
  });
  const res = await fetch(`https://api.vk.com/method/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await res.json();
  if (json.error) throw new Error(`VK API error ${json.error.error_code}: ${json.error.error_msg}`);
  return json.response;
}
```

### 1. Get Long Poll Server

```js
const { server, key, ts } = await vkApi('groups.getLongPollServer', { group_id: GROUP_ID });
```

### 2. Poll for Messages

```js
const url = `${server}?act=a_check&key=${key}&ts=${ts}&wait=25`;
const res = await fetch(url, { signal: AbortSignal.timeout(35_000) });
const data = await res.json();
// data.updates contains message_new events
// data.ts is the new timestamp for next poll
```

### 3. Send Reply

```js
await vkApi('messages.send', {
  peer_id: peerId,
  message: text,
  random_id: Math.floor(Math.random() * 2 ** 31),
});
```

### Long Poll Error Handling

| `failed` code | Action |
|---|---|
| 1 | Update `ts` from response only |
| 2 | Re-fetch `key` (keep `ts`) |
| 3 | Re-fetch both `key` and `ts` |

### Message Event Structure

```json
{
  "type": "message_new",
  "object": {
    "message": {
      "id": 123,
      "from_id": 789,
      "peer_id": 789,
      "text": "Hello"
    }
  }
}
```

### Peer ID Logic

| Condition | Source |
|---|---|
| `peer_id < 0` | Community/group |
| `peer_id < 2000000000` | User DM |
| `peer_id >= 2000000000` | Multi-user chat (`chat_id = peer_id - 2000000000`) |

### Gotchas

- `random_id` required since API v5.90 — use `Math.floor(Math.random() * 2**31)`
- `v` parameter required on every call — use `5.199`
- `access_token` is a group token, not user token
- Long Poll `wait=25` → set fetch timeout to `wait + 10` seconds (35s)
- VK message limit: ~4096 characters

## VK Bot Setup (VK Side)

1. Create VK Community → Community Management → API Usage
2. Generate **group access token**
3. Enable "Incoming messages" in Long Poll API settings
4. Note the **Group ID** (numeric, without minus sign)

## OpenClaw Plugin Structure Reference

### `openclaw.plugin.json`

```json
{
  "id": "vk",
  "channels": ["vk"],
  "configSchema": { "type": "object", "additionalProperties": false, "properties": {} }
}
```

### `package.json` (openclaw manifest)

```json
{
  "name": "@openclaw/vk",
  "version": "0.0.1",
  "type": "module",
  "openclaw": {
    "extensions": ["./index.ts"],
    "channel": {
      "id": "vk",
      "label": "VK",
      "selectionLabel": "VK (VKontakte)",
      "docsPath": "/channels/vk",
      "blurb": "VK Bot API via Long Poll",
      "order": 95
    },
    "install": {
      "npmSpec": "@openclaw/vk",
      "localPath": "extensions/vk",
      "defaultChoice": "npm"
    }
  }
}
```

### `index.ts`

```ts
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { vkPlugin } from "./src/channel.js";
import { setVkRuntime } from "./src/runtime.js";

const plugin = {
  id: "vk",
  name: "VK",
  description: "VK (VKontakte) channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setVkRuntime(api.runtime);
    api.registerChannel({ plugin: vkPlugin });
  },
};
export default plugin;
```

### `src/runtime.ts`

```ts
import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setVkRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getVkRuntime(): PluginRuntime {
  if (!runtime) throw new Error("VK runtime not initialized");
  return runtime;
}
```

### ChannelPlugin Required Fields

```ts
const vkPlugin: ChannelPlugin = {
  id: "vk",
  meta: { id: "vk", label: "VK", selectionLabel: "VK (VKontakte)", docsPath: "/channels/vk", blurb: "..." },
  capabilities: { chatTypes: ["direct", "group"] },
  config: {
    listAccountIds: (cfg) => [...],
    resolveAccount: (cfg, accountId) => ({...}),
  },
  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4096,
    sendText: async ({ cfg, to, text, accountId }) => {
      // vkApi('messages.send', { peer_id, message, random_id })
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      // monitorVkProvider({ runtime, abortSignal, accountId })
    },
  },
};
```

### Monitor Pattern (from Tlon `processMessage`)

```ts
// Build inbound context
const route = core.channel.routing.resolveAgentRoute({
  cfg, channel: "vk", accountId,
  peer: { kind: isGroup ? "group" : "direct", id: peerId },
});

const body = core.channel.reply.formatAgentEnvelope({
  channel: "VK", from: fromLabel, timestamp, body: messageText,
});

const ctxPayload = core.channel.reply.finalizeInboundContext({
  Body: body,
  RawBody: messageText,
  CommandBody: messageText,
  From: `vk:${fromId}`,
  To: `vk:${botId}`,
  SessionKey: route.sessionKey,
  AccountId: route.accountId,
  ChatType: isGroup ? "group" : "direct",
  Provider: "vk",
  Surface: "vk",
  MessageSid: String(messageId),
  OriginatingChannel: "vk",
});

// Dispatch to agent and deliver reply
await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
  ctx: ctxPayload,
  cfg,
  dispatcherOptions: {
    deliver: async (payload) => {
      if (!payload.text) return;
      await vkApi('messages.send', {
        peer_id: peerId,
        message: payload.text,
        random_id: Math.floor(Math.random() * 2 ** 31),
      });
    },
    onError: (err) => runtime.error?.(`[vk] reply failed: ${String(err)}`),
  },
});
```

## Best Template: Tlon Extension

Tlon is the simplest complete channel plugin in OpenClaw:
- `channel.ts`: 392 lines
- `monitor/index.ts`: ~300 lines
- Clean entry point, no HTTP handlers, no custom CLI, no agent tools
- Same pattern VK needs: authenticate → poll/subscribe → dispatch inbound → deliver outbound

Located at: `extensions/tlon/` in the OpenClaw source.

## Alternatives Considered

- **node-vk-bot-api**: Last updated April 2021, old axios, no TypeScript. Not needed — raw fetch is simpler.
- **vk-io**: Actively maintained but unnecessary overhead for text-only messaging.
- **Standalone script (non-OpenClaw)**: Pattern from seedprod POC — `claude -p <msg> --output-format json --resume <session_id>`. ~60 lines but doesn't integrate with OpenClaw's agent/session/routing system.
