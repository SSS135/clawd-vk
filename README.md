# @openclaw/vk

VK (VKontakte) channel plugin for OpenClaw. Uses VK Bot Long Poll API with zero dependencies (raw `fetch`).

## Setup

### 1. VK Side

1. Create a VK Community (or use existing)
2. Go to **Community Management > API Usage**
3. Generate a **group access token**
4. Enable **Incoming messages** in Long Poll API settings
5. Note the **Group ID** (numeric, without minus sign)

### 2. Link Plugin

Symlink into your OpenClaw extensions directory:

```bash
# Linux/macOS
ln -s /path/to/clawd-vk extensions/vk

# Windows (PowerShell as admin)
New-Item -ItemType SymbolicLink -Path extensions\vk -Target C:\path\to\clawd-vk
```

### 3. Configure & Run

```bash
openclaw setup    # Select VK channel, enter token + group ID
openclaw start    # Starts Long Poll monitor
```

## Files

| File | Purpose |
|---|---|
| `index.ts` | Entry point — registers VK channel plugin |
| `src/runtime.ts` | Singleton `PluginRuntime` holder |
| `src/vk-api.ts` | VK API wrapper (zero dependencies, raw fetch) |
| `src/types.ts` | Account types + config resolution |
| `src/channel.ts` | `ChannelPlugin` object (config, outbound, gateway, status) |
| `src/monitor.ts` | Long Poll loop + OpenClaw message dispatch |

## Standalone Test

Test VK connectivity without OpenClaw:

```bash
VK_TOKEN=your_token VK_GROUP_ID=your_id node test-vk.mjs
```

Or with Node.js 20.6+:

```bash
node --env-file=.env test-vk.mjs
```
