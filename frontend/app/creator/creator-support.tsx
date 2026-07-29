"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, ArrowRight, Box, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleSlash, Clock3, Copy, Funnel, Info, MoreVertical, Package, Pencil, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Trash2, Upload, X } from "lucide-react";

import { readApiErrorMessage, readJsonResponse } from "../lib/api";

export type UploadState = "idle" | "loading" | "success" | "error";
export type ControllerOption = "jv" | "xl";
export const FACTORY_SOURCE_CONTROLLER: ControllerOption = "jv";
export const CREATOR_DRAFT_KEY = "creator_process_draft_v1";
export const AVAILABILITY_CONCURRENCY = 10;
export const AVAILABILITY_AFTER_CREATE_DELAY_MS = 8000;

export type FabricOption = { id: string; name: string; items_count?: number };
export type FabricListResponse = { factory?: FabricOption[] };
export type CategoryGroupCategoriesResponse = {
  success?: boolean;
  items?: {
    categoryGroup?: string;
    categoryGroupRu?: string | null;
    displayCategoryGroup?: string | null;
    categories?: string[];
    categoriesDisplay?: { name?: string; nameRu?: string | null; displayName?: string | null }[];
    attributes?: CategoryAttributeOption[];
  }[];
};
export type ShippingProfileOption = { id: string; name: string };
export type CreateFromFabricResponse = {
  success?: boolean;
  process_id?: string | null;
  process_state?: string | null;
  issues?: string[];
};
export type PrepareStatusResponse = {
  success?: boolean;
  process_id?: string;
  process_state?: string;
  source_items?: number;
  mapped_items?: number;
  payload_items?: number;
  issues?: string[];
  products?: Record<string, unknown>[];
  current_step?: string;
  step_elapsed_sec?: number;
  heartbeat_lag_sec?: number;
  stuck?: boolean;
  stuck_message?: string | null;
  frontend_draft?: Record<string, unknown>;
  products_count?: number;
  submitted_products?: Record<string, unknown>[];
  otto_process_id?: string | null;
  otto_create_state?: string;
  otto_update_result?: Record<string, unknown>;
  otto_failed_result?: Record<string, unknown> | null;
  otto_failed_result_original?: Record<string, unknown> | null;
  availability_errors?: OttoErrorRow[];
  availability_errors_original?: OttoErrorRow[];
  availability_failed?: number;
};
export type SubmitPreparedResponse = {
  success?: boolean;
  saved_path?: string;
  products_count?: number;
  otto_process_id?: string | null;
  otto_create_state?: string;
  otto_update_result?: Record<string, unknown>;
  otto_failed_result?: Record<string, unknown> | null;
  otto_failed_result_original?: Record<string, unknown> | null;
  queued?: boolean;
  process_state?: string;
};
export type EnrichPreparedResponse = {
  success?: boolean;
  process_id?: string;
  products_count?: number;
  products?: Record<string, unknown>[];
};
export type AvailabilitySubmitResponse = {
  update_quantity?: { success?: boolean; errors?: string };
  update_delivery?: { success?: boolean; errors?: string };
};
export type OttoSummary = {
  state: string;
  total: number;
  progress: number;
  succeeded: number;
  failed: number;
};
export type TaskProgress = {
  total: number;
  completed: number;
  percent: number;
};
export type OttoErrorRow = {
  variation: string;
  code: string;
  title: string;
  jsonPath: string;
};
export type AiCategoryReview = {
  category: string;
  categoryGroup: string;
};
export type CategoryReviewStatus = "confirmed" | "requires_review" | "manually_changed" | "manually_confirmed" | "skipped";
export type CategoryStatusFilter = "all" | "requires_review" | "confirmed" | "manually_changed" | "skipped";
export type CategorySortOption = "title" | "status";
export type ProductReviewStatus = "pending" | "approved" | "modified" | "rejected";
export type ReviewQueueFilter = "all" | ProductReviewStatus | "errors";
export type ReviewQueueSort = "upload" | "unreviewed" | "modified" | "errors" | "approved" | "title-asc" | "title-desc" | "sku";
export type CategoryChangeEvent = {
  at: string;
  by: string;
  from: string;
  to: string;
  comment?: string;
};
export type CategoryCheckRow = {
  index: number;
  image: string;
  title: string;
  sku: string;
  ean: string;
  sourceCategory: string;
  aiCategory: string;
  aiCategoryGroup: string;
  selectedCategory: string;
  confidence: number;
  shippingProfileId: string;
  shippingProfileName: string;
  productReference: string;
  price: string;
  productLine: string;
  errors: number;
  status: "passed" | "failed" | "processing" | "pending";
};
export type ProductReviewRow = CategoryCheckRow & {
  reviewStatus: ProductReviewStatus;
};
export type CategoryAttributeOption = {
  id?: string | number | null;
  attributeId?: string | number | null;
  attributeKey?: string | null;
  name: string;
  nameRu?: string | null;
  displayName?: string | null;
  description?: string | null;
  descriptionRu?: string | null;
  displayDescription?: string | null;
  type?: string | null;
  multiValue?: boolean;
  relevance?: string | null;
  unit?: string | null;
  isVariationTheme?: boolean;
  allowedValues?: string[];
  allowedValuesDisplay?: { value?: string | null; valueRu?: string | null; displayValue?: string | null }[];
};
export type CategoryAttributesResponse = {
  items?: CategoryAttributeOption[];
  total?: number;
  categoryGroup?: string | null;
};
export type ParsedSkuError = {
  sku: string;
  code: string;
  message: string;
  field: string;
  jsonPath: string;
};

export type EditorTab = "general" | "attributes" | "diff" | "json";
export type AttributeEditField = "values";
export type BulkAttributePatch = {
  rowId: number;
  name: string;
  value: string;
  attributeId?: string;
  attributeKey?: string;
  unit?: string;
};
export type BulkAttributeFailure = { productIndex: number; reason: string };
export type WorkflowStep = "categories" | "compare" | "details";
export type VariantStatus = "draft" | "pending_generation" | "generating_image" | "ready" | "failed" | "manual_override";
export type VariantCombinationItem = {
  attributeId: string;
  name: string;
  value: string;
};
export type ProductVariantDraft = {
  id: string;
  combinationKey: string;
  combination: VariantCombinationItem[];
  ean: string;
  sku: string;
  price: string;
  imageUrl: string;
  mediaAssets: { type: string; location: string }[];
  status: VariantStatus;
  generationError?: string;
  source: "source" | "generated" | "manual";
  active: boolean;
  productPayload?: Record<string, unknown>;
};
export type VariantPreview = {
  totalCombinations: number;
  existingCombinations: number;
  newCombinations: number;
  sourceCombinationKey: string;
  variationAttributes: { attributeId: string; name: string; values: string[]; fixed: boolean }[];
  combinations: { key: string; combination: VariantCombinationItem[] }[];
  issues: string[];
};
export const SHIPPING_PROFILE_LABELS: Record<string, string> = {
  "786c6468-3baf-52e0-88b5-13757eb7f873": "4-8 недель",
  "360835cf-4962-59bb-ae66-78e8a41c8948": "6-10 недель",
  "28e3b4f8-12aa-5994-a7e9-26027baede55": "2-4 недели",
  "ad6009b9-a82f-5284-ac64-5627575655ac": "Express Chesterfield",
  "571dd076-4e59-5216-a86f-3e5f30319e9c": "Express Production",
  "935a75b0-ac88-55a8-98df-8556306f1386": "8-12 недель",
  "b4139e65-603f-52f7-9b99-393cf6b2461f": "Доступно сразу",
  "83feaefc-c110-5b39-af53-49344b77ae89": "Сборка/занос, сразу",
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function ottoErrorsFromPayload(value: unknown): OttoErrorRow[] {
  const payload = asRecord(value);
  const results = Array.isArray(payload.results) ? payload.results : [];
  return results.flatMap((entry) => {
    const rec = asRecord(entry);
    const variation = String(rec.variation ?? rec.sku ?? rec.productReference ?? "unknown");
    const errors = Array.isArray(rec.errors) ? rec.errors : [rec];
    return errors.map((err) => {
      const errRec = asRecord(err);
      return {
        variation,
        code: String(errRec.code ?? errRec.errorCode ?? "error"),
        title: String(
          errRec.title ??
          errRec.titleOriginal ??
          errRec.message ??
          errRec.messageOriginal ??
          errRec.description ??
          errRec.detail ??
          "Unknown error",
        ),
        jsonPath: String(errRec.jsonPath ?? errRec.path ?? ""),
      };
    });
  });
}

export function productIdentityKey(product: Record<string, unknown>, index: number): string {
  const sku = String(product.sku ?? "").trim();
  if (sku) return `sku:${sku}`;
  const ean = String(product.ean ?? "").trim();
  if (ean) return `ean:${ean}`;
  const reference = String(product.productReference ?? "").trim();
  if (reference) return `reference:${reference}`;
  return `index:${index}`;
}

export function readTaskProductRows(parsed: PrepareStatusResponse | null | undefined): Record<string, unknown>[] {
  const payload = asRecord(parsed);
  for (const key of ["products", "submitted_products", "submittedProducts"] as const) {
    const value = payload[key];
    if (Array.isArray(value) && value.length > 0) {
      return value.map((item) => asRecord(item)).filter((item) => Object.keys(item).length > 0);
    }
  }
  return [];
}

export function mergeLiveProductRows(
  incomingRows: unknown[],
  currentRows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const currentByKey = new Map<string, Record<string, unknown>>();
  currentRows.forEach((product, index) => {
    currentByKey.set(productIdentityKey(asRecord(product), index), asRecord(product));
  });

  return incomingRows.map((row, index) => {
    const incoming = asRecord(row);
    const current = currentByKey.get(productIdentityKey(incoming, index)) ?? asRecord(currentRows[index]);
    if (Object.keys(current).length === 0) return incoming;

    const merged = { ...current, ...incoming };
    for (const key of ["variants", "variantSummary", "variantMeta"] as const) {
      if (!(key in incoming) && key in current) merged[key] = current[key];
    }
    if (
      Array.isArray(current.variants)
      && current.variants.length > 0
      && (!Array.isArray(incoming.variants) || incoming.variants.length === 0)
    ) {
      merged.variants = current.variants;
    }
    if (
      Array.isArray(current.mediaAssets)
      && current.mediaAssets.length > 0
      && (!Array.isArray(incoming.mediaAssets) || incoming.mediaAssets.length === 0)
    ) {
      merged.mediaAssets = current.mediaAssets;
    }
    return merged;
  });
}

export function updateProductField(product: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
  const next = { ...product };
  let cursor: Record<string, unknown> = next;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    cursor[key] = asRecord(cursor[key]);
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
  return next;
}

export function updateProductTitle(product: Record<string, unknown>, title: string): Record<string, unknown> {
  return updateProductField(
    {
      ...product,
      Artikelbeschreibung: title,
    },
    ["productDescription", "productLine"],
    title,
  );
}

export function bulkUpsertProductAttributes(
  sourceProducts: Record<string, unknown>[],
  productIndexes: number[],
  patches: BulkAttributePatch[],
): { products: Record<string, unknown>[]; updatedIndexes: number[]; failures: BulkAttributeFailure[] } {
  const products = [...sourceProducts];
  const updatedIndexes: number[] = [];
  const failures: BulkAttributeFailure[] = [];

  for (const productIndex of productIndexes) {
    const sourceProduct = products[productIndex];
    if (!sourceProduct || typeof sourceProduct !== "object") {
      failures.push({ productIndex, reason: "Product is no longer available." });
      continue;
    }
    try {
      const product = asRecord(sourceProduct);
      const description = asRecord(product.productDescription);
      const attributes = Array.isArray(description.attributes) ? [...description.attributes] : [];
      for (const patch of patches) {
        const patchId = String(patch.attributeId ?? "").trim();
        const patchKey = String(patch.attributeKey ?? "").trim().toLowerCase();
        const patchName = normalizeFieldToken(patch.name);
        const existingIndex = attributes.findIndex((item) => {
          const attribute = asRecord(item);
          const attributeId = String(attribute.attribute_id ?? attribute.attributeId ?? "").trim();
          const attributeKey = String(attribute.attribute_key ?? attribute.attributeKey ?? "").trim().toLowerCase();
          if (patchId && attributeId) return patchId === attributeId;
          if (patchKey && attributeKey) return patchKey === attributeKey;
          return Boolean(patchName) && normalizeFieldToken(String(attribute.name ?? "")) === patchName;
        });
        const values = patch.value.split(",").map((value) => value.trim()).filter(Boolean);
        if (existingIndex >= 0) {
          attributes[existingIndex] = { ...asRecord(attributes[existingIndex]), values };
        } else {
          attributes.push({ name: patch.name.trim(), values, additional: true, ...(patch.unit ? { unit: patch.unit } : {}) });
        }
      }
      products[productIndex] = updateProductField(product, ["productDescription", "attributes"], attributes);
      updatedIndexes.push(productIndex);
    } catch (error) {
      failures.push({ productIndex, reason: error instanceof Error ? error.message : "Unknown update error." });
    }
  }
  return { products, updatedIndexes, failures };
}

export function firstImage(product: Record<string, unknown>): string {
  const assets = product.mediaAssets;
  if (!Array.isArray(assets) || assets.length === 0) return "";
  return String(asRecord(assets[0]).location ?? asRecord(assets[0]).filename ?? "");
}

export function HoverPreviewImage({
  src,
  alt,
  className,
  block = false,
  loading,
}: {
  src: string;
  alt: string;
  className?: string;
  block?: boolean;
  loading?: "eager" | "lazy";
}) {
  return (
    <span className={`image-hover-source${block ? " is-block" : ""}`}>
      <img className={className} src={src} alt={alt} loading={loading} />
    </span>
  );
}

export function rowStatusLabel(status: "passed" | "failed" | "processing" | "pending"): string {
  if (status === "failed") return "Failed";
  if (status === "processing") return "Processing";
  if (status === "pending") return "Pending";
  return "Passed";
}

export function buildPagination(currentPage: number, totalPages: number): Array<number | "..."> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  if (currentPage <= 3) return [1, 2, 3, "...", totalPages];
  if (currentPage >= totalPages - 2) return [1, "...", totalPages - 2, totalPages - 1, totalPages];
  return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
}

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  async function consume() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index], index) };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => consume());
  await Promise.all(workers);
  return results;
}

export function normalizeSku(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const bySlash = raw.split("/").filter(Boolean).pop() ?? raw;
  const byQuery = bySlash.split("?")[0] ?? bySlash;
  return byQuery.trim();
}

