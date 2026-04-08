"use client";

import { Product } from "./types";

export type JsonObject = Record<string, unknown>;

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

export function getString(source: JsonObject, paths: string[][]): string | null {
  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
  }
  return null;
}

export function getNumber(source: JsonObject, paths: string[][]): number | null {
  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const normalized = value.replace(",", ".").trim();
      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function getStringArray(source: JsonObject, paths: string[][]): string[] {
  for (const path of paths) {
    const value = readPath(source, path);
    if (!Array.isArray(value)) {
      continue;
    }

    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
}

export function extractCollection(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isObject(payload)) return [];

  const containers = ["items", "products", "content", "data", "results"];
  for (const key of containers) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }

  return [];
}

export function mapProduct(raw: unknown, index: number): Product | null {
  if (!isObject(raw)) return null;

  const idValue = readPath(raw, ["id"]);
  const id =
    typeof idValue === "string" || typeof idValue === "number"
      ? String(idValue)
      : `row-${index}`;

  return {
    id,
    productReference: getString(raw, [["productReference"]]),
    sku: getString(raw, [["sku"]]),
    ean: getString(raw, [["ean"]]),
    moin: getString(raw, [["moin"]]),
    productCategory: getString(raw, [["productCategory"]]),
    deliveryTime: getString(raw, [["deliveryTime"]]),
    price: getNumber(raw, [["price"]]),
    recommendedRetailPrice: getNumber(raw, [["recommendedRetailPrice"]]),
    salePrice: getNumber(raw, [["salePrice"]]),
    saleStart: getString(raw, [["saleStart"]]),
    saleEnd: getString(raw, [["saleEnd"]]),
    marketplaceStatus: getString(raw, [["marketplaceStatus"]]),
    errorMessage: getString(raw, [["errorMessage"]]),
    activeStatus: getString(raw, [["activeStatus"]]),
    ottoUrl: getString(raw, [["ottoUrl"]]),
    mediaAssetLinks: getStringArray(raw, [["mediaAssetLinks"]]),
    lastChangedAt: getString(raw, [["lastChangedAt"]]),
  };
}

export function formatCurrency(value: number | null) {
  if (value === null) return "-";

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDateTime(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatText(value: string | null) {
  return value && value.length > 0 ? value : "-";
}

export function isActiveStatus(value: string | null) {
  if (!value) return false;

  const normalized = value.toLowerCase();
  return normalized.includes("aktiv") || normalized.includes("active");
}
