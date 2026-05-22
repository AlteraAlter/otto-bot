import { NextRequest } from "next/server";

import { getAuthorizedHeaders, toClientResponse, withBackendPath } from "../../../../lib/auth";

export async function POST(request: NextRequest) {
  const incoming = await request.formData();
  const form = new FormData();

  for (const [key, value] of incoming.entries()) {
    form.append(key, value);
  }

  const headers = await getAuthorizedHeaders();
  const response = await fetch(withBackendPath("/v1/uploads/image"), {
    method: "POST",
    headers,
    body: form,
    cache: "no-store",
  });

  return toClientResponse(response);
}
