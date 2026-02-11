import { readFileSync, existsSync } from "node:fs";
import { extname } from "node:path";
import { getVkRuntime } from "./runtime.js";

// MIME type lookup for common audio/media extensions
const MIME_MAP: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/opus",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wma": "audio/x-ms-wma",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

interface LoadedMedia {
  buffer: Buffer;
  contentType: string;
  fileName?: string;
}

// Load media from a URL (http/https) or a local file path.
export async function loadMedia(urlOrPath: string): Promise<LoadedMedia> {
  // Local file path: starts with / or contains common path patterns
  if (urlOrPath.startsWith("/") || (urlOrPath.match(/^[a-zA-Z]:[\\/]/) && !urlOrPath.startsWith("http"))) {
    if (!existsSync(urlOrPath)) {
      throw new Error(`File not found: ${urlOrPath}`);
    }
    const buffer = readFileSync(urlOrPath);
    const ext = extname(urlOrPath).toLowerCase();
    const contentType = MIME_MAP[ext] ?? "application/octet-stream";
    const fileName = urlOrPath.split("/").pop() ?? "file";
    return { buffer: Buffer.from(buffer), contentType, fileName };
  }

  // HTTP URL: use core's loadWebMedia
  const core = getVkRuntime();
  const loaded = await core.media.loadWebMedia(urlOrPath);
  return {
    buffer: loaded.buffer,
    contentType: loaded.contentType ?? "application/octet-stream",
    fileName: loaded.fileName,
  };
}
