## Block 1: Scaffolding & Package Config
**Files:** `package.json`, `openclaw.plugin.json`, `index.ts`, `src/runtime.ts`

`package.json`:
- `"name": "@openclaw/vk"`, `"type": "module"`, `"version": "0.0.1"`
- `"openclaw"` manifest with `extensions: ["./index.ts"]`, `channel: { id, label, selectionLabel, docsPath, blurb, order }`, `install: { npmSpec, localPath, defaultChoice }`
- Channel fields: `id: "vk"`, `label: "VK"`, `selectionLabel: "VK (VKontakte)"`, `docsPath: "/channels/vk"`, `blurb: "VK Bot API via Long Poll"`, `order: 95`
- Install fields: `npmSpec: "@openclaw/vk"`, `localPath: "extensions/vk"`, `defaultChoice: "npm"`

`openclaw.plugin.json`:
```json
{ "id": "vk", "channels": ["vk"], "configSchema": { "type": "object", "additionalProperties": false, "properties": {} } }
```

`index.ts`:
- `import type { OpenClawPluginApi } from "openclaw/plugin-sdk"` (type-only!)
- `import { emptyPluginConfigSchema } from "openclaw/plugin-sdk"` (value)
- `import { vkPlugin } from "./src/channel.js"`
- `import { setVkRuntime } from "./src/runtime.js"`
- `const plugin = { id: "vk", name: "VK", description: "VK (VKontakte) channel plugin", configSchema: emptyPluginConfigSchema(), register(api: OpenClawPluginApi) { setVkRuntime(api.runtime); api.registerChannel({ plugin: vkPlugin }); } }`
- **Must be `export default plugin`** (default export, not named)

`src/runtime.ts`:
- `import type { PluginRuntime } from "openclaw/plugin-sdk"` (type-only!)
- `let runtime: PluginRuntime | null = null;`
- `export function setVkRuntime(next: PluginRuntime) { runtime = next; }`
- `export function getVkRuntime(): PluginRuntime { if (!runtime) throw new Error("VK runtime not initialized"); return runtime; }`

### Fixes Applied

1. **Removed hallucinated Zod dependency**: Plan claimed Zod v4.3.6 required for `.toJSONSchema()`, but Zod v4 doesn't exist and reference package.json shows no dependencies.
2. **Removed devDependencies claim**: Reference example doesn't include devDependencies section.
3. **Removed hallucinated manifest fields**: `docsLabel` and `quickstartAllowFrom` don't appear in reference — only `id, label, selectionLabel, docsPath, blurb, order` exist.
4. **Added missing index.ts imports**: Reference shows `vkPlugin` and `setVkRuntime` imports required for register function.
5. **Completed index.ts register implementation**: Added actual function body: `setVkRuntime(api.runtime); api.registerChannel({ plugin: vkPlugin });`
6. **Added runtime.ts type annotations**: Specified `PluginRuntime | null` type and null initialization.
7. **Added runtime.ts error handling**: Included error throw in `getVkRuntime()` when runtime not initialized.
