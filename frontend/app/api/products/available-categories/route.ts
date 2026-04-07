import { readFile } from "fs/promises";
import path from "path";

import { NextResponse } from "next/server";

function normalizeCategories(payload: unknown): string[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  const unique = new Set<string>();

  for (const item of payload) {
    if (Array.isArray(item)) {
      for (const value of item) {
        if (typeof value === "string" && value.trim()) {
          unique.add(value.trim());
        }
      }
      continue;
    }

    if (typeof item === "string" && item.trim()) {
      unique.add(item.trim());
    }
  }

  return Array.from(unique).sort((left, right) => left.localeCompare(right));
}

export async function GET() {
  try {
    const filePath = path.join(
      process.cwd(),
      "..",
      "app",
      "mapper",
      "available_cats.json",
    );
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;

    return NextResponse.json({
      success: true,
      items: normalizeCategories(parsed),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not load available categories",
        items: [],
      },
      { status: 500 },
    );
  }
}
