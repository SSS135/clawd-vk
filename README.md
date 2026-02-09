# @openclaw/vk

VK (VKontakte) channel plugin for [OpenClaw](https://github.com/nicepkg/openclaw). Receives messages via VK Bot Long Poll API and replies through the OpenClaw agent pipeline. Zero runtime dependencies — uses native `fetch`.

## Setup

### 1. VK Side

1. Create a VK community (or use an existing one)
2. **Manage > API usage > Create token** — grant the `messages` permission
3. Note the numeric **Group ID**

### 2. Install

```bash
# npm (when published)
openclaw install @openclaw/vk

# or symlink locally
ln -s /path/to/clawd-vk extensions/vk          # Linux/macOS
New-Item -ItemType SymbolicLink -Path extensions\vk -Target C:\path\to\clawd-vk  # Windows (admin)
```

### 3. Configure

```bash
openclaw setup   # interactive wizard — prompts for token, group ID, allowFrom
```

The wizard detects `VK_TOKEN` in the environment and offers to use it instead of storing the token in config.

Config is stored flat at `cfg.channels.vk`:

```jsonc
{
  "token": "vk1.a...",
  "groupId": "123456789",
  "allowFrom": ["61888439", "durov", "https://vk.com/sss135"],
  "enabled": true
}
```

`allowFrom` accepts numeric user IDs, screen names, or full `vk.com` profile URLs — all resolved to numeric IDs at monitor startup.

## Architecture

```
index.ts            register plugin with OpenClaw, stash PluginRuntime
src/channel.ts      ChannelPlugin — config CRUD, outbound send, gateway, status probe
src/onboarding.ts   interactive setup wizard (ChannelOnboardingAdapter)
src/monitor.ts      Long Poll loop — dedup, auth, routing, agent dispatch
src/vk-api.ts       thin VK API wrapper (POST URLSearchParams, API v5.199)
src/types.ts        VkConfig / VkResolvedAccount, flat config helpers
src/runtime.ts      PluginRuntime singleton + child logger
```

Single-account model — account ID is always `"default"`.

### Message flow

1. `monitor` obtains Long Poll credentials and enters poll loop
2. Incoming `message_new` events are deduplicated (bounded set, cap 2000) and auth-checked against `allowFrom`
3. `core.channel.routing` resolves the target agent; message is wrapped in an agent envelope
4. `core.channel.reply.dispatchReplyWithBufferedBlockDispatcher` runs the agent and streams reply blocks back via `messages.send`

`peer_id >= 2 000 000 000` → group chat; below → DM.

## Standalone Test

Test VK connectivity without OpenClaw:

```bash
VK_TOKEN=... VK_GROUP_ID=... node test-vk.mjs
```
