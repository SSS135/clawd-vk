## Block 5: Long Poll Monitor & Message Dispatch
**Files:** `src/monitor.ts`

`monitorVkProvider(opts: { runtime?, abortSignal?, accountId? })`:

1. `const core = getVkRuntime()`, load config, resolve account
2. Verify token: `getGroupInfo(token, groupId)` → log community name
3. Get LP server: `getLongPollServer(token, groupId)`
4. Dedup: `Set<number>` capped at 2000 entries
5. **Poll loop** (while not aborted):
   - `pollLongPoll(server, key, ts)`
   - Handle `failed` codes: 1→update ts, 2/3→re-fetch server (both treated same)
   - Network error: wait 3s, re-fetch LP server
   - For each `message_new` update:
     - **Message is at `update.object.message`** (NOT `update.object`)
     - Extract `msg.from_id`, `msg.peer_id`, `msg.text`, `msg.id`
     - Skip empty text, skip dedup
     - **Auth**: if `allowFrom` has entries AND `msg.from_id` not in list → skip, log
     - `chatType`: `peer_id >= 2000000000` → "group", else "direct"
     - `resolveAgentRoute({ cfg, channel: "vk", accountId, peer: { kind: chatType, id: String(peerId) } })`
     - `formatAgentEnvelope({ channel: "VK", from: fromLabel, timestamp: msg.date * 1000, body: msg.text })`
     - `finalizeInboundContext({ Body, RawBody, CommandBody, From, To, SessionKey, AccountId, ChatType, Provider: "vk", Surface: "vk", MessageSid, OriginatingChannel: "vk" })`
     - **Dispatch:**
       ```ts
       await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
         ctx: ctxPayload,
         cfg,
         dispatcherOptions: {
           deliver: async (payload) => {
             if (payload.text) await sendVkMessage(token, peerId, payload.text);
           },
           onError: (err) => { runtime.error?.(`[vk] reply failed: ${String(err)}`); },
         },
       });
       ```
6. On `abortSignal` abort → break loop, log shutdown

### Fixes Applied

1. **Removed `replyOptions: { onModelSelected }` parameter** — not shown in vk-plugin.md Monitor Pattern (lines 269-283)
2. **Removed `createReplyPrefixOptions` destructuring** — not referenced in vk-plugin.md
3. **Removed `...prefixOptions` spread into dispatcherOptions** — not in reference
4. **Removed `humanDelay` and `resolveHumanDelayConfig`** — not referenced in vk-plugin.md
5. **Removed `SenderName` and `SenderId` from `finalizeInboundContext`** — not shown in reference (lines 253-266)
6. **Fixed `onError` signature from `(err, info) => { ... info.kind ... }` to `(err)`** — reference shows simple signature (line 281)
7. **Simplified Long Poll `failed` handling** — test-vk.mjs (lines 58-64) treats `failed !== 1` uniformly as re-fetch, doesn't distinguish 2 vs 3
8. **Kept dedup Set approach** — reasonable pattern though not in minimal test
