import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../../../../lib/auth";

type Params = { productId: string; variantId: string };

export async function POST(
  _request: Request,
  { params }: { params: Promise<Params> },
) {
  const { productId, variantId } = await params;
  const response = await fetch(
    withBackendPath(`/v1/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}/regenerate-image`),
    {
      method: "POST",
      headers: await getAuthorizedHeaders(),
      cache: "no-store",
    },
  );

  return toClientResponse(response);
}
