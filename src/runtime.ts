import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setVkRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getVkRuntime(): PluginRuntime {
  if (!runtime) throw new Error("VK runtime not initialized");
  return runtime;
}

// Channel logger created from PluginRuntime.logging
let _log: { info: (msg: string) => void; error: (msg: string) => void; debug?: (msg: string) => void } | null = null;

export function getVkLog() {
  if (!_log) {
    const rt = getVkRuntime();
    _log = rt.logging.getChildLogger({ subsystem: "vk" });
  }
  return _log;
}
