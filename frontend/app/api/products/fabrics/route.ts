import { NextRequest } from "next/server";

import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../lib/auth";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.toString();
  const response = await fetch(
    withBackendPath(
      `/v1/afterbuy/load-factories-by-controller${query ? `?${query}` : ""}`,
    ),
    {
      method: "GET",
      headers: await getAuthorizedHeaders(),
      cache: "no-store",
    },
  );

  return toClientResponse(response);
}
