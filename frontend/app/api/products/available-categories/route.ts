import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../lib/auth";

export async function GET() {
  const response = await fetch(withBackendPath("/v1/products/db/categories"), {
    method: "GET",
    headers: await getAuthorizedHeaders(),
    cache: "no-store",
  });

  return toClientResponse(response);
}
