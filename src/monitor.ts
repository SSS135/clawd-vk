import { getVkRuntime } from "./runtime.js";
import { getVkLog } from "./runtime.js";
import { resolveVkAccount } from "./types.js";
import type { VkAttachment } from "./types.js";
import {
  sendVkMessage,
  getGroupInfo,
  getLongPollServer,
  pollLongPoll,
  resolveScreenName,
  fetchVkAttachment,
  uploadPhotoForMessage,
  uploadDocForMessage,
} from "./vk-api.js";

interface MonitorOpts {
  cfg?: any;
  abortSignal?: AbortSignal;
  accountId?: string;
  setStatus?: (patch: Record<string, unknown>) => void;
}

interface DownloadedMedia {
  path: string;
  contentType: string;
  placeholder: string;
}

const DEDUP_CAP = 2000;
const RECONNECT_DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pick the best photo URL from the VK sizes array (largest available).
function pickPhotoUrl(sizes: { type: string; url: string }[]): string | undefined {
  const preference = ["w", "z", "y", "x", "r", "q", "p", "o", "m", "s"];
  for (const t of preference) {
    const s = sizes.find((sz) => sz.type === t);
    if (s) return s.url;
  }
  return sizes[sizes.length - 1]?.url;
}

// Download a VK attachment and save it to the media store.
// Returns null for unsupported types.
async function downloadAttachment(
  att: VkAttachment,
  core: ReturnType<typeof getVkRuntime>,
  log: ReturnType<typeof getVkLog>,
): Promise<DownloadedMedia | null> {
  try {
    switch (att.type) {
      case "photo": {
        const url = pickPhotoUrl(att.photo.sizes);
        if (!url) return null;
        const { buffer, contentType } = await fetchVkAttachment(url);
        const saved = await core.channel.media.saveMediaBuffer(buffer, contentType, "inbound");
        return { path: saved.path, contentType: saved.contentType ?? contentType, placeholder: "<media:image>" };
      }
      case "doc": {
        const { buffer, contentType } = await fetchVkAttachment(att.doc.url);
        const saved = await core.channel.media.saveMediaBuffer(buffer, contentType, "inbound");
        return { path: saved.path, contentType: saved.contentType ?? contentType, placeholder: "<media:document>" };
      }
      case "audio_message": {
        const url = att.audio_message.link_ogg || att.audio_message.link_mp3;
        if (!url) return null;
        const { buffer, contentType } = await fetchVkAttachment(url);
        const saved = await core.channel.media.saveMediaBuffer(buffer, contentType, "inbound");
        return { path: saved.path, contentType: saved.contentType ?? contentType, placeholder: "<media:audio>" };
      }
      case "sticker": {
        const images = att.sticker.images;
        const url = images[images.length - 1]?.url;
        if (!url) return null;
        const { buffer, contentType } = await fetchVkAttachment(url);
        const saved = await core.channel.media.saveMediaBuffer(buffer, contentType, "inbound");
        return { path: saved.path, contentType: saved.contentType ?? contentType, placeholder: "<media:sticker>" };
      }
      case "graffiti": {
        const { buffer, contentType } = await fetchVkAttachment(att.graffiti.url);
        const saved = await core.channel.media.saveMediaBuffer(buffer, contentType, "inbound");
        return { path: saved.path, contentType: saved.contentType ?? contentType, placeholder: "<media:image>" };
      }
      default:
        return null;
    }
  } catch (err) {
    log.error(`failed to download ${att.type} attachment: ${String(err)}`);
    return null;
  }
}

// Upload a media file to VK and return the attachment string for messages.send.
async function uploadMediaToVk(
  token: string,
  peerId: number,
  buffer: Buffer,
  contentType: string,
  kind: string,
  audioAsVoice: boolean,
  log: ReturnType<typeof getVkLog>,
): Promise<string | null> {
  try {
    const ext = contentType.split("/")[1]?.split(";")[0] ?? "bin";
    if (kind === "image") {
      return await uploadPhotoForMessage(token, peerId, buffer, `image.${ext}`);
    }
    if (kind === "audio") {
      // VK audio_message requires OGG Opus; use it for ogg, fall back to doc for other audio
      const isOgg = contentType.includes("ogg");
      if (isOgg) {
        return await uploadDocForMessage(token, peerId, buffer, `voice.ogg`, "audio_message");
      }
      return await uploadDocForMessage(token, peerId, buffer, `audio.${ext}`, "doc");
    }
    // Everything else (documents, video, unknown) → doc upload
    return await uploadDocForMessage(token, peerId, buffer, `file.${ext}`, "doc");
  } catch (err) {
    log.error(`failed to upload media to VK: ${String(err)}`);
    return null;
  }
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
      const attachments: VkAttachment[] = msg.attachments ?? [];

      // Skip messages with no text and no attachments
      if (!text && attachments.length === 0) continue;

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

      // Download inbound attachments
      const media: DownloadedMedia[] = [];
      for (const att of attachments) {
        const result = await downloadAttachment(att, core, log);
        if (result) media.push(result);
      }

      // Build body text: original text + placeholders for media-only messages
      const placeholders = media.map((m) => m.placeholder);
      const bodyText = text || placeholders.join(" ");
      const rawBody = text || placeholders.join(" ");

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
        body: bodyText,
      });

      // Build the full inbound context payload
      const ctxPayload = core.channel.reply.finalizeInboundContext({
        Body: body,
        RawBody: rawBody,
        CommandBody: rawBody,
        From: fromLabel,
        To: `vk:${groupId}`,
        SessionKey: route.sessionKey,
        AccountId: route.accountId,
        ChatType: chatType,
        Provider: "vk",
        Surface: "vk",
        MessageSid: String(messageId),
        OriginatingChannel: "vk",
        // Media fields (following Telegram's pattern: paths for both Path and Url)
        ...(media.length > 0 && {
          MediaPath: media[0].path,
          MediaUrl: media[0].path,
          MediaType: media[0].contentType,
          MediaPaths: media.map((m) => m.path),
          MediaUrls: media.map((m) => m.path),
          MediaTypes: media.map((m) => m.contentType),
        }),
      });

      // Track inbound timestamp in gateway runtime
      opts.setStatus?.({ lastInboundAt: Date.now() });

      // Dispatch through agent pipeline; deliver callback sends VK reply
      await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
        ctx: ctxPayload,
        cfg,
        dispatcherOptions: {
          deliver: async (payload: any) => {
            const mediaUrls: string[] =
              payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []);
            const audioAsVoice = payload.audioAsVoice === true;

            // Upload each media URL and collect attachment strings
            const attachmentStrings: string[] = [];
            const failedUrls: string[] = [];
            for (const url of mediaUrls) {
              if (!url) continue;
              try {
                const loaded = await core.media.loadWebMedia(url);
                const kind = core.media.mediaKindFromMime(loaded.contentType ?? "");
                const attStr = await uploadMediaToVk(
                  token, peerId, loaded.buffer, loaded.contentType ?? "application/octet-stream",
                  kind, audioAsVoice, log,
                );
                if (attStr) attachmentStrings.push(attStr);
                else failedUrls.push(url);
              } catch (err) {
                log.error(`[${accountId}] failed to load/upload media ${url}: ${String(err)}`);
                failedUrls.push(url);
              }
            }

            const attachment = attachmentStrings.length > 0
              ? attachmentStrings.join(",")
              : undefined;

            // Fallback: include failed media URLs in the text so they're not silently dropped
            const msgText = [payload.text, ...failedUrls].filter(Boolean).join("\n");

            if (msgText || attachment) {
              await sendVkMessage(token, peerId, msgText, attachment);
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
