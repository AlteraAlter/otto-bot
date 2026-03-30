"use client";

import {
  JsonObject,
  Product,
  ProductAttribute,
  ProductBaseline,
  ProductBrand,
  ProductStatus,
  BulkPriceOperation
} from "./types";

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readPath(source: JsonObject, path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!isObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

export function getString(source: JsonObject, paths: string[][]): string | undefined {
  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return undefined;
}

export function getNumber(source: JsonObject, paths: string[][]): number | undefined {
  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

export function extractCollection(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isObject(payload)) return [];

  const containers = [
    "productVariations",
    "marketPlaceStatus",
    "status",
    "items",
    "products",
    "content",
    "data",
    "results"
  ];
  for (const key of containers) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }

  return [];
}

export function statusFromText(value: string | undefined): ProductStatus | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (
    normalized.includes("pause") ||
    normalized.includes("inactive") ||
    normalized.includes("offline")
  ) {
    return "non_active";
  }
  if (
    normalized.includes("active") ||
    normalized.includes("aktiv") ||
    normalized.includes("online")
  ) {
    return "active";
  }
  return undefined;
}

export function normalizeValuesCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function normalizeBrand(value: string | undefined): ProductBrand {
  if (!value) return "JVmoebel";
  const normalized = value.trim().toLowerCase();
  if (normalized === "xlmoebel") return "XLmoebel";
  return "JVmoebel";
}

export function toDateLabel(input: unknown) {
  if (typeof input !== "string" || input.length === 0) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleDateString("ru-RU");
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(value);
}

export function parseBulkPriceExpression(
  rawExpression: string
): { operation: BulkPriceOperation; value: number } | null {
  const expression = rawExpression.trim();
  if (expression.length === 0) return null;

  if (expression.endsWith("%")) {
    const percentValue = Number(expression.slice(0, -1).trim());
    if (!Number.isFinite(percentValue)) return null;
    return { operation: "percent", value: percentValue };
  }

  if (expression.startsWith("=")) {
    const absoluteValue = Number(expression.slice(1).trim());
    if (!Number.isFinite(absoluteValue)) return null;
    return { operation: "set", value: absoluteValue };
  }

  const deltaValue = Number(expression);
  if (!Number.isFinite(deltaValue)) return null;
  return { operation: "delta", value: deltaValue };
}

export function applyPriceOperation(
  currentPrice: number,
  operation: BulkPriceOperation,
  value: number
): number {
  let nextPrice = currentPrice;
  if (operation === "percent") {
    nextPrice = currentPrice * (1 + value / 100);
  } else if (operation === "set") {
    nextPrice = value;
  } else {
    nextPrice = currentPrice + value;
  }
  return Math.max(0, Number(nextPrice.toFixed(2)));
}

export function comparableProductState(product: Product) {
  return {
    productReference: product.productReference,
    name: product.name,
    sku: product.sku,
    ean: product.ean,
    moin: product.moin,
    category: product.category,
    brand: product.brand,
    brandId: product.brandId,
    price: product.price,
    stock: product.stock,
    description: product.description,
    bulletPoints: product.bulletPoints,
    attributes: product.attributes
  };
}

export function createProductBaseline(product: Product): ProductBaseline {
  return {
    sku: product.sku,
    status: product.status,
    comparableSnapshot: JSON.stringify(comparableProductState(product))
  };
}

export function hasComparableChanges(product: Product, baseline: ProductBaseline | null) {
  if (!baseline) return false;
  return JSON.stringify(comparableProductState(product)) !== baseline.comparableSnapshot;
}

