const VK_API_BASE = "https://api.vk.com/method/";
const VK_API_VERSION = "5.199";

export interface VkGroupInfo {
  id: number;
  name: string;
  screen_name: string;
  is_closed: number;
  type: string;
  photo_50?: string;
  photo_100?: string;
  photo_200?: string;
}

export interface VkLongPollServer {
  server: string;
  key: string;
  ts: string;
}

export interface VkLongPollResponse {
  ts?: string;
  updates?: unknown[];
  failed?: number;
}

// Generic VK API call. POST with URLSearchParams, returns json.response.
export async function vkApi(
  token: string,
  method: string,
  params: Record<string, string | number> = {},
): Promise<any> {
  const body = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ),
    access_token: token,
    v: VK_API_VERSION,
  });

  const res = await fetch(`${VK_API_BASE}${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json = await res.json();
  if (json.error) {
    throw new Error(
      `VK API [${method}] error ${json.error.error_code}: ${json.error.error_msg}`,
    );
  }
  return json.response;
}

// Send a message with optional attachment string.
// Skips silently when both text and attachment are empty.
export async function sendVkMessage(
  token: string,
  peerId: number,
  text: string,
  attachment?: string,
): Promise<void> {
  if (!text && !attachment) return;
  const params: Record<string, string | number> = {
    peer_id: peerId,
    random_id: Math.floor(Math.random() * 2 ** 31),
  };
  if (text) params.message = text;
  if (attachment) params.attachment = attachment;
  await vkApi(token, "messages.send", params);
}

// Fetch a file from a VK CDN URL (pre-signed, no token needed).
export async function fetchVkAttachment(
  url: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch VK attachment: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  return { buffer, contentType };
}

// Upload a photo for use in messages.send attachment parameter.
// 3-step: getMessagesUploadServer → multipart POST → saveMessagesPhoto
// Returns attachment string like "photo<owner_id>_<id>"
export async function uploadPhotoForMessage(
  token: string,
  peerId: number,
  buffer: Buffer,
  filename: string,
): Promise<string> {
  // Step 1: get upload URL
  const { upload_url } = await vkApi(token, "photos.getMessagesUploadServer", {
    peer_id: peerId,
  });

  // Step 2: upload the file via multipart POST
  const form = new FormData();
  form.append("photo", new Blob([buffer]), filename);
  const uploadRes = await fetch(upload_url, { method: "POST", body: form });
  const uploadData = await uploadRes.json();
  if (uploadData.error) {
    throw new Error(`VK photo upload failed: ${JSON.stringify(uploadData.error)}`);
  }

  // Step 3: save and get the attachment reference
  const saved = await vkApi(token, "photos.saveMessagesPhoto", {
    photo: uploadData.photo,
    server: uploadData.server,
    hash: uploadData.hash,
  });
  const photo = saved[0];
  return `photo${photo.owner_id}_${photo.id}`;
}

// Upload a document (or voice/graffiti) for use in messages.send attachment.
// type: "doc" (default), "audio_message", "graffiti"
// Returns attachment string like "doc<owner_id>_<id>" or "audio_message<owner_id>_<id>"
export async function uploadDocForMessage(
  token: string,
  peerId: number,
  buffer: Buffer,
  filename: string,
  type: "doc" | "audio_message" | "graffiti" = "doc",
): Promise<string> {
  // Step 1: get upload URL
  const { upload_url } = await vkApi(token, "docs.getMessagesUploadServer", {
    peer_id: peerId,
    type,
  });

  // Step 2: upload the file via multipart POST
  const form = new FormData();
  form.append("file", new Blob([buffer]), filename);
  const uploadRes = await fetch(upload_url, { method: "POST", body: form });
  const uploadData = await uploadRes.json();
  if (uploadData.error) {
    throw new Error(`VK doc upload failed: ${JSON.stringify(uploadData.error)}`);
  }

  // Step 3: save the doc
  const saved = await vkApi(token, "docs.save", {
    file: uploadData.file,
  });
  const doc = saved.doc ?? saved;
  const prefix = type === "audio_message" ? "audio_message" : "doc";
  return `${prefix}${doc.owner_id}_${doc.id}`;
}

// Fetch community info. Returns the first group object.
export async function getGroupInfo(
  token: string,
  groupId: string | number,
): Promise<VkGroupInfo> {
  const response = await vkApi(token, "groups.getById", {
    group_id: groupId,
  });
  return (response.groups ?? response)[0];
}

// Obtain Long Poll server credentials for a community.
export async function getLongPollServer(
  token: string,
  groupId: string | number,
): Promise<VkLongPollServer> {
  return vkApi(token, "groups.getLongPollServer", {
    group_id: groupId,
  }) as Promise<VkLongPollServer>;
}

// Resolve a screen name (or vk.com URL) to a numeric user ID.
// Returns the numeric ID or null if not found / not a user.
export async function resolveScreenName(
  token: string,
  screenName: string,
): Promise<number | null> {
  // Strip vk.com URL prefix if present
  const name = screenName
    .replace(/^https?:\/\/(www\.)?vk\.com\//i, "")
    .replace(/\/.*$/, "")
    .trim();
  if (!name) return null;

  const result = await vkApi(token, "utils.resolveScreenName", {
    screen_name: name,
  });
  // API returns empty array or {} when not found
  if (!result || !result.object_id || result.type !== "user") return null;
  return result.object_id;
}

// Single Long Poll GET request. 35 s timeout covers the 25 s wait param.
export async function pollLongPoll(
  server: string,
  key: string,
  ts: string,
): Promise<VkLongPollResponse> {
  const url = `${server}?act=a_check&key=${key}&ts=${ts}&wait=25`;
  const res = await fetch(url, { signal: AbortSignal.timeout(35_000) });
  return res.json() as Promise<VkLongPollResponse>;
}
