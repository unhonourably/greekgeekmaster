"use server";

import { randomUUID } from "crypto";
import { requireChapter } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const IMAGE_TYPES: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  "image/png": { ext: "png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/webp": { ext: "webp", magic: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  "image/gif": { ext: "gif", magic: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
};

export async function uploadChapterImage(slug: string, formData: FormData): Promise<{ path?: string; error?: string }> {
  const { chapter, user, can } = await requireChapter(slug);
  if (!can("events.manage") && !can("announcements.publish")) return { error: "You do not have permission to add pictures." };
  if (!rateLimit(`chapter-media:${user.id}`, 40, 60 * 60_000)) return { error: "Too many uploads. Try again later." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image." };
  if (file.size > 5 * 1024 * 1024) return { error: "Pictures must be under 5 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = Object.entries(IMAGE_TYPES).find(([, t]) => t.magic(bytes));
  if (!type) return { error: "Use a PNG, JPEG, WebP, or GIF image." };
  const path = `${chapter.id}/${randomUUID()}.${type[1].ext}`;
  const supabase = await createClient();
  const { error } = await supabase.storage.from("chapter-media").upload(path, bytes, { contentType: type[0], upsert: false });
  if (error) return { error: "Upload failed. Try again." };
  return { path };
}
