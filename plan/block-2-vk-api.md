## Block 2: VK API Layer
**Files:** `src/vk-api.ts`

- `vkApi(token, method, params?)` — POST `https://api.vk.com/method/${method}`, URLSearchParams, `v=5.199`. Returns `json.response`, throws on `json.error`
- `sendVkMessage(token, peerId, text)` — `messages.send` with `random_id = Math.floor(Math.random() * 2**31)`. Guard: skip if `text` is empty
- `getGroupInfo(token, groupId)` — `groups.getById`. Returns array, use `response[0]` to get first group
- `getLongPollServer(token, groupId)` — returns `{ server, key, ts }` (ts is string, not number)
- `pollLongPoll(server, key, ts)` — GET with `AbortSignal.timeout(35_000)`. Returns raw JSON

Zero dependencies, raw `fetch` only.

### Fixes Applied

**Fixed `groups.getById` response format claim**:
- **Was**: "CRITICAL: v5.199 returns `{ groups: [...], profiles: [] }` NOT a flat array. Must use `response.groups[0]`, not `response[0]`"
- **Now**: "Returns array, use `response[0]` to get first group"
- **Why**: Working test-vk.mjs (line 37) uses `const [group] = await vkApi('groups.getById', ...)` proving response is a flat array. Confirmed by VK API docs showing response format `{"response":[{"gid":...}]}` accessed via `response[0]`. See: [Automated posting on Vkontakte](https://avleonov.com/2017/07/10/automated-posting-on-vkontakte-public-pages-using-vk-api-and-python/)

**Verified correct**:
- `pollLongPoll` GET method: Confirmed by test and [VK Long Poll documentation](https://vk-api.readthedocs.io/en/latest/longpoll.html)
- Function signatures with token as first param: Appropriate for reusable module architecture
