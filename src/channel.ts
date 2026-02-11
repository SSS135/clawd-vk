import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk";
import type { VkResolvedAccount } from "./types.js";
import { resolveVkAccount, setVkConfig } from "./types.js";
import { vkApi, getGroupInfo, uploadPhotoForMessage, uploadDocForMessage } from "./vk-api.js";
import { convertToOggOpus } from "./audio-convert.js";
import { loadMedia } from "./media-loader.js";
import { monitorVkProvider } from "./monitor.js";
import { vkOnboardingAdapter } from "./onboarding.js";
import { getVkRuntime, getVkLog } from "./runtime.js";

// Flat JSON Schema for cfg.channels.vk — no accounts nesting, no dmPolicy
const vkChannelConfigSchema = {
  schema: {
    type: "object",
    properties: {
      token: { type: "string" },
      groupId: { type: "string" },
      allowFrom: { type: "array", items: { type: "string" } },
    },
  },
  uiHints: {
    token: {
      label: "Community Bot Token",
      help: "VK API token with messages permission. Get from Community Management > API Usage.",
      sensitive: true,
      placeholder: "vk1.a...",
    },
    groupId: {
      label: "Group ID",
      help: "Numeric VK community (group) ID.",
      placeholder: "123456789",
    },
  },
};

// Strip channel prefix from target (agent tools pass "vk:12345")
function stripVkPrefix(to: string): string {
  return to.replace(/^vk:/i, "").trim();
}

// Resolve account and peer_id, validate config
function resolveTarget(cfg: OpenClawConfig, to: string) {
  const acct = resolveVkAccount(cfg);
  if (!acct.configured) {
    throw new Error(`VK is not configured (missing token or groupId)`);
  }
  const peerId = Number(stripVkPrefix(to));
  if (Number.isNaN(peerId)) {
    throw new Error(`Invalid VK peer_id: ${to}`);
  }
  return { acct, peerId };
}

// Send a text-only message
async function deliverText(
  cfg: OpenClawConfig,
  _accountId: string,
  to: string,
  text: string,
): Promise<{ channel: "vk"; messageId: string }> {
  const { acct, peerId } = resolveTarget(cfg, to);
  const messageId = await vkApi(acct.token, "messages.send", {
    peer_id: peerId,
    message: text,
    random_id: Math.floor(Math.random() * 2 ** 31),
  });
  return { channel: "vk", messageId: String(messageId) };
}

// Send a message with a media attachment
async function deliverMedia(
  cfg: OpenClawConfig,
  _accountId: string,
  to: string,
  text: string,
  mediaUrl: string,
): Promise<{ channel: "vk"; messageId: string }> {
  const { acct, peerId } = resolveTarget(cfg, to);
  const log = getVkLog();
  const core = getVkRuntime();

  // Load and upload media; throw on failure so the agent sees the real error
  const loaded = await loadMedia(mediaUrl);
  const kind = core.media.mediaKindFromMime(loaded.contentType ?? "");
  const ext = (loaded.contentType ?? "").split("/")[1]?.split(";")[0] ?? "bin";
  log.info(`deliverMedia: mediaUrl=${mediaUrl} kind=${kind} contentType=${loaded.contentType} size=${loaded.buffer.length} ext=${ext}`);

  let attachment: string;
  if (kind === "image") {
    attachment = await uploadPhotoForMessage(acct.token, peerId, loaded.buffer, `image.${ext}`);
  } else if (kind === "audio") {
    const oggBuffer = convertToOggOpus(loaded.buffer, ext);
    log.info(`deliverMedia: converted to OGG Opus, size=${oggBuffer.length}`);
    attachment = await uploadDocForMessage(acct.token, peerId, oggBuffer, "voice.ogg", "audio_message");
  } else {
    attachment = await uploadDocForMessage(acct.token, peerId, loaded.buffer, loaded.fileName ?? `file.${ext}`, "doc");
  }
  log.info(`deliverMedia: attachment=${attachment}`);

  const messageId = await vkApi(acct.token, "messages.send", {
    peer_id: peerId,
    ...(text ? { message: text } : {}),
    attachment,
    random_id: Math.floor(Math.random() * 2 ** 31),
  });
  log.info(`deliverMedia: sent messageId=${messageId}`);
  return { channel: "vk", messageId: String(messageId) };
}

