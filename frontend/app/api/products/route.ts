import { NextRequest, NextResponse } from "next/server";

import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../lib/auth";

export async function GET(request: NextRequest) {
  const target = withBackendPath(
    `/v1/products?${request.nextUrl.searchParams.toString()}`,
  );

  const response = await fetch(target, {
    method: "GET",
    headers: await getAuthorizedHeaders(),
    cache: "no-store",
  });

  return toClientResponse(response);
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const response = await fetch(withBackendPath("/v1/products/create"), {
    method: "POST",
    headers: await getAuthorizedHeaders({
      "content-type": "application/json",
    }),
    body,
    cache: "no-store",
  });

  return toClientResponse(response);
}
