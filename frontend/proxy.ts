import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "./lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/register", "/employee-register"]);

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!hasSession && !PUBLIC_PATHS.has(pathname)) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }

  const hasInviteParams =
    searchParams.has("invite") ||
    searchParams.has("code") ||
    searchParams.has("token");

  if (
    hasSession &&
    PUBLIC_PATHS.has(pathname) &&
    !(pathname === "/register" && hasInviteParams) &&
    !(pathname === "/employee-register" && hasInviteParams)
  ) {
    const url = new URL("/", request.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
