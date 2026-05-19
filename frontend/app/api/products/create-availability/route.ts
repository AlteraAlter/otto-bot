import { NextRequest } from "next/server";

import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const response = await fetch(withBackendPath("/v1/products/create-availability"), {
    method: "POST",
    headers: await getAuthorizedHeaders({
      "content-type": "application/json",
    }),
    body,
    cache: "no-store",
  });

  return toClientResponse(response);
}
