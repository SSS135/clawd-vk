// Minimal VK Bot test — Node.js 18+ (zero dependencies)
// Usage: VK_TOKEN=your_token VK_GROUP_ID=your_group_id node test-vk.mjs

const TOKEN = process.env.VK_TOKEN;
const GROUP_ID = process.env.VK_GROUP_ID;
const API_V = '5.199';

if (!TOKEN || !GROUP_ID) {
  console.error('Usage: VK_TOKEN=xxx VK_GROUP_ID=123 node test-vk.mjs');
  process.exit(1);
}

async function vkApi(method, params = {}) {
  const body = new URLSearchParams({ ...params, access_token: TOKEN, v: API_V });
  const res = await fetch(`https://api.vk.com/method/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(`VK API [${method}] error ${json.error.error_code}: ${json.error.error_msg}`);
  }
  return json.response;
}

async function sendMessage(peerId, text) {
  return vkApi('messages.send', {
    peer_id: peerId,
    message: text,
    random_id: Math.floor(Math.random() * 2 ** 31),
  });
}

async function main() {
  // Verify token works
  const [group] = await vkApi('groups.getById', { group_id: GROUP_ID });
  console.log(`Bot connected to community: ${group.name} (id: ${group.id})`);

  // Get Long Poll server
  let { server, key, ts } = await vkApi('groups.getLongPollServer', { group_id: GROUP_ID });
  console.log('Long Poll started. Send a message to your community to test.\n');

  while (true) {
    let data;
    try {
      const res = await fetch(`${server}?act=a_check&key=${key}&ts=${ts}&wait=25`, {
        signal: AbortSignal.timeout(35_000),
      });
      data = await res.json();
    } catch (err) {
      console.error('Poll error:', err.message);
      await new Promise(r => setTimeout(r, 3000));
      ({ server, key, ts } = await vkApi('groups.getLongPollServer', { group_id: GROUP_ID }));
      continue;
    }

    if (data.failed) {
      if (data.failed === 1) { ts = data.ts; }
      else {
        ({ server, key, ts } = await vkApi('groups.getLongPollServer', { group_id: GROUP_ID }));
      }
      continue;
    }

    ts = data.ts;

    for (const update of data.updates) {
      if (update.type === 'message_new') {
        const msg = update.object.message;
        const chatType = msg.peer_id >= 2000000000 ? 'group-chat' : msg.peer_id < 0 ? 'community' : 'dm';
        console.log(`[${chatType}] from_id=${msg.from_id} peer_id=${msg.peer_id}: ${msg.text}`);

        // Echo reply
        try {
          await sendMessage(msg.peer_id, `Echo: ${msg.text}`);
          console.log(`  → replied`);
        } catch (err) {
          console.error(`  → reply failed: ${err.message}`);
        }
      } else {
        console.log(`[event] ${update.type}`);
      }
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
