import type { PluginRuntime } from "openclaw/plugin-sdk";
import { getVkRuntime } from "./runtime.js";
import { resolveVkAccount } from "./types.js";
import {
  sendVkMessage,
  getGroupInfo,
  getLongPollServer,
  pollLongPoll,
} from "./vk-api.js";

interface MonitorOpts {
  runtime?: PluginRuntime;
  abortSignal?: AbortSignal;
  accountId?: string;
}

const DEDUP_CAP = 2000;
const RECONNECT_DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Long Poll monitor loop. Polls VK for new messages and dispatches
// them through the OpenClaw agent pipeline.
export async function monitorVkProvider(opts: MonitorOpts): Promise<void> {
  const core = opts.runtime ?? getVkRuntime();
  const cfg = core.config;
  const acct = resolveVkAccount(cfg, opts.accountId);

  if (!acct.configured) {
    throw new Error(
      `VK account "${acct.accountId}" is not configured (missing token or groupId)`,
    );
  }

  const { token, groupId, accountId, allowFrom } = acct;
  const signal = opts.abortSignal;

  // Verify token by fetching community info
  const groupInfo = await getGroupInfo(token, groupId);
  core.log?.(`[vk] Connected to community: ${groupInfo.name} (id: ${groupInfo.id})`);

  // Obtain initial Long Poll server credentials
  let lp = await getLongPollServer(token, groupId);

  // Dedup set prevents reprocessing the same message.
  // Evicts oldest half when it exceeds DEDUP_CAP.
  const seen = new Set<number>();

  while (!signal?.aborted) {
    let data;
    try {
      data = await pollLongPoll(lp.server, lp.key, lp.ts);
    } catch (err) {
      if (signal?.aborted) break;
      core.error?.(`[vk] Poll error: ${String(err)}`);
      await sleep(RECONNECT_DELAY_MS);
      try {
        lp = await getLongPollServer(token, groupId);
      } catch (refetchErr) {
        core.error?.(`[vk] Failed to re-fetch LP server: ${String(refetchErr)}`);
      }
      continue;
    }

    // Handle Long Poll failed codes:
    //   1 = stale ts, update from response
    //   2/3 = stale key or session, re-fetch entire server
    if (data.failed) {
      if (data.failed === 1 && data.ts) {
        lp.ts = data.ts;
      } else {
        try {
          lp = await getLongPollServer(token, groupId);
        } catch (refetchErr) {
          core.error?.(`[vk] Failed to re-fetch LP server: ${String(refetchErr)}`);
          await sleep(RECONNECT_DELAY_MS);
        }
      }
      continue;
    }

    if (data.ts) {
      lp.ts = data.ts;
    }

    if (!data.updates) continue;

    for (const update of data.updates) {
      if ((update as any).type !== "message_new") continue;

      const msg = (update as any).object?.message;
      if (!msg) continue;

      const fromId: number = msg.from_id;
      const peerId: number = msg.peer_id;
      const text: string = msg.text ?? "";
      const messageId: number = msg.id;

      // Skip empty messages
      if (!text) continue;

      // Dedup: skip already-seen message IDs
      if (seen.has(messageId)) continue;
      seen.add(messageId);
      if (seen.size > DEDUP_CAP) {
        let count = 0;
        const half = Math.floor(DEDUP_CAP / 2);
        for (const id of seen) {
          if (count++ >= half) break;
          seen.delete(id);
        }
      }

      // Auth: if allowFrom is non-empty, reject unknown senders
      if (allowFrom.length > 0 && !allowFrom.includes(fromId)) {
        core.log?.(`[vk] Ignoring message from unauthorized user ${fromId}`);
        continue;
      }

      const chatType = peerId >= 2000000000 ? "group" : "direct";
      const fromLabel = `vk:${fromId}`;

      // Resolve which agent should handle this conversation
      const route = core.channel.routing.resolveAgentRoute({
        cfg,
        channel: "vk",
        accountId,
        peer: { kind: chatType, id: String(peerId) },
      });

      // Wrap the raw text in an agent envelope
      const body = core.channel.reply.formatAgentEnvelope({
        channel: "VK",
        from: fromLabel,
        timestamp: msg.date * 1000,
        body: text,
      });

      // Build the full inbound context payload
      const ctxPayload = core.channel.reply.finalizeInboundContext({
        Body: body,
        RawBody: text,
        CommandBody: text,
        From: fromLabel,
        To: `vk:${groupId}`,
        SessionKey: route.sessionKey,
        AccountId: route.accountId,
        ChatType: chatType,
        Provider: "vk",
        Surface: "vk",
        MessageSid: String(messageId),
        OriginatingChannel: "vk",
      });

      // Dispatch through agent pipeline; deliver callback sends VK reply
      await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
        ctx: ctxPayload,
        cfg,
        dispatcherOptions: {
          deliver: async (payload: any) => {
            if (payload.text) {
              await sendVkMessage(token, peerId, payload.text);
            }
          },
          onError: (err: unknown) => {
            core.error?.(`[vk] reply failed: ${String(err)}`);
          },
        },
      });
    }
  }

  core.log?.(`[vk] Monitor shutting down for account "${accountId}"`);
}
