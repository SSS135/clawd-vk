import type { OpenClawConfig } from "openclaw/plugin-sdk";

// Per-account settings stored in config at cfg.channels.vk.accounts[id]
export interface VkAccount {
  token?: string;
  groupId?: string;
  allowFrom?: number[];
  enabled?: boolean;
  dmPolicy?: string;
}

// Channel-level config living at cfg.channels.vk
export interface VkConfig {
  accounts?: Record<string, VkAccount>;
}

// Normalized account returned by resolveVkAccount
export interface VkResolvedAccount {
  accountId: string;
  name: string;
  enabled: boolean;
  configured: boolean;
  token: string;
  groupId: string;
  allowFrom: number[];
  dmPolicy: string;
}

// Return all account IDs defined under cfg.channels.vk.accounts
export function listVkAccountIds(cfg: OpenClawConfig): string[] {
  const vk = (cfg as any).channels?.vk as VkConfig | undefined;
  return Object.keys(vk?.accounts ?? {});
}

// Resolve a single account into a normalized VkResolvedAccount.
// When accountId is omitted, falls back to the first available account.
export function resolveVkAccount(
  cfg: OpenClawConfig,
  accountId?: string,
): VkResolvedAccount {
  const vk = (cfg as any).channels?.vk as VkConfig | undefined;
  const accounts = vk?.accounts ?? {};

  const id = accountId ?? Object.keys(accounts)[0] ?? "default";
  const acct: VkAccount = accounts[id] ?? {};

  const token = acct.token ?? "";
  const groupId = acct.groupId ?? "";

  return {
    accountId: id,
    name: id,
    enabled: acct.enabled !== false,
    configured: Boolean(token && groupId),
    token,
    groupId,
    allowFrom: acct.allowFrom ?? [],
    dmPolicy: acct.dmPolicy ?? "allow",
  };
}
