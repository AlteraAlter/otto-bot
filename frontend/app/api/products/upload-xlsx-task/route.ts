import { NextResponse } from "next/server";

import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../lib/auth";

export async function POST(request: Request) {
  const headers = await getAuthorizedHeaders();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const response = await fetch(withBackendPath("/v1/products/upload-xlsx-task"), {
    method: "POST",
    headers,
    body: request.body,
    // Node.js fetch requires duplex mode for streamed request bodies.
    duplex: "half",
    cache: "no-store",
  } as RequestInit & { duplex: "half" });

  return toClientResponse(response);
}
