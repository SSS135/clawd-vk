import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { vkPlugin } from "./src/channel.js";
import { setVkRuntime } from "./src/runtime.js";

const plugin = {
  id: "vk",
  name: "VK",
  description: "VK (VKontakte) channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setVkRuntime(api.runtime);
    api.registerChannel({ plugin: vkPlugin });
  },
};
export default plugin;
