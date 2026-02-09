## Block 0: Project Setup & Secrets
**Files:** `.env`, `.gitignore`

- `.env` — store `VK_TOKEN` and `VK_GROUP_ID` (used for local testing only; OpenClaw stores config in `~/.openclaw/openclaw.json`)
- `.gitignore` — ignore `.env`, `node_modules/`, `dist/`
- `test-vk.mjs` reads from `process.env` — pass vars on command line or use `node --env-file=.env test-vk.mjs` (Node.js 20.6+)

### Fixes Applied
- **Corrected hallucinated claim**: Original stated "Keep `test-vk.mjs` updated to read from `.env`" but the test file doesn't read from `.env` files — it reads from `process.env`. Updated to accurately describe how to use environment variables with the test script (command-line vars or `--env-file` flag).
