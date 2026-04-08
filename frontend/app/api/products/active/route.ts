import { NextRequest, NextResponse } from "next/server";

import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../lib/auth";

export async function GET(request: NextRequest) {
  const target = withBackendPath(
    `/v1/products/active?${request.nextUrl.searchParams.toString()}`,
  );
  const response = await fetch(target, {
    method: "GET",
    headers: await getAuthorizedHeaders(),
    cache: "no-store",
  });

  return toClientResponse(response);
}
