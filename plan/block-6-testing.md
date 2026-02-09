## Block 6: Integration & Testing

1. Link plugin into openclaw:
   - Symlink: `extensions/vk` → `clawd-vk/` (dev, recommended)
   - Or add `clawd-vk/` to pnpm workspace and build
2. `openclaw setup` → configure VK → enter token, group ID, allowFrom
3. `openclaw start` → verify gateway starts VK channel
4. Test cases:
   - **Basic messaging:**
     - DM from allowed user → agent replies
     - DM from non-allowed user → silently dropped
     - Message with text + attachment → text extracted
     - Empty/attachment-only messages → skipped gracefully
   - **Error handling:**
     - Long Poll reconnect after network error
     - Invalid/expired token → error logged, channel fails gracefully
     - VK API rate limit → backoff/retry logic
   - **Edge cases:**
     - Very long message (>4096 chars) → split or truncate
     - Unicode/emoji in messages → preserved
     - Rapid messages from same user → all processed
   - **Group chats:**
     - Group message from allowed user → agent replies in group
     - Group message from non-allowed user → dropped
   - **Monitoring:**
     - `openclaw status` shows VK running
     - Conversation context persists across restarts

### Fixes Applied

1. **Removed redundant .env step** — Config handled by `openclaw setup`, no manual .env needed
2. **Clarified integration approach** — Symlink (dev) or pnpm workspace, not vague "copy/link"
3. **Reordered steps** — Integration setup before configuration
4. **Expanded test coverage** — Added missing cases:
   - Token expiry/invalid credentials
   - VK API rate limits with backoff
   - Messages with text + attachments
   - Unicode/emoji handling
   - Very long messages (VK 4096 char limit)
   - Rapid successive messages
   - Group chat scenarios (allowed/non-allowed users)
   - Conversation persistence across restarts
5. **Categorized test cases** — Grouped into Basic, Error Handling, Edge Cases, Group Chats, Monitoring for clarity