export function normalizeFieldToken(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeVariationValue(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function stableVariantImageRequestId(productIndex: number, combinationKey: string): string {
  let hash = 2166136261;
  const input = `${productIndex}:${combinationKey}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `variant-draft-${productIndex}-${(hash >>> 0).toString(16)}`;
}

export async function waitForGeneratedImage(url: string, attempts = 8): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(Math.min(12000, 1200 * attempt));
    try {
      const response = await fetch(url, { method: "HEAD", cache: "no-store" });
      if (response.ok) return true;
      if (response.status !== 404) return false;
    } catch {
      // Keep polling: the original generation request may still be finishing.
    }
  }
  return false;
}

export function splitVariationValues(value: unknown): string[] {
  const rawValues = Array.isArray(value) ? value : String(value ?? "").split(/[,;\n]+/);
  const values: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawValues) {
    const text = String(raw ?? "").trim();
    if (!text) continue;
    const key = normalizeVariationValue(text);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(text);
  }
  return values;
}

export function variantAttributeIdentity(option: CategoryAttributeOption): string {
  return String(option.attributeId ?? option.id ?? option.attributeKey ?? option.name ?? "").trim();
}

export function buildVariantCombinationKey(combination: VariantCombinationItem[]): string {
  return JSON.stringify(
    combination
      .map((item) => ({
        attribute_id: String(item.attributeId),
        value: normalizeVariationValue(item.value),
      }))
      .filter((item) => item.attribute_id && item.value)
      .sort((left, right) => left.attribute_id.localeCompare(right.attribute_id)),
  );
}

export function cloneProductRecord(product: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(product)) as Record<string, unknown>;
}

export function readProductVariants(product: Record<string, unknown>): ProductVariantDraft[] {
  return Array.isArray(product.variants)
    ? product.variants.map((item) => asRecord(item)).map((item): ProductVariantDraft => {
      const source: ProductVariantDraft["source"] = item.source === "source" ? "source" : item.source === "manual" ? "manual" : "generated";
      return {
        id: String(item.id ?? item.combinationKey ?? ""),
        combinationKey: String(item.combinationKey ?? ""),
        combination: Array.isArray(item.combination)
          ? item.combination.map((entry) => asRecord(entry)).map((entry) => ({
            attributeId: String(entry.attributeId ?? entry.attribute_id ?? entry.id ?? entry.name ?? ""),
            name: String(entry.name ?? entry.attributeName ?? ""),
            value: String(entry.value ?? ""),
          })).filter((entry) => entry.attributeId && entry.name)
          : [],
        ean: String(item.ean ?? ""),
        sku: String(item.sku ?? ""),
        price: String(item.price ?? ""),
        imageUrl: String(item.imageUrl ?? item.image_url ?? ""),
        mediaAssets: Array.isArray(item.mediaAssets)
          ? item.mediaAssets.map((asset) => asRecord(asset)).map((asset) => ({
            type: String(asset.type ?? "IMAGE"),
            location: String(asset.location ?? asset.url ?? ""),
          })).filter((asset) => asset.location)
          : [],
        status: (String(item.status ?? "draft") as VariantStatus) || "draft",
        generationError: String(item.generationError ?? item.generation_error ?? "") || undefined,
        source,
        active: item.active !== false && item.isDeleted !== true && item.deleted !== true,
        productPayload: typeof item.productPayload === "object" && item.productPayload !== null
          ? asRecord(item.productPayload)
          : undefined,
      };
    }).filter((item) => item.combinationKey)
    : [];
}

export function patchVariantInProducts(
  currentProducts: Record<string, unknown>[],
  productIndex: number,
  combinationKey: string,
  patch: Partial<ProductVariantDraft>,
): Record<string, unknown>[] {
  const copy = [...currentProducts];
  const current = asRecord(copy[productIndex]);
  if (Object.keys(current).length === 0) return currentProducts;
  const variants = readProductVariants(current).map((variant) =>
    variant.combinationKey === combinationKey
      ? updateVariantPayloadFields({ ...variant, ...patch })
      : variant,
  );
  copy[productIndex] = { ...current, variants };
  return copy;
}

export function variationDimensionsForProduct(
  product: Record<string, unknown>,
  categoryAttributes: CategoryAttributeOption[],
) {
  const description = asRecord(product.productDescription);
  const attributes = Array.isArray(description.attributes) ? description.attributes.map((item) => asRecord(item)) : [];
  const attributesByName = new Map<string, Record<string, unknown>>();
  for (const attribute of attributes) {
    const key = normalizeFieldToken(String(attribute.name ?? ""));
    if (key) attributesByName.set(key, attribute);
  }

  const themeOptions = categoryAttributes.filter((option) => option.isVariationTheme);
  if (themeOptions.length === 0) {
    return attributes
      .filter((attribute) => {
        const name = String(attribute.name ?? "");
        return isColorVariantAttribute(name) || isMaterialVariantAttribute(name);
      })
      .map((attribute) => {
        const name = String(attribute.name ?? "");
        const values = splitVariationValues(attribute.values ?? attribute.value ?? "");
        return {
          attributeId: String(attribute.attributeId ?? attribute.attribute_id ?? attribute.id ?? attribute.attributeKey ?? name).trim() || name,
          name,
          values,
          fixed: values.length === 1,
        };
      })
      .filter((dimension) => dimension.attributeId && dimension.name && dimension.values.length > 0);
  }

  return themeOptions
    .map((option) => {
      const attr = attributesByName.get(normalizeFieldToken(option.name));
      const values = splitVariationValues(attr?.values ?? attr?.value ?? "");
      return {
        attributeId: variantAttributeIdentity(option),
        name: option.name,
        values,
        fixed: values.length === 1,
      };
    })
    .filter((dimension) => dimension.attributeId && dimension.name && dimension.values.length > 0);
}

export function buildVariantCombinations(
  dimensions: ReturnType<typeof variationDimensionsForProduct>,
): { key: string; combination: VariantCombinationItem[] }[] {
  if (dimensions.length === 0) return [];
  const result: { key: string; combination: VariantCombinationItem[] }[] = [];
  function visit(index: number, current: VariantCombinationItem[]) {
    if (index >= dimensions.length) {
      result.push({ key: buildVariantCombinationKey(current), combination: current });
      return;
    }
    const dimension = dimensions[index];
    for (const value of dimension.values) {
      visit(index + 1, [
        ...current,
        { attributeId: dimension.attributeId, name: dimension.name, value },
      ]);
    }
  }
  visit(0, []);
  return result;
}

export function sourceVariantCombinationKey(
  dimensions: ReturnType<typeof variationDimensionsForProduct>,
): string {
  return buildVariantCombinationKey(
    dimensions.map((dimension) => ({
      attributeId: dimension.attributeId,
      name: dimension.name,
      value: dimension.values[0] ?? "",
    })),
  );
}

export function variantPriceFromProduct(product: Record<string, unknown>): string {
  const pricing = asRecord(product.pricing);
  const standardPrice = asRecord(pricing.standardPrice);
  return String(standardPrice.amount ?? "");
}

export function applyCombinationToProductPayload(
  product: Record<string, unknown>,
  combination: VariantCombinationItem[],
): Record<string, unknown> {
  const payload = cloneProductRecord(product);
  delete payload.variants;
  delete payload.variantSummary;
  const description = asRecord(payload.productDescription);
  const byName = new Map(combination.map((item) => [normalizeFieldToken(item.name), item.value]));
  const byId = new Map(combination.map((item) => [String(item.attributeId), item.value]));
  if (Array.isArray(description.attributes)) {
    payload.productDescription = {
      ...description,
      attributes: description.attributes.map((item) => {
        const attribute = asRecord(item);
        const identity = String(attribute.attributeId ?? attribute.attribute_id ?? attribute.id ?? attribute.attributeKey ?? "").trim();
        const value = (identity && byId.get(identity)) || byName.get(normalizeFieldToken(String(attribute.name ?? "")));
        return value ? { ...attribute, values: [value] } : attribute;
      }),
    };
  }
  return payload;
}

export function buildLocalVariantPreview(
  product: Record<string, unknown>,
  categoryAttributes: CategoryAttributeOption[],
): VariantPreview {
  const dimensions = variationDimensionsForProduct(product, categoryAttributes);
  const combinations = buildVariantCombinations(dimensions);
  const sourceKey = sourceVariantCombinationKey(dimensions);
  const existingKeys = new Set(readProductVariants(product).filter((item) => item.active).map((item) => item.combinationKey));
  if (sourceKey) existingKeys.add(sourceKey);
  const allKeys = new Set(combinations.map((item) => item.key));
  const issues: string[] = [];
  const themeCount = categoryAttributes.filter((item) => item.isVariationTheme).length;
  if (categoryAttributes.length > 0 && themeCount === 0) issues.push("Для этой category group не настроены variationThemes.");
  if (themeCount > 0 && dimensions.length === 0) issues.push("У variation attributes нет заполненных значений.");
  return {
    totalCombinations: combinations.length,
    existingCombinations: Array.from(existingKeys).filter((key) => allKeys.has(key)).length,
    newCombinations: combinations.filter((item) => !existingKeys.has(item.key)).length,
    sourceCombinationKey: sourceKey,
    variationAttributes: dimensions,
    combinations,
    issues,
  };
}

export function generateLocalVariantsForProduct(
  product: Record<string, unknown>,
  categoryAttributes: CategoryAttributeOption[],
): { product: Record<string, unknown>; createdCount: number; sourceCreated: boolean; preview: VariantPreview } {
  const preview = buildLocalVariantPreview(product, categoryAttributes);
  const existing = readProductVariants(product);
  const existingByKey = new Map(existing.map((variant) => [variant.combinationKey, variant]));
  const baseImage = firstImage(product);
  const basePrice = variantPriceFromProduct(product);
  let createdCount = 0;
  let sourceCreated = false;
  const variants = [...existing];

  for (const item of preview.combinations) {
    if (existingByKey.has(item.key)) continue;
    const isSource = item.key === preview.sourceCombinationKey;
    const productPayload = applyCombinationToProductPayload(product, item.combination);
    const mediaAssets = baseImage ? [{ type: "IMAGE", location: baseImage }] : [];
    const variant: ProductVariantDraft = {
      id: item.key,
      combinationKey: item.key,
      combination: item.combination,
      ean: isSource ? String(product.ean ?? "") : "",
      sku: isSource ? String(product.sku ?? "") : "",
      price: basePrice,
      imageUrl: baseImage,
      mediaAssets,
      status: isSource && product.ean && product.sku ? "ready" : "pending_generation",
      source: isSource ? "source" : "generated",
      active: true,
      productPayload,
    };
    variants.push(variant);
    existingByKey.set(item.key, variant);
    if (isSource) sourceCreated = true;
    else createdCount += 1;
  }

  return {
    product: { ...product, variants },
    createdCount,
    sourceCreated,
    preview,
  };
}

export function syncLocalVariantsForProduct(
  product: Record<string, unknown>,
  categoryAttributes: CategoryAttributeOption[],
): Record<string, unknown> {
  const preview = buildLocalVariantPreview(product, categoryAttributes);
  if (preview.totalCombinations <= 1) {
    if (readProductVariants(product).length > 0) return product;
    const payload = { ...product };
    delete payload.variants;
    delete payload.variantSummary;
    return payload;
  }

  const existing = readProductVariants(product);
  const existingByKey = new Map(existing.map((variant) => [variant.combinationKey, variant]));
  const baseImage = firstImage(product);
  const basePrice = variantPriceFromProduct(product);
  const syncedVariants: ProductVariantDraft[] = [];

  for (const item of preview.combinations) {
    const current = existingByKey.get(item.key);
    if (current) {
      syncedVariants.push(updateVariantPayloadFields({
        ...current,
        combination: item.combination,
        productPayload: current.productPayload ?? applyCombinationToProductPayload(product, item.combination),
      }));
      continue;
    }

    const isSource = item.key === preview.sourceCombinationKey;
    const imageUrl = baseImage;
    syncedVariants.push(updateVariantPayloadFields({
      id: item.key,
      combinationKey: item.key,
      combination: item.combination,
      ean: isSource ? String(product.ean ?? "") : "",
      sku: isSource ? String(product.sku ?? "") : "",
      price: basePrice,
      imageUrl,
      mediaAssets: imageUrl ? [{ type: "IMAGE", location: imageUrl }] : [],
      status: isSource && product.ean && product.sku ? "ready" : "pending_generation",
      source: isSource ? "source" : "generated",
      active: true,
      productPayload: applyCombinationToProductPayload(product, item.combination),
    }));
  }

  return { ...product, variants: syncedVariants };
}

export function updateVariantPayloadFields(variant: ProductVariantDraft): ProductVariantDraft {
  const payload = variant.productPayload ? cloneProductRecord(variant.productPayload) : undefined;
  if (!payload) return variant;
  payload.sku = variant.sku;
  payload.ean = variant.ean || null;
  const price = parseMoneyValue(variant.price);
  if (price !== null) {
    payload.pricing = {
      ...asRecord(payload.pricing),
      standardPrice: {
        ...asRecord(asRecord(payload.pricing).standardPrice),
        amount: price,
      },
    };
  }
  if (variant.mediaAssets.length > 0) {
    payload.mediaAssets = variant.mediaAssets;
  } else if (variant.imageUrl) {
    payload.mediaAssets = [{ type: "IMAGE", location: variant.imageUrl }];
  }
  return { ...variant, productPayload: payload };
}

export function expandedProductCount(products: Record<string, unknown>[]): number {
  return products.reduce((total, product) => {
    const variants = readProductVariants(product).filter((variant) => variant.active);
    return total + (variants.length || 1);
  }, 0);
}

export function collectVariantExportIssues(products: Record<string, unknown>[]): OttoErrorRow[] {
  const rows: { sku: string; ean: string; label: string }[] = [];
  for (const product of products) {
    const variants = readProductVariants(product).filter((variant) => variant.active);
    if (variants.length === 0) continue;
    for (const variant of variants) {
      const label = variant.sku || variant.ean || variant.combination.map((item) => item.value).join(" + ") || "variant";
      rows.push({ sku: variant.sku.trim(), ean: variant.ean.trim(), label });
    }
  }

  const errors: OttoErrorRow[] = [];
  const seenSku = new Map<string, string>();
  const seenEan = new Map<string, string>();
  for (const row of rows) {
    if (!row.sku) errors.push({ variation: row.label, code: "missing_sku", title: "SKU is required for every active variant.", jsonPath: "sku" });
    else if (seenSku.has(row.sku)) errors.push({ variation: row.label, code: "duplicate_sku", title: `SKU duplicates ${seenSku.get(row.sku)}.`, jsonPath: "sku" });
    else seenSku.set(row.sku, row.label);

    if (row.ean && seenEan.has(row.ean)) errors.push({ variation: row.label, code: "duplicate_ean", title: `EAN duplicates ${seenEan.get(row.ean)}.`, jsonPath: "ean" });
    else if (row.ean) seenEan.set(row.ean, row.label);
  }
  return errors;
}

export function sanitizeUiMessage(value: string): string {
  const raw = String(value ?? "");
  return raw
    .replace(/\s*PID=[^\s]+/gi, "")
    .replace(/\s*File:\s*.+$/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function readAttributeGroup(name: string): "Основные характеристики" | "Комплектация" | "Дополнительно" {
  const normalized = name.toLowerCase();
  if (
    normalized.includes("farbe") ||
    normalized.includes("color") ||
    normalized.includes("material") ||
    normalized.includes("größe") ||
    normalized.includes("size")
  ) {
    return "Основные характеристики";
  }
  if (
    normalized.includes("set") ||
    normalized.includes("umfang") ||
    normalized.includes("inhalt") ||
    normalized.includes("paket")
  ) {
    return "Комплектация";
  }
  return "Дополнительно";
}

export function labelWithRu(value: unknown, ruValue?: unknown): string {
  const primary = String(value ?? "").trim();
  const ru = String(ruValue ?? "").trim();
  if (!primary) return ru;
  if (!ru || normalizeFieldToken(primary) === normalizeFieldToken(ru)) return primary;
  return `${primary} (${ru})`;
}

export function attributeDisplayName(item: CategoryAttributeOption): string {
  const labeled = labelWithRu(item.name, item.nameRu);
  return labeled || String(item.displayName ?? item.name ?? "").trim();
}

export function attributeDisplayDescription(item: CategoryAttributeOption): string {
  return String(item.displayDescription || item.descriptionRu || item.description || "").trim();
}

export function attributeAllowedValueLabel(item: CategoryAttributeOption, value: string): string {
  const displayItem = item.allowedValuesDisplay?.find((option) => option.value === value);
  const withRu = labelWithRu(displayItem?.value || value, displayItem?.valueRu);
  return withRu || String(displayItem?.displayValue ?? value).trim();
}

export function firstTextField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = String(record[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

export function arrayTextField(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim());
  }
  return [];
}

export function immediateAttributeOption(attr: Record<string, unknown>, name: string, rawValues: string[]): CategoryAttributeOption {
  const nameRu = typeof attr["name_ru"] === "string" ? attr["name_ru"].trim() : "";
  const displayName = firstTextField(attr, ["displayName", "display_name"]) || labelWithRu(name, nameRu);
  const attributeId = attr.attribute_id ?? attr.attributeId;
  const normalizedAttributeId = typeof attributeId === "number" || typeof attributeId === "string" ? attributeId : null;
  const explicitAllowedValues = arrayTextField(attr, ["allowedValues", "allowed_values"]);
  const valueRuByValue = new Map<string, string>();
  const valueDisplayByValue = new Map<string, string>();
  const valuesRu = arrayTextField(attr, ["valuesRu", "valueRuList", "values_ru", "value_ru_list"]);
  const displayValues = attr.valuesDisplay ?? attr.displayValues ?? attr.allowedValuesDisplay;

  if (Array.isArray(displayValues)) {
    for (const item of displayValues) {
      const row = asRecord(item);
      const value = firstTextField(row, ["value", "name", "original"]);
      const key = normalizeFieldToken(value);
      if (!key) continue;
      const valueRu = firstTextField(row, ["valueRu", "nameRu", "ru", "translation"]);
      const displayValue = firstTextField(row, ["displayValue", "displayName", "label"]);
      if (valueRu) valueRuByValue.set(key, valueRu);
      if (displayValue) valueDisplayByValue.set(key, displayValue);
    }
  } else if (displayValues && typeof displayValues === "object") {
    for (const [value, label] of Object.entries(displayValues as Record<string, unknown>)) {
      const key = normalizeFieldToken(value);
      const text = String(label ?? "").trim();
      if (key && text) valueDisplayByValue.set(key, text);
    }
  }

  rawValues.forEach((value, index) => {
    const key = normalizeFieldToken(value);
    if (key && valuesRu[index]) valueRuByValue.set(key, valuesRu[index]);
  });
  if (rawValues.length === 1) {
    const singleValueRu = firstTextField(attr, ["valueRu", "value_ru"]);
    const key = normalizeFieldToken(rawValues[0]);
    if (key && singleValueRu) valueRuByValue.set(key, singleValueRu);
  }

  return {
    id: normalizedAttributeId,
    attributeId: normalizedAttributeId,
    attributeKey: String(attr.attribute_key ?? attr.attributeKey ?? "").trim() || null,
    name,
    nameRu: nameRu || null,
    displayName,
    allowedValues: explicitAllowedValues,
    allowedValuesDisplay: (explicitAllowedValues.length ? explicitAllowedValues : rawValues).map((value) => {
      const key = normalizeFieldToken(value);
      return {
        value,
        valueRu: valueRuByValue.get(key) ?? null,
        displayValue: valueDisplayByValue.get(key) ?? value,
      };
    }),
  };
}

export function mergeAttributeOption(preferred: CategoryAttributeOption, fallback: CategoryAttributeOption): CategoryAttributeOption {
  const fallbackDisplayByValue = new Map((fallback.allowedValuesDisplay ?? []).map((item) => [normalizeFieldToken(String(item.value ?? "")), item]));
  const preferredDisplay = preferred.allowedValuesDisplay ?? [];
  const mergedDisplay = preferredDisplay.length
    ? preferredDisplay.map((item) => {
      const fallbackItem = fallbackDisplayByValue.get(normalizeFieldToken(String(item.value ?? "")));
      return {
        ...item,
        valueRu: item.valueRu || fallbackItem?.valueRu || null,
        displayValue: item.displayValue || fallbackItem?.displayValue || item.value || "",
      };
    })
    : fallback.allowedValuesDisplay;
  return {
    ...preferred,
    nameRu: preferred.nameRu || fallback.nameRu || null,
    displayName: preferred.displayName || fallback.displayName,
    allowedValues: preferred.allowedValues?.length ? preferred.allowedValues : fallback.allowedValues,
    allowedValuesDisplay: mergedDisplay,
  };
}

export function isColorVariantAttribute(name: string): boolean {
  const token = normalizeFieldToken(name);
  return ["color", "farbe", "colour", "цвет"].includes(token);
}

export function isColorAutofillAttribute(name: string): boolean {
  const token = normalizeFieldToken(name);
  return token.includes("farbe") && !token.includes("lichtfarbe");
}

export function isMaterialVariantAttribute(name: string): boolean {
  const token = normalizeFieldToken(name);
  return ["material", "материал"].includes(token);
}

export function splitAttributeValues(value: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of String(value ?? "").split(/[,;\n]+/)) {
    const item = raw.trim();
    const key = normalizeFieldToken(item);
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function joinAttributeValues(values: string[]): string {
  return values.map((item) => item.trim()).filter(Boolean).join(", ");
}

export function attributeLayoutRank(name: string): number {
  const token = normalizeFieldToken(name);
  if (token.includes("wohnraum") || token.includes("room")) return 10;
  if (token.includes("breite") || token.includes("width")) return 20;
  if (token.includes("tiefe") || token.includes("depth")) return 30;
  if (token.includes("höhe") || token.includes("height")) return 40;
  if (token.includes("set-typ") || token.includes("set typ") || token.includes("set type")) return 50;
  if (token.includes("anzahl sitzflächen") || token.includes("sitzflächen")) return 60;
  if (token.includes("besondere merkmale") || token.includes("special features")) return 70;
  if (isMaterialVariantAttribute(name)) return 80;
  if (token.includes("ausstattung") || token.includes("features")) return 90;
  if (isColorVariantAttribute(name) && !token.includes("füße") && !token.includes("fusse") && !token.includes("feet")) return 100;
  if (token.includes("farbe füße") || token.includes("farbe fusse") || token.includes("feet color")) return 110;
  if (token.includes("ausführung") || token.includes("ausfuhrung") || token.includes("style")) return 120;
  if (token.includes("lieferumfang") || token.includes("scope of delivery")) return 130;
  return 1000;
}

export function attributeFieldLayout(name: string): "wide" | "normal" {
  const token = normalizeFieldToken(name);
  return token.includes("wohnraum") || token.includes("ausstattung") ? "wide" : "normal";
}

export function attributeControlKind(name: string, value: string): "input" | "textarea" {
  const token = normalizeFieldToken(name);
  if (token.includes("wohnraum") || token.includes("ausstattung") || token.includes("lieferumfang")) return "textarea";
  return value.length > 100 ? "textarea" : "input";
}

export function parseShippingProfiles(payload: unknown): ShippingProfileOption[] {
  const rawList = Array.isArray(payload)
    ? payload
    : (() => {
      const record = asRecord(payload);
      if (Array.isArray(record.shippingProfiles)) return record.shippingProfiles;
      if (Array.isArray(record.items)) return record.items;
      if (Array.isArray(record.data)) return record.data;
      if (Array.isArray(record.results)) return record.results;
      return [];
    })();

  const parsed = rawList
    .map((item) => asRecord(item))
    .map((item) => {
      const id = String(
        item.id ??
        item.shippingProfileID ??
        item.shippingProfileId ??
        item.profileId ??
        "",
      );
      const name = String(
        item.name ??
        item.title ??
        item.profileName ??
        item.label ??
        SHIPPING_PROFILE_LABELS[id] ??
        id,
      );
      return { id, name };
    })
    .filter((item) => Boolean(item.id));

  const unique = new Map<string, ShippingProfileOption>();
  for (const item of parsed) unique.set(item.id, item);
  return Array.from(unique.values());
}

export function productShippingProfileId(product: Record<string, unknown>): string {
  return String(product.shippingProfileID ?? "");
}

export function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function readAiCategoryReview(product: Record<string, unknown>): AiCategoryReview {
  const description = asRecord(product.productDescription);
  const categoryGroup = String(
    product.aiCategoryGroup ??
    product.categoryGroup ??
    description.aiCategoryGroup ??
    description.categoryGroup ??
    "",
  );
  return {
    categoryGroup,
    category: String(
      product.aiCategory ??
      product.category ??
      description.aiCategory ??
      description.category ??
      "",
    ),
  };
}

export function mergeAiCategoryReview(
  storedReview: AiCategoryReview | undefined,
  product: Record<string, unknown>,
): AiCategoryReview {
  const productReview = readAiCategoryReview(product);
  if (!storedReview) {
    return productReview;
  }

  const storedCategory = String(storedReview.category ?? "").trim();
  const storedCategoryGroup = String(storedReview.categoryGroup ?? "").trim();
  const productCategory = String(productReview.category ?? "").trim();
  const productCategoryGroup = String(productReview.categoryGroup ?? "").trim();

  return {
    category: storedCategory || productCategory,
    categoryGroup: storedCategoryGroup || productCategoryGroup,
  };
}

export function productAftercoolData(product: Record<string, unknown>) {
  const comparison = asRecord(product.aftercoolComparison);
  return asRecord(comparison.aftercool);
}

export function previewText(value: unknown, fallback = "-"): string {
  const text = String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text || fallback;
}

export function formatDiffValue(value: unknown): string {
  if (Array.isArray(value)) {
    const values = value
      .map((item) => {
        if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") return String(item);
        return formatDiffValue(item);
      })
      .filter((item) => item && item !== "-");
    return values.join("\n");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return previewText(value);
}

export function readComparisonAttributes(body: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  const attributes = Array.isArray(body.attributes) ? body.attributes : [];
  for (const item of attributes) {
    const attribute = asRecord(item);
    const name = String(attribute.name ?? attribute.attributeName ?? attribute.key ?? "").trim();
    if (!name) continue;
    result[name] = formatDiffValue(attribute.values ?? attribute.value ?? attribute.text ?? "");
  }
  return result;
}

export function readDiffList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => formatDiffValue(item))
      .filter((item) => item && item !== "-");
  }
  const text = previewText(value, "");
  if (!text) return [];
  return text
    .split(/\r?\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildAftercoolRows(aftercool: ReturnType<typeof productAftercoolData>) {
  const aftercoolAttributes = readComparisonAttributes(aftercool);
  const aftercoolBulletPoints = readDiffList(aftercool.bulletPoints);
  const baseRows = [
    { label: "EAN", value: aftercool.ean },
    { label: "Title", value: aftercool.title },
    { label: "Description", value: aftercool.description },
    { label: "Price", value: aftercool.price },
    { label: "Category", value: aftercool.category },
  ];
  const bulletPointRows = aftercoolBulletPoints.map((value, index) => ({
    label: `Bullet Point ${index + 1}`,
    value,
  }));
  const attributeNames = Object.keys(aftercoolAttributes).sort((a, b) => a.localeCompare(b));
  return [
    ...baseRows,
    ...bulletPointRows,
    ...attributeNames.map((name) => ({
      label: name,
      value: aftercoolAttributes[name],
    })),
  ]
    .map((item) => ({
      label: item.label,
      value: formatDiffValue(item.value),
    }))
    .filter((item) => item.value !== "-");
}

export function statusText(status: CategoryReviewStatus): string {
  if (status === "confirmed" || status === "manually_confirmed") return "Подтверждено";
  if (status === "manually_changed") return "Изменено вручную";
  if (status === "skipped") return "Пропущено";
  return "Требует проверки";
}

export function StatusBadge({ status }: { status: CategoryReviewStatus }) {
  return <span className={`category-check-status-badge ${status}`}>{statusText(status)}</span>;
}

export function FabricHero() {
  return (
    <section className="fabric-hero">
      <div className="fabric-hero-copy">
        <p>Создание</p>
        <h1>Подготовка по Fabric</h1>
        <span>Подготовка, проверка и публикация товаров в OTTO</span>
      </div>
      <div className="fabric-hero-art" aria-hidden="true">
        <span className="fabric-hero-cube"><Box size={24} /></span>
      </div>
    </section>
  );
}

export function ProductUploadCard({
  fabricControl,
  fabricMenu,
  isPreparing,
  canPrepare,
  canReset,
  isRefreshing,
  status,
  message,
  onPrepare,
  onRefresh,
  onReset,
}: {
  fabricControl: ReactNode;
  fabricMenu: ReactNode;
  isPreparing: boolean;
  canPrepare: boolean;
  canReset: boolean;
  isRefreshing: boolean;
  status: UploadState;
  message: string;
  onPrepare: () => void;
  onRefresh: () => void;
  onReset: () => void;
}) {
  return (
    <article className="fabric-dashboard-card product-upload-card">
      <div className="fabric-card-head">
        <span className="fabric-card-icon"><Upload size={18} aria-hidden="true" /></span>
        <div>
          <h2>Загрузка товаров</h2>
          <p>Выберите источник и подготовьте товары к проверке.</p>
        </div>
      </div>
      <div className="fabric-upload-form">
        <label>
          <span>Fabric</span>
          {fabricControl}
        </label>
        <div className="fabric-upload-actions">
          <button
            className="fabric-refresh-button"
            type="button"
            onClick={onRefresh}
            disabled={isPreparing || isRefreshing}
            aria-label="Обновить список товаров"
          >
            <RefreshCw size={17} className={isRefreshing ? "spin" : ""} aria-hidden="true" />
          </button>
          <button
            className="fabric-primary-button"
            type="button"
            onClick={onPrepare}
            disabled={!canPrepare || isPreparing}
          >
            {isPreparing ? <span className="fabric-button-spinner" aria-hidden="true" /> : null}
            <span>{isPreparing ? "Подготовка..." : "Подготовить товары"}</span>
          </button>
        </div>
        <button className="fabric-reset-button" type="button" onClick={onReset} disabled={!canReset}>
          Сбросить
        </button>
      </div>
      {fabricMenu}
      <div className={`fabric-status-callout is-${status === "error" ? "error" : status === "success" ? "success" : "info"}`}>
        <span aria-hidden="true">
          {status === "error" ? <AlertCircle size={17} /> : status === "success" ? <CheckCircle2 size={17} /> : <Info size={17} />}
        </span>
        <p>{message}</p>
      </div>
    </article>
  );
}

export function CategoryStats({
  categoryKpis,
}: {
  categoryKpis: { total: number; confirmed: number; requiresReview: number; manuallyChanged: number; skipped: number };
}) {
  const stats = [
    { label: "Всего", value: categoryKpis.total, icon: Package, tone: "neutral" },
    { label: "Подтверждено", value: categoryKpis.confirmed, icon: CheckCircle2, tone: "success" },
    { label: "На проверке", value: categoryKpis.requiresReview, icon: Clock3, tone: "blue" },
    { label: "Изменено", value: categoryKpis.manuallyChanged, icon: Pencil, tone: "blue" },
    { label: "Пропущено", value: categoryKpis.skipped, icon: CircleSlash, tone: "muted" },
  ];
  return (
    <div className="fabric-category-stats">
      {stats.map((item) => {
        const Icon = item.icon;
        return (
          <div className={`fabric-category-stat is-${item.tone}`} key={item.label}>
            <span><Icon size={18} aria-hidden="true" /></span>
            <div>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PreparationProgress({
  processState,
  progressPercent,
  progressLabel,
  realtimeMode,
}: {
  processState: string;
  progressPercent: number;
  progressLabel: string;
  realtimeMode: "websocket" | "polling";
}) {
  const safeProgress = processState === "DONE"
    ? 100
    : Math.max(0, Math.min(100, Math.round(progressPercent || 0)));
  return (
    <div className="fabric-preparation-progress">
      <div className="fabric-progress-copy">
        <div>
          <strong>{processState === "DONE" ? "Подготовка завершена" : progressLabel}</strong>
          <span>{realtimeMode === "websocket" ? "Обновляется в реальном времени" : "Обновляется через polling"}</span>
        </div>
        <b>{`${safeProgress}%`}</b>
      </div>
      <div
        className="fabric-progress-track"
        role="progressbar"
        aria-label="Прогресс подготовки товаров"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safeProgress}
      >
        <span style={{ width: `${safeProgress}%` }} />
      </div>
    </div>
  );
}

export function TechnicalInfoAccordion({
  currentStep,
  preparationCounts,
  realtimeMode,
  processId,
  ottoProcessId,
  stepElapsed,
  heartbeatLag,
  copiedRuntimeField,
  runtimeCopyErrorField,
  copyText,
}: {
  currentStep: string;
  preparationCounts: { source: number; mapped: number; payload: number };
  realtimeMode: "websocket" | "polling";
  processId: string;
  ottoProcessId: string;
  stepElapsed: number;
  heartbeatLag: number;
  copiedRuntimeField: string | null;
  runtimeCopyErrorField: string | null;
  copyText: (value: string, field: string) => void;
}) {
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className={`fabric-technical ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="fabric-technical-trigger"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight size={16} aria-hidden="true" />
        <span>Техническая информация</span>
      </button>
      <div id={detailsId} className="fabric-technical-body" hidden={!open}>
        <div className="category-check-tech-counts">
          <span>{`Источник: ${preparationCounts.source}`}</span>
          <span>{`Сопоставлено: ${preparationCounts.mapped}`}</span>
          <span>{`Подготовлено: ${preparationCounts.payload}`}</span>
          <span>{realtimeMode === "websocket" ? "WebSocket" : "Polling fallback"}</span>
        </div>
        {[
          ["otto_process_id", "Otto Process ID", ottoProcessId],
          ["process_id", "Process ID", processId],
        ].map(([field, label, value]) => (
          <div className="creator-ref-runtime-row" key={field}>
            <span>{label}</span>
            <code>{value || "-"}</code>
            <button
              type="button"
              className={`creator-runtime-copy-btn ${copiedRuntimeField === field ? "is-copied" : runtimeCopyErrorField === field ? "is-error" : ""}`}
              onClick={() => copyText(value || "-", field)}
              disabled={!value}
            >
              {copiedRuntimeField === field ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedRuntimeField === field ? "Скопировано" : runtimeCopyErrorField === field ? "Ошибка" : "Копировать"}</span>
            </button>
          </div>
        ))}
        <p>Шаг: <strong>{currentStep}</strong> · <strong>{Math.max(0, Math.round(stepElapsed))}s</strong> · heartbeat {Math.max(0, Math.round(heartbeatLag))}s</p>
      </div>
    </div>
  );
}

export function CategoryReviewCard({
  categoryKpis,
  processState,
  currentStep,
  progressPercent,
  progressLabel,
  preparationCounts,
  realtimeMode,
  processId,
  ottoProcessId,
  stepElapsed,
  heartbeatLag,
  copiedRuntimeField,
  runtimeCopyErrorField,
  copyText,
  stuckMessage,
}: {
  categoryKpis: { total: number; confirmed: number; requiresReview: number; manuallyChanged: number; skipped: number };
  processState: string;
  currentStep: string;
  progressPercent: number;
  progressLabel: string;
  preparationCounts: { source: number; mapped: number; payload: number };
  realtimeMode: "websocket" | "polling";
  processId: string;
  ottoProcessId: string;
  stepElapsed: number;
  heartbeatLag: number;
  copiedRuntimeField: string | null;
  runtimeCopyErrorField: string | null;
  copyText: (value: string, field: string) => void;
  stuckMessage: string;
}) {
  const statusLabel = processState === "DONE" ? "Готово" : processState === "FAILED" ? "Ошибка" : "Подготовка";
  return (
    <article className="fabric-dashboard-card category-review-card">
      <div className="fabric-card-head fabric-card-head-split">
        <div className="fabric-card-title-row">
          <span className="fabric-card-icon"><ShieldCheck size={18} aria-hidden="true" /></span>
          <div>
            <h2>Проверка категорий</h2>
          </div>
        </div>
        <span className={`fabric-status-badge is-${processState === "FAILED" ? "failed" : processState === "DONE" ? "done" : "progress"}`}>{statusLabel}</span>
      </div>
      <p className="fabric-ready-copy">{`${categoryKpis.total} ${categoryKpis.total === 1 ? "товар готов" : "товаров готовы"} к проверке`}</p>
      <CategoryStats categoryKpis={categoryKpis} />
      <PreparationProgress processState={processState} progressPercent={progressPercent} progressLabel={progressLabel} realtimeMode={realtimeMode} />
      <TechnicalInfoAccordion
        currentStep={currentStep}
        preparationCounts={preparationCounts}
        realtimeMode={realtimeMode}
        processId={processId}
        ottoProcessId={ottoProcessId}
        stepElapsed={stepElapsed}
        heartbeatLag={heartbeatLag}
        copiedRuntimeField={copiedRuntimeField}
        runtimeCopyErrorField={runtimeCopyErrorField}
        copyText={copyText}
      />
      {stuckMessage ? <p className="helper-banner error">{stuckMessage}</p> : null}
    </article>
  );
}

export function ProductCategoriesCard({
  canCreate,
  onCreate,
  isLive,
  toolbar,
  batchActions,
  table,
}: {
  canCreate: boolean;
  onCreate: () => void;
  isLive: boolean;
  toolbar: ReactNode;
  batchActions: ReactNode;
  table: ReactNode;
}) {
  return (
    <section className="product-categories-card">
      <div className="product-categories-head">
        <div className="product-categories-title">
          <span className="fabric-card-icon"><Package size={18} aria-hidden="true" /></span>
          <div>
            <h2>Категории товаров</h2>
            <p>{isLive ? "Live updates включены. Новые строки появляются по мере готовности." : "Проверьте, подтвердите или измените категории перед генерацией данных."}</p>
          </div>
        </div>
        <button className="product-categories-create" type="button" onClick={onCreate} disabled={!canCreate}>
          <span>Создать товары</span>
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
      {toolbar}
      {batchActions}
      {table}
    </section>
  );
}

export function CategoryCheckToolbar({
  tableQuery,
  setTableQuery,
  categoryFilter,
  setCategoryFilter,
  categoryFilterOptions,
  categoryGroupDisplayByValue,
  statusFilter,
  setStatusFilter,
  categorySort,
  setCategorySort,
  setPage,
}: {
  tableQuery: string;
  setTableQuery: (value: string) => void;
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  categoryFilterOptions: string[];
  categoryGroupDisplayByValue: Record<string, string>;
  statusFilter: CategoryStatusFilter;
  setStatusFilter: (value: CategoryStatusFilter) => void;
  categorySort: CategorySortOption;
  setCategorySort: (value: CategorySortOption) => void;
  setPage: (value: number) => void;
}) {
  return (
    <div className="category-check-toolbar">
      <div className="creator-search-wrap category-check-search">
        <Search size={16} className="creator-search-icon" />
        <input
          className="creator-search-input"
          placeholder="Поиск по названию, EAN, SKU"
          type="search"
          value={tableQuery}
          onChange={(event) => {
            setTableQuery(event.target.value);
            setPage(1);
          }}
        />
      </div>
      <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}>
        <option value="all">Все AI категории</option>
        {categoryFilterOptions.map((item) => (
          <option value={item} key={item}>{categoryGroupDisplayByValue[item] || item}</option>
        ))}
      </select>
      <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as CategoryStatusFilter); setPage(1); }}>
        <option value="all">Все статусы</option>
        <option value="requires_review">Требуют проверки</option>
        <option value="confirmed">Подтверждено</option>
        <option value="manually_changed">Изменено вручную</option>
        <option value="skipped">Пропущено</option>
      </select>
      <select value={categorySort} onChange={(event) => { setCategorySort(event.target.value as CategorySortOption); setPage(1); }}>
        <option value="title">По названию</option>
        <option value="status">По статусу</option>
      </select>
    </div>
  );
}

