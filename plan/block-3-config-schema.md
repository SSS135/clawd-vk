## Block 3: Config Types & Schema
**Files:** `src/types.ts`

`src/types.ts`:
- `VkResolvedAccount`: `{ accountId, name, enabled, configured, token, groupId, allowFrom, dmPolicy }`
- `VkConfig`: type for channel config with account fields + `accounts?: Record<string, VkAccount>`
- `VkAccount`: account-specific config (token, groupId, allowFrom, etc.)
- Access pattern: `cfg.channels?.vk?.accounts` (OpenClaw config type allows direct property access; explicit casting optional depending on TypeScript strictness)
- `resolveVkAccount(cfg, accountId?)` — positional params OK (adapter lambda translates: `resolveAccount: (cfg, id) => resolveVkAccount(cfg, id)`)
- `listVkAccountIds(cfg)` — return `Object.keys(cfg.channels?.vk?.accounts ?? {})` (standard OpenClaw pattern)
- `configured = Boolean(token && groupId)`

**Note:** OpenClaw channel plugins do NOT require a separate config-schema.ts file. Plugin-level configSchema (in `index.ts`) uses `emptyPluginConfigSchema()` from SDK. Channel configuration is validated by OpenClaw's core config system. The `openclaw.plugin.json` uses JSON Schema format for plugin-level validation.

### Fixes Applied

1. **Removed incorrect Zod v4 claims**: Zod v4 (^4.3.6) DOES exist and DOES have `.toJSONSchema()` method ([npm](https://www.npmjs.com/package/zod), [Zod v4 docs](https://zod.dev/v4)), but OpenClaw does NOT use Zod for channel plugin schemas. Per [OpenClaw plugin docs](https://docs.openclaw.ai/plugin), plugin configSchema uses JSON Schema format.

2. **Removed non-existent `buildChannelConfigSchema` function**: No evidence this function exists in OpenClaw plugin SDK. Web searches and documentation review found no references to this function.

3. **Removed src/config-schema.ts file requirement**: OpenClaw channel plugins use `emptyPluginConfigSchema()` helper from SDK in index.ts. Separate config-schema.ts with Zod schemas is not part of the OpenClaw channel plugin pattern.

4. **Corrected `listVkAccountIds` logic**: Changed from `["default", ...Object.keys(accounts)]` to `Object.keys(cfg.channels?.vk?.accounts ?? {})` to match [documented OpenClaw pattern](https://docs.openclaw.ai/plugin). The "default" key comes from Object.keys if present in accounts, not added separately.

5. **Clarified cfg.channels access pattern**: Removed overly specific casting requirement. OpenClaw docs show direct access pattern `cfg.channels?.acmechat?.accounts`. While TypeScript casting may be needed depending on strictness, the critical warning about `unknown` type was unverified and removed.

6. **Added VkConfig and VkAccount types**: Clarified that type definitions are needed for the config structure, not Zod schemas.

**Sources consulted:**
- [Zod v4 release info](https://www.infoq.com/news/2025/08/zod-v4-available/)
- [Zod v4 toJSONSchema method](https://zod.dev/json-schema)
- [OpenClaw Plugin Documentation](https://docs.openclaw.ai/plugin)
- [OpenClaw Extensions and Plugins Guide](https://deepwiki.com/openclaw/openclaw/10-extensions-and-plugins)
