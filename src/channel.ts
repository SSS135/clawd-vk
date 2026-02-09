import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk";
import type { VkResolvedAccount } from "./types.js";
import { listVkAccountIds, resolveVkAccount } from "./types.js";
import { vkApi, getGroupInfo } from "./vk-api.js";
import { monitorVkProvider } from "./monitor.js";

// JSON Schema describing the cfg.channels.vk section
const vkChannelConfigSchema = {
  type: "object" as const,
  properties: {
    accounts: {
      type: "object" as const,
      additionalProperties: {
        type: "object" as const,
        properties: {
          token: { type: "string" as const },
          groupId: { type: "string" as const },
          allowFrom: {
            type: "array" as const,
            items: { type: "number" as const },
          },
          enabled: { type: "boolean" as const },
          dmPolicy: { type: "string" as const },
        },
      },
    },
  },
};

// Shared send logic used by both sendText and sendMedia
async function deliverText(
  cfg: OpenClawConfig,
  accountId: string,
  to: string,
  text: string,
): Promise<{ channel: "vk"; messageId: string }> {
  const acct = resolveVkAccount(cfg, accountId);
  if (!acct.configured) {
    throw new Error(`VK account "${accountId}" is not configured`);
  }
  const peerId = Number(to);
  if (Number.isNaN(peerId)) {
    throw new Error(`Invalid VK peer_id: ${to}`);
  }
  // messages.send returns the sent message ID
  const messageId = await vkApi(acct.token, "messages.send", {
    peer_id: peerId,
    message: text,
    random_id: Math.floor(Math.random() * 2 ** 31),
  });
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
  capabilities: { chatTypes: ["direct", "group"] },
  configSchema: vkChannelConfigSchema,

  config: {
    listAccountIds(cfg: OpenClawConfig): string[] {
      return listVkAccountIds(cfg);
    },

    resolveAccount(
      cfg: OpenClawConfig,
      accountId: string,
    ): VkResolvedAccount {
      return resolveVkAccount(cfg, accountId);
    },

    defaultAccountId(cfg: OpenClawConfig): string | undefined {
      const ids = listVkAccountIds(cfg);
      return ids[0];
    },

    setAccountEnabled(
      cfg: OpenClawConfig,
      accountId: string,
      enabled: boolean,
    ): void {
      const channels = ((cfg as any).channels ??= {});
      const vk = (channels.vk ??= {});
      const accounts = (vk.accounts ??= {});
      const acct = (accounts[accountId] ??= {});
      acct.enabled = enabled;
    },

    deleteAccount(cfg: OpenClawConfig, accountId: string): void {
      const vk = (cfg as any).channels?.vk;
      if (vk?.accounts) {
        delete vk.accounts[accountId];
      }
    },

    isConfigured(cfg: OpenClawConfig): boolean {
      return listVkAccountIds(cfg).some(
        (id) => resolveVkAccount(cfg, id).configured,
      );
    },

    describeAccount(cfg: OpenClawConfig, accountId: string): string {
      const acct = resolveVkAccount(cfg, accountId);
      if (!acct.configured) return `${acct.name} (not configured)`;
      return `${acct.name} (group ${acct.groupId})`;
    },
  },

  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4096,

    async sendText({ cfg, to, text, accountId }) {
      return deliverText(cfg, accountId, to, text);
    },

    async sendMedia({ cfg, to, text, mediaUrl, accountId }) {
      // Append media URL to message body as a simple fallback
      const combined = [text, mediaUrl].filter(Boolean).join("\n");
      return deliverText(cfg, accountId, to, combined);
    },
  },

  gateway: {
    async startAccount(ctx) {
      await monitorVkProvider({
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        accountId: ctx.accountId,
      });
    },
  },

  status: {
    async probeAccount(cfg: OpenClawConfig, accountId: string) {
      const acct = resolveVkAccount(cfg, accountId);
      if (!acct.configured) {
        return { ok: false, error: "Account not configured (missing token or groupId)" };
      }
      try {
        const info = await getGroupInfo(acct.token, acct.groupId);
        return { ok: true, detail: `Connected to group "${info.name}"` };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  },
};