export function CategoryCheckBatchActions({
  selectedCount,
  selectedConfirmableCount,
  editSelected,
  confirmSelected,
  skipSelected,
  resetSelected,
}: {
  selectedCount: number;
  selectedConfirmableCount: number;
  editSelected: () => void;
  confirmSelected: () => void;
  skipSelected: () => void;
  resetSelected: () => void;
}) {
  if (selectedCount === 0) return null;
  return (
    <div className="category-check-batch">
      <strong>{`Выбрано: ${selectedCount}`}</strong>
      <button className="primary-btn" type="button" onClick={editSelected}>Изменить категорию</button>
      <button className="primary-btn" type="button" onClick={confirmSelected} disabled={selectedConfirmableCount === 0}>Подтвердить выбранные</button>
      <button className="secondary-btn" type="button" onClick={skipSelected}>Пропустить выбранные</button>
      <button className="secondary-btn" type="button" onClick={resetSelected}>Сбросить выбор</button>
    </div>
  );
}

export function BulkCategoryEditDrawer({
  open,
  count,
  groups,
  categoryGroupDisplayByValue,
  categoryDisplayByValue,
  options,
  value,
  setValue,
  onClose,
  onApply,
}: {
  open: boolean;
  count: number;
  groups: string[];
  categoryGroupDisplayByValue: Record<string, string>;
  categoryDisplayByValue: Record<string, string>;
  options: string[];
  value: string;
  setValue: (value: string) => void;
  onClose: () => void;
  onApply: () => void;
}) {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const hasSingleGroup = groups.length === 1;
  const normalizedQuery = normalizeFieldToken(query);
  const visibleOptions = options
    .filter((option) => !normalizedQuery || normalizeFieldToken(`${option} ${categoryDisplayByValue[option] ?? ""}`).includes(normalizedQuery))
    .slice(0, 100);

  useEffect(() => {
    if (!open) {
      setMenuOpen(false);
      return;
    }
    setQuery(value);
  }, [open, value]);

  if (!open) return null;

  return (
    <div className="category-drawer-backdrop bulk-category-backdrop" onClick={onClose}>
      <aside className="category-drawer bulk-category-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="category-drawer-head">
          <div>
            <h3>Массовое изменение категории</h3>
            <p>Выберите одну подкатегорию для всех отмеченных товаров.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>
        <div className="category-drawer-body">
          <section className="bulk-selected-products">
            <small>Выбрано товаров</small>
            <strong>{count}</strong>
          </section>
          {hasSingleGroup ? (
            <>
              <div className="bulk-category-group">
                <small>Category group</small>
                <strong>{categoryGroupDisplayByValue[groups[0]] || groups[0]}</strong>
              </div>
              <label className="bulk-category-field">
                <span>Подкатегория</span>
                <div className={`bulk-category-picker${menuOpen ? " is-open" : ""}`}>
                  <Search size={16} aria-hidden="true" />
                  <input
                    value={query}
                    placeholder="Найти категорию"
                    onFocus={() => setMenuOpen(true)}
                    onBlur={() => window.setTimeout(() => setMenuOpen(false), 120)}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setValue("");
                      setMenuOpen(true);
                    }}
                    aria-expanded={menuOpen}
                    aria-autocomplete="list"
                  />
                  <ChevronDown size={16} aria-hidden="true" />
                  {menuOpen ? (
                    <div className="bulk-category-options" role="listbox">
                      {visibleOptions.length ? visibleOptions.map((option) => {
                        const active = option === value;
                        return (
                          <button
                            className={active ? "is-selected" : ""}
                            type="button"
                            role="option"
                            aria-selected={active}
                            key={option}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setValue(option);
                              setQuery(option);
                              setMenuOpen(false);
                            }}
                          >
                            <span>{categoryDisplayByValue[option] || option}</span>
                            {active ? <Check size={15} /> : null}
                          </button>
                        );
                      }) : <div className="bulk-category-options-empty">Категории не найдены</div>}
                    </div>
                  ) : null}
                </div>
              </label>
              {value ? <div className="bulk-category-selection"><Check size={15} /><span>Будет применено:</span><strong>{categoryDisplayByValue[value] || value}</strong></div> : null}
            </>
          ) : (
            <div className="bulk-category-warning">
              <AlertCircle size={18} />
              <div>
                <strong>Выбраны товары из разных Category group</strong>
                <span>Для массового изменения выберите товары только из одной группы.</span>
              </div>
            </div>
          )}
        </div>
        <div className="bulk-category-footer">
          <button className="secondary-btn" type="button" onClick={onClose}>Отмена</button>
          <button className="primary-btn" type="button" disabled={!hasSingleGroup || !value || count === 0} onClick={onApply}>
            {`Применить к ${count} товарам`}
          </button>
        </div>
      </aside>
    </div>
  );
}

