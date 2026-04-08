import { NextResponse } from "next/server";

import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../lib/auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sku: string }> }
) {
  const { sku } = await context.params;
  const response = await fetch(
    withBackendPath(`/v1/products/${encodeURIComponent(sku)}`),
    {
    method: "GET",
    headers: await getAuthorizedHeaders(),
    cache: "no-store",
  },
  );

  return toClientResponse(response);
}
