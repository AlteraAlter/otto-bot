import { NextRequest, NextResponse } from "next/server";

import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../lib/auth";

export async function POST(request: NextRequest) {
  const query = request.nextUrl.searchParams.toString();
  const target = withBackendPath(`/v1/products/sync-to-db${query ? `?${query}` : ""}`);

  const response = await fetch(target, {
    method: "POST",
    headers: await getAuthorizedHeaders(),
    cache: "no-store",
  });

  return toClientResponse(response);
}