export function mapProduct(
  raw: unknown,
  index: number,
  statusBySku: Record<string, ProductStatus>
): Product | null {
  if (!isObject(raw)) return null;

  const sku = getString(raw, [["sku"], ["productSku"]]);
  const productReference = getString(raw, [["productReference"], ["reference"]]);
  const id = sku ?? productReference ?? `item-${index}`;
  const productLine = getString(raw, [["productDescription", "productLine"], ["name"]]);
  const bulletPointsRaw = readPath(raw, ["productDescription", "bulletPoints"]);
  const attributesRaw = readPath(raw, ["productDescription", "attributes"]);
  const mediaAssetsRaw = readPath(raw, ["mediaAssets"]);
  const bulletPoints = Array.isArray(bulletPointsRaw)
    ? bulletPointsRaw.filter((item): item is string => typeof item === "string")
    : [];
  const attributes = Array.isArray(attributesRaw)
    ? attributesRaw
        .map((item): ProductAttribute | null => {
          if (!isObject(item)) return null;
          const name = typeof item.name === "string" ? item.name : "";
          const valuesRaw = item.values;
          const values = Array.isArray(valuesRaw)
            ? valuesRaw.filter((value): value is string => typeof value === "string")
            : [];
          const additional = typeof item.additional === "boolean" ? item.additional : false;
          if (name.length === 0 && values.length === 0) return null;
          return { name, values, additional };
        })
        .filter((item): item is ProductAttribute => item !== null)
    : [];

  const category =
    getString(raw, [["productDescription", "category"], ["category"]]) ?? "Без категории";
  const rawStatus =
    statusFromText(getString(raw, [["marketPlaceStatus"], ["status"], ["activeStatus"]])) ??
    "non_active";
  const mappedStatus = sku ? statusBySku[sku] ?? rawStatus : rawStatus;

  return {
    id,
    productReference: productReference ?? "-",
    name: productLine ?? productReference ?? sku ?? `Товар ${index + 1}`,
    sku: sku ?? `sku-${index}`,
    ean: getString(raw, [["ean"]]) ?? "-",
    moin: getString(raw, [["moin"]]) ?? "-",
    category,
    brand: normalizeBrand(getString(raw, [["productDescription", "brand"]])),
    brandId: getString(raw, [["productDescription", "brandId"]]) ?? "-",
    price:
      getNumber(raw, [["pricing", "standardPrice", "amount"], ["price", "amount"], ["price"]]) ??
      0,
    stock:
      getNumber(raw, [
        ["availability", "stockQuantity"],
        ["stock"],
        ["inventory"],
        ["quantity"],
        ["order", "maxOrderQuantity", "quantity"]
      ]) ?? 0,
    mediaCount: Array.isArray(mediaAssetsRaw) ? mediaAssetsRaw.length : 0,
    attributesCount: attributes.length,
    attributes,
    bulletPoints,
    description: getString(raw, [["productDescription", "description"]]) ?? "",
    status: mappedStatus,
    rating: getNumber(raw, [["rating"], ["reviews", "rating"]]) ?? 0,
    sales: getNumber(raw, [["sales"], ["soldQuantity"]]) ?? 0,
    views: getNumber(raw, [["views"], ["viewCount"]]) ?? 0,
    updatedAt: toDateLabel(readPath(raw, ["updatedAt"]) ?? readPath(raw, ["lastModifiedDate"]))
  };
}

export function asCreatePayload(detail: JsonObject, product: Product): JsonObject | null {
  const productDescription = readPath(detail, ["productDescription"]);
  const mediaAssets = readPath(detail, ["mediaAssets"]);
  const pricing = readPath(detail, ["pricing"]);
  const logistics = readPath(detail, ["logistics"]);

  if (
    !isObject(productDescription) ||
    !Array.isArray(mediaAssets) ||
    !isObject(pricing) ||
    !isObject(logistics)
  ) {
    return null;
  }

  const standardPrice = readPath(pricing, ["standardPrice"]);
  if (!isObject(standardPrice)) return null;

  return {
    productReference: product.productReference !== "-" ? product.productReference : product.name,
    sku: product.sku,
    ean: product.ean !== "-" ? product.ean : getString(detail, [["ean"]]),
    pzn: getString(detail, [["pzn"]]),
    mpn: getString(detail, [["mpn"]]),
    moin: product.moin !== "-" ? product.moin : getString(detail, [["moin"]]),
    releaseDate: readPath(detail, ["releaseDate"]),
    productDescription: {
      ...productDescription,
      category: product.category,
      brand: product.brand,
      brandId: product.brandId,
      productLine: product.name,
      description: product.description,
      bulletPoints: product.bulletPoints,
      attributes: product.attributes
    },
    mediaAssets,
    order: isObject(readPath(detail, ["order"])) ? readPath(detail, ["order"]) : undefined,
    pricing: {
      ...pricing,
      standardPrice: {
        ...standardPrice,
        amount: product.price
      }
    },
    logistics,
    compliance: isObject(readPath(detail, ["compliance"])) ? readPath(detail, ["compliance"]) : undefined
  };
}
