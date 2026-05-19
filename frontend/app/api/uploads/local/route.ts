import { readFile } from "fs/promises";
import path from "path";

import { NextRequest, NextResponse } from "next/server";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "");
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("file") ?? "";
  const file = sanitizeFileName(raw);
  if (!file) {
    return NextResponse.json({ message: "file is required" }, { status: 400 });
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  const filePath = path.join(uploadsDir, file);

  try {
    const bytes = await readFile(filePath);
    const ext = path.extname(file).toLowerCase();
    const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
}