export function CategoryCheckTable({
  rows,
  categoryRowStatuses,
  categoryDisplayByValue,
  categoryGroupDisplayByValue,
  selectedCategoryIndexSet,
  allFilteredRowsSelected,
  toggleAllFilteredRows,
  toggleCategorySelection,
  confirmCategoryRows,
  openDetails,
  selectedIndex,
  setSelectedIndex,
  pageSize,
  setPageSize,
  safePage,
  totalPages,
  paginationItems,
  setPage,
  filteredCount,
  state,
  processState,
  rowNumberStart,
}: {
  rows: CategoryCheckRow[];
  categoryRowStatuses: Record<number, CategoryReviewStatus>;
  categoryDisplayByValue: Record<string, string>;
  categoryGroupDisplayByValue: Record<string, string>;
  selectedCategoryIndexSet: Set<number>;
  allFilteredRowsSelected: boolean;
  toggleAllFilteredRows: () => void;
  toggleCategorySelection: (rowIndex: number) => void;
  confirmCategoryRows: (rowIndexes: number[]) => void;
  openDetails: (rowIndex: number) => void;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  pageSize: number;
  setPageSize: (value: number) => void;
  safePage: number;
  totalPages: number;
  paginationItems: Array<number | "...">;
  setPage: (updater: number | ((value: number) => number)) => void;
  filteredCount: number;
  state: UploadState;
  processState: string;
  rowNumberStart: number;
}) {
  return (
    <>
      <div className="category-check-table-scroll">
        <table className="category-check-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={allFilteredRowsSelected} onChange={toggleAllFilteredRows} aria-label="Выбрать все товары" /></th>
              <th>№</th>
              <th>Название товара</th>
              <th>EAN / SKU</th>
              <th>Категория</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, displayIndex) => {
              const reviewStatus = categoryRowStatuses[row.index] ?? "requires_review";
              return (
                <tr
                  key={row.index}
                  className={selectedIndex === row.index ? "is-selected" : ""}
                  onClick={() => {
                    setSelectedIndex(row.index);
                    openDetails(row.index);
                  }}
                >
                  <td data-label="Выбор" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedCategoryIndexSet.has(row.index)}
                      onChange={() => toggleCategorySelection(row.index)}
                      aria-label={`Выбрать товар ${row.title || row.ean || row.sku || row.index}`}
                    />
                  </td>
                  <td data-label="№">{rowNumberStart + displayIndex + 1}</td>
                  <td data-label="Название товара">
                    <div className="category-check-title-cell">
                      {row.image ? <HoverPreviewImage src={row.image} alt="" /> : <span className="category-check-no-image">-</span>}
                      <strong title={row.title || "-"}>{row.title || "-"}</strong>
                    </div>
                  </td>
                  <td data-label="EAN / SKU">
                    <div className="category-check-code-cell">
                      <span>{row.ean || "-"}</span>
                      <code>{row.sku || "-"}</code>
                    </div>
                  </td>
                  <td data-label="Категория">
                    <div className="category-check-ai-cell">
                      {row.selectedCategory.trim() !== row.aiCategory.trim() ? (
                        <div className="category-check-category-diff" aria-label="Категория изменена">
                          <div className="removed">
                            <span aria-hidden="true">−</span>
                            <del>{categoryDisplayByValue[row.aiCategory] || row.aiCategory || "Без категории"}</del>
                          </div>
                          <div className="added">
                            <span aria-hidden="true">+</span>
                            <ins>{categoryDisplayByValue[row.selectedCategory] || row.selectedCategory || "Без категории"}</ins>
                          </div>
                        </div>
                      ) : (
                        <strong>{categoryDisplayByValue[row.selectedCategory || row.aiCategory] || row.selectedCategory || row.aiCategory || "-"}</strong>
                      )}
                      <span>{categoryGroupDisplayByValue[row.aiCategoryGroup] || row.aiCategoryGroup || "-"}</span>
                    </div>
                  </td>
                  <td data-label="Статус"><StatusBadge status={reviewStatus} /></td>
                  <td data-label="Действия" onClick={(event) => event.stopPropagation()}>
                    <div className="category-check-row-actions">
                      <button type="button" onClick={() => confirmCategoryRows([row.index])} disabled={state === "loading" || !row.selectedCategory.trim() || reviewStatus === "confirmed" || reviewStatus === "manually_confirmed"}>Подтвердить</button>
                      <button type="button" onClick={() => { setSelectedIndex(row.index); openDetails(row.index); }}>Детали</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? (
        <div className="creator-products-empty">
          <div className="creator-products-empty-title">
            <Package size={28} aria-hidden="true" />
            <strong>{processState === "IN_PROGRESS" ? "Жду готовые категории" : "Нет товаров"}</strong>
          </div>
          <p>{processState === "IN_PROGRESS" ? "Товары появятся здесь по мере готовности AI category mapping." : "Измените фильтры или запустите подготовку товаров."}</p>
        </div>
      ) : null}
      <div className="creator-products-pagination category-check-pagination">
        <div className="creator-products-pagination-left">
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
            {[25, 50, 100, 200].map((item) => <option key={item} value={item}>{`${item} на странице`}</option>)}
          </select>
          <span>{`${filteredCount === 0 ? 0 : (safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, filteredCount)} из ${filteredCount}`}</span>
        </div>
        <div className="creator-products-pagination-right">
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}><ChevronLeft size={14} /></button>
          {paginationItems.map((item, idx) => typeof item === "number" ? (
            <button key={`${item}-${idx}`} type="button" className={item === safePage ? "active" : ""} onClick={() => setPage(item)}>{item}</button>
          ) : (
            <span key={`${item}-${idx}`}>...</span>
          ))}
          <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}><ChevronRight size={14} /></button>
        </div>
      </div>
    </>
  );
}

export function CategoryProductMedia({ row }: { row: CategoryCheckRow }) {
  return (
    <figure className="category-details-product-media">
      {row.image ? (
        <HoverPreviewImage src={row.image} alt={row.title || "Изображение товара"} block />
      ) : (
        <div className="category-details-product-media-empty">
          <Package size={48} aria-hidden="true" />
          <span>Изображение недоступно</span>
        </div>
      )}
      <figcaption>{row.title || "-"}</figcaption>
    </figure>
  );
}

export function CategoryEditDrawer({
  row,
  categoryOptionsByGroup,
  categoryGroupDisplayByValue,
  categoryDisplayByValue,
  open,
  onSave,
  onClose,
}: {
  row: CategoryCheckRow | null;
  categoryOptionsByGroup: Record<string, string[]>;
  categoryGroupDisplayByValue: Record<string, string>;
  categoryDisplayByValue: Record<string, string>;
  open: boolean;
  onSave: (category: string, comment: string) => void;
  onClose: () => void;
}) {
  if (!open || !row) return null;

  return (
    <div className="category-drawer-backdrop" onClick={onClose}>
      <aside className="category-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="category-drawer-head">
          <h3>Изменить категорию</h3>
          <button type="button" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>
        <div className="category-drawer-body">
          <CategoryProductMedia row={row} />
          <CategoryChangeForm
            currentGroup={row.aiCategoryGroup}
            currentCategory={row.selectedCategory || row.aiCategory}
            categoryOptionsByGroup={categoryOptionsByGroup}
            categoryGroupDisplayByValue={categoryGroupDisplayByValue}
            categoryDisplayByValue={categoryDisplayByValue}
            onSave={onSave}
            onCancel={onClose}
            onDirtyChange={() => undefined}
          />
        </div>
      </aside>
    </div>
  );
}

export function CategoryChangeForm({
  currentGroup,
  currentCategory,
  categoryOptionsByGroup,
  categoryGroupDisplayByValue = {},
  categoryDisplayByValue = {},
  onSave,
  onCancel,
  onDirtyChange,
  autoSave = false,
  hideActions = false,
  compact = false,
  onDraftChange,
}: {
  currentGroup: string;
  currentCategory: string;
  categoryOptionsByGroup: Record<string, string[]>;
  categoryGroupDisplayByValue?: Record<string, string>;
  categoryDisplayByValue?: Record<string, string>;
  onSave: (category: string, comment: string) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  autoSave?: boolean;
  hideActions?: boolean;
  compact?: boolean;
  onDraftChange?: (draft: { category: string; dirty: boolean; valid: boolean }) => void;
}) {
  const groups = useMemo(() => {
    const values = new Set(Object.keys(categoryOptionsByGroup));
    if (currentGroup.trim()) values.add(currentGroup.trim());
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [categoryOptionsByGroup, currentGroup]);
  const [group, setGroup] = useState(currentGroup);
  const [category, setCategory] = useState(currentCategory);
  const [query, setQuery] = useState(categoryDisplayByValue[currentCategory] || currentCategory);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [optionsStyle, setOptionsStyle] = useState<CSSProperties | undefined>(undefined);
  const comboboxRef = useRef<HTMLDivElement>(null);
  const categories = categoryOptionsByGroup[group] ?? [];
  const displayCategory = (value: string) => categoryDisplayByValue[value] || value;
  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return categories.filter((item) => {
      if (!normalized) return true;
      return item.toLocaleLowerCase().includes(normalized) || displayCategory(item).toLocaleLowerCase().includes(normalized);
    }).slice(0, 80);
  }, [categories, query, categoryDisplayByValue]);

  useEffect(() => {
    setGroup(currentGroup);
    setCategory(currentCategory);
    setQuery(categoryDisplayByValue[currentCategory] || currentCategory);
    setOpen(false);
    setActiveIndex(0);
  }, [currentGroup, currentCategory, categoryDisplayByValue]);

  useEffect(() => {
    const dirty = group !== currentGroup || category !== currentCategory;
    onDirtyChange(dirty);
    onDraftChange?.({ category, dirty, valid: Boolean(category) });
  }, [group, category, currentGroup, currentCategory, onDirtyChange, onDraftChange]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (!comboboxRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !comboboxRef.current) {
      setOptionsStyle(undefined);
      return;
    }

    const updateOptionsPosition = () => {
      if (!comboboxRef.current) return;
      const rect = comboboxRef.current.getBoundingClientRect();
      const viewportGap = 24;
      const preferredHeight = 220;
      const availableBelow = window.innerHeight - rect.bottom - viewportGap;
      const availableAbove = rect.top - viewportGap;
      const openUpward = availableBelow < 160 && availableAbove > availableBelow;
      const maxHeight = Math.max(120, Math.min(preferredHeight, openUpward ? availableAbove - 6 : availableBelow - 6));

      setOptionsStyle({
        position: "fixed",
        left: rect.left,
        right: "auto",
        width: rect.width,
        maxHeight,
        ...(openUpward ? { top: "auto", bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6, bottom: "auto" }),
      });
    };

    updateOptionsPosition();
    window.addEventListener("resize", updateOptionsPosition);
    window.addEventListener("scroll", updateOptionsPosition, true);
    return () => {
      window.removeEventListener("resize", updateOptionsPosition);
      window.removeEventListener("scroll", updateOptionsPosition, true);
    };
  }, [open, matches.length]);

  const choose = (value: string) => {
    setCategory(value);
    setQuery(displayCategory(value));
    setOpen(false);
    if (autoSave) onSave(value, "");
  };
  const cancel = () => {
    setGroup(currentGroup);
    setCategory(currentCategory);
    setQuery(categoryDisplayByValue[currentCategory] || currentCategory);
    setOpen(false);
    setActiveIndex(0);
    onCancel();
  };

  return (
    <div className={`category-change-form ${compact ? "is-compact" : ""}`}>
      {!compact ? <div className="category-change-current"><span>Текущая AI-категория</span><strong>{categoryDisplayByValue[currentCategory] || currentCategory || "-"}</strong></div> : null}
      <label>Category group
        <select value={group} onChange={(event) => { setGroup(event.target.value); setCategory(""); setQuery(""); setOpen(false); setActiveIndex(0); }}>
          <option value="">Выберите Category group</option>
          {groups.map((item) => <option value={item} key={item}>{categoryGroupDisplayByValue[item] || item}</option>)}
        </select>
      </label>
      <label>Новая подкатегория
        <div className="category-combobox" ref={comboboxRef}>
          <Search size={16} aria-hidden="true" />
          <input
            role="combobox"
            aria-expanded={open}
            aria-controls="category-options"
            value={query}
            placeholder={group ? "Поиск по подкатегориям" : "Сначала выберите Category group"}
            disabled={!group}
            onFocus={() => setOpen(true)}
            onChange={(event) => { setQuery(event.target.value); setCategory(""); setOpen(true); setActiveIndex(0); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActiveIndex((value) => Math.min(value + 1, matches.length - 1)); }
              if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((value) => Math.max(value - 1, 0)); }
              if (event.key === "Enter" && open && matches[activeIndex]) { event.preventDefault(); choose(matches[activeIndex]); }
              if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
            }}
          />
          <ChevronDown size={16} aria-hidden="true" />
          {open ? <div className="category-combobox-options" id="category-options" role="listbox" style={optionsStyle} onWheel={(event) => event.stopPropagation()}>
            {matches.length ? matches.map((item, index) => (
              <button className={index === activeIndex ? "active" : ""} type="button" role="option" aria-selected={category === item} key={item} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}>{displayCategory(item)}</button>
            )) : <span>Категории не найдены</span>}
          </div> : null}
        </div>
      </label>
      {!compact ? <div className="category-change-result"><span>Новая подкатегория</span><strong>{category ? displayCategory(category) : "Выберите подкатегорию"}</strong></div> : null}
      {!autoSave && !hideActions ? <div className="category-change-actions">
        <button className="secondary-btn" type="button" onClick={cancel}>Отмена</button>
        <button className="primary-btn" type="button" disabled={!category} onClick={() => onSave(category, "")}>Сохранить изменение</button>
      </div> : null}
    </div>
  );
}

