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

  let response: Response;
  try {
    response = await fetch(withBackendPath("/v1/auth/me"), {
      method: "GET",
      headers: await getAuthorizedHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    return NextResponse.json(
      { detail: "Auth service timeout" },
      { status: 504 },
    );
  }

  return toClientResponse(response);
}
