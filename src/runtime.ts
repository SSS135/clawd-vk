import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setVkRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getVkRuntime(): PluginRuntime {
  if (!runtime) throw new Error("VK runtime not initialized");
  return runtime;
}
