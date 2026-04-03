import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const BACKEND_BASE_URL =
  process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:8000";
export const SESSION_COOKIE_NAME = "otto_access_token";

export function withBackendPath(path: string) {
  return `${BACKEND_BASE_URL}${path}`;
}

export async function getSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function getAuthorizedHeaders(
  init?: HeadersInit,
): Promise<Headers> {
  const headers = new Headers(init);
  const token = await getSessionToken();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

export async function clearSessionCookie(response: NextResponse) {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  response.cookies.delete(SESSION_COOKIE_NAME);
}

export type BackendTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

export function setSessionCookie(
  response: NextResponse,
  payload: BackendTokenResponse,
) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: payload.access_token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: payload.expires_in,
    path: "/",
  });
}

export async function toClientResponse(response: Response) {
  const text = await response.text();
  const nextResponse = new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
    },
  });

  if (response.status === 401) {
    await clearSessionCookie(nextResponse);
  }

  return nextResponse;
}
