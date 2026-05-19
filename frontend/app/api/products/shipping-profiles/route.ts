import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../lib/auth";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.toString();
  const response = await fetch(withBackendPath(`/v1/products/otto/shipping-profiles${query ? `?${query}` : ""}`), {
    method: "GET",
    headers: await getAuthorizedHeaders(),
    cache: "no-store",
  });

  return toClientResponse(response);
}
