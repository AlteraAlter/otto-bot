import { NextRequest } from "next/server";

import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../lib/auth";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.toString();
  const target = withBackendPath(
    `/v1/products/import-tasks${query ? `?${query}` : ""}`,
  );

  const response = await fetch(target, {
    method: "GET",
    headers: await getAuthorizedHeaders(),
    cache: "no-store",
  });

  return toClientResponse(response);
}
