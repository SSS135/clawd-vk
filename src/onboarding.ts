import type { OpenClawConfig } from "openclaw/plugin-sdk";
import {
  formatDocsLink,
  type ChannelOnboardingAdapter,
  type WizardPrompter,
} from "openclaw/plugin-sdk";
import { resolveVkAccount, setVkConfig } from "./types.js";

const channel = "vk" as const;

async function noteVkTokenHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) Create a VK community (group) or use an existing one",
      "2) Go to Manage → API usage → Create token",
      '3) Grant "messages" permission',
      "4) Copy the token",
      "Tip: you can also set VK_TOKEN in your env.",
      `Docs: ${formatDocsLink("/channels/vk")}`,
    ].join("\n"),
    "VK community bot token",
  );
}

async function promptVkAllowFrom(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
}): Promise<OpenClawConfig> {
  const { cfg, prompter } = params;
  const resolved = resolveVkAccount(cfg);
  const existing = resolved.allowFrom ?? [];

  const entry = await prompter.text({
    message: "VK allowFrom (comma-separated user IDs, screen names, or vk.com URLs)",
    placeholder: "sss135, 61888439, https://vk.com/durov",
    initialValue: existing[0] ? String(existing[0]) : undefined,
    validate: (value) => (String(value ?? "").trim() ? undefined : "Required"),
  });

  const parsed = String(entry)
    .split(/[\n,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const merged = [...new Set([...existing, ...parsed])];

  return setVkConfig(cfg, { allowFrom: merged });
}

export const vkOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,

  getStatus: async ({ cfg }) => {
    const acct = resolveVkAccount(cfg);
    return {
      channel,
      configured: acct.configured,
      statusLines: [`VK: ${acct.configured ? "configured" : "needs token"}`],
      selectionHint: acct.configured ? "configured" : undefined,
      quickstartScore: acct.configured ? 1 : 50,
    };
  },

  configure: async ({ cfg, prompter, forceAllowFrom }) => {
    let next = cfg;
    const resolved = resolveVkAccount(next);
    const accountConfigured = resolved.configured;
    const canUseEnv = Boolean(process.env.VK_TOKEN?.trim());
    const hasConfigToken = Boolean(resolved.token);

    let token: string | null = null;
    if (!accountConfigured) {
      await noteVkTokenHelp(prompter);
    }

    if (canUseEnv && !hasConfigToken) {
      const keepEnv = await prompter.confirm({
        message: "VK_TOKEN detected. Use env var?",
        initialValue: true,
      });
      if (!keepEnv) {
        token = String(
          await prompter.text({
            message: "Enter VK community bot token",
            validate: (v) => (v?.trim() ? undefined : "Required"),
          }),
        ).trim();
      }
    } else if (hasConfigToken) {
      const keep = await prompter.confirm({
        message: "VK token already configured. Keep it?",
        initialValue: true,
      });
      if (!keep) {
        token = String(
          await prompter.text({
            message: "Enter VK community bot token",
            validate: (v) => (v?.trim() ? undefined : "Required"),
          }),
        ).trim();
      }
    } else {
      token = String(
        await prompter.text({
          message: "Enter VK community bot token",
          validate: (v) => (v?.trim() ? undefined : "Required"),
        }),
      ).trim();
    }

    if (token) {
      next = setVkConfig(next, { enabled: true, token });
    } else {
      next = setVkConfig(next, { enabled: true });
    }

    // Prompt for groupId if not already set
    const resolvedAfterToken = resolveVkAccount(next);
    if (!resolvedAfterToken.groupId) {
      const groupId = String(
        await prompter.text({
          message: "Enter VK community (group) ID",
          placeholder: "123456789",
          validate: (v) =>
            /^\d+$/.test(v?.trim() ?? "") ? undefined : "Must be a numeric group ID",
        }),
      ).trim();
      next = setVkConfig(next, { groupId });
    }

    if (forceAllowFrom) {
      next = await promptVkAllowFrom({ cfg: next, prompter });
    }

    return { cfg: next, accountId: "default" };
  },

  disable: (cfg) => setVkConfig(cfg, { enabled: false }),
};
