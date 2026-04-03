import { NextResponse } from "next/server";

import {
  getAuthorizedHeaders,
  getSessionToken,
  toClientResponse,
  withBackendPath,
} from "../../../../lib/auth";

export async function GET() {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json(
      { detail: "Not authenticated" },
      { status: 401 },
    );
  }

  const response = await fetch(withBackendPath("/v1/auth/me"), {
    method: "GET",
    headers: await getAuthorizedHeaders(),
    cache: "no-store",
  });

  return toClientResponse(response);
}
