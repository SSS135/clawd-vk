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

// Send a text message. Skips silently when text is empty.
export async function sendVkMessage(
  token: string,
  peerId: number,
  text: string,
): Promise<void> {
  if (!text) return;
  await vkApi(token, "messages.send", {
    peer_id: peerId,
    message: text,
    random_id: Math.floor(Math.random() * 2 ** 31),
  });
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