export const vkPlugin: ChannelPlugin<VkResolvedAccount> = {
  id: "vk",
  meta: {
    id: "vk",
    label: "VK",
    selectionLabel: "VK (VKontakte)",
    docsPath: "/channels/vk",
    blurb: "VK Bot API via Long Poll",
  },
  capabilities: { chatTypes: ["direct", "group"], media: true },
  configSchema: vkChannelConfigSchema,
  onboarding: vkOnboardingAdapter,

  setup: {
    applyAccountConfig({ cfg, input }) {
      const patch: Record<string, unknown> = { enabled: true };
      if (input.token?.trim()) {
        patch.token = input.token.trim();
      }
      const raw = input as Record<string, unknown>;
      if (typeof raw.groupId === "string" && raw.groupId.trim()) {
        patch.groupId = raw.groupId.trim();
      }
      return setVkConfig(cfg, patch);
    },
    validateInput({ input }) {
      const raw = input as Record<string, unknown>;
      if (!input.token?.trim() && !(typeof raw.groupId === "string" && raw.groupId.trim())) {
        return "VK requires a community bot token and group ID";
      }
      return null;
    },
  },

  config: {
    listAccountIds: () => ["default"],

    resolveAccount: (cfg: OpenClawConfig) => resolveVkAccount(cfg),

    defaultAccountId: () => "default",

    setAccountEnabled: ({ cfg, enabled }) => setVkConfig(cfg, { enabled }),

    deleteAccount: ({ cfg }) => ({
      ...cfg,
      channels: {
        ...cfg.channels,
        vk: {},
      },
    }),

    isConfigured: (account: VkResolvedAccount) => account.configured,

    describeAccount: (account: VkResolvedAccount) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      credentialSource: account.configured ? "config" : undefined,
    }),
  },

  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4096,

    async sendText({ cfg, to, text, accountId }) {
      return deliverText(cfg, accountId, to, text);
    },

    async sendMedia({ cfg, to, text, mediaUrl, accountId }) {
      return deliverMedia(cfg, accountId, to, text, mediaUrl ?? "");
    },
  },

  gateway: {
    async startAccount(ctx) {
      await monitorVkProvider({
        cfg: ctx.cfg,
        abortSignal: ctx.abortSignal,
        accountId: ctx.accountId,
        setStatus: ctx.setStatus,
      });
    },
  },

  status: {
    buildAccountSnapshot({ account, runtime, probe }: {
      account: VkResolvedAccount;
      cfg: OpenClawConfig;
      runtime?: Record<string, unknown>;
      probe?: unknown;
    }) {
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured: account.configured,
        running: (runtime?.running as boolean) ?? false,
        lastStartAt: (runtime?.lastStartAt as number) ?? null,
        lastStopAt: (runtime?.lastStopAt as number) ?? null,
        lastError: (runtime?.lastError as string) ?? null,
        lastInboundAt: (runtime?.lastInboundAt as number) ?? null,
        lastOutboundAt: (runtime?.lastOutboundAt as number) ?? null,
        probe,
      };
    },

    async probeAccount({ account }: {
      account: VkResolvedAccount;
      timeoutMs: number;
      cfg: OpenClawConfig;
    }) {
      if (!account.configured) {
        return { ok: false, error: "Account not configured (missing token or groupId)" };
      }
      try {
        const info = await getGroupInfo(account.token, account.groupId);
        return { ok: true, detail: `Connected to group "${info.name}"` };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  },
};