export function CategoryDiff({ previous, next }: { previous: string; next: string }) {
  if (!previous || !next || previous.trim() === next.trim()) return null;
  return (
    <div className="category-review-diff">
      <div className="old-value"><span>Было</span><strong>{previous}</strong></div>
      <div className="new-value"><span>Стало</span><strong>{next}</strong></div>
    </div>
  );
}

export function CategoryReviewModalHeader({ onClose }: { onClose: () => void }) {
  return (
    <header className="category-review-modal-header">
      <div className="category-review-heading">
        <h3>Проверка категории</h3>
        <p>Проверьте товар по изображению и подтвердите AI-категорию</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
    </header>
  );
}

export function CategoryProductImageCard({ row }: { row: CategoryCheckRow }) {
  return row.image ? (
    <HoverPreviewImage className="category-review-product-image" src={row.image} alt={row.title || "Изображение товара"} block />
  ) : (
    <div className="category-review-product-image-empty">
      <Package size={42} aria-hidden="true" />
      <span>Изображение отсутствует</span>
    </div>
  );
}

export function CategoryProductHero({ row, status }: { row: CategoryCheckRow; status: CategoryReviewStatus }) {
  return (
    <section className="category-product-hero">
      <CategoryProductImageCard row={row} />
      <div className="category-review-product-info">
        <div className="category-review-product-title"><strong>{row.title || "Без названия"}</strong></div>
        <div className="category-review-identifiers"><span>{`SKU: ${row.sku || "-"} · EAN: ${row.ean || "-"}`}</span></div>
        <div className="category-review-product-status"><StatusBadge status={status} /></div>
      </div>
    </section>
  );
}

export function CategoryCategorySection({ row, categoryOptionsByGroup, categoryGroupDisplayByValue, categoryDisplayByValue, canSaveDraft, onDraftChange, onDirtyChange, onSave, onSaveDraft }: {
  row: CategoryCheckRow;
  categoryOptionsByGroup: Record<string, string[]>;
  categoryGroupDisplayByValue: Record<string, string>;
  categoryDisplayByValue: Record<string, string>;
  canSaveDraft: boolean;
  onDraftChange: (draft: { category: string; dirty: boolean; valid: boolean }) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (category: string, comment: string) => void;
  onSaveDraft: () => void;
}) {
  return (
    <section className="category-review-ai-panel">
      <div className="category-review-ai-head">
        <div><strong>AI-категория</strong><small>Текущая предложенная категория</small></div>
      </div>
      <CategoryDiff previous={categoryDisplayByValue[row.aiCategory] || row.aiCategory} next={categoryDisplayByValue[row.selectedCategory] || row.selectedCategory} />
      <CategoryChangeForm
        currentGroup={row.aiCategoryGroup}
        currentCategory={row.selectedCategory || row.aiCategory}
        categoryOptionsByGroup={categoryOptionsByGroup}
        categoryGroupDisplayByValue={categoryGroupDisplayByValue}
        categoryDisplayByValue={categoryDisplayByValue}
        onSave={onSave}
        onCancel={() => undefined}
        onDirtyChange={onDirtyChange}
        onDraftChange={onDraftChange}
        hideActions
        compact
      />
      <div className="category-inline-save">
        <button className="primary-btn" type="button" disabled={!canSaveDraft} onClick={onSaveDraft}>Сохранить изменения</button>
      </div>
    </section>
  );
}

export function CategoryReviewNavigation({ position, total, onPrevious, onNext }: { position: number; total: number; onPrevious: () => void; onNext: () => void }) {
  return (
    <div className="category-review-navigation">
      <button className="ghost-btn" type="button" onClick={onPrevious} disabled={position <= 0}><ChevronLeft size={16} /> Предыдущий</button>
      <span className="category-review-position">{`${Math.max(0, position) + 1} / ${total}`}</span>
      <button className="ghost-btn" type="button" onClick={onNext} disabled={position < 0 || position >= total - 1}>Следующий <ChevronRight size={16} /></button>
    </div>
  );
}

export function CategoryReviewFooter({ position, total, onPrevious, onNext }: {
  position: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return <footer className="category-review-footer">
    <CategoryReviewNavigation position={position} total={total} onPrevious={onPrevious} onNext={onNext} />
  </footer>;
}

export function CategoryProductListItem({ row, status, active, onSelect }: {
  row: CategoryCheckRow;
  status: CategoryReviewStatus;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" className={`category-product-list-item ${active ? "active" : ""}`} onClick={onSelect}>
      {row.image ? <HoverPreviewImage src={row.image} alt="" /> : <span className="category-product-list-empty">-</span>}
      <span className="category-product-list-text">
        <strong>{row.title || "Без названия"}</strong>
        <span>{row.sku || row.ean || "-"}</span>
        <StatusBadge status={status} />
      </span>
    </button>
  );
}

export function CategoryProductNavigator({ rows, statuses, activeIndex, position, total, onSelectProduct }: {
  rows: CategoryCheckRow[];
  statuses: Record<number, CategoryReviewStatus>;
  activeIndex: number;
  position: number;
  total: number;
  onSelectProduct: (rowIndex: number) => void;
}) {
  const [query, setQuery] = useState("");
  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) => [row.title, row.sku, row.ean, row.selectedCategory, row.aiCategory].some((value) => value.toLocaleLowerCase().includes(normalized)));
  }, [query, rows]);

  return (
    <aside className="category-product-navigator">
      <div className="category-product-search">
        <label htmlFor="category-product-search">Поиск по товарам</label>
        <span>{`${Math.max(0, position) + 1} / ${total}`}</span>
      </div>
      <div className="category-product-search-input">
        <Search size={16} aria-hidden="true" />
        <input id="category-product-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название, SKU или EAN" />
      </div>
      <div className="category-product-list">
        {visibleRows.length ? visibleRows.map((item) => (
          <CategoryProductListItem
            key={item.index}
            row={item}
            status={statuses[item.index] ?? "requires_review"}
            active={item.index === activeIndex}
            onSelect={() => onSelectProduct(item.index)}
          />
        )) : <div className="category-product-list-empty-state">Товары не найдены</div>}
      </div>
    </aside>
  );
}

export function CategoryReviewWorkspace({ row, status, categoryOptionsByGroup, categoryGroupDisplayByValue, categoryDisplayByValue, canSaveDraft, onDraftChange, onDirtyChange, onSave, onSaveDraft }: {
  row: CategoryCheckRow;
  status: CategoryReviewStatus;
  categoryOptionsByGroup: Record<string, string[]>;
  categoryGroupDisplayByValue: Record<string, string>;
  categoryDisplayByValue: Record<string, string>;
  canSaveDraft: boolean;
  onDraftChange: (draft: { category: string; dirty: boolean; valid: boolean }) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (category: string, comment: string) => void;
  onSaveDraft: () => void;
}) {
  return (
    <div className="category-review-workspace">
      <CategoryProductHero row={row} status={status} />
      <CategoryCategorySection
        key={row.index}
        row={row}
        categoryOptionsByGroup={categoryOptionsByGroup}
        categoryGroupDisplayByValue={categoryGroupDisplayByValue}
        categoryDisplayByValue={categoryDisplayByValue}
        canSaveDraft={canSaveDraft}
        onDraftChange={onDraftChange}
        onDirtyChange={onDirtyChange}
        onSave={onSave}
        onSaveDraft={onSaveDraft}
      />
    </div>
  );
}

