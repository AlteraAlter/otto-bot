import { NextResponse } from "next/server";

import {
  BackendTokenResponse,
  setSessionCookie,
  withBackendPath,
} from "../../../../lib/auth";

export async function POST(request: Request) {
  const body = await request.text();
  let response: Response;
  try {
    response = await fetch(withBackendPath("/v1/auth/login"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    return NextResponse.json(
      { detail: "Auth service timeout" },
      { status: 504 },
    );
  }

  const text = await response.text();
  if (!response.ok) {
    return new NextResponse(text, {
      status: response.status,
      headers: {
        "content-type":
          response.headers.get("content-type") ?? "application/json",
      },
    });
  }

  const payload = JSON.parse(text) as BackendTokenResponse;
  const nextResponse = NextResponse.json({
    success: true,
    expires_in: payload.expires_in,
    token_type: payload.token_type,
  });

  setSessionCookie(nextResponse, payload);
  return nextResponse;
}
