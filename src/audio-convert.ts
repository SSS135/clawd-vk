import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

// Resolve ffmpeg binary path from @ffmpeg-installer/ffmpeg
const require = createRequire(import.meta.url);
let ffmpegPath: string;
try {
  ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
} catch {
  ffmpegPath = "ffmpeg";
}

// Convert audio buffer (MP3/WAV/etc) to OGG Opus for VK audio_message upload.
// Returns the converted buffer. Throws on failure.
export function convertToOggOpus(input: Buffer, inputExt: string): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "vk-audio-"));
  const inFile = join(dir, `input.${inputExt}`);
  const outFile = join(dir, "output.ogg");
  try {
    writeFileSync(inFile, input);
    execFileSync(ffmpegPath, [
      "-i", inFile,
      "-c:a", "libopus",
      "-b:a", "48k",
      "-ac", "1",
      "-y",
      outFile,
    ], { timeout: 120_000, stdio: "pipe" });
    return readFileSync(outFile);
  } finally {
    try { unlinkSync(inFile); } catch {}
    try { unlinkSync(outFile); } catch {}
    try { unlinkSync(dir); } catch {}
  }
}