export function CategoryReviewModal({
  row,
  rows,
  statuses,
  status,
  categoryOptionsByGroup,
  categoryGroupDisplayByValue,
  categoryDisplayByValue,
  open,
  onSave,
  position,
  total,
  onPrevious,
  onNext,
  onSelectProduct,
  onClose,
}: {
  row: CategoryCheckRow | null;
  rows: CategoryCheckRow[];
  statuses: Record<number, CategoryReviewStatus>;
  status: CategoryReviewStatus;
  categoryOptionsByGroup: Record<string, string[]>;
  categoryGroupDisplayByValue: Record<string, string>;
  categoryDisplayByValue: Record<string, string>;
  open: boolean;
  onSave: (category: string, comment: string) => void;
  position: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onSelectProduct: (rowIndex: number) => void;
  onClose: () => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState({ category: "", dirty: false, valid: false });
  useEffect(() => {
    setDirty(false);
    setDraft({ category: row?.selectedCategory || row?.aiCategory || "", dirty: false, valid: Boolean(row?.selectedCategory || row?.aiCategory) });
  }, [row?.index, open, row?.selectedCategory, row?.aiCategory]);
  const requestClose = () => {
    if (dirty && !window.confirm("Есть несохранённые изменения. Закрыть без сохранения?")) return;
    onClose();
  };
  const requestNavigation = (navigate: () => void) => {
    if (dirty && !window.confirm("Есть несохранённые изменения. Перейти без сохранения?")) return;
    setDirty(false);
    navigate();
  };
  const requestSave = () => {
    if (!draft.valid || !draft.category) return;
    onSave(draft.category, "");
    setDirty(false);
    setDraft((current) => ({ ...current, dirty: false }));
  };
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") requestClose(); };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
  if (!open || !row) return null;
  return (
    <div className="category-drawer-backdrop category-review-backdrop" onClick={requestClose}>
      <aside className="category-review-modal" onClick={(event) => event.stopPropagation()}>
        <CategoryReviewModalHeader onClose={requestClose} />
        <div className="category-review-modal-body">
          <CategoryProductNavigator rows={rows} statuses={statuses} activeIndex={row.index} position={position} total={total} onSelectProduct={(rowIndex) => requestNavigation(() => onSelectProduct(rowIndex))} />
          <CategoryReviewWorkspace
            row={row}
            status={status}
            categoryOptionsByGroup={categoryOptionsByGroup}
            categoryGroupDisplayByValue={categoryGroupDisplayByValue}
            categoryDisplayByValue={categoryDisplayByValue}
            canSaveDraft={dirty && draft.valid}
            onDraftChange={setDraft}
            onDirtyChange={setDirty}
            onSave={(category, comment) => { onSave(category, comment); setDirty(false); }}
            onSaveDraft={requestSave}
          />
        </div>
        <CategoryReviewFooter
          position={position}
          total={total}
          onPrevious={() => requestNavigation(onPrevious)}
          onNext={() => requestNavigation(onNext)}
        />
      </aside>
    </div>
  );
}

export function reviewStatusLabel(status: ProductReviewStatus): string {
  if (status === "approved") return "Approved";
  if (status === "modified") return "Modified";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

export function ProductReviewPage({ children }: { children: ReactNode }) {
  return <section className="product-review-page">{children}</section>;
}

export const PRODUCT_REVIEW_ROW_HEIGHT = 74;
export const PRODUCT_REVIEW_OVERSCAN = 8;

export function productReviewRowKey(row: ProductReviewRow): string {
  const identity = row.productReference || row.sku || row.ean || "product";
  return `${row.index}:${identity}`;
}

export function productReviewCategory(row: ProductReviewRow): string {
  return row.selectedCategory || row.aiCategory || row.sourceCategory || "";
}

export function productReviewStatusIcon(status: ProductReviewStatus, errors: number): ReactNode {
  if (status === "approved") return <Check size={13} aria-hidden="true" />;
  if (status === "modified") return <Pencil size={12} aria-hidden="true" />;
  if (status === "rejected" || errors > 0) return <AlertCircle size={13} aria-hidden="true" />;
  return null;
}

export function ProductListItem({
  row,
  active,
  selected,
  onOpen,
  onToggle,
}: {
  row: ProductReviewRow;
  active: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const statusTitle = row.errors > 0 ? `Errors: ${row.errors}` : reviewStatusLabel(row.reviewStatus);
  return (
    <article className={`product-review-list-item ${active ? "active" : ""}`} data-product-index={row.index} data-product-key={productReviewRowKey(row)}>
      <span className="product-review-list-checkbox">
        <input type="checkbox" checked={selected} onChange={onToggle} onClick={(event) => event.stopPropagation()} aria-label={`Select ${row.sku}`} />
      </span>
      <button type="button" className="product-review-list-open" onClick={onOpen}>
        {row.image ? <HoverPreviewImage src={row.image} alt="" loading="lazy" /> : <span className="product-review-list-no-image">-</span>}
      </button>
      <button type="button" className="product-review-list-copy" onClick={onOpen}>
        <strong title={row.title}>{row.title || "-"}</strong>
        <small>{`SKU ${row.sku || "-"} · ${productReviewCategory(row) || "-"}`}</small>
      </button>
      <span className={`product-review-status ${row.reviewStatus}${row.errors > 0 ? " has-errors" : ""}`} title={statusTitle} aria-label={statusTitle}>
        {productReviewStatusIcon(row.reviewStatus, row.errors)}
      </span>
    </article>
  );
}

export function ProductList({
  allRows,
  rows,
  selectedIndex,
  selectedReviewIndexes,
  onSelect,
  onToggleSelect,
  onToggleAllVisible,
  onClearSelection,
  searchRef,
  query,
  setQuery,
  filter,
  setFilter,
  categoryFilter,
  setCategoryFilter,
  sort,
  setSort,
}: {
  allRows: ProductReviewRow[];
  rows: ProductReviewRow[];
  selectedIndex: number;
  selectedReviewIndexes: number[];
  onSelect: (index: number) => void;
  onToggleSelect: (index: number) => void;
  onToggleAllVisible: (indexes: number[], selected: boolean) => void;
  onClearSelection: () => void;
  searchRef: Ref<HTMLInputElement>;
  query: string;
  setQuery: (value: string) => void;
  filter: ReviewQueueFilter;
  setFilter: (value: ReviewQueueFilter) => void;
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  sort: ReviewQueueSort;
  setSort: (value: ReviewQueueSort) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);
  const selectedSet = useMemo(() => new Set(selectedReviewIndexes), [selectedReviewIndexes]);
  const reviewedCount = useMemo(() => allRows.filter((row) => row.reviewStatus === "approved" || row.reviewStatus === "rejected").length, [allRows]);
  const statusCounts = useMemo(() => ({
    all: allRows.length,
    modified: allRows.filter((row) => row.reviewStatus === "modified").length,
    errors: allRows.filter((row) => row.errors > 0 || row.reviewStatus === "rejected").length,
    approved: allRows.filter((row) => row.reviewStatus === "approved").length,
    pending: allRows.filter((row) => row.reviewStatus === "pending").length,
  }), [allRows]);
  const categoryOptions = useMemo(() => Array.from(new Set(allRows.map(productReviewCategory).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [allRows]);
  const activePosition = rows.findIndex((row) => row.index === selectedIndex);
  const totalHeight = rows.length * PRODUCT_REVIEW_ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / PRODUCT_REVIEW_ROW_HEIGHT) - PRODUCT_REVIEW_OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / PRODUCT_REVIEW_ROW_HEIGHT) + PRODUCT_REVIEW_OVERSCAN * 2;
  const endIndex = Math.min(rows.length, startIndex + visibleCount);
  const visibleRows = rows.slice(startIndex, endIndex);
  const visibleRowIndexes = useMemo(() => rows.map((row) => row.index), [rows]);
  const selectedVisibleCount = useMemo(
    () => visibleRowIndexes.filter((index) => selectedSet.has(index)).length,
    [selectedSet, visibleRowIndexes],
  );
  const allVisibleSelected = visibleRowIndexes.length > 0 && selectedVisibleCount === visibleRowIndexes.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const offsetY = startIndex * PRODUCT_REVIEW_ROW_HEIGHT;
  const quickFilters = [
    { value: "all", label: "Все", count: statusCounts.all },
    { value: "modified", label: "Изменённые", count: statusCounts.modified },
    { value: "errors", label: "Ошибки", count: statusCounts.errors },
    { value: "approved", label: "Проверенные", count: statusCounts.approved },
    { value: "pending", label: "Непроверенные", count: statusCounts.pending },
  ] satisfies Array<{ value: ReviewQueueFilter; label: string; count: number }>;
  const visibleQuickFilters = quickFilters.filter((item) => item.value === "all" || item.count > 0);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const position = rows.findIndex((row) => row.index === selectedIndex);
    if (position < 0) return;
    const itemTop = position * PRODUCT_REVIEW_ROW_HEIGHT;
    const itemBottom = itemTop + PRODUCT_REVIEW_ROW_HEIGHT;
    const visibleTop = container.scrollTop;
    const visibleBottom = visibleTop + container.clientHeight;
    if (itemTop < visibleTop) {
      container.scrollTo({ top: Math.max(0, itemTop - 6), behavior: "smooth" });
    } else if (itemBottom > visibleBottom) {
      container.scrollTo({ top: itemBottom - container.clientHeight + 6, behavior: "smooth" });
    }
  }, [selectedIndex, rows]);

  useLayoutEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const update = () => setViewportHeight(container.clientHeight || 520);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const resetFilters = () => {
    setQuery("");
    setFilter("all");
    setCategoryFilter("all");
    setSort("upload");
  };
  const goToPosition = (position: number) => {
    const target = rows[position];
    if (target) onSelect(target.index);
  };
  const searchActive = query.trim().length > 0;

  return (
    <aside className="product-review-list">
      <div className="product-review-list-tools">
        <div className="product-review-list-head">
          <label className="product-review-list-select-all">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allVisibleSelected}
              disabled={visibleRowIndexes.length === 0}
              onChange={() => onToggleAllVisible(visibleRowIndexes, allVisibleSelected)}
              aria-label="Выбрать все видимые товары"
            />
          </label>
          <div>
            <h3>Товары</h3>
            <p>{`Проверено ${reviewedCount} · Осталось ${Math.max(0, allRows.length - reviewedCount)}`}</p>
          </div>
          <strong>{allRows.length.toLocaleString("ru-RU")}</strong>
        </div>
        {selectedReviewIndexes.length > 0 ? (
          <div className="product-review-list-selected">
            <span>{`Выбрано: ${selectedReviewIndexes.length}`}</span>
            <button type="button" onClick={onClearSelection}>Снять выбор</button>
          </div>
        ) : null}
        <div className="creator-search-wrap">
          <Search size={16} className="creator-search-icon" />
          <input ref={searchRef} className="creator-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по SKU, EAN или названию" />
          {query ? <button type="button" className="product-review-search-clear" onClick={() => setQuery("")} aria-label="Очистить поиск"><X size={14} /></button> : null}
        </div>
        {searchActive ? <div className="product-review-found">{`Найдено: ${rows.length}`}</div> : null}
        <div className="product-review-filter-row">
          <select value={filter} onChange={(event) => setFilter(event.target.value as ReviewQueueFilter)} aria-label="Фильтр статуса">
            <option value="all">Все статусы</option>
            <option value="pending">Непроверенные</option>
            <option value="approved">Проверенные</option>
            <option value="modified">Изменённые</option>
            <option value="errors">Ошибки</option>
          </select>
          {categoryOptions.length > 0 ? (
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Фильтр категории">
              <option value="all">Все категории</option>
              {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          ) : null}
          <select value={sort} onChange={(event) => setSort(event.target.value as ReviewQueueSort)} aria-label="Сортировка">
            <option value="upload">Порядок загрузки</option>
            <option value="unreviewed">Непроверенные сначала</option>
            <option value="modified">Изменённые сначала</option>
            <option value="errors">Ошибки сначала</option>
            <option value="approved">Проверенные сначала</option>
            <option value="title-asc">Название A-Z</option>
            <option value="title-desc">Название Z-A</option>
            <option value="sku">По SKU</option>
          </select>
        </div>
      </div>
      <div ref={listRef} className="product-review-list-scroll" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        {rows.length === 0 ? (
          <div className="product-review-empty">
            <strong>Товары не найдены</strong>
            <span>Измените запрос или сбросьте фильтры</span>
            <button type="button" className="secondary-btn" onClick={resetFilters}>Сбросить фильтры</button>
          </div>
        ) : (
          <div className="product-review-virtual-space" style={{ height: totalHeight }}>
            <div className="product-review-virtual-window" style={{ transform: `translateY(${offsetY}px)` }}>
              {visibleRows.map((row) => (
                <ProductListItem
                  key={productReviewRowKey(row)}
                  row={row}
                  active={selectedIndex === row.index}
                  selected={selectedSet.has(row.index)}
                  onOpen={() => onSelect(row.index)}
                  onToggle={() => onToggleSelect(row.index)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="product-review-list-nav">
        <button className="ghost-btn" type="button" onClick={() => goToPosition(activePosition - 1)} disabled={activePosition <= 0}><ChevronLeft size={16} />Предыдущий</button>
        <span>{activePosition >= 0 ? `${activePosition + 1} / ${rows.length}` : `- / ${rows.length}`}</span>
        <button className="ghost-btn" type="button" onClick={() => goToPosition(activePosition + 1)} disabled={activePosition < 0 || activePosition >= rows.length - 1}>Следующий<ChevronRight size={16} /></button>
      </div>
    </aside>
  );
}

export function ProductReviewHeader({ row, image, categoryDisplayByValue, categoryGroupDisplayByValue }: {
  row: ProductReviewRow | null;
  image: string;
  categoryDisplayByValue: Record<string, string>;
  categoryGroupDisplayByValue: Record<string, string>;
}) {
  if (!row) {
    return <div className="product-review-empty workspace"><strong>Select a product to review</strong></div>;
  }
  const group = categoryGroupDisplayByValue[row.aiCategoryGroup] || row.aiCategoryGroup || "-";
  const category = categoryDisplayByValue[row.selectedCategory] || row.selectedCategory || "-";
  return (
    <section className="product-review-header">
      {image ? <HoverPreviewImage src={image} alt="" /> : <div className="product-review-header-empty">No image</div>}
      <div className="product-review-header-main">
        <h2>{row.title || "-"}</h2>
        <p className="product-review-header-meta">{`SKU ${row.sku || "-"} · EAN ${row.ean || "-"} · ${group} / ${category}`}</p>
      </div>
      <button className="product-review-header-menu" type="button" aria-label="Product actions">
        <MoreVertical size={18} aria-hidden="true" />
      </button>
    </section>
  );
}

export function DiffViewer({ aftercool }: { aftercool: ReturnType<typeof productAftercoolData> }) {
  const rows = buildAftercoolRows(aftercool);
  return (
    <section className="product-review-section product-review-aftercool">
      <div className="product-review-section-head"><h3>Aftercool Data</h3></div>
      <div className="product-review-diff">
        <div className="product-review-diff-head"><span>Field</span><span>Value</span></div>
        {rows.map((item) => (
          <div className="product-review-diff-row" key={item.label}>
            <strong>{item.label}</strong>
            <pre>{item.value}</pre>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ReviewTabs({ value, setValue }: { value: EditorTab; setValue: (value: EditorTab) => void }) {
  const tabs: Array<[EditorTab, string]> = [
    ["general", "Overview"],
    ["attributes", "Attributes"],
    ["diff", "Diff"],
    ["json", "JSON"],
  ];
  const activeIndex = Math.max(0, tabs.findIndex(([key]) => key === value));

  return (
    <div
      className="product-review-tabs"
      role="tablist"
      style={{
        "--active-tab-index": activeIndex,
        "--tabs-count": tabs.length,
      } as CSSProperties}
    >
      {tabs.map(([key, label]) => (
        <button key={key} className={value === key ? "active" : ""} type="button" role="tab" aria-selected={value === key} onClick={() => setValue(key)}>{label}</button>
      ))}
    </div>
  );
}

export type AttributeCard = {
  index: number;
  name: string;
  displayName: string;
  values: string;
  valueList: string[];
  displayValues: string;
  allowedValues: string[];
  multiValue: boolean;
  variantKind: "color" | "material" | null;
  option?: CategoryAttributeOption;
  group: string;
  layout: "wide" | "normal";
  controlKind: "input" | "textarea";
  sortRank: number;
};

export function AttributeBadges({ invalid }: { invalid: boolean }) {
  return invalid ? <span className="attribute-badge is-invalid">Invalid</span> : null;
}

export function ExclusiveActionsMenu({ children, className = "", label }: { children: ReactNode; className?: string; label: string }) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const menuId = useId();

  useEffect(() => {
    const closeOtherMenu = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== menuId && menuRef.current) menuRef.current.open = false;
    };
    window.addEventListener("product-review-action-menu-open", closeOtherMenu);
    return () => window.removeEventListener("product-review-action-menu-open", closeOtherMenu);
  }, [menuId]);

  return (
    <details ref={menuRef} className={`attribute-actions-menu${className ? ` ${className}` : ""}`} onToggle={() => {
      if (menuRef.current?.open) window.dispatchEvent(new CustomEvent("product-review-action-menu-open", { detail: menuId }));
    }}>
      <summary aria-label={label}><MoreVertical size={17} /></summary>
      {children}
    </details>
  );
}

export function AttributeActionsMenu({ onDelete, value }: { onDelete: () => void; value: string }) {
  return (
    <ExclusiveActionsMenu label="Attribute actions">
      <div>
        {value ? <button type="button" onClick={() => void navigator.clipboard?.writeText(value)}><Copy size={14} /> Copy value</button> : null}
        <button type="button" className="is-danger" onClick={onDelete}><Trash2 size={14} /> Delete</button>
      </div>
    </ExclusiveActionsMenu>
  );
}

export function OverviewActionsMenu({ onEdit, onCopy, canCopy = true, copied = false }: { onEdit: () => void; onCopy?: () => void; canCopy?: boolean; copied?: boolean }) {
  return (
    <ExclusiveActionsMenu className="overview-actions-menu" label="Field actions">
      <div>
        <button type="button" onClick={onEdit}><Pencil size={14} /> Edit</button>
        {onCopy && canCopy ? <button type="button" onClick={onCopy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy value"}</button> : null}
      </div>
    </ExclusiveActionsMenu>
  );
}

export function AttributeValueChips({ values, option, onChange }: { values: string[]; option?: CategoryAttributeOption; onChange: (values: string[]) => void }) {
  const allowedValues = option?.allowedValues ?? [];
  const [draft, setDraft] = useState("");
  const addValue = (raw: string) => {
    const next = raw.trim().replace(/,$/, "").trim();
    if (!next) return;
    const exists = values.some((item) => normalizeFieldToken(item) === normalizeFieldToken(next));
    if (!exists) onChange([...values, next]);
    setDraft("");
  };
  const removeValue = (target: string) => {
    onChange(values.filter((item) => normalizeFieldToken(item) !== normalizeFieldToken(target)));
  };
  const availableOptions = allowedValues.filter((item) => !values.some((value) => normalizeFieldToken(value) === normalizeFieldToken(item)));

  return (
    <div className={`attribute-chip-control${values.length > 1 ? " has-multiple" : ""}`}>
      <div className="attribute-chip-list">
        {allowedValues.length > 0 ? (
          <>
            {values.map((item) => (
              <span className="attribute-chip" key={item}>
                {option ? attributeAllowedValueLabel(option, item) : item}
                <button type="button" onClick={() => removeValue(item)} aria-label={`Remove ${item}`}><X size={12} /></button>
              </span>
            ))}
            <select value="" onChange={(event) => addValue(event.target.value)} aria-label="Add value">
              <option value="">Add value</option>
              {availableOptions.map((item) => (
                <option value={item} key={item}>{option ? attributeAllowedValueLabel(option, item) : item}</option>
              ))}
            </select>
          </>
        ) : (
          <>
            {values.map((item) => (
              <span className="attribute-chip" key={item}>
                {option ? attributeAllowedValueLabel(option, item) : item}
                <button type="button" onClick={() => removeValue(item)} aria-label={`Remove ${item}`}><X size={12} /></button>
              </span>
            ))}
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Tab" || event.key === ",") {
                  event.preventDefault();
                  addValue(draft);
                }
                if (event.key === "Backspace" && !draft && values.length > 0) {
                  removeValue(values[values.length - 1]);
                }
                if (event.key === "Escape") setDraft("");
              }}
              onBlur={() => addValue(draft)}
              placeholder=""
              aria-label="Value"
            />
          </>
        )}
      </div>
    </div>
  );
}

export function AttributeFieldCard({ attribute, onChange, onDelete, invalid }: {
  attribute: AttributeCard;
  onChange: (value: string) => void;
  onDelete: () => void;
  invalid: boolean;
}) {
  const values = attribute.valueList.length ? attribute.valueList : splitAttributeValues(attribute.values);
  return (
    <article className={`attribute-form-field${invalid ? " is-invalid" : ""}${values.length > 1 ? " has-multiple-values" : ""}`}>
      <div className="attribute-form-field-head">
        <span title={attribute.displayName || attribute.name || "Unnamed"}>{attribute.displayName || attribute.name || "Unnamed"}</span>
        <AttributeBadges invalid={invalid} />
        <AttributeActionsMenu onDelete={onDelete} value={attribute.values} />
      </div>
      <AttributeValueChips
        values={values}
        option={attribute.option}
        onChange={(nextValues) => onChange(joinAttributeValues(nextValues))}
      />
      {invalid ? <p className="attribute-field-error">Check this value before approval.</p> : null}
    </article>
  );
}

export function AttributeFieldsSection({ title, items, editingAttribute, editingDraft, setEditingDraft, startAttributeEdit, saveAttributeEdit, cancelAttributeEdit, deleteAttribute, invalidNames }: {
  title: string;
  items: AttributeCard[];
  editingAttribute: { index: number; field: AttributeEditField } | null;
  editingDraft: string;
  setEditingDraft: (value: string) => void;
  startAttributeEdit: (index: number, field: AttributeEditField, value: string) => void;
  saveAttributeEdit: (index?: number, value?: string) => void;
  cancelAttributeEdit: () => void;
  deleteAttribute: (index: number) => void;
  invalidNames: Set<string>;
}) {
  void editingAttribute;
  void editingDraft;
  void setEditingDraft;
  void startAttributeEdit;
  void cancelAttributeEdit;
  return (
    <section className="attribute-fields-section" aria-label={title}>
      <div className="attribute-group-grid">{items.map((attribute) => (
        <AttributeFieldCard
          key={attribute.index}
          attribute={attribute}
          onChange={(value) => saveAttributeEdit(attribute.index, value)}
          onDelete={() => deleteAttribute(attribute.index)}
          invalid={invalidNames.has(normalizeFieldToken(attribute.name))}
        />
      ))}</div>
    </section>
  );
}

export type AttributeVariantDimension = {
  key: string;
  label: string;
  values: string[];
};

export type AttributeVariantRow = {
  key: string;
  combination: string;
  parts: Array<{ key: string; label: string; value: string }>;
};

export type VariantPriceAdjustment = {
  direction: "add" | "subtract";
  mode: "percent" | "amount";
  value: string;
};

export function parseMoneyValue(value: unknown): number | null {
  const normalized = String(value ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatMoneyValue(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

export function applyVariantPriceAdjustments(
  basePrice: number | null,
  row: AttributeVariantRow,
  adjustments: Record<string, VariantPriceAdjustment>,
): string {
  if (basePrice === null) return "";
  const nextPrice = row.parts.reduce((price, part) => {
    const adjustment = adjustments[`${part.key}:${normalizeFieldToken(part.value)}`];
    const amount = parseMoneyValue(adjustment?.value);
    if (!adjustment || amount === null) return price;
    const delta = adjustment.mode === "percent" ? price * (amount / 100) : amount;
    return adjustment.direction === "subtract" ? price - delta : price + delta;
  }, basePrice);
  return formatMoneyValue(Math.max(0, nextPrice));
}

export function variantPartChipLabel(part: { label: string; value: string }, mode: "main" | "row"): string {
  if (mode === "main") return `${part.label}: ${part.value}`;
  return part.value;
}

export function buildAttributeVariantRows(attributes: AttributeCard[]): { dimensions: AttributeVariantDimension[]; rows: AttributeVariantRow[]; total: number; mainCombination: string; mainParts: AttributeVariantRow["parts"] } {
  const dimensions: AttributeVariantDimension[] = attributes
    .map((attribute) => {
      const values = attribute.valueList.length ? attribute.valueList : splitAttributeValues(attribute.values);
      return {
        key: normalizeFieldToken(attribute.name) || String(attribute.index),
        label: attribute.displayName || attribute.name,
        values,
        variantKind: attribute.variantKind,
      };
    })
    .filter((dimension) => dimension.values.length > 1 && (dimension.variantKind === "material" || dimension.variantKind === "color"));
  if (dimensions.length === 0) return { dimensions, rows: [], total: 0, mainCombination: "", mainParts: [] };

  const combinations: Array<Array<{ key: string; label: string; value: string }>> = [];
  const visit = (index: number, current: Array<{ key: string; label: string; value: string }>) => {
    if (index >= dimensions.length) {
      combinations.push(current);
      return;
    }
    const dimension = dimensions[index];
    for (const value of dimension.values) {
      visit(index + 1, [...current, { key: dimension.key, label: dimension.label, value }]);
    }
  };
  visit(0, []);
  const toRow = (combination: Array<{ key: string; label: string; value: string }>) => ({
    key: combination.map((item) => `${item.key}:${normalizeFieldToken(item.value)}`).join("|"),
    combination: combination.map((item) => `${item.label}: ${item.value}`).join(" / "),
    parts: combination,
  });
  const [main, ...additional] = combinations.map(toRow);
  return { dimensions, rows: additional, total: combinations.length, mainCombination: main?.combination ?? "", mainParts: main?.parts ?? [] };
}

export function AttributeProductVariants({ attributes, basePrice, onMaterialPriceChange }: { attributes: AttributeCard[]; basePrice: string; onMaterialPriceChange?: (materialValue: string, price: string) => void }) {
  const preview = useMemo(() => buildAttributeVariantRows(attributes), [attributes]);
  const [priceAdjustments, setPriceAdjustments] = useState<Record<string, VariantPriceAdjustment>>({});
  const parsedBasePrice = useMemo(() => parseMoneyValue(basePrice), [basePrice]);
  const materialDimension = preview.dimensions.find((dimension) => isMaterialVariantAttribute(dimension.label));
  const priceRuleDimension = materialDimension ?? null;

  if (preview.rows.length === 0 || !priceRuleDimension) return null;

  const basePriceLabel = parsedBasePrice === null ? "0,00" : formatMoneyValue(parsedBasePrice);
  const resultForPriceValue = (value: string, index: number, adjustments = priceAdjustments) => {
    if (parsedBasePrice === null) return "";
    if (!priceRuleDimension || index === 0) return basePriceLabel;
    const key = `${priceRuleDimension.key}:${normalizeFieldToken(value)}`;
    const adjustment = adjustments[key];
    const amount = parseMoneyValue(adjustment?.value);
    if (!adjustment || amount === null) return basePriceLabel;
    const delta = adjustment.mode === "percent" ? parsedBasePrice * (amount / 100) : amount;
    const next = adjustment.direction === "subtract" ? parsedBasePrice - delta : parsedBasePrice + delta;
    return formatMoneyValue(Math.max(0, next));
  };
  const updatePriceAdjustment = (key: string, value: string, index: number, patch: Partial<VariantPriceAdjustment>) => {
    setPriceAdjustments((current) => {
      const previous = current[key] ?? { direction: "add", mode: "percent", value: "" };
      const next = { ...current, [key]: { ...previous, ...patch } };
      if (onMaterialPriceChange && index > 0) {
        onMaterialPriceChange(value, resultForPriceValue(value, index, next));
      }
      return next;
    });
  };

  return (
    <section className="attribute-variants-panel">
      <details className="attribute-price-rules" open>
        <summary className="attribute-price-rules-head">
          <span>
            <h5>Price adjustments</h5>
            <small>{`${priceRuleDimension.label} · Base price: ${basePriceLabel}`}</small>
          </span>
          <span className="attribute-price-rules-actions">
            <span className="attribute-price-rules-count">{`${priceRuleDimension.values.length} rules`}</span>
            <ChevronDown size={15} aria-hidden="true" />
          </span>
        </summary>
        <div>
          <div className="attribute-price-rule-row is-head"><span>Value</span><span>Adjustment</span><span>Result</span></div>
          {priceRuleDimension.values.map((value, index) => {
            const key = `${priceRuleDimension.key}:${normalizeFieldToken(value)}`;
            const adjustment = priceAdjustments[key] ?? { direction: "add", mode: "percent", value: "" };
            const isBase = index === 0;
            return (
              <label key={key} className={`attribute-price-rule-row${isBase ? " is-base" : ""}`}>
                <span>{value}</span>
                {isBase ? <em>Base price</em> : (
                  <span className="attribute-price-rule-controls">
                    <select value={adjustment.direction} onChange={(event) => updatePriceAdjustment(key, value, index, { direction: event.target.value as VariantPriceAdjustment["direction"] })} aria-label={`${value} price direction`}>
                      <option value="add">+</option>
                      <option value="subtract">-</option>
                    </select>
                    <input inputMode="decimal" value={adjustment.value} onChange={(event) => updatePriceAdjustment(key, value, index, { value: event.target.value })} placeholder="0" aria-label={`${value} price adjustment`} />
                    <select value={adjustment.mode} onChange={(event) => updatePriceAdjustment(key, value, index, { mode: event.target.value as VariantPriceAdjustment["mode"] })} aria-label={`${value} price mode`}>
                      <option value="percent">%</option>
                      <option value="amount">€</option>
                    </select>
                  </span>
                )}
                <strong>{resultForPriceValue(value, index)}</strong>
              </label>
            );
          })}
        </div>
      </details>
    </section>
  );
}

export function MissingAttributeRow({
  item,
  selected,
  value,
  onSelect,
  onValueChange,
  onAdd,
}: {
  item: CategoryAttributeOption;
  selected: boolean;
  value: string;
  onSelect: () => void;
  onValueChange: (value: string) => void;
  onAdd: () => void;
}) {
  const priority = (item.relevance || "LOW").toUpperCase();
  const displayName = attributeDisplayName(item);
  const allowedValues = item.allowedValues ?? [];
  const typeToken = normalizeFieldToken(String(item.type ?? ""));
  const inputType = typeToken.includes("number") || typeToken.includes("integer") || typeToken.includes("decimal") ? "number" : "text";
  return (
    <div className={`missing-attribute-row${selected ? " is-selected" : ""}`}>
      <strong>{displayName || item.name}</strong>
      {allowedValues.length > 0 ? (
        <select value={selected && allowedValues.includes(value) ? value : ""} onFocus={onSelect} onChange={(event) => { onSelect(); onValueChange(event.target.value); }} aria-label={`Value for ${item.name}`}>
          <option value="">Select value</option>
          {allowedValues.map((option) => <option value={option} key={option}>{attributeAllowedValueLabel(item, option)}</option>)}
        </select>
      ) : (
        <input type={inputType} value={selected ? value : ""} onFocus={onSelect} onChange={(event) => { onSelect(); onValueChange(event.target.value); }} placeholder="Введите значение" aria-label={`Value for ${item.name}`} />
      )}
      <span>{item.unit || "—"}</span><span>{item.type || "—"}</span>
      <span><i className={`priority-badge priority-${priority.toLowerCase()}`}>{priority}</i></span>
      <button type="button" onClick={onAdd} disabled={!selected || !value.trim()}>Add</button>
    </div>
  );
}

export function MissingAttributesPanel({ availableAttributes, isLoading, error, selectedOption, valueOptions, newAttributeName, setNewAttributeName, newAttributeValue, setNewAttributeValue, addAttribute, open, setOpen, query }: {
  availableAttributes: CategoryAttributeOption[]; isLoading: boolean; error: string; selectedOption: CategoryAttributeOption | null; valueOptions: string[];
  newAttributeName: string; setNewAttributeName: (value: string) => void; newAttributeValue: string; setNewAttributeValue: (value: string) => void;
  addAttribute: () => void; open: boolean; setOpen: (value: boolean) => void; query: string;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const visible = availableAttributes.filter((item) => !normalizedQuery || [item.name, attributeDisplayName(item), attributeDisplayDescription(item), item.relevance, item.unit, item.type].join(" ").toLowerCase().includes(normalizedQuery)).slice(0, 80);
  useEffect(() => {
    if (valueOptions.length === 0) return;
    if (valueOptions.includes(newAttributeValue)) return;
    setNewAttributeValue(valueOptions.length === 1 ? valueOptions[0] : "");
  }, [newAttributeValue, setNewAttributeValue, valueOptions]);
  if (!isLoading && !error && availableAttributes.length === 0) return null;
  return (
    <section className="missing-attributes-panel">
      <button type="button" className="missing-attributes-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span><strong>Недостающие атрибуты</strong><small>{isLoading ? "Загрузка атрибутов категории" : `${availableAttributes.length} доступно из категории`}</small></span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open ? <div className="missing-attributes-content">
        {error ? <p className="attribute-field-error">{error}</p> : null}
        <div className="missing-attribute-list">
          <div className="missing-attribute-row is-head"><span>Attribute</span><span>Value</span><span>Unit</span><span>Type</span><span>Priority</span><span /></div>
          {visible.length ? visible.map((item) => <MissingAttributeRow key={item.name} item={item} selected={selectedOption?.name === item.name} onSelect={() => {
            setNewAttributeName(item.name);
            if ((item.allowedValues ?? []).length === 1) setNewAttributeValue(item.allowedValues?.[0] ?? "");
          }} value={selectedOption?.name === item.name ? newAttributeValue : ""} onValueChange={setNewAttributeValue} onAdd={addAttribute} />) : <p className="missing-attributes-empty">{isLoading ? "Загрузка атрибутов..." : "Подходящие атрибуты не найдены."}</p>}
        </div>
      </div> : null}
    </section>
  );
}

export function AttributesToolbar({ query, setQuery, group, setGroup, groups, onlyEmpty, setOnlyEmpty, onAdd }: { query: string; setQuery: (value: string) => void; group: string; setGroup: (value: string) => void; groups: string[]; onlyEmpty: boolean; setOnlyEmpty: (value: boolean) => void; onAdd: () => void }) {
  return <div className="attributes-toolbar">
    <label className="attributes-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск аттрибутов..." aria-label="Search attributes" /></label>
    <select value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Filter by group"><option value="all">All groups</option>{groups.map((item) => <option key={item}>{item}</option>)}</select>
    <label className="attributes-empty-toggle"><input type="checkbox" checked={onlyEmpty} onChange={(event) => setOnlyEmpty(event.target.checked)} /> Only empty</label>
    <button type="button" className="attributes-add-button" onClick={onAdd}><Plus size={16} /> Add attribute</button>
  </div>;
}

export function AttributeEditor({
  attributes,
  basePrice,
  onMaterialPriceChange,
  categoryAttributes,
  isLoadingCategoryAttributes,
  categoryAttributesError,
  newAttributeName,
  setNewAttributeName,
  newAttributeValue,
  setNewAttributeValue,
  addAttribute,
  editingAttribute,
  editingDraft,
  setEditingDraft,
  startAttributeEdit,
  saveAttributeEdit,
  cancelAttributeEdit,
  deleteAttribute,
  invalidAttributeNames,
}: {
  attributes: AttributeCard[];
  basePrice: string;
  onMaterialPriceChange?: (materialValue: string, price: string) => void;
  categoryAttributes: CategoryAttributeOption[];
  isLoadingCategoryAttributes: boolean;
  categoryAttributesError: string;
  newAttributeName: string;
  setNewAttributeName: (value: string) => void;
  newAttributeValue: string;
  setNewAttributeValue: (value: string) => void;
  addAttribute: () => void;
  editingAttribute: { index: number; field: AttributeEditField } | null;
  editingDraft: string;
  setEditingDraft: (value: string) => void;
  startAttributeEdit: (index: number, field: AttributeEditField, value: string) => void;
  saveAttributeEdit: (index?: number, value?: string) => void;
  cancelAttributeEdit: () => void;
  deleteAttribute: (index: number) => void;
  invalidAttributeNames: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const groups: Record<string, typeof attributes> = {
    "Basic Information": [],
    Dimensions: [],
    Materials: [],
    "Package Information": [],
    "Additional Information": [],
  };

  for (const attr of attributes) {
    const token = normalizeFieldToken(attr.name);
    if (["category", "subcategory", "product type", "produktart", "room", "wohnraum", "zimmer"].some((key) => token.includes(key))) groups["Basic Information"].push(attr);
    else if (["width", "height", "depth", "weight", "breite", "höhe", "tiefe"].some((key) => token.includes(key))) groups.Dimensions.push(attr);
    else if (["material", "frame", "fabric", "filling", "gestell", "stoff"].some((key) => token.includes(key))) groups.Materials.push(attr);
    else if (["set", "quantity", "parts", "anzahl", "teile"].some((key) => token.includes(key))) groups["Package Information"].push(attr);
    else groups["Additional Information"].push(attr);
  }
  const existingNames = new Set(attributes.map((item) => item.name.trim().toLowerCase()).filter(Boolean));
  const relevanceRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const availableAttributes = categoryAttributes
    .filter((item) => item.name && !existingNames.has(item.name.trim().toLowerCase()))
    .sort((left, right) => {
      const leftRank = relevanceRank[(left.relevance || "LOW").toUpperCase()] ?? 3;
      const rightRank = relevanceRank[(right.relevance || "LOW").toUpperCase()] ?? 3;
      return leftRank - rightRank;
    });
  const selectedOption = categoryAttributes.find((item) => item.name.toLowerCase() === newAttributeName.trim().toLowerCase()) ?? null;
  const valueOptions = selectedOption?.allowedValues ?? [];
  const normalizedQuery = query.trim().toLowerCase();
  const filteredAttributes = Object.entries(groups).flatMap(([title, items]) => items.map((item) => ({ ...item, groupTitle: title }))).filter((item) => {
    if (onlyEmpty && item.values.trim()) return false;
    if (groupFilter !== "all" && item.groupTitle !== groupFilter) return false;
    return !normalizedQuery || `${item.name} ${item.displayName} ${item.values} ${item.displayValues}`.toLowerCase().includes(normalizedQuery);
  }).sort((left, right) => left.sortRank - right.sortRank || left.index - right.index);
  return (
    <div className="product-review-attributes">
      <div className="attributes-title"><div><h3>Атрибуты</h3><p>{`${attributes.filter((item) => item.values.trim()).length} из ${attributes.length} заполнено`}</p></div></div>
      <AttributesToolbar query={query} setQuery={setQuery} group={groupFilter} setGroup={setGroupFilter} groups={Object.keys(groups).filter((title) => groups[title].length > 0)} onlyEmpty={onlyEmpty} setOnlyEmpty={setOnlyEmpty} onAdd={() => setMissingOpen(true)} />
      <MissingAttributesPanel availableAttributes={availableAttributes} isLoading={isLoadingCategoryAttributes} error={categoryAttributesError} selectedOption={selectedOption} valueOptions={valueOptions} newAttributeName={newAttributeName} setNewAttributeName={setNewAttributeName} newAttributeValue={newAttributeValue} setNewAttributeValue={setNewAttributeValue} addAttribute={addAttribute} open={missingOpen} setOpen={setMissingOpen} query={query} />
      {filteredAttributes.length ? (
        <AttributeFieldsSection title="All attributes" items={filteredAttributes} editingAttribute={editingAttribute} editingDraft={editingDraft} setEditingDraft={setEditingDraft} startAttributeEdit={startAttributeEdit} saveAttributeEdit={saveAttributeEdit} cancelAttributeEdit={cancelAttributeEdit} deleteAttribute={deleteAttribute} invalidNames={invalidAttributeNames} />
      ) : <div className="attributes-empty-state">No attributes match these filters.</div>}
      <AttributeProductVariants attributes={attributes} basePrice={basePrice} onMaterialPriceChange={onMaterialPriceChange} />
    </div>
  );
}

export function variantStatusLabel(status: VariantStatus): string {
  if (status === "pending_generation") return "Pending";
  if (status === "generating_image") return "Generating";
  if (status === "manual_override") return "Manual";
  if (status === "failed") return "Failed";
  if (status === "ready") return "Ready";
  return "Draft";
}

export function variantWorkflowStatus(variant: ProductVariantDraft, missing: boolean, imageUrl: string) {
  if (variant.status === "generating_image") return { label: "Generating", tone: "generating" };
  if (variant.status === "failed") return { label: "Failed", tone: "failed" };
  if (missing) return { label: "Needs input", tone: "needs-input" };
  if (!imageUrl) return { label: "Needs image", tone: "needs-image" };
  return { label: "Ready", tone: "ready" };
}

export function materialValueForVariant(variant: ProductVariantDraft): string {
  return variant.combination.find((item) => isMaterialVariantAttribute(item.name))?.value.trim() || "";
}

export function VariantManager({
  product,
  categoryAttributes,
  onPatchVariant,
  onDeleteVariant,
  onRegenerateVariant,
}: {
  product: Record<string, unknown>;
  categoryAttributes: CategoryAttributeOption[];
  onPatchVariant: (combinationKey: string, patch: Partial<ProductVariantDraft>) => void;
  onDeleteVariant: (combinationKey: string) => void;
  onRegenerateVariant: (combinationKey: string) => void | Promise<void>;
}) {
  const preview = buildLocalVariantPreview(product, categoryAttributes);
  const liveProduct = syncLocalVariantsForProduct(product, categoryAttributes);
  const variants = readProductVariants(liveProduct);
  const activeVariants = variants.filter((variant) => variant.active);
  const [editingKey, setEditingKey] = useState("");
  const [uploadingKey, setUploadingKey] = useState("");
  const [fullscreenImage, setFullscreenImage] = useState<{ src: string; label: string } | null>(null);
  const [quickEdit, setQuickEdit] = useState<{ combinationKey: string; field: "ean" | "sku" } | null>(null);
  const editingVariant = variants.find((variant) => variant.combinationKey === editingKey) ?? null;
  const variableAttributeIds = new Set(preview.variationAttributes.filter((item) => !item.fixed).map((item) => item.attributeId));
  const baseVariantPrice = variantPriceFromProduct(product);
  const materialPriceRows = Array.from(
    activeVariants.reduce((rows, variant) => {
      const materialValue = materialValueForVariant(variant);
      if (!materialValue) return rows;
      const current = rows.get(materialValue);
      rows.set(materialValue, {
        value: materialValue,
        count: (current?.count ?? 0) + 1,
        price: current?.price ?? (variant.price || baseVariantPrice),
      });
      return rows;
    }, new Map<string, { value: string; count: number; price: string }>()),
  ).map(([, row]) => row);

  function updateMaterialVariantPrices(materialValue: string, price: string) {
    for (const variant of activeVariants) {
      if (materialValueForVariant(variant) !== materialValue) continue;
      onPatchVariant(variant.combinationKey, { price });
    }
  }

  async function uploadVariantImage(combinationKey: string, file: File | null) {
    if (!file) return;
    setUploadingKey(combinationKey);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/uploads/image", {
        method: "POST",
        body: form,
        cache: "no-store",
      });
      const parsed = await readJsonResponse<{ url?: string; filename?: string }>(response);
      if (!response.ok || !parsed?.url) {
        throw new Error(readApiErrorMessage(parsed, "Image upload failed.", response.status));
      }
      onPatchVariant(combinationKey, {
        imageUrl: parsed.url,
        mediaAssets: [{ type: "IMAGE", location: parsed.url }],
        status: "manual_override",
        generationError: undefined,
      });
    } catch (error) {
      onPatchVariant(combinationKey, {
        status: "failed",
        generationError: error instanceof Error ? error.message : "Image upload failed.",
      });
    } finally {
      setUploadingKey("");
    }
  }

  function renderRequiredVariantField(variant: ProductVariantDraft, field: "ean" | "sku") {
    const value = variant[field];
    const isEditing = quickEdit?.combinationKey === variant.combinationKey && quickEdit.field === field;
    if (isEditing) {
      return (
        <input
          className="variant-inline-input"
          autoFocus
          value={value}
          placeholder={field.toUpperCase()}
          onChange={(event) => onPatchVariant(variant.combinationKey, field === "ean" ? { ean: event.target.value } : { sku: event.target.value })}
          onBlur={() => setQuickEdit(null)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.currentTarget.blur();
            }
          }}
        />
      );
    }
    if (value.trim()) {
      return field === "sku" ? <code>{value}</code> : value;
    }
    return (
      <button
        className="variant-missing-chip"
        type="button"
        title="Значение не заполнено. Нажмите, чтобы исправить."
        onClick={() => setQuickEdit({ combinationKey: variant.combinationKey, field })}
      >
        <AlertCircle size={13} />
        Missing
      </button>
    );
  }

  function renderVariantCombination(variant: ProductVariantDraft) {
    const variableItems = variant.combination.filter((item) => variableAttributeIds.has(item.attributeId));
    const contextItems = variant.combination.filter((item) => !variableAttributeIds.has(item.attributeId));
    const primaryItems = contextItems.length ? contextItems.slice(0, 2) : variant.combination.slice(0, 2);
    const secondaryItems = variableItems.length ? variableItems : variant.combination.slice(primaryItems.length);
    return (
      <div className="variant-combination-cell" title={variant.combination.map((item) => `${item.name}: ${item.value}`).join(" · ")}>
        <strong>{primaryItems.map((item) => item.value).join(" · ") || "-"}</strong>
        {secondaryItems.length ? (
          <span>{secondaryItems.map((item) => `${item.name}: ${item.value}`).join(" · ")}</span>
        ) : null}
      </div>
    );
  }

  useEffect(() => {
    if (!fullscreenImage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreenImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreenImage]);

  if (preview.totalCombinations <= 1) return null;

  return (
    <section className="product-review-section variant-manager">
      <div className="variant-manager-head">
        <div>
          <h3>Variants</h3>
          <p>
            {`Показано ${activeVariants.length} актуальных комбинаций из текущих attributes.`}
          </p>
        </div>
      </div>
      {preview.issues.length > 0 ? (
        <div className="variant-issues">
          {preview.issues.map((issue) => <span key={issue}>{issue}</span>)}
        </div>
      ) : null}
      {materialPriceRows.length > 0 ? (
        <div className="variant-material-price-panel">
          <div>
            <h4>Bezug price</h4>
            <p>Цена применяется ко всем variants с выбранным Bezug.</p>
          </div>
          <div className="variant-material-price-grid">
            {materialPriceRows.map((row) => (
              <label key={row.value} className="variant-material-price-row">
                <span>
                  <strong>{row.value}</strong>
                  <small>{`${row.count} variant${row.count === 1 ? "" : "s"}`}</small>
                </span>
                <input
                  inputMode="decimal"
                  value={row.price}
                  onChange={(event) => updateMaterialVariantPrices(row.value, event.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <div className="variant-table-scroll">
        <table className="variant-table">
          <thead>
            <tr>
              <th>Variant</th>
              <th>EAN</th>
              <th>SKU</th>
              <th>Price</th>
              <th>Image</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeVariants.length > 0 ? activeVariants.map((variant) => {
              const imageUrl = variant.imageUrl || variant.mediaAssets[0]?.location || "";
              const missing = !variant.sku.trim() || !variant.ean.trim();
              const workflow = variantWorkflowStatus(variant, missing, imageUrl);
              const isGenerating = variant.status === "generating_image";
              return (
                <tr
                  key={variant.combinationKey}
                  className={[
                    "variant-work-row",
                    missing ? "has-missing-fields" : "",
                    !imageUrl ? "needs-image" : "",
                    isGenerating ? "is-generating-image" : "",
                    workflow.tone === "ready" ? "is-ready" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <td>{renderVariantCombination(variant)}</td>
                  <td>{renderRequiredVariantField(variant, "ean")}</td>
                  <td>{renderRequiredVariantField(variant, "sku")}</td>
                  <td>{variant.price || "-"}</td>
                  <td className="variant-image-cell">
                    {isGenerating ? (
                      <div className="variant-generating-card" aria-label="Generating image">
                        <span className="variant-generating-glow" />
                        <Sparkles size={17} aria-hidden="true" />
                        <strong>Generating...</strong>
                      </div>
                    ) : imageUrl ? (
                      <button className="variant-thumb-button" type="button" onClick={() => setFullscreenImage({ src: imageUrl, label: variant.combination.map((item) => item.value).join(" · ") })} aria-label="Open image fullscreen">
                        <img className="variant-thumb" src={imageUrl} alt="" />
                      </button>
                    ) : (
                      <div className="variant-image-placeholder">
                        <Package size={17} aria-hidden="true" />
                        <strong>No image yet</strong>
                        <button type="button" title="Generate image" onClick={() => void onRegenerateVariant(variant.combinationKey)} disabled={isGenerating}>
                          <Sparkles size={13} /> Generate
                        </button>
                        {variant.generationError ? <small title={variant.generationError}>{variant.generationError}</small> : null}
                      </div>
                    )}
                  </td>
                  <td><span className={`variant-status workflow-${workflow.tone}`}>{workflow.label}</span></td>
                  <td>
                    <div className="variant-actions">
                      <button className={missing ? "variant-action-primary" : ""} type="button" title={missing ? "Fill missing fields" : "Open / edit"} onClick={() => setEditingKey(variant.combinationKey)}><Pencil size={14} />{missing ? <span>Fix</span> : null}</button>
                      <button className="variant-action-generate" type="button" title={imageUrl ? "Regenerate image" : "Generate image"} onClick={() => void onRegenerateVariant(variant.combinationKey)} disabled={variant.status === "generating_image"}>
                        {variant.status === "generating_image" ? <Sparkles size={14} /> : imageUrl ? <RefreshCw size={14} /> : <Sparkles size={14} />}
                        <span>{imageUrl ? "Regen" : "Generate"}</span>
                      </button>
                      <button type="button" title="Delete" className="is-danger" onClick={() => onDeleteVariant(variant.combinationKey)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={7}>
                  <div className="variant-empty-state">Для текущих attributes нет активных variants.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editingVariant ? (
        <div className="variant-drawer-backdrop" onClick={() => setEditingKey("")}>
          <aside className="variant-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="category-drawer-head">
              <div>
                <h3>Variant editor</h3>
                <p>{editingVariant.combination.map((item) => `${item.name}: ${item.value}`).join(" · ")}</p>
              </div>
              <button type="button" onClick={() => setEditingKey("")} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="variant-drawer-body">
              <div className="variant-image-preview">
                {editingVariant.imageUrl || editingVariant.mediaAssets[0]?.location ? (
                  <button type="button" onClick={() => setFullscreenImage({ src: editingVariant.imageUrl || editingVariant.mediaAssets[0]?.location || "", label: editingVariant.combination.map((item) => item.value).join(" · ") })} aria-label="Open image fullscreen">
                    <img src={editingVariant.imageUrl || editingVariant.mediaAssets[0]?.location} alt="" />
                  </button>
                ) : (
                  <span>No image</span>
                )}
              </div>
              <div className="variant-combination-readonly">
                {editingVariant.combination.map((item) => (
                  <span key={`${item.attributeId}-${item.value}`}><small>{item.name}</small><strong>{item.value}</strong></span>
                ))}
              </div>
              <label>EAN
                <input value={editingVariant.ean} onChange={(event) => onPatchVariant(editingVariant.combinationKey, { ean: event.target.value })} />
              </label>
              <label>SKU
                <input value={editingVariant.sku} onChange={(event) => onPatchVariant(editingVariant.combinationKey, { sku: event.target.value })} />
              </label>
              <label>Price
                <input inputMode="decimal" value={editingVariant.price} onChange={(event) => onPatchVariant(editingVariant.combinationKey, { price: event.target.value })} />
              </label>
              <label>Image URL
                <input value={editingVariant.imageUrl} onChange={(event) => onPatchVariant(editingVariant.combinationKey, { imageUrl: event.target.value, mediaAssets: event.target.value.trim() ? [{ type: "IMAGE", location: event.target.value.trim() }] : [] })} />
              </label>
              <label className="variant-upload-button">
                <Plus size={15} />
                {uploadingKey === editingVariant.combinationKey ? "Uploading..." : "Upload / replace image"}
                <input type="file" accept="image/*" onChange={(event) => void uploadVariantImage(editingVariant.combinationKey, event.target.files?.[0] ?? null)} />
              </label>
              {editingVariant.generationError ? <p className="attribute-field-error">{editingVariant.generationError}</p> : null}
            </div>
          </aside>
        </div>
      ) : null}
      {fullscreenImage ? (
        <div className="variant-fullscreen-backdrop" onClick={() => setFullscreenImage(null)} role="dialog" aria-modal="true">
          <button className="variant-fullscreen-close" type="button" onClick={() => setFullscreenImage(null)} aria-label="Close fullscreen image"><X size={20} /></button>
          <figure className="variant-fullscreen-figure" onClick={(event) => event.stopPropagation()}>
            <img src={fullscreenImage.src} alt="" />
            {fullscreenImage.label ? <figcaption>{fullscreenImage.label}</figcaption> : null}
          </figure>
        </div>
      ) : null}
    </section>
  );
}

export function ErrorDrawer({ open, errors, onClose }: { open: boolean; errors: ParsedSkuError[]; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="category-drawer-backdrop" onClick={onClose}>
      <aside className="category-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="category-drawer-head"><h3>{`Errors (${errors.length})`}</h3><button type="button" onClick={onClose}><X size={18} /></button></div>
        <div className="category-drawer-body">
          {errors.length === 0 ? <p>No errors.</p> : errors.map((item, index) => (
            <section className="product-review-error-card" key={`${item.sku}-${index}`}>
              <strong>{item.code}</strong>
              <span>{item.sku}</span>
              <p>{item.message}</p>
              <code>{item.jsonPath}</code>
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}

export function StickyActionBar({
  onReject,
  onSave,
  onRegenerate,
  onApprove,
  onSubmit,
  approved,
  approvedCount,
  totalCount,
  allApproved,
  disabled,
}: {
  onReject: () => void;
  onSave: () => void;
  onRegenerate: () => void;
  onApprove: () => void;
  onSubmit: () => void;
  approved: boolean;
  approvedCount: number;
  totalCount: number;
  allApproved: boolean;
  disabled: boolean;
}) {
  return (
    <div className="product-review-sticky-actions">
      <div className="product-review-action-progress">
        <span>Review progress</span>
        <strong>{`${approvedCount} of ${totalCount} approved`}</strong>
      </div>
      <div className="product-review-action-buttons">
        <button className="danger-btn" type="button" onClick={onReject} disabled={disabled}>Reject</button>
        <button className="secondary-btn" type="button" onClick={onSave} disabled={disabled}>Save Draft</button>
        <button className="secondary-btn" type="button" onClick={onRegenerate} disabled={disabled}><Sparkles size={16} aria-hidden="true" /> Regenerate AI</button>
        <button className="primary-btn" type="button" onClick={onApprove} disabled={disabled}>{approved ? "Approved" : "Approve Product"}</button>
        {allApproved ? <button className="primary-btn product-review-submit-btn" type="button" onClick={onSubmit} disabled={disabled}>Send to OTTO</button> : null}
      </div>
    </div>
  );
}

export function useBulkAttributeEdit() {
  const nextRowId = useRef(2);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rows, setRows] = useState<BulkAttributePatch[]>([{ rowId: 1, name: "", value: "" }]);
  const updateRow = (rowId: number, patch: Partial<BulkAttributePatch>) => setRows((current) => current.map((row) => row.rowId === rowId ? { ...row, ...patch } : row));
  const addRow = () => setRows((current) => [...current, { rowId: nextRowId.current++, name: "", value: "" }]);
  const removeRow = (rowId: number) => setRows((current) => current.filter((row) => row.rowId !== rowId));
  const reset = () => {
    setOpen(false);
    setConfirming(false);
    setRows([{ rowId: nextRowId.current++, name: "", value: "" }]);
  };
  const validRows = rows.filter((row) => row.name.trim() && row.value.trim());
  return { open, setOpen, confirming, setConfirming, rows, validRows, updateRow, addRow, removeRow, reset };
}

export function BulkSelectionBar({ count, onBulkEdit, onApprove, onReject, onClear }: { count: number; onBulkEdit: () => void; onApprove: () => void; onReject: () => void; onClear: () => void }) {
  if (count === 0) return null;
  return (
    <div className="bulk-selection-bar">
      <strong>{`Selected: ${count} products`}</strong>
      <div>
        <button className="secondary-btn" type="button" onClick={onBulkEdit}>Bulk Edit Attributes</button>
        <button className="danger-btn" type="button" onClick={onReject}>Reject Selected</button>
        <button className="tertiary-btn" type="button" onClick={onClear}>Clear Selection</button>
        <button className="primary-btn" type="button" onClick={onApprove}>Approve Selected</button>
      </div>
    </div>
  );
}

export function BulkAttributeRow({ row, options, onChange, onRemove }: { row: BulkAttributePatch; options: CategoryAttributeOption[]; onChange: (patch: Partial<BulkAttributePatch>) => void; onRemove: () => void }) {
  const [attributeMenuOpen, setAttributeMenuOpen] = useState(false);
  const selectedOption = options.find((item) => normalizeFieldToken(item.name) === normalizeFieldToken(row.name));
  const query = normalizeFieldToken(row.name);
  const valueOptions = selectedOption?.allowedValues ?? [];
  const visibleOptions = options.filter((item) => {
    if (!query || selectedOption) return true;
    return normalizeFieldToken(`${item.name} ${attributeDisplayName(item)} ${attributeDisplayDescription(item)} ${item.type ?? ""} ${item.relevance ?? ""} ${item.unit ?? ""}`).includes(query);
  }).slice(0, 80);
  const selectAttribute = (option: CategoryAttributeOption) => {
    const allowedValues = option.allowedValues ?? [];
    onChange({
      name: option.name,
      attributeId: String(option.attributeId ?? option.id ?? "") || undefined,
      attributeKey: option.attributeKey || undefined,
      unit: option.unit || undefined,
      value: allowedValues.length === 1 ? allowedValues[0] : allowedValues.includes(row.value) ? row.value : "",
    });
    setAttributeMenuOpen(false);
  };
  return <div className="bulk-attribute-row">
    <div className="bulk-attribute-picker">
      <div className="bulk-attribute-picker-input">
        <input value={row.name} onFocus={() => setAttributeMenuOpen(true)} onBlur={() => window.setTimeout(() => setAttributeMenuOpen(false), 120)} onChange={(event) => {
          const name = event.target.value;
          const option = options.find((item) => normalizeFieldToken(item.name) === normalizeFieldToken(name));
          onChange({
            name,
            attributeId: option ? String(option.attributeId ?? option.id ?? "") || undefined : undefined,
            attributeKey: option?.attributeKey || undefined,
            unit: option?.unit || undefined,
          });
          setAttributeMenuOpen(true);
        }} placeholder="Search attribute..." aria-label="Attribute" aria-expanded={attributeMenuOpen} aria-autocomplete="list" />
        <ChevronDown size={16} aria-hidden="true" />
      </div>
      {attributeMenuOpen ? <div className="bulk-attribute-options" role="listbox">
        {visibleOptions.length ? visibleOptions.map((item) => {
          const priority = (item.relevance || "LOW").toUpperCase();
          const active = selectedOption === item;
          const displayName = attributeDisplayName(item);
          const displayDescription = attributeDisplayDescription(item);
          return <button className={active ? "is-selected" : ""} type="button" role="option" aria-selected={active} key={`${item.attributeId ?? item.id ?? item.attributeKey ?? item.name}-${item.name}`} onMouseDown={(event) => event.preventDefault()} onClick={() => selectAttribute(item)}>
            <span className="bulk-attribute-option-head"><strong>{displayName || item.name}</strong>{active ? <Check size={14} /> : null}</span>
            {displayDescription ? <small>{displayDescription}</small> : <small className="is-empty">Нет описания</small>}
            <span className="bulk-attribute-requirements">
              <i className={`priority-badge priority-${priority.toLowerCase()}`}>{priority}</i>
              <i>{item.type || "Неизвестный тип"}</i>
              {item.unit ? <i>{`Ед.: ${item.unit}`}</i> : null}
              {item.multiValue ? <i>Несколько значений</i> : <i>Одно значение</i>}
            </span>
          </button>;
        }) : <div className="bulk-attribute-options-empty">Подходящие атрибуты не найдены</div>}
      </div> : null}
      {selectedOption ? <div className="bulk-selected-attribute-meta">
        {attributeDisplayDescription(selectedOption) ? <p>{attributeDisplayDescription(selectedOption)}</p> : null}
        <span className="bulk-attribute-requirements">
          <i className={`priority-badge priority-${(selectedOption.relevance || "LOW").toLowerCase()}`}>{(selectedOption.relevance || "LOW").toUpperCase()}</i>
          <i>{selectedOption.type || "Неизвестный тип"}</i>
          {selectedOption.unit ? <i>{`Ед.: ${selectedOption.unit}`}</i> : null}
          <i>{selectedOption.multiValue ? "Несколько значений" : "Одно значение"}</i>
        </span>
      </div> : null}
    </div>
    <div>
      {valueOptions.length > 0 ? (
        <select value={valueOptions.includes(row.value) ? row.value : ""} onChange={(event) => onChange({ value: event.target.value })} aria-label="Value">
          <option value="">Choose value</option>
          {valueOptions.map((value) => <option key={value} value={value}>{selectedOption ? attributeAllowedValueLabel(selectedOption, value) : value}</option>)}
        </select>
      ) : (
        <input value={row.value} onChange={(event) => onChange({ value: event.target.value })} placeholder={selectedOption?.unit ? `Value in ${selectedOption.unit}` : "Value"} aria-label="Value" />
      )}
    </div>
    <button type="button" onClick={onRemove} aria-label="Remove attribute"><Trash2 size={16} /></button>
  </div>;
}

export function BulkAttributeConfirmDialog({ count, attributes, onCancel, onApply }: { count: number; attributes: BulkAttributePatch[]; onCancel: () => void; onApply: () => void }) {
  return <div className="bulk-confirm-backdrop" role="presentation" onClick={(event) => event.stopPropagation()}>
    <section className="bulk-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="bulk-confirm-title">
      <h3 id="bulk-confirm-title">Apply bulk changes?</h3>
      <p>{`You are about to update ${count} products.`}</p>
      <strong>Attributes to apply:</strong>
      <ul>{attributes.map((attribute) => <li key={attribute.rowId}>{`${attribute.name} = ${attribute.value}`}</li>)}</ul>
      <p>Existing values will be replaced.</p>
      <div><button className="secondary-btn" type="button" onClick={onCancel}>Cancel</button><button className="primary-btn" type="button" onClick={onApply}>Apply Changes</button></div>
    </section>
  </div>;
}

export function BulkAttributeEditDrawer({ count, options, isLoading, state, onClose, onApply }: {
  count: number;
  options: CategoryAttributeOption[];
  isLoading: boolean;
  state: ReturnType<typeof useBulkAttributeEdit>;
  onClose: () => void;
  onApply: (attributes: BulkAttributePatch[]) => void;
}) {
  if (!state.open) return null;
  return <div className="category-drawer-backdrop bulk-attribute-backdrop" onClick={onClose}>
    <aside className="category-drawer bulk-attribute-drawer" onClick={(event) => event.stopPropagation()}>
      <div className="category-drawer-head"><div><h3>Bulk Edit Attributes</h3><p>Apply the same attributes to selected products. Existing values will be replaced.</p></div><button type="button" onClick={onClose}><X size={18} /></button></div>
      <div className="category-drawer-body">
        <section className="bulk-selected-products"><small>Selected products</small><strong>{`${count} products selected`}</strong></section>
        <h4 className="bulk-attribute-builder-title">Attribute builder</h4>
        <div className="bulk-attribute-columns"><span>Attribute</span><span>Value</span><span>Action</span></div>
        <div className="bulk-attribute-rows">{state.rows.map((row) => <BulkAttributeRow key={row.rowId} row={row} options={options} onChange={(patch) => state.updateRow(row.rowId, patch)} onRemove={() => state.removeRow(row.rowId)} />)}</div>
        {isLoading ? <div className="bulk-attribute-skeleton" aria-label="Loading category attributes"><span /><span /></div> : null}
        <button className="bulk-add-row" type="button" onClick={state.addRow}><Plus size={15} /> Add another attribute</button>
      </div>
      <div className="bulk-attribute-footer"><button className="secondary-btn" type="button" onClick={onClose}>Cancel</button><button className="primary-btn" type="button" disabled={state.validRows.length === 0} onClick={() => state.setConfirming(true)}>{`Apply to ${count} products`}</button></div>
    </aside>
    {state.confirming ? <BulkAttributeConfirmDialog count={count} attributes={state.validRows} onCancel={() => state.setConfirming(false)} onApply={() => onApply(state.validRows)} /> : null}
  </div>;
}
