import type { OpenClawConfig } from "openclaw/plugin-sdk";

// --- VK attachment types (inbound) ---

export interface VkPhotoSize {
  type: string; // s, m, x, o, p, q, r, y, z, w
  url: string;
  width: number;
  height: number;
}

export interface VkPhotoAttachment {
  type: "photo";
  photo: {
    id: number;
    owner_id: number;
    sizes: VkPhotoSize[];
    text?: string;
  };
}

export interface VkDocAttachment {
  type: "doc";
  doc: {
    id: number;
    owner_id: number;
    title: string;
    size: number;
    ext: string;
    url: string;
  };
}

export interface VkAudioMessageAttachment {
  type: "audio_message";
  audio_message: {
    id: number;
    owner_id: number;
    duration: number;
    link_ogg: string;
    link_mp3: string;
  };
}

export interface VkStickerAttachment {
  type: "sticker";
  sticker: {
    sticker_id: number;
    product_id: number;
    images: { url: string; width: number; height: number }[];
    animation_url?: string;
  };
}

export interface VkVideoAttachment {
  type: "video";
  video: {
    id: number;
    owner_id: number;
    title: string;
    duration?: number;
    image?: { url: string; width: number; height: number }[];
    player?: string;
  };
}

export interface VkGraffitiAttachment {
  type: "graffiti";
  graffiti: {
    id: number;
    owner_id: number;
    url: string;
    width: number;
    height: number;
  };
}

export type VkAttachment =
  | VkPhotoAttachment
  | VkDocAttachment
  | VkAudioMessageAttachment
  | VkStickerAttachment
  | VkVideoAttachment
  | VkGraffitiAttachment;

// --- Channel config ---

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
