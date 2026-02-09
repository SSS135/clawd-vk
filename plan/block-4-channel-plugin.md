## Block 4: Channel Plugin Object
**Files:** `src/channel.ts`

Imports — **must split type-only and value imports**:
```ts
import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk";
// Note: Other SDK types/utils discovered during implementation
```

The `ChannelPlugin<VkResolvedAccount>`:
- `id: "vk"`, `meta`, `capabilities: { chatTypes: ["direct", "group"] }`
- `configSchema: vkChannelConfigSchema`

**config adapter**:
- Required methods: listAccountIds, resolveAccount, defaultAccountId, setAccountEnabled, deleteAccount, isConfigured, describeAccount
- Use channel key `"vk"` to access `cfg.channels.vk`
- Follow Tlon pattern (inspect Tlon extension for config helpers)

**setup adapter** (if needed):
- Validate token + groupId present
- Merge into `cfg.channels.vk`
- Note: ChannelSetupInput structure TBD from Tlon reference

**outbound adapter**:
- `deliveryMode: "direct"`, `textChunkLimit: 4096`
- `sendText` returns `{ channel: "vk", messageId: String(id) }` (duck-type return structure)
- `sendMedia` — simple approach: append mediaUrl to text, delegate to sendText

**gateway adapter**:
- `startAccount(ctx)` — ctx provides at minimum: runtime, abortSignal, accountId
- Call `monitorVkProvider({ runtime: ctx.runtime, abortSignal: ctx.abortSignal, accountId: ctx.accountId })`
- Note: Other ctx fields (cfg, account, log, setStatus) TBD from Tlon reference

**status adapter** (if needed):
- `probeAccount` — call `getGroupInfo`, return ok/error structure
- `collectStatusIssues` — flag unconfigured accounts
- `buildAccountSnapshot` — return status snapshot (structure TBD from Tlon reference)

### Fixes Applied

1. **Removed hallucinated imports**: DEFAULT_ACCOUNT_ID, normalizeAccountId, applyAccountNameToChannelSection, createReplyPrefixOptions not grounded in reference doc. Replaced with placeholder noting SDK imports TBD.

2. **Removed `reload` config**: `reload: { configPrefixes: ["channels.vk"] }` pattern not mentioned in vk-plugin.md — likely hallucinated from other OpenClaw patterns.

3. **Hedged ChannelSetupInput claims**: Removed specific claim about `token` field already existing. Changed to "structure TBD from Tlon reference."

4. **Removed sendMedia "matches Tlon pattern" claim**: vk-plugin.md doesn't describe Tlon's media handling pattern. Reframed as "simple approach."

5. **Hedged gateway ctx shape**: Reference only confirms runtime, abortSignal, accountId. Moved other fields (cfg, account, log, setStatus) to "TBD from Tlon reference."

6. **Removed ChannelAccountSnapshot type**: Specific type name not in reference. Changed to "status snapshot (structure TBD)."

7. **Added "(if needed)" qualifiers**: setup and status adapters not explicitly shown in vk-plugin.md's minimal ChannelPlugin structure (lines 215-238), so marked as potentially optional.

**Rationale**: The original block made overly specific claims about SDK internals (utility functions, type field names, config patterns) not grounded in vk-plugin.md. The rewrite defers to "inspect Tlon extension" for these implementation details, which is the appropriate approach given we don't have SDK source access.
