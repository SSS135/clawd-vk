import type { OpenClawConfig } from "openclaw/plugin-sdk";

// Flat channel config at cfg.channels.vk
export interface VkConfig {
  enabled?: boolean;
  token?: string;
  groupId?: string;
  allowFrom?: string[];
}

// Normalized account returned by resolveVkAccount.
// allowFrom contains raw entries (numeric IDs, screen names, or vk.com URLs);
// the monitor resolves strings to numeric IDs at startup.
export interface VkResolvedAccount {
  accountId: string;
  name: string;
  enabled: boolean;
  configured: boolean;
  token: string;
  groupId: string;
  allowFrom: string[];
}

// Immutable flat config update: patches cfg.channels.vk directly
export function setVkConfig(
  cfg: OpenClawConfig,
  patch: Record<string, unknown>,
): OpenClawConfig {
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      vk: {
        ...(cfg as any).channels?.vk,
        ...patch,
      },
    },
  };
}

// Single-account: always "default"
export function listVkAccountIds(_cfg: OpenClawConfig): string[] {
  return ["default"];
}

// Resolve the flat VK config into a normalized VkResolvedAccount.
export function resolveVkAccount(
  cfg: OpenClawConfig,
  _accountId?: string,
): VkResolvedAccount {
  const vk = (cfg as any).channels?.vk as VkConfig | undefined;

  return {
    accountId: "default",
    name: "default",
    enabled: vk?.enabled !== false,
    configured: Boolean(vk?.token && vk?.groupId),
    token: vk?.token ?? "",
    groupId: vk?.groupId ?? "",
    allowFrom: vk?.allowFrom ?? [],
  };
}
