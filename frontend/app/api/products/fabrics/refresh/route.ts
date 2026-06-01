import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../../lib/auth";

export async function POST() {
  const response = await fetch(
    withBackendPath("/v1/afterbuy/fetch-factory?save=true"),
    {
      method: "GET",
      headers: await getAuthorizedHeaders(),
      cache: "no-store",
    },
  );

  return toClientResponse(response);
}
