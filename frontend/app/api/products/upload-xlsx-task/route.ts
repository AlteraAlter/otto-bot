import { NextResponse } from "next/server";

import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../lib/auth";

export async function POST(request: Request) {
  const incoming = await request.formData();
  const file = incoming.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, message: "file is required", issues: [] },
      { status: 400 },
    );
  }

  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await fetch(withBackendPath("/v1/products/upload-xlsx-task"), {
    method: "POST",
    headers: await getAuthorizedHeaders(),
    body: formData,
    cache: "no-store",
  });

  return toClientResponse(response);
}
