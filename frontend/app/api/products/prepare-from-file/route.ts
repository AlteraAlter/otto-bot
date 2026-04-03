import { NextResponse } from "next/server";

import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../lib/auth";

export async function POST(request: Request) {
  const incoming = await request.formData();
  const file = incoming.get("file");
  const maxChars = incoming.get("maxChars");

  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, message: "file is required", issues: [] }, { status: 400 });
  }

  const formData = new FormData();
  formData.append("file", file, file.name);

  if (typeof maxChars === "string" && maxChars.trim().length > 0) {
    formData.append("max_chars", maxChars);
  }

  const response = await fetch(withBackendPath("/v1/products/prepare-from-file"), {
    method: "POST",
    headers: await getAuthorizedHeaders(),
    body: formData,
    cache: "no-store",
  });

  return toClientResponse(response);
}
