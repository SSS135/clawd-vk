import { getVkRuntime } from "./runtime.js";
import { getVkLog } from "./runtime.js";
import { resolveVkAccount } from "./types.js";
import {
  sendVkMessage,
  getGroupInfo,
  getLongPollServer,
  pollLongPoll,
  resolveScreenName,
} from "./vk-api.js";

interface MonitorOpts {
  cfg?: any;
  abortSignal?: AbortSignal;
  accountId?: string;
  setStatus?: (patch: Record<string, unknown>) => void;
}

const DEDUP_CAP = 2000;
const RECONNECT_DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Long Poll monitor loop. Polls VK for new messages and dispatches
// them through the OpenClaw agent pipeline.
export async function monitorVkProvider(opts: MonitorOpts): Promise<void> {
  const core = getVkRuntime();
  const log = getVkLog();
  const cfg = opts.cfg ?? core.config.loadConfig();
  const acct = resolveVkAccount(cfg, opts.accountId);

  if (!acct.configured) {
    throw new Error(
      `VK account "${acct.accountId}" is not configured (missing token or groupId)`,
    );
  }

  const { token, groupId, accountId } = acct;
  const signal = opts.abortSignal;

  // Verify token by fetching community info
  const groupInfo = await getGroupInfo(token, groupId);
  log.info(`[${accountId}] connected to community: ${groupInfo.name} (id: ${groupInfo.id})`);

  // Resolve allowFrom entries: pure-numeric strings are parsed directly,
  // others (screen names or vk.com URLs) are resolved via API
  const allowFrom: number[] = [];
  for (const entry of acct.allowFrom) {
    if (/^\d+$/.test(entry)) {
      allowFrom.push(Number(entry));
    } else {
      const id = await resolveScreenName(token, entry);
      if (id) {
        log.info(`[${accountId}] resolved allowFrom "${entry}" → ${id}`);
        allowFrom.push(id);
      } else {
        log.error(`[${accountId}] could not resolve allowFrom "${entry}" — skipping`);
      }
    }
  }

  // Obtain initial Long Poll server credentials
  let lp = await getLongPollServer(token, groupId);
  log.info(`[${accountId}] long poll started (allowFrom: ${allowFrom.length ? allowFrom.join(", ") : "none — blocking all"})`);

  // Dedup set prevents reprocessing the same message.
  // Evicts oldest half when it exceeds DEDUP_CAP.
  const seen = new Set<number>();

  while (!signal?.aborted) {
    let data;
    try {
      data = await pollLongPoll(lp.server, lp.key, lp.ts);
    } catch (err) {
      if (signal?.aborted) break;
      log.error(`[${accountId}] poll error: ${String(err)}`);
      await sleep(RECONNECT_DELAY_MS);
      try {
        lp = await getLongPollServer(token, groupId);
      } catch (refetchErr) {
        log.error(`[${accountId}] failed to re-fetch LP server: ${String(refetchErr)}`);
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
          log.error(`[${accountId}] failed to re-fetch LP server: ${String(refetchErr)}`);
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

      // Auth: reject senders not in the allowFrom list
      if (!allowFrom.includes(fromId)) {
        log.info(`[${accountId}] ignoring message from unauthorized user ${fromId}`);
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

      // Track inbound timestamp in gateway runtime
      opts.setStatus?.({ lastInboundAt: Date.now() });

      // Dispatch through agent pipeline; deliver callback sends VK reply
      await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
        ctx: ctxPayload,
        cfg,
        dispatcherOptions: {
          deliver: async (payload: any) => {
            if (payload.text) {
              await sendVkMessage(token, peerId, payload.text);
              opts.setStatus?.({ lastOutboundAt: Date.now() });
            }
          },
          onError: (err: unknown) => {
            log.error(`[${accountId}] reply failed: ${String(err)}`);
          },
        },
      });
    }
  }

  log.info(`[${accountId}] monitor shutting down`);
}
