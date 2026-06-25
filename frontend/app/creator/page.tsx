"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { AlertCircle, Box, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Funnel, Info, MoreVertical, Package, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";

import { readApiErrorMessage, readJsonResponse } from "../lib/api";
import { useCurrentUser } from "../hooks/use-current-user";
import { AppWorkspaceShell } from "../ui/app-workspace-shell";
import { PageLoadingShell } from "../ui/page-loading-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type UploadState = "idle" | "loading" | "success" | "error";
type ControllerOption = "jv" | "xl";
const CREATOR_DRAFT_KEY = "creator_process_draft_v1";
const AVAILABILITY_CONCURRENCY = 10;
const AVAILABILITY_AFTER_CREATE_DELAY_MS = 8000;

type FabricOption = { id: string; name: string; items_count?: number };
type FabricListResponse = { factory?: FabricOption[] };
type CategoryGroupCategoriesResponse = {
  success?: boolean;
  items?: {
    categoryGroup?: string;
    categoryGroupRu?: string | null;
    displayCategoryGroup?: string | null;
    categories?: string[];
    categoriesDisplay?: { name?: string; nameRu?: string | null; displayName?: string | null }[];
  }[];
};
type ShippingProfileOption = { id: string; name: string };
type CreateFromFabricResponse = {
  success?: boolean;
  process_id?: string | null;
  process_state?: string | null;
  issues?: string[];
};
type PrepareStatusResponse = {
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
  otto_process_id?: string | null;
  otto_create_state?: string;
  otto_update_result?: Record<string, unknown>;
  otto_failed_result?: Record<string, unknown> | null;
  otto_failed_result_original?: Record<string, unknown> | null;
  availability_errors?: OttoErrorRow[];
  availability_errors_original?: OttoErrorRow[];
  availability_failed?: number;
};
type SubmitPreparedResponse = {
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
type EnrichPreparedResponse = {
  success?: boolean;
  process_id?: string;
  products_count?: number;
  products?: Record<string, unknown>[];
};
type AvailabilitySubmitResponse = {
  update_quantity?: { success?: boolean; errors?: string };
  update_delivery?: { success?: boolean; errors?: string };
};
type OttoSummary = {
  state: string;
  total: number;
  progress: number;
  succeeded: number;
  failed: number;
};
type TaskProgress = {
  total: number;
  completed: number;
  percent: number;
};
type OttoErrorRow = {
  variation: string;
  code: string;
  title: string;
  jsonPath: string;
};
type AiCategoryReview = {
  category: string;
  categoryGroup: string;
};
type CategoryReviewStatus = "confirmed" | "requires_review" | "manually_changed" | "manually_confirmed" | "skipped";
type CategoryStatusFilter = "all" | "requires_review" | "confirmed" | "manually_changed" | "skipped";
type CategorySortOption = "title" | "status";
type ProductReviewStatus = "pending" | "approved" | "modified" | "rejected";
type ReviewQueueFilter = "all" | ProductReviewStatus;
type CategoryChangeEvent = {
  at: string;
  by: string;
  from: string;
  to: string;
  comment?: string;
};
type CategoryCheckRow = {
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
type ProductReviewRow = CategoryCheckRow & {
  reviewStatus: ProductReviewStatus;
};
type CategoryAttributeOption = {
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
type CategoryAttributesResponse = {
  items?: CategoryAttributeOption[];
  total?: number;
  categoryGroup?: string | null;
};
type ParsedSkuError = {
  sku: string;
  code: string;
  message: string;
  field: string;
  jsonPath: string;
};

type EditorTab = "general" | "attributes" | "diff" | "json";
type AttributeEditField = "values";
type BulkAttributePatch = {
  rowId: number;
  name: string;
  value: string;
  attributeId?: string;
  attributeKey?: string;
  unit?: string;
};
type BulkAttributeFailure = { productIndex: number; reason: string };
type WorkflowStep = "categories" | "compare" | "details";
type VariantStatus = "draft" | "pending_generation" | "generating_image" | "ready" | "failed" | "manual_override";
type VariantCombinationItem = {
  attributeId: string;
  name: string;
  value: string;
};
type ProductVariantDraft = {
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
type VariantPreview = {
  totalCombinations: number;
  existingCombinations: number;
  newCombinations: number;
  sourceCombinationKey: string;
  variationAttributes: { attributeId: string; name: string; values: string[]; fixed: boolean }[];
  combinations: { key: string; combination: VariantCombinationItem[] }[];
  issues: string[];
};
const SHIPPING_PROFILE_LABELS: Record<string, string> = {
  "786c6468-3baf-52e0-88b5-13757eb7f873": "4-8 недель",
  "360835cf-4962-59bb-ae66-78e8a41c8948": "6-10 недель",
  "28e3b4f8-12aa-5994-a7e9-26027baede55": "2-4 недели",
  "ad6009b9-a82f-5284-ac64-5627575655ac": "Express Chesterfield",
  "571dd076-4e59-5216-a86f-3e5f30319e9c": "Express Production",
  "935a75b0-ac88-55a8-98df-8556306f1386": "8-12 недель",
  "b4139e65-603f-52f7-9b99-393cf6b2461f": "Доступно сразу",
  "83feaefc-c110-5b39-af53-49344b77ae89": "Сборка/занос, сразу",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function ottoErrorsFromPayload(value: unknown): OttoErrorRow[] {
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

function productIdentityKey(product: Record<string, unknown>, index: number): string {
  const sku = String(product.sku ?? "").trim();
  if (sku) return `sku:${sku}`;
  const ean = String(product.ean ?? "").trim();
  if (ean) return `ean:${ean}`;
  const reference = String(product.productReference ?? "").trim();
  if (reference) return `reference:${reference}`;
  return `index:${index}`;
}

function mergeLiveProductRows(
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

function updateProductField(product: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
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

function updateProductTitle(product: Record<string, unknown>, title: string): Record<string, unknown> {
  return updateProductField(
    {
      ...product,
      Artikelbeschreibung: title,
    },
    ["productDescription", "productLine"],
    title,
  );
}

function bulkUpsertProductAttributes(
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

function firstImage(product: Record<string, unknown>): string {
  const assets = product.mediaAssets;
  if (!Array.isArray(assets) || assets.length === 0) return "";
  return String(asRecord(assets[0]).location ?? asRecord(assets[0]).filename ?? "");
}

function HoverPreviewImage({
  src,
  alt,
  className,
  block = false,
}: {
  src: string;
  alt: string;
  className?: string;
  block?: boolean;
}) {
  return (
    <span className={`image-hover-source${block ? " is-block" : ""}`}>
      <img className={className} src={src} alt={alt} />
    </span>
  );
}

function rowStatusLabel(status: "passed" | "failed" | "processing" | "pending"): string {
  if (status === "failed") return "Failed";
  if (status === "processing") return "Processing";
  if (status === "pending") return "Pending";
  return "Passed";
}

function buildPagination(currentPage: number, totalPages: number): Array<number | "..."> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  if (currentPage <= 3) return [1, 2, 3, "...", totalPages];
  if (currentPage >= totalPages - 2) return [1, "...", totalPages - 2, totalPages - 1, totalPages];
  return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
}

async function runWithConcurrency<T, R>(
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

function normalizeSku(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const bySlash = raw.split("/").filter(Boolean).pop() ?? raw;
  const byQuery = bySlash.split("?")[0] ?? bySlash;
  return byQuery.trim();
}

function normalizeFieldToken(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVariationValue(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function stableVariantImageRequestId(productIndex: number, combinationKey: string): string {
  let hash = 2166136261;
  const input = `${productIndex}:${combinationKey}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `variant-draft-${productIndex}-${(hash >>> 0).toString(16)}`;
}

async function waitForGeneratedImage(url: string, attempts = 8): Promise<boolean> {
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

function splitVariationValues(value: unknown): string[] {
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

function variantAttributeIdentity(option: CategoryAttributeOption): string {
  return String(option.attributeId ?? option.id ?? option.attributeKey ?? option.name ?? "").trim();
}

function buildVariantCombinationKey(combination: VariantCombinationItem[]): string {
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

function cloneProductRecord(product: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(product)) as Record<string, unknown>;
}

function readProductVariants(product: Record<string, unknown>): ProductVariantDraft[] {
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

function variationDimensionsForProduct(
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

  return categoryAttributes
    .filter((option) => option.isVariationTheme)
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

function buildVariantCombinations(
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

function sourceVariantCombinationKey(
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

function variantPriceFromProduct(product: Record<string, unknown>): string {
  const pricing = asRecord(product.pricing);
  const standardPrice = asRecord(pricing.standardPrice);
  return String(standardPrice.amount ?? "");
}

function applyCombinationToProductPayload(
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

function buildLocalVariantPreview(
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
  if (themeCount === 0) issues.push("Для этой category group не настроены variationThemes.");
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

function generateLocalVariantsForProduct(
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

function updateVariantPayloadFields(variant: ProductVariantDraft): ProductVariantDraft {
  const payload = variant.productPayload ? cloneProductRecord(variant.productPayload) : undefined;
  if (!payload) return variant;
  payload.sku = variant.sku;
  payload.ean = variant.ean || null;
  const price = Number(variant.price);
  if (!Number.isNaN(price)) {
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

function expandedProductCount(products: Record<string, unknown>[]): number {
  return products.reduce((total, product) => {
    const variants = readProductVariants(product).filter((variant) => variant.active);
    return total + (variants.length || 1);
  }, 0);
}

function collectVariantExportIssues(products: Record<string, unknown>[]): OttoErrorRow[] {
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

    if (!row.ean) errors.push({ variation: row.label, code: "missing_ean", title: "EAN is required for every active variant.", jsonPath: "ean" });
    else if (seenEan.has(row.ean)) errors.push({ variation: row.label, code: "duplicate_ean", title: `EAN duplicates ${seenEan.get(row.ean)}.`, jsonPath: "ean" });
    else seenEan.set(row.ean, row.label);
  }
  return errors;
}

function sanitizeUiMessage(value: string): string {
  const raw = String(value ?? "");
  return raw
    .replace(/\s*PID=[^\s]+/gi, "")
    .replace(/\s*File:\s*.+$/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function readAttributeGroup(name: string): "Основные характеристики" | "Комплектация" | "Дополнительно" {
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

function labelWithRu(value: unknown, ruValue?: unknown): string {
  const primary = String(value ?? "").trim();
  const ru = String(ruValue ?? "").trim();
  if (!primary) return ru;
  if (!ru || normalizeFieldToken(primary) === normalizeFieldToken(ru)) return primary;
  return `${primary} (${ru})`;
}

function attributeDisplayName(item: CategoryAttributeOption): string {
  return labelWithRu(item.name, item.nameRu);
}

function attributeDisplayDescription(item: CategoryAttributeOption): string {
  return String(item.displayDescription || item.descriptionRu || item.description || "").trim();
}

function attributeAllowedValueLabel(item: CategoryAttributeOption, value: string): string {
  const displayItem = item.allowedValuesDisplay?.find((option) => option.value === value);
  return labelWithRu(displayItem?.value || value, displayItem?.valueRu);
}

function isColorVariantAttribute(name: string): boolean {
  const token = normalizeFieldToken(name);
  if (token.includes("füße") || token.includes("fusse") || token.includes("feet")) return false;
  return ["color", "farbe", "grundfarbe", "colour", "цвет"].some((key) => token.includes(key));
}

function isMaterialVariantAttribute(name: string): boolean {
  const token = normalizeFieldToken(name);
  return ["material", "bezug", "stoff", "материал"].some((key) => token.includes(key));
}

function splitAttributeValues(value: string): string[] {
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

function joinAttributeValues(values: string[]): string {
  return values.map((item) => item.trim()).filter(Boolean).join(", ");
}

function attributeLayoutRank(name: string): number {
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

function attributeFieldLayout(name: string): "wide" | "normal" {
  const token = normalizeFieldToken(name);
  return token.includes("wohnraum") || token.includes("ausstattung") ? "wide" : "normal";
}

function attributeControlKind(name: string, value: string): "input" | "textarea" {
  const token = normalizeFieldToken(name);
  if (token.includes("wohnraum") || token.includes("ausstattung") || token.includes("lieferumfang")) return "textarea";
  return value.length > 100 ? "textarea" : "input";
}

function parseShippingProfiles(payload: unknown): ShippingProfileOption[] {
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

function productShippingProfileId(product: Record<string, unknown>): string {
  return String(product.shippingProfileID ?? "");
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readAiCategoryReview(product: Record<string, unknown>): AiCategoryReview {
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

function mergeAiCategoryReview(
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

function productAftercoolData(product: Record<string, unknown>) {
  const comparison = asRecord(product.aftercoolComparison);
  return asRecord(comparison.aftercool);
}

function previewText(value: unknown, fallback = "-"): string {
  const text = String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function formatDiffValue(value: unknown): string {
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

function readComparisonAttributes(body: Record<string, unknown>): Record<string, string> {
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

function readDiffList(value: unknown): string[] {
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

function buildAftercoolRows(aftercool: ReturnType<typeof productAftercoolData>) {
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

function statusText(status: CategoryReviewStatus): string {
  if (status === "confirmed" || status === "manually_confirmed") return "Подтверждено";
  if (status === "manually_changed") return "Изменено вручную";
  if (status === "skipped") return "Пропущено";
  return "Требует проверки";
}

function StatusBadge({ status }: { status: CategoryReviewStatus }) {
  return <span className={`category-check-status-badge ${status}`}>{statusText(status)}</span>;
}

function CategoryCheckSummary({
  categoryKpis,
  processState,
}: {
  categoryKpis: { total: number; confirmed: number; requiresReview: number; manuallyChanged: number; skipped: number };
  processState: string;
}) {
  return (
    <div className="category-check-summary">
      <div className="category-check-summary-top">
        <h2>Проверка категорий</h2>
        <Badge className={`creator-ref-status-badge ${processState === "DONE" ? "done" : processState === "FAILED" ? "failed" : "progress"}`}>
          {processState === "DONE" ? "Готово" : processState === "FAILED" ? "Ошибка" : "Подготовка"}
        </Badge>
      </div>
      <p className="category-check-ready-copy">{`${categoryKpis.total} ${categoryKpis.total === 1 ? "товар готов" : "товаров готовы"} к проверке`}</p>
      <div className="category-check-metrics">
        <span className="category-check-metric neutral"><small>Всего</small><strong>{categoryKpis.total}</strong></span>
        <span className="category-check-metric success"><small>Подтверждено</small><strong>{categoryKpis.confirmed}</strong></span>
        <span className="category-check-metric warning"><small>На проверке</small><strong>{categoryKpis.requiresReview}</strong></span>
        <span className="category-check-metric info"><small>Изменено</small><strong>{categoryKpis.manuallyChanged}</strong></span>
        <span className="category-check-metric muted"><small>Пропущено</small><strong>{categoryKpis.skipped}</strong></span>
      </div>
    </div>
  );
}

function CategoryCheckProgress({
  currentStep,
  processState,
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
}: {
  currentStep: string;
  processState: string;
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
}) {
  const safeProgress = processState === "DONE"
    ? 100
    : Math.max(0, Math.min(100, Math.round(progressPercent || 0)));
  return (
    <div className="category-check-progress">
      <div className="category-check-progress-main">
        <div className="creator-ref-progress-head">
          <div>
            <strong>{processState === "DONE" ? "Подготовка завершена" : progressLabel}</strong>
            <small>{realtimeMode === "websocket" ? "Обновляется в реальном времени" : "Обновляется через polling"}</small>
          </div>
          <span>{`${safeProgress}%`}</span>
        </div>
        <div className="creator-ref-progress-track" role="progressbar" aria-label="Прогресс подготовки товаров" aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeProgress}>
          <span style={{ width: `${safeProgress}%` }} />
        </div>
      </div>
      <details className="category-check-tech">
        <summary>Техническая информация</summary>
        <div className="creator-ref-runtime">
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
      </details>
    </div>
  );
}

function CategoryCheckToolbar({
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

function CategoryCheckBatchActions({
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

function BulkCategoryEditDrawer({
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

function CategoryCheckTable({
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

function CategoryProductMedia({ row }: { row: CategoryCheckRow }) {
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

function CategoryEditDrawer({
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

function CategoryChangeForm({
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
  const groups = useMemo(() => Object.keys(categoryOptionsByGroup).sort((a, b) => a.localeCompare(b)), [categoryOptionsByGroup]);
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

function CategoryDiff({ previous, next }: { previous: string; next: string }) {
  if (!previous || !next || previous.trim() === next.trim()) return null;
  return (
    <div className="category-review-diff">
      <div className="old-value"><span>Было</span><strong>{previous}</strong></div>
      <div className="new-value"><span>Стало</span><strong>{next}</strong></div>
    </div>
  );
}

function CategoryReviewModalHeader({ onClose }: { onClose: () => void }) {
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

function CategoryProductImageCard({ row }: { row: CategoryCheckRow }) {
  return row.image ? (
    <HoverPreviewImage className="category-review-product-image" src={row.image} alt={row.title || "Изображение товара"} block />
  ) : (
    <div className="category-review-product-image-empty">
      <Package size={42} aria-hidden="true" />
      <span>Изображение отсутствует</span>
    </div>
  );
}

function CategoryProductHero({ row, status }: { row: CategoryCheckRow; status: CategoryReviewStatus }) {
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

function CategoryCategorySection({ row, categoryOptionsByGroup, categoryGroupDisplayByValue, categoryDisplayByValue, canSaveDraft, onDraftChange, onDirtyChange, onSave, onSaveDraft }: {
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

function CategoryReviewNavigation({ position, total, onPrevious, onNext }: { position: number; total: number; onPrevious: () => void; onNext: () => void }) {
  return (
    <div className="category-review-navigation">
      <button className="secondary-btn" type="button" onClick={onPrevious} disabled={position <= 0}><ChevronLeft size={16} /> Предыдущий</button>
      <span className="category-review-position">{`${Math.max(0, position) + 1} / ${total}`}</span>
      <button className="secondary-btn" type="button" onClick={onNext} disabled={position < 0 || position >= total - 1}>Следующий <ChevronRight size={16} /></button>
    </div>
  );
}

function CategoryReviewFooter({ position, total, onPrevious, onNext }: {
  position: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return <footer className="category-review-footer">
    <CategoryReviewNavigation position={position} total={total} onPrevious={onPrevious} onNext={onNext} />
  </footer>;
}

function CategoryProductListItem({ row, status, active, onSelect }: {
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

function CategoryProductNavigator({ rows, statuses, activeIndex, position, total, onSelectProduct }: {
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

function CategoryReviewWorkspace({ row, status, categoryOptionsByGroup, categoryGroupDisplayByValue, categoryDisplayByValue, canSaveDraft, onDraftChange, onDirtyChange, onSave, onSaveDraft }: {
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

function CategoryReviewModal({
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

function reviewStatusLabel(status: ProductReviewStatus): string {
  if (status === "approved") return "Approved";
  if (status === "modified") return "Modified";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

function ProductReviewPage({ children }: { children: ReactNode }) {
  return <section className="product-review-page">{children}</section>;
}

function ProductListItem({
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
  return (
    <article className={`product-review-list-item ${active ? "active" : ""}`} data-product-index={row.index}>
      <span className="product-review-list-checkbox">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${row.sku}`} />
      </span>
      <button type="button" className="product-review-list-open" onClick={onOpen}>
        {row.image ? <HoverPreviewImage src={row.image} alt="" /> : <span className="product-review-list-no-image">-</span>}
      </button>
      <button type="button" className="product-review-list-copy" onClick={onOpen}>
        <strong title={row.title}>{row.title || "-"}</strong>
        <small>{`SKU: ${row.sku || "-"}`}</small>
        <em>{row.selectedCategory || row.aiCategory || "-"}</em>
      </button>
      <span className={`product-review-status ${row.reviewStatus}`}>{reviewStatusLabel(row.reviewStatus)}</span>
    </article>
  );
}

function ProductList({
  rows,
  selectedIndex,
  selectedReviewIndexes,
  onSelect,
  onToggleSelect,
  searchRef,
  query,
  setQuery,
  filter,
  setFilter,
}: {
  rows: ProductReviewRow[];
  selectedIndex: number;
  selectedReviewIndexes: number[];
  onSelect: (index: number) => void;
  onToggleSelect: (index: number) => void;
  searchRef: Ref<HTMLInputElement>;
  query: string;
  setQuery: (value: string) => void;
  filter: ReviewQueueFilter;
  setFilter: (value: ReviewQueueFilter) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const activeItem = listRef.current?.querySelector<HTMLElement>(`[data-product-index="${selectedIndex}"]`);
    if (!activeItem) return;
    const itemTop = activeItem.offsetTop;
    const itemBottom = itemTop + activeItem.offsetHeight;
    const visibleTop = container.scrollTop;
    const visibleBottom = visibleTop + container.clientHeight;
    if (itemTop < visibleTop) {
      container.scrollTo({ top: Math.max(0, itemTop - 8), behavior: "smooth" });
    } else if (itemBottom > visibleBottom) {
      container.scrollTo({ top: itemBottom - container.clientHeight + 8, behavior: "smooth" });
    }
  }, [selectedIndex, rows.length]);

  return (
    <aside className="product-review-list">
      <div className="product-review-list-tools">
        <div className="creator-search-wrap">
          <Search size={16} className="creator-search-icon" />
          <input ref={searchRef} className="creator-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search SKU, EAN, product" />
        </div>
        <select value={filter} onChange={(event) => setFilter(event.target.value as ReviewQueueFilter)}>
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="modified">Modified</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <div ref={listRef} className="product-review-list-scroll">
        {rows.length === 0 ? (
          <div className="product-review-empty"><strong>No products found</strong><span>Try changing filters or search query</span></div>
        ) : rows.map((row) => (
          <ProductListItem
            key={row.index}
            row={row}
            active={selectedIndex === row.index}
            selected={selectedReviewIndexes.includes(row.index)}
            onOpen={() => onSelect(row.index)}
            onToggle={() => onToggleSelect(row.index)}
          />
        ))}
      </div>
    </aside>
  );
}

function ProductReviewHeader({ row, image, categoryDisplayByValue, categoryGroupDisplayByValue }: {
  row: ProductReviewRow | null;
  image: string;
  categoryDisplayByValue: Record<string, string>;
  categoryGroupDisplayByValue: Record<string, string>;
}) {
  if (!row) {
    return <div className="product-review-empty workspace"><strong>Select a product to review</strong></div>;
  }
  return (
    <section className="product-review-header">
      {image ? <HoverPreviewImage src={image} alt="" /> : <div className="product-review-header-empty">No image</div>}
      <div>
        <h2>{row.title || "-"}</h2>
        <dl>
          <div><dt>SKU</dt><dd>{row.sku || "-"}</dd></div>
          <div><dt>EAN</dt><dd>{row.ean || "-"}</dd></div>
          <div><dt>Price</dt><dd>{row.price || "-"}</dd></div>
          <div><dt>Category</dt><dd>{categoryGroupDisplayByValue[row.aiCategoryGroup] || row.aiCategoryGroup || "-"}</dd></div>
          <div><dt>Subcategory</dt><dd>{categoryDisplayByValue[row.selectedCategory] || row.selectedCategory || "-"}</dd></div>
        </dl>
      </div>
    </section>
  );
}

function DiffViewer({ aftercool }: { aftercool: ReturnType<typeof productAftercoolData> }) {
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

function ReviewTabs({ value, setValue }: { value: EditorTab; setValue: (value: EditorTab) => void }) {
  return (
    <div className="product-review-tabs">
      {[
        ["general", "Overview"],
        ["attributes", "Attributes"],
        ["diff", "Diff"],
        ["json", "JSON"],
      ].map(([key, label]) => (
        <button key={key} className={value === key ? "active" : ""} type="button" onClick={() => setValue(key as EditorTab)}>{label}</button>
      ))}
    </div>
  );
}

type AttributeCard = {
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

function AttributeBadges({ invalid }: { invalid: boolean }) {
  return invalid ? <span className="attribute-badge is-invalid">Invalid</span> : null;
}

function ExclusiveActionsMenu({ children, className = "", label }: { children: ReactNode; className?: string; label: string }) {
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

function AttributeActionsMenu({ onDelete, value }: { onDelete: () => void; value: string }) {
  return (
    <ExclusiveActionsMenu label="Attribute actions">
      <div>
        {value ? <button type="button" onClick={() => void navigator.clipboard?.writeText(value)}><Copy size={14} /> Copy value</button> : null}
        <button type="button" className="is-danger" onClick={onDelete}><Trash2 size={14} /> Delete</button>
      </div>
    </ExclusiveActionsMenu>
  );
}

function OverviewActionsMenu({ onEdit, onCopy, canCopy = true, copied = false }: { onEdit: () => void; onCopy?: () => void; canCopy?: boolean; copied?: boolean }) {
  return (
    <ExclusiveActionsMenu className="overview-actions-menu" label="Field actions">
      <div>
        <button type="button" onClick={onEdit}><Pencil size={14} /> Edit</button>
        {onCopy && canCopy ? <button type="button" onClick={onCopy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy value"}</button> : null}
      </div>
    </ExclusiveActionsMenu>
  );
}

function AttributeValueChips({ values, option, onChange }: { values: string[]; option?: CategoryAttributeOption; onChange: (values: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const allowedValues = option?.allowedValues ?? [];
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
        {values.map((item) => (
          <span className="attribute-chip" key={item}>
            {option ? attributeAllowedValueLabel(option, item) : item}
            <button type="button" onClick={() => removeValue(item)} aria-label={`Remove ${item}`}><X size={12} /></button>
          </span>
        ))}
        {allowedValues.length > 0 ? (
          <select value="" onChange={(event) => addValue(event.target.value)} aria-label="Add value">
            <option value="">Add value</option>
            {availableOptions.map((item) => (
              <option value={item} key={item}>{option ? attributeAllowedValueLabel(option, item) : item}</option>
            ))}
          </select>
        ) : (
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
            aria-label="Add value"
          />
        )}
      </div>
    </div>
  );
}

function AttributeFieldCard({ attribute, onChange, onDelete, invalid }: {
  attribute: AttributeCard;
  onChange: (value: string) => void;
  onDelete: () => void;
  invalid: boolean;
}) {
  const values = attribute.valueList.length ? attribute.valueList : splitAttributeValues(attribute.values);
  return (
    <article className={`attribute-form-field${invalid ? " is-invalid" : ""}${values.length > 1 ? " has-multiple-values" : ""}`}>
      <div className="attribute-form-field-head">
        <span title={attribute.name}>{attribute.displayName || attribute.name || "Unnamed"}</span>
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

function AttributeFieldsSection({ title, items, editingAttribute, editingDraft, setEditingDraft, startAttributeEdit, saveAttributeEdit, cancelAttributeEdit, deleteAttribute, invalidNames }: {
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

type AttributeVariantDimension = {
  key: string;
  label: string;
  values: string[];
};

type AttributeVariantRow = {
  key: string;
  combination: string;
  parts: Array<{ key: string; label: string; value: string }>;
};

type VariantPriceAdjustment = {
  direction: "add" | "subtract";
  mode: "percent" | "amount";
  value: string;
};

function parseMoneyValue(value: unknown): number | null {
  const normalized = String(value ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoneyValue(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function applyVariantPriceAdjustments(
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

function variantPartChipLabel(part: { label: string; value: string }, mode: "main" | "row"): string {
  if (mode === "main") return `${part.label}: ${part.value}`;
  return part.value;
}

function buildAttributeVariantRows(attributes: AttributeCard[]): { dimensions: AttributeVariantDimension[]; rows: AttributeVariantRow[]; total: number; mainCombination: string; mainParts: AttributeVariantRow["parts"] } {
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

function AttributeProductVariants({ attributes, basePrice }: { attributes: AttributeCard[]; basePrice: string }) {
  const preview = useMemo(() => buildAttributeVariantRows(attributes), [attributes]);
  const [drafts, setDrafts] = useState<Record<string, { sku: string; ean: string; price: string }>>({});
  const [priceAdjustments, setPriceAdjustments] = useState<Record<string, VariantPriceAdjustment>>({});
  const parsedBasePrice = useMemo(() => parseMoneyValue(basePrice), [basePrice]);
  const materialDimension = preview.dimensions.find((dimension) => isMaterialVariantAttribute(dimension.label));
  const priceRuleDimension = materialDimension ?? null;

  useEffect(() => {
    const keys = new Set(preview.rows.map((row) => row.key));
    setDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => keys.has(key)),
      ),
    );
  }, [preview.rows]);

  if (preview.rows.length === 0) return null;

  const updateDraft = (key: string, patch: Partial<{ sku: string; ean: string; price: string }>) => {
    setDrafts((current) => {
      const previous = current[key] ?? { sku: "", ean: "", price: "" };
      return { ...current, [key]: { ...previous, ...patch } };
    });
  };
  const updatePriceAdjustment = (key: string, patch: Partial<VariantPriceAdjustment>) => {
    setPriceAdjustments((current) => {
      const previous = current[key] ?? { direction: "add", mode: "percent", value: "" };
      return { ...current, [key]: { ...previous, ...patch } };
    });
  };
  const basePriceLabel = parsedBasePrice === null ? "0,00" : formatMoneyValue(parsedBasePrice);
  const resultForPriceValue = (value: string, index: number) => {
    if (parsedBasePrice === null) return "";
    if (!priceRuleDimension || index === 0) return basePriceLabel;
    const key = `${priceRuleDimension.key}:${normalizeFieldToken(value)}`;
    const adjustment = priceAdjustments[key];
    const amount = parseMoneyValue(adjustment?.value);
    if (!adjustment || amount === null) return basePriceLabel;
    const delta = adjustment.mode === "percent" ? parsedBasePrice * (amount / 100) : amount;
    const next = adjustment.direction === "subtract" ? parsedBasePrice - delta : parsedBasePrice + delta;
    return formatMoneyValue(Math.max(0, next));
  };

  return (
    <section className="attribute-variants-panel">
      <div className="attribute-variants-head">
        <div>
          <div className="attribute-variants-title-line">
            <h4>Product variants <Info size={13} aria-hidden="true" /></h4>
            <span className="attribute-variants-count">{`${preview.rows.length} variants`}</span>
          </div>
          <div className="attribute-main-product">
            <p><strong>Main product:</strong></p>
            <div className="attribute-main-chips">
              {preview.mainParts.map((part) => (
                <span key={`${part.key}:${part.value}`} title={`${part.label}: ${part.value}`}>
                  <small>{part.label}:</small>
                  <strong>{part.value}</strong>
                </span>
              ))}
            </div>
          </div>
          <p className="attribute-variants-description">{`${preview.rows.length} additional variants generated from selected attributes`}</p>
        </div>
      </div>
      {priceRuleDimension ? (
        <details className="attribute-price-rules" open>
          <summary className="attribute-price-rules-head">
            <span>
              <h5>Price adjustments</h5>
              <small>{`Base price: ${basePriceLabel}`}</small>
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
                      <select value={adjustment.direction} onChange={(event) => updatePriceAdjustment(key, { direction: event.target.value as VariantPriceAdjustment["direction"] })} aria-label={`${value} price direction`}>
                        <option value="add">+</option>
                        <option value="subtract">-</option>
                      </select>
                      <input inputMode="decimal" value={adjustment.value} onChange={(event) => updatePriceAdjustment(key, { value: event.target.value })} placeholder="0" aria-label={`${value} price adjustment`} />
                      <select value={adjustment.mode} onChange={(event) => updatePriceAdjustment(key, { mode: event.target.value as VariantPriceAdjustment["mode"] })} aria-label={`${value} price mode`}>
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
      ) : null}
      <div className="attribute-variants-table-meta"><span>{`Showing ${preview.rows.length} additional variants`}</span><span>{`${preview.rows.length} total`}</span></div>
      <div className="attribute-variants-table">
        <div className="attribute-variants-row is-head"><span>Variant combination</span><span>SKU</span><span>EAN</span><span>Price</span></div>
        {preview.rows.map((row) => {
          const draft = drafts[row.key] ?? { sku: "", ean: "", price: "" };
          const calculatedPrice = applyVariantPriceAdjustments(parsedBasePrice, row, priceAdjustments);
          return (
            <div className="attribute-variants-row" key={row.key}>
              <div className="attribute-variant-combination" aria-label={row.combination}>
                {row.parts.map((part) => (
                  <span key={`${part.key}:${part.value}`} title={`${part.label}: ${part.value}`}>
                    {variantPartChipLabel(part, "row")}
                  </span>
                ))}
              </div>
              <input value={draft.sku} onChange={(event) => updateDraft(row.key, { sku: event.target.value })} placeholder="SKU" aria-label={`${row.combination} SKU`} />
              <input type="text" inputMode="numeric" value={draft.ean} onChange={(event) => updateDraft(row.key, { ean: event.target.value })} placeholder="EAN" aria-label={`${row.combination} EAN`} />
              <input type="text" inputMode="decimal" value={draft.price || calculatedPrice} onChange={(event) => updateDraft(row.key, { price: event.target.value })} placeholder="0,00" aria-label={`${row.combination} price`} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MissingAttributeRow({
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

function MissingAttributesPanel({ availableAttributes, isLoading, error, selectedOption, valueOptions, newAttributeName, setNewAttributeName, newAttributeValue, setNewAttributeValue, addAttribute, open, setOpen, query }: {
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

function AttributesToolbar({ query, setQuery, group, setGroup, groups, onlyEmpty, setOnlyEmpty, onAdd }: { query: string; setQuery: (value: string) => void; group: string; setGroup: (value: string) => void; groups: string[]; onlyEmpty: boolean; setOnlyEmpty: (value: boolean) => void; onAdd: () => void }) {
  return <div className="attributes-toolbar">
    <label className="attributes-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search attributes..." aria-label="Search attributes" /></label>
    <select value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Filter by group"><option value="all">All groups</option>{groups.map((item) => <option key={item}>{item}</option>)}</select>
    <label className="attributes-empty-toggle"><input type="checkbox" checked={onlyEmpty} onChange={(event) => setOnlyEmpty(event.target.checked)} /> Only empty</label>
    <button type="button" className="attributes-add-button" onClick={onAdd}><Plus size={16} /> Add attribute</button>
  </div>;
}

function AttributeEditor({
  attributes,
  basePrice,
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
      <div className="attributes-title"><div><h3>Attributes</h3><p>{`${attributes.filter((item) => item.values.trim()).length} of ${attributes.length} filled`}</p></div></div>
      <AttributesToolbar query={query} setQuery={setQuery} group={groupFilter} setGroup={setGroupFilter} groups={Object.keys(groups).filter((title) => groups[title].length > 0)} onlyEmpty={onlyEmpty} setOnlyEmpty={setOnlyEmpty} onAdd={() => setMissingOpen(true)} />
      <MissingAttributesPanel availableAttributes={availableAttributes} isLoading={isLoadingCategoryAttributes} error={categoryAttributesError} selectedOption={selectedOption} valueOptions={valueOptions} newAttributeName={newAttributeName} setNewAttributeName={setNewAttributeName} newAttributeValue={newAttributeValue} setNewAttributeValue={setNewAttributeValue} addAttribute={addAttribute} open={missingOpen} setOpen={setMissingOpen} query={query} />
      {filteredAttributes.length ? (
        <AttributeFieldsSection title="All attributes" items={filteredAttributes} editingAttribute={editingAttribute} editingDraft={editingDraft} setEditingDraft={setEditingDraft} startAttributeEdit={startAttributeEdit} saveAttributeEdit={saveAttributeEdit} cancelAttributeEdit={cancelAttributeEdit} deleteAttribute={deleteAttribute} invalidNames={invalidAttributeNames} />
      ) : <div className="attributes-empty-state">No attributes match these filters.</div>}
      <AttributeProductVariants attributes={attributes} basePrice={basePrice} />
    </div>
  );
}

function variantStatusLabel(status: VariantStatus): string {
  if (status === "pending_generation") return "Pending";
  if (status === "generating_image") return "Generating";
  if (status === "manual_override") return "Manual";
  if (status === "failed") return "Failed";
  if (status === "ready") return "Ready";
  return "Draft";
}

function VariantManager({
  product,
  categoryAttributes,
  onGenerate,
  onPatchVariant,
  onDeleteVariant,
  onRegenerateVariant,
}: {
  product: Record<string, unknown>;
  categoryAttributes: CategoryAttributeOption[];
  onGenerate: () => void;
  onPatchVariant: (combinationKey: string, patch: Partial<ProductVariantDraft>) => void;
  onDeleteVariant: (combinationKey: string) => void;
  onRegenerateVariant: (combinationKey: string) => void | Promise<void>;
}) {
  const variants = readProductVariants(product);
  const activeVariants = variants.filter((variant) => variant.active);
  const preview = buildLocalVariantPreview(product, categoryAttributes);
  const [editingKey, setEditingKey] = useState("");
  const [uploadingKey, setUploadingKey] = useState("");
  const [fullscreenImage, setFullscreenImage] = useState<{ src: string; label: string } | null>(null);
  const editingVariant = variants.find((variant) => variant.combinationKey === editingKey) ?? null;
  const columns = preview.variationAttributes.length > 0
    ? preview.variationAttributes.map((item) => ({ attributeId: item.attributeId, name: item.name }))
    : Array.from(
      new Map(
        variants.flatMap((variant) => variant.combination.map((item) => [item.attributeId, { attributeId: item.attributeId, name: item.name }] as const)),
      ).values(),
    );

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

  useEffect(() => {
    if (!fullscreenImage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreenImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreenImage]);

  return (
    <section className="product-review-section variant-manager">
      <div className="variant-manager-head">
        <div>
          <h3>Variants</h3>
          <p>
            {preview.totalCombinations > 0
              ? `Будет создано ${preview.totalCombinations} комбинаций, уже существует ${preview.existingCombinations}, будет добавлено ${preview.newCombinations}.`
              : "Для текущих attributes нет доступной variation matrix."}
          </p>
        </div>
        <button className="primary-btn" type="button" onClick={onGenerate} disabled={preview.totalCombinations === 0}>
          <RefreshCw size={15} />
          Сгенерировать варианты
        </button>
      </div>
      {preview.issues.length > 0 ? (
        <div className="variant-issues">
          {preview.issues.map((issue) => <span key={issue}>{issue}</span>)}
        </div>
      ) : null}
      {preview.variationAttributes.length > 0 ? (
        <div className="variant-theme-list">
          {preview.variationAttributes.map((attribute) => (
            <span key={attribute.attributeId}>
              <strong>{attribute.name}</strong>
              <small>{attribute.fixed ? "fixed" : `${attribute.values.length} values`}</small>
            </span>
          ))}
        </div>
      ) : null}
      <div className="variant-table-scroll">
        <table className="variant-table">
          <thead>
            <tr>
              {columns.map((column) => <th key={column.attributeId}>{column.name}</th>)}
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
              const valueById = new Map(variant.combination.map((item) => [item.attributeId, item.value]));
              const imageUrl = variant.imageUrl || variant.mediaAssets[0]?.location || "";
              const missing = !variant.sku.trim() || !variant.ean.trim();
              return (
                <tr key={variant.combinationKey} className={missing ? "has-missing-fields" : ""}>
                  {columns.map((column) => <td key={column.attributeId}>{valueById.get(column.attributeId) || "-"}</td>)}
                  <td>{variant.ean || <span className="variant-missing">Missing</span>}</td>
                  <td><code>{variant.sku || "Missing"}</code></td>
                  <td>{variant.price || "-"}</td>
                  <td>
                    {imageUrl ? (
                      <button className="variant-thumb-button" type="button" onClick={() => setFullscreenImage({ src: imageUrl, label: variant.combination.map((item) => item.value).join(" · ") })} aria-label="Open image fullscreen">
                        <img className="variant-thumb" src={imageUrl} alt="" />
                      </button>
                    ) : <span className="variant-missing">No image</span>}
                  </td>
                  <td><span className={`variant-status status-${variant.status}`}>{variantStatusLabel(variant.status)}</span></td>
                  <td>
                    <div className="variant-actions">
                      <button type="button" title="Open / edit" onClick={() => setEditingKey(variant.combinationKey)}><Pencil size={14} /></button>
                      <button type="button" title="Regenerate image" onClick={() => void onRegenerateVariant(variant.combinationKey)} disabled={variant.status === "generating_image"}><RefreshCw size={14} /></button>
                      <label title="Upload / replace image">
                        <Plus size={14} />
                        <input type="file" accept="image/*" onChange={(event) => void uploadVariantImage(variant.combinationKey, event.target.files?.[0] ?? null)} />
                      </label>
                      <button type="button" title="Delete" className="is-danger" onClick={() => onDeleteVariant(variant.combinationKey)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={columns.length + 6}>
                  <div className="variant-empty-state">Нажмите «Сгенерировать варианты», чтобы создать matrix для текущих attributes.</div>
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

function ErrorDrawer({ open, errors, onClose }: { open: boolean; errors: ParsedSkuError[]; onClose: () => void }) {
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

function StickyActionBar({
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
        <button className="secondary-btn" type="button" onClick={onRegenerate} disabled={disabled}>Regenerate AI</button>
        <button className="primary-btn" type="button" onClick={onApprove} disabled={disabled}>{approved ? "Approved" : "Approve Product"}</button>
        {allApproved ? <button className="primary-btn product-review-submit-btn" type="button" onClick={onSubmit} disabled={disabled}>Send to OTTO</button> : null}
      </div>
    </div>
  );
}

function useBulkAttributeEdit() {
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

function BulkSelectionBar({ count, onBulkEdit, onApprove, onReject, onClear }: { count: number; onBulkEdit: () => void; onApprove: () => void; onReject: () => void; onClear: () => void }) {
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

function BulkAttributeRow({ row, options, onChange, onRemove }: { row: BulkAttributePatch; options: CategoryAttributeOption[]; onChange: (patch: Partial<BulkAttributePatch>) => void; onRemove: () => void }) {
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

function BulkAttributeConfirmDialog({ count, attributes, onCancel, onApply }: { count: number; attributes: BulkAttributePatch[]; onCancel: () => void; onApply: () => void }) {
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

function BulkAttributeEditDrawer({ count, options, isLoading, state, onClose, onApply }: {
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

export default function CreatorPage() {
  const { currentUser, isLoading, error } = useCurrentUser();
  const [controller, setController] = useState<ControllerOption>("jv");
  const [fabrics, setFabrics] = useState<FabricOption[]>([]);
  const [shippingProfiles, setShippingProfiles] = useState<ShippingProfileOption[]>([]);
  const [categoryOptionsByGroup, setCategoryOptionsByGroup] = useState<Record<string, string[]>>({});
  const [selectedFabricId, setSelectedFabricId] = useState<string>("");
  const [fabricQuery, setFabricQuery] = useState("");
  const [fabricDropdownOpen, setFabricDropdownOpen] = useState(false);
  const [state, setState] = useState<UploadState>("idle");
  const [isLoadingFabrics, setIsLoadingFabrics] = useState(false);
  const [isRefreshingFabrics, setIsRefreshingFabrics] = useState(false);
  const [message, setMessage] = useState("Выберите fabric и нажмите «Выставить».");
  const [issues, setIssues] = useState<string[]>([]);
  const [processId, setProcessId] = useState<string>("");
  const [processState, setProcessState] = useState<string>("IDLE");
  const [products, setProducts] = useState<Record<string, unknown>[]>([]);
  const [aiCategoryByIndex, setAiCategoryByIndex] = useState<Record<number, AiCategoryReview>>({});
  const [categoryDisplayByValue, setCategoryDisplayByValue] = useState<Record<string, string>>({});
  const [categoryGroupDisplayByValue, setCategoryGroupDisplayByValue] = useState<Record<string, string>>({});
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("categories");
  const [currentStep, setCurrentStep] = useState<string>("prepare_initializing");
  const [stepElapsed, setStepElapsed] = useState<number>(0);
  const [heartbeatLag, setHeartbeatLag] = useState<number>(0);
  const [stuckMessage, setStuckMessage] = useState<string>("");
  const [hydratedDraft, setHydratedDraft] = useState(false);
  const [isRestoringProcess, setIsRestoringProcess] = useState(false);
  const [ottoProcessId, setOttoProcessId] = useState<string>("");
  const [ottoSummary, setOttoSummary] = useState<OttoSummary | null>(null);
  const [ottoErrors, setOttoErrors] = useState<OttoErrorRow[]>([]);
  const [lastSubmitTotal, setLastSubmitTotal] = useState(0);
  const [editorTab, setEditorTab] = useState<EditorTab>("general");
  const [editingOverviewField, setEditingOverviewField] = useState<string | null>(null);
  const [categoryAttributes, setCategoryAttributes] = useState<CategoryAttributeOption[]>([]);
  const [isLoadingCategoryAttributes, setIsLoadingCategoryAttributes] = useState(false);
  const [categoryAttributesError, setCategoryAttributesError] = useState("");
  const [newAttributeName, setNewAttributeName] = useState("");
  const [newAttributeValue, setNewAttributeValue] = useState("");
  const [editingAttribute, setEditingAttribute] = useState<{ index: number; field: AttributeEditField } | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [tableQuery, setTableQuery] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryStatusFilter, setCategoryStatusFilter] = useState<CategoryStatusFilter>("all");
  const [categorySort, setCategorySort] = useState<CategorySortOption>("title");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");
  const [errorFilter, setErrorFilter] = useState<"all" | "with_errors" | "only_success">("all");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [copiedSkuIndex, setCopiedSkuIndex] = useState<number | null>(null);
  const [copiedRuntimeField, setCopiedRuntimeField] = useState<string | null>(null);
  const [runtimeCopyErrorField, setRuntimeCopyErrorField] = useState<string | null>(null);
  const [tableStatusPhase, setTableStatusPhase] = useState<"pending" | "processing" | "result">("pending");
  const [selectedCategoryRowIndexes, setSelectedCategoryRowIndexes] = useState<number[]>([]);
  const [bulkCategoryValue, setBulkCategoryValue] = useState("");
  const [isBulkCategoryDrawerOpen, setIsBulkCategoryDrawerOpen] = useState(false);
  const [confirmedCategoryRowIndexes, setConfirmedCategoryRowIndexes] = useState<number[]>([]);
  const [skippedCategoryRowIndexes, setSkippedCategoryRowIndexes] = useState<number[]>([]);
  const [categoryChangeHistoryByIndex, setCategoryChangeHistoryByIndex] = useState<Record<number, CategoryChangeEvent[]>>({});
  const [categoryCommentsByIndex, setCategoryCommentsByIndex] = useState<Record<number, string>>({});
  const [editingCategoryIndex, setEditingCategoryIndex] = useState<number | null>(null);
  const [detailsCategoryIndex, setDetailsCategoryIndex] = useState<number | null>(null);
  const [approvedComparisonRowIndexes, setApprovedComparisonRowIndexes] = useState<number[]>([]);
  const [rejectedReviewRowIndexes, setRejectedReviewRowIndexes] = useState<number[]>([]);
  const [selectedReviewRowIndexes, setSelectedReviewRowIndexes] = useState<number[]>([]);
  const imageGenerationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [bulkModifiedRowIndexes, setBulkModifiedRowIndexes] = useState<number[]>([]);
  const [bulkToast, setBulkToast] = useState<{ message: string; error: boolean } | null>(null);
  const [reviewQueueFilter, setReviewQueueFilter] = useState<ReviewQueueFilter>("all");
  const [reviewSearchQuery, setReviewSearchQuery] = useState("");
  const [isErrorDrawerOpen, setIsErrorDrawerOpen] = useState(false);
  const [taskProgress, setTaskProgress] = useState<TaskProgress>({ total: 0, completed: 0, percent: 0 });
  const [preparationCounts, setPreparationCounts] = useState({ source: 0, mapped: 0, payload: 0 });
  const [realtimeMode, setRealtimeMode] = useState<"websocket" | "polling">("websocket");
  const productsDraftSaveSkippedRef = useRef(false);
  const serverDraftRestoreAttemptedRef = useRef(false);
  const liveCategoryRowsCountRef = useRef(0);
  const taskProgressSnapshotRef = useRef({ step: "", completed: 0, percent: 0 });
  const reviewSearchRef = useRef<HTMLInputElement>(null);
  const bulkAttributeEdit = useBulkAttributeEdit();

  useEffect(() => {
    if (!bulkToast) return;
    const timer = window.setTimeout(() => setBulkToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [bulkToast]);

  function setUiMessage(nextMessage: string) {
    setMessage(sanitizeUiMessage(nextMessage));
  }

  function progressTitle(step: string) {
    if (step === "building_category_preview") return "AI выбирает parent category";
    if (step === "saving_snapshot") return "Сохраняю готовые категории";
    if (step === "ai_enrichment_in_progress" || step === "ai_enrichment_queued") return "Создание товаров через AI";
    if (step === "otto_create_queued" || step === "otto_create_in_progress") return "Отправка в OTTO";
    if (step === "availability_in_progress") return "Отправка availability";
    return "Подготовка данных";
  }

  function applyFrontendDraft(parsed: PrepareStatusResponse, options?: { preserveWorkflowStep?: boolean }) {
    const frontendDraft = asRecord((parsed as Record<string, unknown>)?.frontend_draft);
    if (Object.keys(frontendDraft).length === 0) return;

    const storedSelectedIndex = Number(frontendDraft.selectedIndex ?? 0);
    const storedWorkflowStep = String(frontendDraft.workflowStep ?? "");
    const storedAiCategoryByIndex = asRecord(frontendDraft.aiCategoryByIndex) as Record<number, AiCategoryReview>;
    const storedConfirmedRows = Array.isArray(frontendDraft.confirmedCategoryRowIndexes)
      ? (frontendDraft.confirmedCategoryRowIndexes as number[])
      : [];
    const storedApprovedComparisonRows = Array.isArray(frontendDraft.approvedComparisonRowIndexes)
      ? (frontendDraft.approvedComparisonRowIndexes as number[])
      : [];
    const storedRejectedReviewRows = Array.isArray(frontendDraft.rejectedReviewRowIndexes)
      ? (frontendDraft.rejectedReviewRowIndexes as number[])
      : [];
    const storedBulkModifiedRows = Array.isArray(frontendDraft.bulkModifiedRowIndexes)
      ? (frontendDraft.bulkModifiedRowIndexes as number[])
      : [];
    const storedSkippedRows = Array.isArray(frontendDraft.skippedCategoryRowIndexes)
      ? (frontendDraft.skippedCategoryRowIndexes as number[])
      : [];
    const storedCategoryHistory = asRecord(frontendDraft.categoryChangeHistoryByIndex) as Record<number, CategoryChangeEvent[]>;
    const storedCategoryComments = asRecord(frontendDraft.categoryCommentsByIndex) as Record<number, string>;
    const storedOttoErrors = Array.isArray(frontendDraft.ottoErrors)
      ? (frontendDraft.ottoErrors as OttoErrorRow[])
      : [];
    const storedSummary = asRecord(frontendDraft.ottoSummary);

    setSelectedIndex(Number.isFinite(storedSelectedIndex) ? storedSelectedIndex : 0);
    if (!options?.preserveWorkflowStep && (storedWorkflowStep === "categories" || storedWorkflowStep === "compare" || storedWorkflowStep === "details")) {
      setWorkflowStep(storedWorkflowStep);
    }
    if (Object.keys(storedAiCategoryByIndex).length > 0) {
      setAiCategoryByIndex(storedAiCategoryByIndex);
    }
    setConfirmedCategoryRowIndexes(storedConfirmedRows);
    setSkippedCategoryRowIndexes(storedSkippedRows);
    setCategoryChangeHistoryByIndex(storedCategoryHistory);
    setCategoryCommentsByIndex(storedCategoryComments);
    setApprovedComparisonRowIndexes(storedApprovedComparisonRows);
    setRejectedReviewRowIndexes(storedRejectedReviewRows);
    setBulkModifiedRowIndexes(storedBulkModifiedRows);
    setTableStatusPhase(
      frontendDraft.tableStatusPhase === "processing" || frontendDraft.tableStatusPhase === "result"
        ? frontendDraft.tableStatusPhase
        : "pending",
    );
    setLastSubmitTotal(Number(frontendDraft.lastSubmitTotal ?? 0));
    setOttoProcessId(String(frontendDraft.ottoProcessId ?? ""));
    setOttoErrors(storedOttoErrors);
    if (Object.keys(storedSummary).length > 0) {
      setOttoSummary({
        state: String(storedSummary.state ?? ""),
        total: Number(storedSummary.total ?? 0),
        progress: Number(storedSummary.progress ?? 0),
        succeeded: Number(storedSummary.succeeded ?? 0),
        failed: Number(storedSummary.failed ?? 0),
      });
    }
  }

  function applyProcessUpdate(parsed: PrepareStatusResponse) {
    const nextState = parsed?.process_state ?? "IN_PROGRESS";
    setProcessState(nextState);
    setIssues(Array.isArray(parsed?.issues) ? parsed.issues : []);
    const currentStepName = String(parsed?.current_step ?? "in_progress");
    setCurrentStep(currentStepName);
    setStepElapsed(Number(parsed?.step_elapsed_sec ?? 0));
    setHeartbeatLag(Number(parsed?.heartbeat_lag_sec ?? 0));
    setStuckMessage(parsed?.stuck ? String(parsed?.stuck_message ?? "Процесс завис") : "");
    const nextProgress = {
      total: Number((parsed as Record<string, unknown>)?.progress_total ?? 0),
      completed: Number((parsed as Record<string, unknown>)?.progress_completed ?? 0),
      percent: Number((parsed as Record<string, unknown>)?.progress_percent ?? 0),
    };
    setTaskProgress((previous) => {
      const snapshot = taskProgressSnapshotRef.current;
      const sameStep = snapshot.step === currentStepName;
      const isTransientRollback = sameStep && nextProgress.percent < snapshot.percent && nextProgress.completed <= snapshot.completed;
      if (isTransientRollback) return previous;

      taskProgressSnapshotRef.current = {
        step: currentStepName,
        completed: nextProgress.completed,
        percent: nextProgress.percent,
      };
      return nextProgress;
    });
    setPreparationCounts({
      source: Number(parsed?.source_items ?? 0),
      mapped: Number(parsed?.mapped_items ?? 0),
      payload: Number(parsed?.payload_items ?? (Array.isArray(parsed?.products) ? parsed.products.length : 0)),
    });

    const liveRows = Array.isArray(parsed?.products) ? parsed.products : [];
    if (liveRows.length > 0 && nextState === "IN_PROGRESS") {
      if (currentStepName === "building_category_preview" && liveRows.length < liveCategoryRowsCountRef.current) return;
      if (currentStepName === "building_category_preview") liveCategoryRowsCountRef.current = liveRows.length;
      const nextRows = currentStepName.startsWith("ai_enrichment")
        ? mergeLiveProductRows(liveRows, products)
        : liveRows.map((product) => asRecord(product));
      setProducts(nextRows);
      // Partial products are compacted and can move to another array index while
      // parallel normalization is still running. Rebuild the index-based review
      // map from the same snapshot so stale categories cannot follow old indexes.
      setAiCategoryByIndex(
        Object.fromEntries(
          nextRows.map((product, index) => [index, readAiCategoryReview(asRecord(product))]),
        ),
      );
    }
    if ((nextState === "DONE" || nextState === "FAILED") && (currentStepName === "otto_create_done" || currentStepName === "availability_done" || currentStepName === "otto_create_failed" || currentStepName === "final_validation_failed")) {
      const update = asRecord(parsed?.otto_update_result);
      const failed = asRecord(parsed?.otto_failed_result);
      const failedCount = Number(update.failed ?? 0);
      const succeededCount = Number(update.succeeded ?? 0);
      const ottoPid = String(parsed?.otto_process_id ?? "");
      const availabilityErrors = Array.isArray(parsed?.availability_errors) ? parsed.availability_errors : [];
      setOttoProcessId(ottoPid);
      setOttoSummary({
        state: String(update.state ?? parsed?.otto_create_state ?? ""),
        total: Number(update.total ?? parsed?.products_count ?? 0),
        progress: Number(update.progress ?? 0),
        succeeded: succeededCount,
        failed: failedCount,
      });

      const ottoErrorRows = ottoErrorsFromPayload(failed);
      const nextErrors = availabilityErrors.length > 0 ? (availabilityErrors as OttoErrorRow[]) : ottoErrorRows;
      setOttoErrors(nextErrors);
      setTableStatusPhase("result");

      if (nextState === "FAILED" || failedCount > 0 || nextErrors.length > 0) {
        setState("error");
        const parsedIssues = Array.isArray(parsed?.issues) ? parsed.issues.map((item) => String(item)) : [];
        setIssues(nextErrors.length > 0 ? nextErrors.map((item) => `${item.variation}: ${item.code}: ${item.title}`) : (parsedIssues.length > 0 ? parsedIssues : [`OTTO process ${ottoPid || "-"} failed`]));
        setUiMessage(currentStepName === "availability_done" ? "Availability завершен с ошибками." : "Загрузка завершена с ошибками.");
        return;
      }

      resetCreatorWorkspace("Успешно загружено.", "success");
      void clearBackendProcess(processId);
      return;
    }

    if (nextState === "DONE") {
      const rawRows = Array.isArray(parsed?.products) ? parsed.products : [];
      const rows = currentStepName === "ai_enrichment_done"
        ? mergeLiveProductRows(rawRows, products)
        : rawRows.map((product) => asRecord(product));
      setProducts(rows);
      if (currentStepName === "ai_enrichment_done") {
        applyFrontendDraft(parsed, { preserveWorkflowStep: true });
        setState("success");
        setSelectedIndex((current) => (current >= 0 && current < rows.length ? current : 0));
        setWorkflowStep("compare");
        setTableStatusPhase("pending");
        setApprovedComparisonRowIndexes([]);
        setRejectedReviewRowIndexes([]);
        setSelectedReviewRowIndexes([]);
        setBulkModifiedRowIndexes([]);
        setUiMessage("AI-атрибуты и описания готовы. Сравните с Aftercool и approve-ните товары.");
        return;
      }

      applyFrontendDraft(parsed);
      setAiCategoryByIndex(
        Object.fromEntries(
          rows.map((product, index) => {
            const record = asRecord(product);
            return [
              index,
              readAiCategoryReview(record),
            ];
          }),
        ),
      );
      if (!asRecord((parsed as Record<string, unknown>)?.frontend_draft).aiCategoryByIndex) {
        setSelectedIndex(0);
        setConfirmedCategoryRowIndexes([]);
        setSkippedCategoryRowIndexes([]);
        setCategoryChangeHistoryByIndex({});
        setCategoryCommentsByIndex({});
        setApprovedComparisonRowIndexes([]);
        setWorkflowStep("categories");
        setTableStatusPhase("pending");
      }
      setState("success");
      setUiMessage(`${parsed?.payload_items ?? rows.length} товаров готовы к проверке.`);
    }
    if (nextState === "FAILED") {
      setState("error");
      const failedStep = String(parsed?.current_step ?? "");
      if (parsed?.stuck && (failedStep === "prepare_queued" || failedStep === "ai_enrichment_queued" || failedStep === "otto_create_queued")) {
        setProcessState("IN_PROGRESS");
        setState("loading");
        setRealtimeMode("polling");
        setUiMessage("Процесс ожидает worker. Продолжаю проверять статус...");
        return;
      }
      setUiMessage(failedStep.startsWith("ai_enrichment") ? "Генерация товаров завершилась с ошибкой." : "Подготовка завершилась с ошибкой.");
    }
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CREATOR_DRAFT_KEY);
      if (!raw) {
        setHydratedDraft(true);
        return;
      }
      const draft = JSON.parse(raw) as Record<string, unknown>;
      setController((draft.controller as ControllerOption) ?? "jv");
      setSelectedFabricId(String(draft.selectedFabricId ?? ""));
      setState((draft.state as UploadState) ?? "idle");
      setUiMessage(String(draft.message ?? "Выберите fabric и нажмите «Выставить»."));
      setIssues(Array.isArray(draft.issues) ? (draft.issues as string[]) : []);
      setProcessId(String(draft.processId ?? ""));
      setProcessState(String(draft.processState ?? "IDLE"));
      setWorkflowStep((draft.workflowStep as WorkflowStep) ?? "categories");
      setCurrentStep(String(draft.currentStep ?? "prepare_initializing"));
      setStepElapsed(Number(draft.stepElapsed ?? 0));
      setHeartbeatLag(Number(draft.heartbeatLag ?? 0));
      setStuckMessage(String(draft.stuckMessage ?? ""));
    } catch {
      // ignore broken draft and continue with clean state
    } finally {
      setHydratedDraft(true);
    }
  }, []);

  useEffect(() => {
    if (!hydratedDraft) return;
    const draft = {
      controller,
      selectedFabricId,
      state,
      message,
      issues,
      processId,
      processState,
      workflowStep,
      currentStep,
      stepElapsed,
      heartbeatLag,
      stuckMessage,
    };
    try {
      window.localStorage.setItem(CREATOR_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage failures and continue without browser draft persistence
    }
  }, [
    hydratedDraft,
    controller,
    selectedFabricId,
    state,
    message,
    issues,
    processId,
    processState,
    workflowStep,
    currentStep,
    stepElapsed,
    heartbeatLag,
    stuckMessage,
  ]);

  useEffect(() => {
    if (!hydratedDraft || serverDraftRestoreAttemptedRef.current) return;
    serverDraftRestoreAttemptedRef.current = true;
    let active = true;
    setIsRestoringProcess(true);

    async function restoreLatestWorkspaceTask() {
      try {
        const response = await fetch("/api/products/create-from-fabric/latest", {
          method: "GET",
          cache: "no-store",
        });
        const parsed = await readJsonResponse<PrepareStatusResponse>(response);
        if (!active || !response.ok || !parsed || parsed.success === false || !parsed.process_id) return;

        setProcessId(String(parsed.process_id));
        setController(String((parsed as Record<string, unknown>).controller ?? "jv") as ControllerOption);
        setSelectedFabricId(String((parsed as Record<string, unknown>).factory_id ?? ""));
        applyProcessUpdate(parsed);
        setUiMessage("Восстановлен текущий процесс создания из workspace.");
      } catch {
        // A missing workspace task is a valid clean state.
      } finally {
        if (active) setIsRestoringProcess(false);
      }
    }

    void restoreLatestWorkspaceTask();
    return () => {
      active = false;
      setIsRestoringProcess(false);
    };
  }, [hydratedDraft]);

  useEffect(() => {
    if (!hydratedDraft || !processId || products.length > 0) return;
    let active = true;
    setIsRestoringProcess(true);

    async function restorePersistedTask() {
      try {
        const response = await fetch(`/api/products/create-from-fabric/${encodeURIComponent(processId)}`, {
          method: "GET",
          cache: "no-store",
        });
        const parsed = await readJsonResponse<PrepareStatusResponse>(response);
        if (!active || !response.ok || !parsed || parsed.success === false) return;
        applyProcessUpdate(parsed);
      } catch {
        // ignore restore failures and keep current draft state
      } finally {
        if (active) setIsRestoringProcess(false);
      }
    }

    void restorePersistedTask();
    return () => {
      active = false;
      setIsRestoringProcess(false);
    };
  }, [hydratedDraft, processId, products.length]);

  useEffect(() => {
    if (!hydratedDraft || !processId || products.length === 0) return;
    if (processState === "IN_PROGRESS") return;
    if (!productsDraftSaveSkippedRef.current) {
      productsDraftSaveSkippedRef.current = true;
      return;
    }
    if (currentStep.startsWith("ai_enrichment") && currentStep !== "ai_enrichment_done" && currentStep !== "ai_enrichment_failed") {
      return;
    }
    const timer = window.setTimeout(() => {
      void fetch(`/api/products/create-from-fabric/${encodeURIComponent(processId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          products,
        }),
        cache: "no-store",
      }).catch(() => {
        // keep working locally if draft sync fails temporarily
      });
    }, 1400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    hydratedDraft,
    processId,
    processState,
    products,
  ]);

  useEffect(() => {
    if (!hydratedDraft || !processId || products.length === 0) return;
    const timer = window.setTimeout(() => {
      void fetch(`/api/products/create-from-fabric/${encodeURIComponent(processId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          frontend_draft: {
            aiCategoryByIndex,
            selectedIndex,
            workflowStep,
            confirmedCategoryRowIndexes,
            skippedCategoryRowIndexes,
            categoryChangeHistoryByIndex,
            categoryCommentsByIndex,
            approvedComparisonRowIndexes,
            rejectedReviewRowIndexes,
            bulkModifiedRowIndexes,
            ottoProcessId,
            ottoSummary,
            ottoErrors,
            lastSubmitTotal,
            tableStatusPhase,
          },
        }),
        cache: "no-store",
      }).catch(() => {
        // keep working locally if draft sync fails temporarily
      });
    }, 600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    hydratedDraft,
    processId,
    aiCategoryByIndex,
    selectedIndex,
    workflowStep,
    confirmedCategoryRowIndexes,
    skippedCategoryRowIndexes,
    categoryChangeHistoryByIndex,
    categoryCommentsByIndex,
    approvedComparisonRowIndexes,
    rejectedReviewRowIndexes,
    bulkModifiedRowIndexes,
    ottoProcessId,
    ottoSummary,
    ottoErrors,
    lastSubmitTotal,
    tableStatusPhase,
  ]);

  async function loadFabrics(options?: { silent?: boolean }) {
    const silent = Boolean(options?.silent);
    if (!silent) setIsLoadingFabrics(true);
    try {
      const response = await fetch(`/api/products/fabrics?controller=${encodeURIComponent(controller)}`, { method: "GET", cache: "no-store" });
      const parsed = await readJsonResponse<FabricListResponse>(response);
      if (!response.ok) {
        setFabrics([]);
        setSelectedFabricId("");
        setUiMessage(readApiErrorMessage(parsed, "Не удалось загрузить fabrics", response.status));
        return;
      }
      const items = Array.isArray(parsed?.factory) ? parsed.factory : [];
      setFabrics(items);
      setSelectedFabricId((prev) => (prev && items.some((item) => item.id === prev) ? prev : (items[0]?.id ?? "")));
      setMessage((prev) =>
        prev.includes("Ошибка загрузки списка fabrics")
          ? "Выберите fabric и нажмите «Выставить»."
          : prev,
      );
    } catch {
      setFabrics([]);
      setSelectedFabricId("");
      setUiMessage("Ошибка загрузки списка fabrics.");
    } finally {
      if (!silent) setIsLoadingFabrics(false);
    }
  }

  useEffect(() => {
    void loadFabrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller]);

  async function refreshFabrics() {
    setIsRefreshingFabrics(true);
    setUiMessage("Обновляю factories: очищаю таблицу и загружаю заново...");
    try {
      const response = await fetch("/api/products/fabrics/refresh", {
        method: "POST",
        cache: "no-store",
      });
      const parsed = await readJsonResponse<unknown>(response);
      if (!response.ok) {
        setUiMessage(readApiErrorMessage(parsed, "Не удалось обновить factories", response.status));
        return;
      }
      await loadFabrics({ silent: true });
      setUiMessage("Список fabrics обновлен.");
    } catch (caughtError) {
      setUiMessage(caughtError instanceof Error ? `Ошибка обновления fabrics: ${caughtError.message}` : "Ошибка обновления fabrics.");
    } finally {
      setIsRefreshingFabrics(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadShippingProfiles() {
      try {
        const response = await fetch(`/api/products/shipping-profiles?controller=${encodeURIComponent(controller)}`, {
          method: "GET",
          cache: "no-store",
        });
        const parsed = await readJsonResponse<unknown>(response);
        if (!active) return;
        if (!response.ok) {
          setShippingProfiles([]);
          return;
        }
        const items = parseShippingProfiles(parsed);
        setShippingProfiles(items);
      } catch {
        if (!active) return;
        setShippingProfiles([]);
      }
    }
    void loadShippingProfiles();
    return () => { active = false; };
  }, [controller]);

  useEffect(() => {
    if (shippingProfiles.length === 0 || products.length === 0) return;
    const defaultProfileId = shippingProfiles[0]?.id ?? "";
    if (!defaultProfileId) return;
    setProducts((prev) =>
      prev.map((raw) => {
        const product = asRecord(raw);
        if (productShippingProfileId(product)) return product;
        return { ...product, shippingProfileID: defaultProfileId };
      }),
    );
  }, [shippingProfiles, products.length]);

  useEffect(() => {
    if (!processId || processState !== "IN_PROGRESS") return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/products/create-from-fabric/${processId}`, { method: "GET", cache: "no-store" });
        const parsed = await readJsonResponse<PrepareStatusResponse>(response);
        if (!active || !response.ok || !parsed || parsed?.success === false) return;
        applyProcessUpdate(parsed);
      } catch {
        // WebSocket may still deliver updates; retry polling on the next interval.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1800);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [processId, processState]);

  useEffect(() => {
    if (!processId || processState !== "IN_PROGRESS" || typeof window === "undefined") return;
    setRealtimeMode("websocket");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/v1/products/tasks/create-from-factory/${encodeURIComponent(processId)}/ws`;
    let closedByTerminalState = false;
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(wsUrl);
      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data ?? "")) as PrepareStatusResponse;
          if (parsed?.success === false) return;
          applyProcessUpdate(parsed);
          const nextState = parsed?.process_state ?? "IN_PROGRESS";
          if (nextState === "DONE" || nextState === "FAILED") {
            closedByTerminalState = true;
          }
        } catch {
          // ignore malformed realtime payloads and keep fallback available
        }
      };
      socket.onerror = () => {
        setRealtimeMode("polling");
      };
      socket.onclose = () => {
        if (!closedByTerminalState && processState === "IN_PROGRESS") {
          setRealtimeMode("polling");
        }
      };
    } catch {
      setRealtimeMode("polling");
    }

    return () => {
      if (socket && socket.readyState === WebSocket.OPEN) socket.close();
    };
  }, [processId, processState]);

  const shippingProfileNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of shippingProfiles) map.set(item.id, item.name);
    return map;
  }, [shippingProfiles]);

  const errorCountByVariation = useMemo(() => {
    const map = new Map<string, number>();
    for (const error of ottoErrors) {
      const key = String(error.variation ?? "");
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [ottoErrors]);

  const rows = useMemo(() => products.map((product, index) => {
    const description = asRecord(product.productDescription);
    const pricing = asRecord(product.pricing);
    const standardPrice = asRecord(pricing.standardPrice);
    const profileId = productShippingProfileId(asRecord(product));
    const profileName = shippingProfileNameById.get(profileId) ?? "";
    const rowErrors = errorCountByVariation.get(String(product.sku ?? "")) ?? 0;
    const rowStatus =
      tableStatusPhase === "pending"
        ? "pending"
        : tableStatusPhase === "processing"
          ? "processing"
          : rowErrors > 0
            ? "failed"
            : "passed";
    const title = String(
      product.Artikelbeschreibung ??
      product.TranslatedDescription ??
      description.productLine ??
      product.productReference ??
      product.sku ??
      `Товар ${index + 1}`,
    );
    const aiReview = mergeAiCategoryReview(
      aiCategoryByIndex[index],
      asRecord(product),
    );
    const aiCategory = String(aiReview.category ?? "");
    const aiCategoryGroup = String(aiReview.categoryGroup ?? "");
    const confidence = Number(product.aiCategoryConfidence ?? product.categoryConfidence ?? (aiCategoryGroup ? 100 : 0));
    const sourceCategory = String(
      product.sourceCategory ??
      product.originalCategory ??
      product.Produktkategorie ??
      product.productCategory ??
      "",
    );
    return {
      index,
      image: firstImage(product),
      title,
      sku: String(product.sku ?? ""),
      sourceCategory,
      aiCategory,
      aiCategoryGroup,
      selectedCategory: String(description.category ?? ""),
      confidence: Number.isFinite(confidence) ? confidence : 0,
      shippingProfileId: profileId,
      shippingProfileName: profileName,
      ean: String(product.ean ?? ""),
      productReference: String(product.productReference ?? ""),
      price: String(standardPrice.amount ?? ""),
      productLine: String(description.productLine ?? ""),
      errors: rowErrors,
      status: rowStatus as "passed" | "failed" | "processing" | "pending",
    };
  }), [products, aiCategoryByIndex, errorCountByVariation, tableStatusPhase, shippingProfileNameById]);

  const categoryFilterOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.aiCategoryGroup.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  useEffect(() => {
    if (categoryFilter === "all") return;
    if (categoryFilterOptions.includes(categoryFilter)) return;
    setCategoryFilter("all");
    setPage(1);
  }, [categoryFilter, categoryFilterOptions]);

  const requestedCategoryGroups = useMemo(
    () => Array.from(new Set(rows.map((row) => row.aiCategoryGroup.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  useEffect(() => {
    const missingGroups = requestedCategoryGroups.filter((group) => !categoryOptionsByGroup[group]);
    if (missingGroups.length === 0) return;

    let active = true;
    async function loadCategoryGroupOptions() {
      const params = new URLSearchParams();
      for (const group of missingGroups) params.append("category_group", group);
      try {
        const response = await fetch(`/api/products/category-group-categories?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        const parsed = await readJsonResponse<CategoryGroupCategoriesResponse>(response);
        if (!active || !response.ok) return;
        const nextEntries: Record<string, string[]> = {};
        const nextDisplayByValue: Record<string, string> = {};
        const nextGroupDisplayByValue: Record<string, string> = {};
        const categoriesByGroupKey = new Map<string, string[]>();
        for (const item of Array.isArray(parsed?.items) ? parsed.items : []) {
          const group = String(item.categoryGroup ?? "").trim();
          if (!group) continue;
          nextGroupDisplayByValue[group] = labelWithRu(group, item.categoryGroupRu);
          const categories = Array.isArray(item.categories)
            ? item.categories.filter((category): category is string => typeof category === "string" && category.trim().length > 0)
            : [];
          const options = categories.length > 0 ? categories : [group];
          nextEntries[group] = options;
          categoriesByGroupKey.set(group.toLowerCase(), options);
          if (Array.isArray(item.categoriesDisplay)) {
            for (const displayItem of item.categoriesDisplay) {
              const value = String(displayItem.name ?? "").trim();
              const label = labelWithRu(value, displayItem.nameRu);
              if (value && label) nextDisplayByValue[value] = label;
            }
          }
        }
        for (const group of missingGroups) {
          nextEntries[group] = categoriesByGroupKey.get(group.toLowerCase()) ?? [group];
        }
        setCategoryOptionsByGroup((prev) => ({ ...prev, ...nextEntries }));
        setCategoryDisplayByValue((prev) => ({ ...prev, ...nextDisplayByValue }));
        setCategoryGroupDisplayByValue((prev) => ({ ...prev, ...nextGroupDisplayByValue }));
      } catch {
        if (!active) return;
      }
    }
    void loadCategoryGroupOptions();
    return () => {
      active = false;
    };
  }, [requestedCategoryGroups, categoryOptionsByGroup]);

  const filteredRows = useMemo(() => {
    const query = tableQuery.trim().toLowerCase();
    const skippedSet = new Set(skippedCategoryRowIndexes);
    const confirmedSet = new Set(confirmedCategoryRowIndexes);
    const isCategoryMode = workflowStep === "categories";
    const filtered = rows.filter((row) => {
      if (categoryFilter !== "all" && row.aiCategoryGroup !== categoryFilter) return false;
      const manuallyChanged = row.selectedCategory.trim() !== row.aiCategory.trim();
      const status: CategoryReviewStatus = skippedSet.has(row.index)
        ? "skipped"
        : manuallyChanged
          ? confirmedSet.has(row.index)
            ? "manually_confirmed"
            : "manually_changed"
          : confirmedSet.has(row.index)
            ? "confirmed"
            : "requires_review";
      if (isCategoryMode) {
        if (categoryStatusFilter === "confirmed" && status !== "confirmed" && status !== "manually_confirmed") return false;
        if (categoryStatusFilter !== "all" && categoryStatusFilter !== "confirmed" && status !== categoryStatusFilter) return false;
      }
      if (!query) return true;
      return [row.sku, row.aiCategoryGroup, row.aiCategory, row.selectedCategory, row.title, row.productReference, row.productLine, row.ean, row.sourceCategory]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
    if (!isCategoryMode) return filtered;
    return [...filtered].sort((a, b) => {
      if (categorySort === "title") return a.title.localeCompare(b.title);
      const statusOrder: Record<CategoryReviewStatus, number> = {
        requires_review: 0,
        manually_changed: 1,
        skipped: 2,
        confirmed: 3,
        manually_confirmed: 3,
      };
      const statusFor = (row: CategoryCheckRow): CategoryReviewStatus => {
        const manuallyChanged = row.selectedCategory.trim() !== row.aiCategory.trim();
        if (skippedSet.has(row.index)) return "skipped";
        if (manuallyChanged) return confirmedSet.has(row.index) ? "manually_confirmed" : "manually_changed";
        return confirmedSet.has(row.index) ? "confirmed" : "requires_review";
      };
      return statusOrder[statusFor(a)] - statusOrder[statusFor(b)];
    });
  }, [
    rows,
    tableQuery,
    categoryFilter,
    workflowStep,
    skippedCategoryRowIndexes,
    confirmedCategoryRowIndexes,
    categoryStatusFilter,
    categorySort,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paginationItems = buildPagination(safePage, totalPages);
  const selectedCategoryIndexSet = useMemo(() => new Set(selectedCategoryRowIndexes), [selectedCategoryRowIndexes]);
  const confirmedCategoryIndexSet = useMemo(() => new Set(confirmedCategoryRowIndexes), [confirmedCategoryRowIndexes]);
  const skippedCategoryIndexSet = useMemo(() => new Set(skippedCategoryRowIndexes), [skippedCategoryRowIndexes]);
  const rowByIndex = useMemo(() => {
    const map = new Map<number, (typeof rows)[number]>();
    for (const row of rows) map.set(row.index, row);
    return map;
  }, [rows]);
  const selectedCategoryGroups = useMemo(
    () =>
      Array.from(
        new Set(
          selectedCategoryRowIndexes
            .map((index) => rowByIndex.get(index)?.aiCategoryGroup.trim() ?? "")
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [rowByIndex, selectedCategoryRowIndexes],
  );
  const bulkCategoryOptions = useMemo(() => {
    if (selectedCategoryGroups.length !== 1) return [];
    return categoryOptionsByGroup[selectedCategoryGroups[0]] ?? [];
  }, [categoryOptionsByGroup, selectedCategoryGroups]);
  const allFilteredRowsSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedCategoryIndexSet.has(row.index));
  const missingCategoryCount = rows.filter((row) => !skippedCategoryIndexSet.has(row.index) && !row.selectedCategory.trim()).length;
  const isEnrichmentLoading = processState === "IN_PROGRESS" && currentStep.startsWith("ai_enrichment");
  const isOttoSubmitLoading =
    processState === "IN_PROGRESS" &&
    (currentStep.startsWith("otto_create") || currentStep.startsWith("availability"));
  const isCategoryStage = !isEnrichmentLoading && !isOttoSubmitLoading && workflowStep === "categories" && (products.length > 0 || processState === "IN_PROGRESS");
  const selectedConfirmableCount = useMemo(
    () =>
      selectedCategoryRowIndexes.filter((index) => {
        const row = rowByIndex.get(index);
        return Boolean(row?.selectedCategory.trim()) && !skippedCategoryIndexSet.has(index);
      }).length,
    [rowByIndex, selectedCategoryRowIndexes, skippedCategoryIndexSet],
  );
  const categoryRowStatuses = useMemo<Record<number, CategoryReviewStatus>>(
    () =>
      Object.fromEntries(
        rows.map((row) => {
          if (skippedCategoryIndexSet.has(row.index)) {
            return [row.index, "skipped"];
          }
          const manuallyChanged = row.selectedCategory.trim() !== row.aiCategory.trim();
          const isConfirmed = confirmedCategoryIndexSet.has(row.index);
          const status: CategoryReviewStatus = manuallyChanged
            ? isConfirmed
              ? "manually_confirmed"
              : "manually_changed"
            : isConfirmed
              ? "confirmed"
              : "requires_review";
          return [row.index, status];
        }),
      ),
    [rows, confirmedCategoryIndexSet, skippedCategoryIndexSet],
  );
  const categoryKpis = useMemo(() => {
    let confirmed = 0;
    let requiresReview = 0;
    let manuallyChanged = 0;
    let skipped = 0;
    for (const row of rows) {
      const status = categoryRowStatuses[row.index];
      if (status === "confirmed" || status === "manually_confirmed") confirmed += 1;
      if (status === "manually_changed") manuallyChanged += 1;
      if (status === "requires_review") requiresReview += 1;
      if (status === "skipped") skipped += 1;
    }
    return {
      total: rows.length,
      confirmed,
      requiresReview,
      manuallyChanged,
      skipped,
    };
  }, [rows, categoryRowStatuses]);

  useEffect(() => {
    if (!bulkCategoryValue) return;
    if (!bulkCategoryOptions.includes(bulkCategoryValue)) {
      setBulkCategoryValue("");
    }
  }, [bulkCategoryOptions, bulkCategoryValue]);

  const selectedProduct = asRecord(products[selectedIndex]);
  const editingCategoryRow = editingCategoryIndex === null ? null : rowByIndex.get(editingCategoryIndex) ?? null;
  const detailsCategoryRow = detailsCategoryIndex === null ? null : rowByIndex.get(detailsCategoryIndex) ?? null;
  const detailsCategoryStatus = detailsCategoryIndex === null ? "requires_review" : categoryRowStatuses[detailsCategoryIndex] ?? "requires_review";
  const detailsCategoryPosition = detailsCategoryIndex === null ? -1 : filteredRows.findIndex((row) => row.index === detailsCategoryIndex);
  const navigateCategoryDetails = (position: number) => {
    const target = filteredRows[position];
    if (!target) return;
    setDetailsCategoryIndex(target.index);
    setSelectedIndex(target.index);
    setPage(Math.floor(position / pageSize) + 1);
  };
  const selectedAftercoolData = productAftercoolData(selectedProduct);
  const approvedComparisonIndexSet = useMemo(() => new Set(approvedComparisonRowIndexes), [approvedComparisonRowIndexes]);
  const rejectedReviewIndexSet = useMemo(() => new Set(rejectedReviewRowIndexes), [rejectedReviewRowIndexes]);
  const bulkModifiedIndexSet = useMemo(() => new Set(bulkModifiedRowIndexes), [bulkModifiedRowIndexes]);
  const comparisonApprovedCount = rows.filter((row) => approvedComparisonIndexSet.has(row.index)).length;
  const allComparisonsApproved = rows.length > 0 && comparisonApprovedCount === rows.length;
  const reviewRows = useMemo<ProductReviewRow[]>(() => {
    const query = reviewSearchQuery.trim().toLowerCase();
    return rows
      .map((row) => {
        const reviewStatus: ProductReviewStatus = rejectedReviewIndexSet.has(row.index)
          ? "rejected"
          : approvedComparisonIndexSet.has(row.index)
              ? "approved"
              : bulkModifiedIndexSet.has(row.index) || (categoryChangeHistoryByIndex[row.index]?.length ?? 0) > 0
                  ? "modified"
                  : "pending";
        return { ...row, reviewStatus };
      })
      .filter((row) => {
        if (reviewQueueFilter !== "all" && row.reviewStatus !== reviewQueueFilter) return false;
        if (!query) return true;
        return [row.sku, row.ean, row.title, row.productReference].join(" ").toLowerCase().includes(query);
      });
  }, [rows, reviewSearchQuery, reviewQueueFilter, rejectedReviewIndexSet, approvedComparisonIndexSet, bulkModifiedIndexSet, categoryChangeHistoryByIndex]);
  const selectedReviewStatus: ProductReviewStatus = rejectedReviewIndexSet.has(selectedIndex)
    ? "rejected"
    : approvedComparisonIndexSet.has(selectedIndex)
        ? "approved"
        : bulkModifiedIndexSet.has(selectedIndex) || (categoryChangeHistoryByIndex[selectedIndex]?.length ?? 0) > 0
            ? "modified"
            : "pending";
  const selectedReviewRowForRender = useMemo<ProductReviewRow | null>(() => {
    const row = rowByIndex.get(selectedIndex);
    return row ? { ...row, reviewStatus: selectedReviewStatus } : null;
  }, [rowByIndex, selectedIndex, selectedReviewStatus]);
  const selectedAttributeCategory = selectedReviewRowForRender?.selectedCategory || selectedReviewRowForRender?.aiCategory || "";
  const selectedAttributeCategoryGroup = selectedReviewRowForRender?.aiCategoryGroup || "";
  const selectedSku = normalizeSku(String(selectedProduct.sku ?? ""));
  const selectedShippingProfileId = productShippingProfileId(selectedProduct);
  const selectedDescription = asRecord(selectedProduct.productDescription);
  const selectedPricing = asRecord(selectedProduct.pricing);
  const selectedStandardPrice = asRecord(selectedPricing.standardPrice);
  const selectedCurrency = String(selectedStandardPrice.currency ?? selectedPricing.currency ?? "").trim();
  const selectedCurrencyLabel = selectedCurrency.toUpperCase() === "EUR" ? "€" : selectedCurrency;
  const selectedImage = firstImage(selectedProduct);
  const selectedBulletPoints = Array.isArray(selectedDescription.bulletPoints)
    ? selectedDescription.bulletPoints.map((item) => String(item))
    : [];
  const selectedAttributes = Array.isArray(selectedDescription.attributes)
    ? selectedDescription.attributes
    : [];

  useEffect(() => {
    setEditingOverviewField(null);
  }, [selectedIndex]);
  const categoryAttributeByName = useMemo(() => {
    const map = new Map<string, CategoryAttributeOption>();
    for (const option of categoryAttributes) {
      const key = normalizeFieldToken(option.name);
      if (key) map.set(key, option);
    }
    return map;
  }, [categoryAttributes]);
  const attributeCards = useMemo(() => {
    return selectedAttributes.map((item, index) => {
      const attr = asRecord(item);
      const name = String(attr.name ?? "");
      const option = categoryAttributeByName.get(normalizeFieldToken(name));
      const rawValues = Array.isArray(attr.values) ? attr.values.map((value) => String(value)) : [];
      const values = rawValues.join(", ");
      const variantKind: AttributeCard["variantKind"] = isColorVariantAttribute(name) ? "color" : isMaterialVariantAttribute(name) ? "material" : null;
      const displayValues = option
        ? rawValues.map((value) => attributeAllowedValueLabel(option, value) || value).join(", ")
        : values;
      return {
        index,
        name,
        displayName: option ? attributeDisplayName(option) : name,
        values,
        valueList: rawValues,
        displayValues,
        allowedValues: option?.allowedValues ?? [],
        multiValue: Boolean(option?.multiValue),
        variantKind,
        option,
        group: readAttributeGroup(name),
        layout: attributeFieldLayout(name),
        controlKind: attributeControlKind(name, values),
        sortRank: attributeLayoutRank(name),
      };
    });
  }, [selectedAttributes, categoryAttributeByName]);
  const parsedOttoErrors = useMemo<ParsedSkuError[]>(() => {
    return ottoErrors.map((item) => {
      const jsonPath = String(item.jsonPath ?? "");
      const byNameSingle = jsonPath.match(/@name='([^']+)'/);
      const byNameDouble = jsonPath.match(/@name==\"([^\"]+)\"/);
      const field = byNameSingle?.[1] ?? byNameDouble?.[1] ?? jsonPath;
      return {
        sku: normalizeSku(item.variation),
        code: String(item.code ?? "error"),
        message: String(item.title ?? item.code ?? "Unknown error"),
        field: String(field || "Неизвестное поле"),
        jsonPath,
      };
    });
  }, [ottoErrors]);
  const selectedProductErrors = useMemo(() => {
    return parsedOttoErrors.filter((item) => item.sku === selectedSku);
  }, [parsedOttoErrors, selectedSku]);
  const selectedErrorFieldTokens = useMemo(() => {
    const tokens: string[] = [];
    for (const item of selectedProductErrors) {
      const fieldToken = normalizeFieldToken(item.field);
      if (fieldToken) tokens.push(fieldToken);
      const pathToken = normalizeFieldToken(item.jsonPath);
      if (pathToken) tokens.push(pathToken);
    }
    return tokens;
  }, [selectedProductErrors]);
  const invalidAttributeNames = useMemo(() => new Set(attributeCards
    .filter((attribute) => {
      const name = normalizeFieldToken(attribute.name);
      return name && selectedErrorFieldTokens.some((token) => token.includes(name) || name.includes(token));
    })
    .map((attribute) => normalizeFieldToken(attribute.name))), [attributeCards, selectedErrorFieldTokens]);
  const bulkAttributeOptions = useMemo(() => {
    const byIdentity = new Map<string, CategoryAttributeOption>();
    for (const option of categoryAttributes) {
      const identity = String(option.attributeId ?? option.id ?? option.attributeKey ?? normalizeFieldToken(option.name));
      if (option.name && identity) byIdentity.set(identity, option);
    }
    for (const productIndex of selectedReviewRowIndexes) {
      const description = asRecord(asRecord(products[productIndex]).productDescription);
      const attributes = Array.isArray(description.attributes) ? description.attributes : [];
      for (const item of attributes) {
        const attribute = asRecord(item);
        const name = String(attribute.name ?? "").trim();
        if (!name) continue;
        const attributeId = String(attribute.attribute_id ?? attribute.attributeId ?? "").trim() || undefined;
        const attributeKey = String(attribute.attribute_key ?? attribute.attributeKey ?? "").trim() || undefined;
        const identity = attributeId ?? attributeKey ?? normalizeFieldToken(name);
        if (!byIdentity.has(identity)) {
          byIdentity.set(identity, { name, attributeId, attributeKey, unit: String(attribute.unit ?? "").trim() || undefined });
        }
      }
    }
    const rank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return Array.from(byIdentity.values()).sort((left, right) => {
      const priority = (rank[String(left.relevance ?? "LOW").toUpperCase()] ?? 3) - (rank[String(right.relevance ?? "LOW").toUpperCase()] ?? 3);
      return priority || left.name.localeCompare(right.name);
    });
  }, [categoryAttributes, products, selectedReviewRowIndexes]);
  const errorCardsBySku = useMemo(() => {
    const grouped: Record<string, ParsedSkuError[]> = {};
    for (const item of parsedOttoErrors) {
      if (!grouped[item.sku]) grouped[item.sku] = [];
      grouped[item.sku].push(item);
    }
    return Object.entries(grouped).map(([sku, list]) => ({
      sku,
      items: list,
      count: list.length,
      firstMessage: list[0]?.message ?? "Ошибка",
      fields: Array.from(new Set(list.map((entry) => entry.field).filter(Boolean))),
    }));
  }, [parsedOttoErrors]);
  const kpiTotal = useMemo(() => {
    const candidate = lastSubmitTotal > 0 ? lastSubmitTotal : rows.length;
    return Math.max(0, candidate);
  }, [lastSubmitTotal, rows.length]);
  const kpiFailed = useMemo(() => {
    const summaryFailed = Number(ottoSummary?.failed ?? 0);
    const failedProducts = errorCardsBySku.length;
    const candidate = Math.max(summaryFailed, failedProducts, 0);
    return Math.min(kpiTotal, candidate);
  }, [ottoSummary?.failed, errorCardsBySku.length, kpiTotal]);
  const kpiSucceeded = useMemo(() => Math.max(0, kpiTotal - kpiFailed), [kpiTotal, kpiFailed]);
  const visibleGenericIssues = useMemo(() => {
    if (issues.length === 0) return [];
    const coveredPairs = new Set(
      parsedOttoErrors.map((item) => `${item.sku}:${item.code}`.toLowerCase()),
    );
    return issues.filter((item) => {
      const raw = String(item ?? "").trim().toLowerCase();
      if (!raw) return false;
      const normalized = raw.replace(/\s+/g, "");
      const normalizedCovered = new Set(
        Array.from(coveredPairs).map((pair) => pair.replace(/\s+/g, "")),
      );
      return !normalizedCovered.has(normalized);
    });
  }, [issues, parsedOttoErrors]);

  useEffect(() => {
    setEditingAttribute(null);
    setEditingDraft("");
    setNewAttributeName("");
    setNewAttributeValue("");
  }, [selectedIndex]);

  useEffect(() => {
    if (workflowStep === "categories") return;
    let active = true;
    async function loadCategoryAttributes() {
      if (!selectedAttributeCategory && !selectedAttributeCategoryGroup) {
        setCategoryAttributes([]);
        setCategoryAttributesError("");
        return;
      }
      setIsLoadingCategoryAttributes(true);
      setCategoryAttributesError("");
      try {
        const params = new URLSearchParams();
        if (selectedAttributeCategory) params.set("category", selectedAttributeCategory);
        if (selectedAttributeCategoryGroup) params.set("category_group", selectedAttributeCategoryGroup);
        const response = await fetch(`/api/products/category-attributes?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        const parsed = await readJsonResponse<CategoryAttributesResponse>(response);
        if (!active) return;
        if (!response.ok) {
          setCategoryAttributes([]);
          setCategoryAttributesError(readApiErrorMessage(parsed, "Could not load category attributes."));
          return;
        }
        const items = Array.isArray(parsed?.items) ? parsed.items : [];
        setCategoryAttributes(items.filter((item) => item.name));
      } catch {
        if (!active) return;
        setCategoryAttributes([]);
        setCategoryAttributesError("Could not load category attributes.");
      } finally {
        if (active) setIsLoadingCategoryAttributes(false);
      }
    }
    void loadCategoryAttributes();
    return () => {
      active = false;
    };
  }, [workflowStep, selectedAttributeCategory, selectedAttributeCategoryGroup]);

  useEffect(() => {
    if (workflowStep === "categories") return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isTyping = tagName === "input" || tagName === "textarea" || tagName === "select" || target?.isContentEditable;
      if (event.ctrlKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        reviewSearchRef.current?.focus();
        return;
      }
      if (isTyping) return;
      if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        approveReviewProduct(selectedIndex);
      }
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        rejectReviewProduct(selectedIndex);
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveReviewDraft();
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) => {
          const currentPosition = reviewRows.findIndex((row) => row.index === current);
          if (currentPosition <= 0) return reviewRows[0]?.index ?? current;
          return reviewRows[currentPosition - 1].index;
        });
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) => {
          const currentPosition = reviewRows.findIndex((row) => row.index === current);
          if (currentPosition < 0) return reviewRows[0]?.index ?? current;
          return reviewRows[Math.min(reviewRows.length - 1, currentPosition + 1)]?.index ?? current;
        });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [workflowStep, selectedIndex, reviewRows, selectedReviewRowIndexes]);

  async function copyText(value: string, field: string) {
    if (!value || value === "-") {
      setRuntimeCopyErrorField(field);
      window.setTimeout(() => setRuntimeCopyErrorField((current) => (current === field ? null : current)), 1200);
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedRuntimeField(field);
      setRuntimeCopyErrorField(null);
      window.setTimeout(() => setCopiedRuntimeField((current) => (current === field ? null : current)), 1600);
    } catch {
      setRuntimeCopyErrorField(field);
      window.setTimeout(() => setRuntimeCopyErrorField((current) => (current === field ? null : current)), 1200);
    }
  }

  function persistProductsDraftNow(nextProducts: Record<string, unknown>[]) {
    if (!hydratedDraft || !processId || nextProducts.length === 0) return;
    if (processState === "IN_PROGRESS") return;
    productsDraftSaveSkippedRef.current = true;
    void fetch(`/api/products/create-from-fabric/${encodeURIComponent(processId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        products: nextProducts,
      }),
      cache: "no-store",
    }).catch(() => {
      // Debounced autosave will retry later.
    });
  }

  function updateSelected(path: string[], value: string) {
    setProducts((prev) => {
      const next = [...prev];
      next[selectedIndex] = updateProductField(asRecord(next[selectedIndex]), path, value);
      return next;
    });
  }

  function updateSelectedTitle(value: string) {
    setProducts((prev) => {
      const next = [...prev];
      next[selectedIndex] = updateProductTitle(asRecord(next[selectedIndex]), value);
      return next;
    });
  }

  function updateRowShippingProfile(rowIndex: number, profileId: string) {
    setProducts((prev) => {
      const next = [...prev];
      next[rowIndex] = { ...asRecord(next[rowIndex]), shippingProfileID: profileId };
      return next;
    });
  }

  function updateRowCategory(rowIndex: number, category: string) {
    setProducts((prev) => {
      const next = [...prev];
      const current = asRecord(next[rowIndex]);
      next[rowIndex] = updateProductField(current, ["productDescription", "category"], category);
      return next;
    });
    setConfirmedCategoryRowIndexes((prev) => prev.filter((item) => item !== rowIndex));
    setSkippedCategoryRowIndexes((prev) => prev.filter((item) => item !== rowIndex));
  }

  function toggleCategorySelection(rowIndex: number) {
    setSelectedCategoryRowIndexes((prev) =>
      prev.includes(rowIndex) ? prev.filter((item) => item !== rowIndex) : [...prev, rowIndex],
    );
  }

  function toggleAllFilteredRows() {
    setSelectedCategoryRowIndexes((prev) => {
      if (allFilteredRowsSelected) {
        return prev.filter((item) => !filteredRows.some((row) => row.index === item));
      }
      const next = new Set(prev);
      for (const row of filteredRows) next.add(row.index);
      return Array.from(next).sort((a, b) => a - b);
    });
  }

  function applyBulkCategory() {
    if (!bulkCategoryValue || selectedCategoryRowIndexes.length === 0) return;
    if (!bulkCategoryOptions.includes(bulkCategoryValue)) return;
    const selectedSet = new Set(selectedCategoryRowIndexes);
    setProducts((prev) =>
      prev.map((item, index) =>
        selectedSet.has(index)
          ? updateProductField(asRecord(item), ["productDescription", "category"], bulkCategoryValue)
          : item,
      ),
    );
    setConfirmedCategoryRowIndexes((prev) => prev.filter((item) => !selectedSet.has(item)));
    setUiMessage(`Категория применена к ${selectedCategoryRowIndexes.length} товарам.`);
    setIsBulkCategoryDrawerOpen(false);
  }

  function confirmCategoryRows(rowIndexes: number[]) {
    if (rowIndexes.length === 0) return;
    const eligible = rowIndexes.filter((index) => {
      const row = rows.find((item) => item.index === index);
      if (!row) return false;
      return row.selectedCategory.trim().length > 0 && !skippedCategoryIndexSet.has(index);
    });
    if (eligible.length === 0) return;
    setConfirmedCategoryRowIndexes((prev) => Array.from(new Set([...prev, ...eligible])).sort((a, b) => a - b));
    setSelectedCategoryRowIndexes((prev) => prev.filter((item) => !eligible.includes(item)));
    setUiMessage(`Подтверждено категорий: ${eligible.length}.`);
  }

  function skipCategoryRows(rowIndexes: number[]) {
    if (rowIndexes.length === 0) return;
    setSkippedCategoryRowIndexes((prev) => Array.from(new Set([...prev, ...rowIndexes])).sort((a, b) => a - b));
    setConfirmedCategoryRowIndexes((prev) => prev.filter((item) => !rowIndexes.includes(item)));
    setSelectedCategoryRowIndexes((prev) => prev.filter((item) => !rowIndexes.includes(item)));
    setUiMessage(`Пропущено товаров: ${rowIndexes.length}.`);
  }

  function unconfirmCategoryRows(rowIndexes: number[]) {
    if (rowIndexes.length === 0) return;
    const confirmedIndexes = rowIndexes.filter((index) => confirmedCategoryIndexSet.has(index));
    if (confirmedIndexes.length === 0) return;
    const confirmedSet = new Set(confirmedIndexes);
    setConfirmedCategoryRowIndexes((prev) => prev.filter((item) => !confirmedSet.has(item)));
    setUiMessage(`Снято подтверждение с категорий: ${confirmedIndexes.length}.`);
  }

  function saveCategoryEdit(rowIndex: number, category: string, comment: string) {
    const row = rowByIndex.get(rowIndex);
    if (!row || !category.trim()) return;
    const previous = row.selectedCategory || row.aiCategory || "";
    updateRowCategory(rowIndex, category.trim());
    setCategoryCommentsByIndex((prev) => ({ ...prev, [rowIndex]: comment.trim() }));
    setCategoryChangeHistoryByIndex((prev) => ({
      ...prev,
      [rowIndex]: [
        ...(prev[rowIndex] ?? []),
        {
          at: new Date().toISOString(),
          by: currentUser?.email ?? "unknown",
          from: previous,
          to: category.trim(),
          comment: comment.trim() || undefined,
        },
      ],
    }));
    setEditingCategoryIndex(null);
    setUiMessage("Категория изменена. Подтвердите товар в таблице.");
  }

  function setComparisonApproved(rowIndex: number, approved: boolean) {
    setApprovedComparisonRowIndexes((prev) => {
      const next = new Set(prev);
      if (approved) next.add(rowIndex);
      else next.delete(rowIndex);
      return Array.from(next).sort((a, b) => a - b);
    });
    setProducts((prev) => {
      const next = [...prev];
      const product = asRecord(next[rowIndex]);
      const comparison = asRecord(product.aftercoolComparison);
      next[rowIndex] = {
        ...product,
        aftercoolComparison: {
          ...comparison,
          approved,
        },
      };
      return next;
    });
  }

  function approveReviewProduct(rowIndex: number) {
    if (rowIndex < 0 || rowIndex >= products.length) return;
    setRejectedReviewRowIndexes((prev) => prev.filter((item) => item !== rowIndex));
    setBulkModifiedRowIndexes((prev) => prev.filter((item) => item !== rowIndex));
    setComparisonApproved(rowIndex, true);
  }

  function rejectReviewProduct(rowIndex: number) {
    if (rowIndex < 0 || rowIndex >= products.length) return;
    setComparisonApproved(rowIndex, false);
    setRejectedReviewRowIndexes((prev) => Array.from(new Set([...prev, rowIndex])).sort((a, b) => a - b));
    setUiMessage("Товар помечен как rejected.");
  }

  function saveReviewDraft() {
    setUiMessage("Draft сохранен локально и синхронизируется с процессом.");
  }

  function toggleReviewSelection(rowIndex: number) {
    setSelectedReviewRowIndexes((prev) =>
      prev.includes(rowIndex) ? prev.filter((item) => item !== rowIndex) : [...prev, rowIndex].sort((a, b) => a - b),
    );
  }

  function approveSelectedReviewProducts() {
    for (const index of selectedReviewRowIndexes) approveReviewProduct(index);
    setSelectedReviewRowIndexes([]);
  }

  function rejectSelectedReviewProducts() {
    for (const index of selectedReviewRowIndexes) rejectReviewProduct(index);
    setSelectedReviewRowIndexes([]);
  }

  function applyBulkAttributeChanges(attributes: BulkAttributePatch[]) {
    const result = bulkUpsertProductAttributes(products, selectedReviewRowIndexes, attributes);
    setProducts(result.products);
    if (result.updatedIndexes.length > 0) {
      setBulkModifiedRowIndexes((current) => Array.from(new Set([...current, ...result.updatedIndexes])).sort((left, right) => left - right));
      setRejectedReviewRowIndexes((current) => current.filter((index) => !result.updatedIndexes.includes(index)));
      setApprovedComparisonRowIndexes((current) => current.filter((index) => !result.updatedIndexes.includes(index)));
    }
    bulkAttributeEdit.reset();
    if (result.failures.length === 0) {
      const successMessage = `Updated ${result.updatedIndexes.length} products successfully.`;
      setUiMessage(successMessage);
      setBulkToast({ message: successMessage, error: false });
    } else {
      const details = result.failures.map((failure) => `#${failure.productIndex + 1}: ${failure.reason}`).join("; ");
      const partialMessage = `Updated ${result.updatedIndexes.length} of ${selectedReviewRowIndexes.length} products. ${result.failures.length} failed. ${details}`;
      setUiMessage(partialMessage);
      setBulkToast({ message: partialMessage, error: true });
    }
  }

  function fieldHasError(keywords: string[]): boolean {
    const lowered = keywords.map((item) => normalizeFieldToken(item));
    return selectedErrorFieldTokens.some((token) =>
      lowered.some((keyword) => token.includes(keyword) || keyword.includes(token)),
    );
  }

  function updateAttributeField(attributeIndex: number, field: AttributeEditField, nextValue: string) {
    setProducts((prev) => {
      const copy = [...prev];
      const current = asRecord(copy[selectedIndex]);
      const desc = asRecord(current.productDescription);
      const attrs = Array.isArray(desc.attributes) ? [...desc.attributes] : [];
      const nextAttr = asRecord(attrs[attributeIndex]);
      attrs[attributeIndex] = {
        ...nextAttr,
        values: nextValue
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      };
      copy[selectedIndex] = updateProductField(
        current,
        ["productDescription", "attributes"],
        attrs,
      );
      return copy;
    });
  }

  function startAttributeEdit(attributeIndex: number, field: AttributeEditField, sourceValue: string) {
    setEditingAttribute({ index: attributeIndex, field });
    setEditingDraft(sourceValue);
  }

  function saveAttributeEdit(attributeIndex?: number, value?: string) {
    if (typeof attributeIndex === "number") {
      updateAttributeField(attributeIndex, "values", value ?? "");
      setEditingAttribute(null);
      setEditingDraft("");
      return;
    }
    if (!editingAttribute) return;
    updateAttributeField(editingAttribute.index, editingAttribute.field, editingDraft);
    setEditingAttribute(null);
    setEditingDraft("");
  }

  function cancelAttributeEdit() {
    setEditingAttribute(null);
    setEditingDraft("");
  }

  function addAttribute() {
    const name = newAttributeName.trim();
    const values = newAttributeValue
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!name || values.length === 0) return;
    const option = categoryAttributes.find((item) => item.name.toLowerCase() === name.toLowerCase()) ?? null;
    setProducts((prev) => {
      const copy = [...prev];
      const current = asRecord(copy[selectedIndex]);
      const desc = asRecord(current.productDescription);
      const attrs = Array.isArray(desc.attributes) ? [...desc.attributes] : [];
      attrs.push({
        name: option?.name ?? name,
        values,
        additional: true,
        ...(option?.unit ? { unit: option.unit } : {}),
      });
      copy[selectedIndex] = updateProductField(
        current,
        ["productDescription", "attributes"],
        attrs,
      );
      return copy;
    });
    setNewAttributeName("");
    setNewAttributeValue("");
  }

  function deleteAttribute(attributeIndex: number) {
    setProducts((prev) => {
      const copy = [...prev];
      const current = asRecord(copy[selectedIndex]);
      const desc = asRecord(current.productDescription);
      const attrs = Array.isArray(desc.attributes) ? [...desc.attributes] : [];
      const nextAttrs = attrs.filter((_, index) => index !== attributeIndex);
      copy[selectedIndex] = updateProductField(
        current,
        ["productDescription", "attributes"],
        nextAttrs,
      );
      return copy;
    });
    setEditingAttribute(null);
    setEditingDraft("");
  }

  function patchSelectedVariant(combinationKey: string, patch: Partial<ProductVariantDraft>) {
    const copy = [...products];
    const current = asRecord(copy[selectedIndex]);
    if (Object.keys(current).length > 0) {
      const variants = readProductVariants(current).map((variant) =>
        variant.combinationKey === combinationKey
          ? updateVariantPayloadFields({ ...variant, ...patch })
          : variant,
      );
      copy[selectedIndex] = { ...current, variants };
      setProducts(copy);
      persistProductsDraftNow(copy);
    }
    setBulkModifiedRowIndexes((current) => Array.from(new Set([...current, selectedIndex])).sort((left, right) => left - right));
    setApprovedComparisonRowIndexes((current) => current.filter((index) => index !== selectedIndex));
  }

  function generateVariantsForSelectedProduct() {
    const copy = [...products];
    const current = asRecord(copy[selectedIndex]);
    if (Object.keys(current).length === 0) return;
    const result = generateLocalVariantsForProduct(current, categoryAttributes);
    copy[selectedIndex] = result.product;
    const createdLabel = result.createdCount + (result.sourceCreated ? 1 : 0);
    setUiMessage(
      `Variants: ${result.preview.totalCombinations} combinations, added ${createdLabel}.`,
    );
    setProducts(copy);
    persistProductsDraftNow(copy);
    setBulkModifiedRowIndexes((current) => Array.from(new Set([...current, selectedIndex])).sort((left, right) => left - right));
    setApprovedComparisonRowIndexes((current) => current.filter((index) => index !== selectedIndex));
  }

  function deleteSelectedVariant(combinationKey: string) {
    patchSelectedVariant(combinationKey, { active: false });
  }

  async function runVariantImageGeneration(combinationKey: string) {
    const currentProduct = asRecord(products[selectedIndex]);
    const variant = readProductVariants(currentProduct).find((item) => item.combinationKey === combinationKey);
    if (!variant) return;
    const requestId = stableVariantImageRequestId(selectedIndex, combinationKey);
    const recoverableImageUrl = `/generated-media/${requestId}.jpg`;
    patchSelectedVariant(combinationKey, {
      status: "generating_image",
      generationError: undefined,
    });
    try {
      const response = await fetch("/v1/products/variant-image/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          combination: variant.combination,
          sourceImageUrl: firstImage(currentProduct),
          requestId,
        }),
        cache: "no-store",
      });
      const parsed = await readJsonResponse<{ imageUrl?: string; imagePath?: string }>(response);
      if (!response.ok || !parsed?.imageUrl) {
        throw new Error(readApiErrorMessage(parsed, "Image generation failed.", response.status));
      }
      patchSelectedVariant(combinationKey, {
        imageUrl: parsed.imageUrl,
        mediaAssets: [{ type: "IMAGE", location: parsed.imageUrl }],
        status: "ready",
        generationError: undefined,
      });
    } catch (error) {
      const recovered = await waitForGeneratedImage(recoverableImageUrl);
      if (recovered) {
        patchSelectedVariant(combinationKey, {
          imageUrl: recoverableImageUrl,
          mediaAssets: [{ type: "IMAGE", location: recoverableImageUrl }],
          status: "ready",
          generationError: undefined,
        });
        return;
      }
      const message = error instanceof Error && error.name === "AbortError"
        ? "Image generation request was interrupted. Try again."
        : error instanceof Error
          ? error.message
          : "Image generation failed.";
      patchSelectedVariant(combinationKey, {
        status: "failed",
        generationError: message,
      });
    }
  }

  function regenerateSelectedVariant(combinationKey: string) {
    imageGenerationQueueRef.current = imageGenerationQueueRef.current
      .catch(() => undefined)
      .then(() => runVariantImageGeneration(combinationKey));
    return imageGenerationQueueRef.current;
  }

  function resetCreatorWorkspace(nextMessage: string, nextState: UploadState = "idle") {
    window.localStorage.removeItem(CREATOR_DRAFT_KEY);
    setState(nextState);
    setUiMessage(nextMessage);
    setIssues([]);
    setProcessId("");
    setProcessState("IDLE");
    setProducts([]);
    productsDraftSaveSkippedRef.current = false;
    liveCategoryRowsCountRef.current = 0;
    taskProgressSnapshotRef.current = { step: "", completed: 0, percent: 0 };
    setAiCategoryByIndex({});
    setSelectedIndex(0);
    setWorkflowStep("categories");
    setCurrentStep("prepare_initializing");
    setStepElapsed(0);
    setHeartbeatLag(0);
    setStuckMessage("");
    setOttoProcessId("");
    setOttoSummary(null);
    setOttoErrors([]);
    setTableStatusPhase("pending");
    setLastSubmitTotal(0);
    setConfirmedCategoryRowIndexes([]);
    setSkippedCategoryRowIndexes([]);
    setCategoryChangeHistoryByIndex({});
    setCategoryCommentsByIndex({});
    setEditingCategoryIndex(null);
    setDetailsCategoryIndex(null);
    setApprovedComparisonRowIndexes([]);
    setRejectedReviewRowIndexes([]);
    setSelectedReviewRowIndexes([]);
    setBulkModifiedRowIndexes([]);
    setTaskProgress({ total: 0, completed: 0, percent: 0 });
    setPreparationCounts({ source: 0, mapped: 0, payload: 0 });
    setRealtimeMode("websocket");
    setSelectedFabricId((prev) =>
      prev && fabrics.some((item) => item.id === prev) ? prev : (fabrics[0]?.id ?? ""),
    );
  }

  async function clearBackendProcess(processIdToClear: string) {
    if (!processIdToClear) return;
    await fetch(`/api/products/create-from-fabric/${encodeURIComponent(processIdToClear)}`, {
      method: "DELETE",
      cache: "no-store",
    }).catch(() => {
      // Client-side reset is still useful if the backend task was already gone.
    });
  }

  async function handleCreate() {
    if (!selectedFabricId) {
      setState("error");
      setUiMessage("Сначала выберите fabric.");
      return;
    }
    setState("loading");
    setProcessState("IN_PROGRESS");
    setUiMessage("Процесс подготовки запущен...");
    setIssues([]);
    setProducts([]);
    productsDraftSaveSkippedRef.current = false;
    liveCategoryRowsCountRef.current = 0;
    setAiCategoryByIndex({});
    setProcessId("");
    setWorkflowStep("categories");
    setCurrentStep("prepare_initializing");
    setStepElapsed(0);
    setHeartbeatLag(0);
    setStuckMessage("");
    setOttoProcessId("");
    setOttoSummary(null);
    setOttoErrors([]);
    setTableStatusPhase("pending");
    setLastSubmitTotal(0);
    setConfirmedCategoryRowIndexes([]);
    setSkippedCategoryRowIndexes([]);
    setCategoryChangeHistoryByIndex({});
    setCategoryCommentsByIndex({});
    setEditingCategoryIndex(null);
    setDetailsCategoryIndex(null);
    setApprovedComparisonRowIndexes([]);
    setRejectedReviewRowIndexes([]);
    setSelectedReviewRowIndexes([]);
    setBulkModifiedRowIndexes([]);
    setTaskProgress({ total: 0, completed: 0, percent: 0 });
    setPreparationCounts({ source: 0, mapped: 0, payload: 0 });
    setRealtimeMode("websocket");
    try {
      const response = await fetch("/api/products/create-from-fabric", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          controller,
          factory_id: selectedFabricId,
        }),
        cache: "no-store",
      });
      const parsed = await readJsonResponse<CreateFromFabricResponse>(response);
      if (!response.ok || parsed?.success === false) {
        setState("error");
        setIssues(Array.isArray(parsed?.issues) ? parsed.issues : []);
        setUiMessage(readApiErrorMessage(parsed, "Не удалось запустить подготовку", response.status));
        return;
      }
      setProcessId(parsed?.process_id ?? "");
      setUiMessage(`Запуск успешен. Process ID: ${parsed?.process_id ?? "-"}`);
    } catch (caughtError) {
      setState("error");
      setUiMessage(caughtError instanceof Error ? `Ошибка запроса: ${caughtError.message}` : "Ошибка запроса");
    }
  }

  async function confirmCategories() {
    if (!processId || products.length === 0) return;
    if (missingCategoryCount > 0) {
      setState("error");
      setUiMessage("Укажите категорию для всех товаров перед переходом к следующему шагу.");
      return;
    }
    if (categoryKpis.requiresReview > 0) {
      setState("error");
      setUiMessage("Подтвердите все неотмеченные категории или измените их вручную перед созданием товаров.");
      return;
    }
    const skippedSet = new Set(skippedCategoryRowIndexes);
    const productsForEnrichment = products.filter((_, index) => !skippedSet.has(index));
    if (productsForEnrichment.length === 0) {
      setState("error");
      setUiMessage("Все товары пропущены. Нет товаров для создания.");
      return;
    }
    setState("loading");
    setUiMessage("Категории подтверждены. Запускаю создание товаров и AI-генерацию...");
    try {
      const response = await fetch(`/api/products/create-from-fabric/${processId}/enrich`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          products: productsForEnrichment,
          controller,
          factory_id: selectedFabricId,
        }),
        cache: "no-store",
      });
      const parsed = await readJsonResponse<EnrichPreparedResponse>(response);
      if (!response.ok || parsed?.success === false) {
        setState("error");
        setUiMessage(readApiErrorMessage(parsed, "Не удалось сгенерировать детали товаров", response.status));
        return;
      }
      setProcessState("IN_PROGRESS");
      setCurrentStep("ai_enrichment_queued");
      setProducts(productsForEnrichment);
      setSelectedIndex(0);
      setApprovedComparisonRowIndexes([]);
      setRejectedReviewRowIndexes([]);
      setSelectedReviewRowIndexes([]);
      setBulkModifiedRowIndexes([]);
      setTaskProgress({ total: productsForEnrichment.length, completed: 0, percent: 0 });
      setRealtimeMode("websocket");
      setUiMessage("Создание товаров запущено. Дожидаюсь генерации атрибутов, описаний и bullet points...");
    } catch (caughtError) {
      setState("error");
      setUiMessage(caughtError instanceof Error ? `Ошибка запроса: ${caughtError.message}` : "Ошибка запроса");
    }
  }

  async function regenerateAiProducts() {
    if (!processId || products.length === 0) return;
    setState("loading");
    setProcessState("IN_PROGRESS");
    setCurrentStep("ai_enrichment_queued");
    setUiMessage("Перегенерирую AI-описания, bullet points и атрибуты из текущих данных...");
    setOttoSummary(null);
    setOttoErrors([]);
    setIssues([]);
    setTableStatusPhase("pending");
    setApprovedComparisonRowIndexes([]);
    setRejectedReviewRowIndexes([]);
    setSelectedReviewRowIndexes([]);
    setBulkModifiedRowIndexes([]);
    setTaskProgress({ total: products.length, completed: 0, percent: 0 });

    try {
      const response = await fetch(`/api/products/create-from-fabric/${processId}/enrich`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          products,
          controller,
          factory_id: selectedFabricId,
          regenerate: true,
        }),
        cache: "no-store",
      });
      const parsed = await readJsonResponse<EnrichPreparedResponse>(response);
      if (!response.ok || parsed?.success === false) {
        setState("error");
        setUiMessage(readApiErrorMessage(parsed, "Не удалось перегенерировать товары", response.status));
        return;
      }
      setRealtimeMode("websocket");
      setUiMessage("Перегенерация запущена. Дожидаюсь нового AI-результата...");
    } catch (caughtError) {
      setState("error");
      setUiMessage(caughtError instanceof Error ? `Ошибка запроса: ${caughtError.message}` : "Ошибка запроса");
    }
  }

  async function submitEditedProducts() {
    if (!processId || products.length === 0) return;
    if (!allComparisonsApproved) {
      setState("error");
      setUiMessage(`Approve-ните сравнение для всех товаров: ${comparisonApprovedCount} из ${rows.length}.`);
      return;
    }
    const variantIssues = collectVariantExportIssues(products);
    if (variantIssues.length > 0) {
      setState("error");
      setOttoErrors(variantIssues);
      setIssues(variantIssues.map((item) => `${item.variation}: ${item.code}`));
      setTableStatusPhase("result");
      setUiMessage(`Проверьте variants перед отправкой: ${variantIssues.length} ошибок.`);
      return;
    }
    const submitTotal = expandedProductCount(products);
    setState("loading");
    setUiMessage("Загрузить: отправляю все продукты в OTTO...");
    setOttoSummary(null);
    setOttoErrors([]);
    setProcessState("IN_PROGRESS");
    setCurrentStep("otto_create_queued");
    setTaskProgress({ total: submitTotal, completed: 0, percent: 0 });
    setTableStatusPhase("processing");
    setLastSubmitTotal(submitTotal);
    try {
      const response = await fetch(`/api/products/create-from-fabric/${processId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          products,
          controller,
          factory_id: selectedFabricId,
          media_base_url: window.location.origin,
        }),
        cache: "no-store",
      });
      const parsed = await readJsonResponse<SubmitPreparedResponse>(response);
      if (!response.ok || parsed?.success === false) {
        setState("error");
        setUiMessage(readApiErrorMessage(parsed, "Не удалось сохранить итоговые данные", response.status));
        return;
      }
      if (parsed?.queued) {
        setProcessState(parsed?.process_state ?? "IN_PROGRESS");
        setCurrentStep("otto_create_queued");
        setTaskProgress({ total: submitTotal, completed: 0, percent: 0 });
        setRealtimeMode("websocket");
        setUiMessage("Загрузка в OTTO запущена. Дожидаюсь live-результата...");
        return;
      }
      const update = asRecord(parsed?.otto_update_result);
      const failed = asRecord(parsed?.otto_failed_result);
      const failedCount = Number(update.failed ?? 0);
      const succeededCount = Number(update.succeeded ?? 0);
      const ottoPid = String(parsed?.otto_process_id ?? "");
      setOttoProcessId(ottoPid);
      setOttoSummary({
        state: String(update.state ?? parsed?.otto_create_state ?? ""),
        total: Number(update.total ?? 0),
        progress: Number(update.progress ?? 0),
        succeeded: Number(update.succeeded ?? 0),
        failed: Number(update.failed ?? 0),
      });

      const nextErrors = ottoErrorsFromPayload(failed);
      setOttoErrors(nextErrors);
      setTableStatusPhase("result");

      if (failedCount > 0) {
        setState("error");
        const nextIssues: string[] = nextErrors.map((item) => `${item.variation}: ${item.code}: ${item.title}`);
        setIssues(nextIssues.length > 0 ? nextIssues : [`OTTO process ${ottoPid}: failed=${failedCount}`]);
        setUiMessage("Загрузка завершена с ошибками.");
        return;
      }
      if (succeededCount < submitTotal) {
        setState("error");
        setIssues([`Создано меньше товаров, чем ожидалось: ${succeededCount} из ${submitTotal}`]);
        setUiMessage("Availability не запущен: не все товары подтверждены как созданные.");
        return;
      }

      setUiMessage("Товары созданы. Жду, пока OTTO завершит создание variations...");
      await sleep(AVAILABILITY_AFTER_CREATE_DELAY_MS);
      setUiMessage(`Отправляю stock=20 и shipping profile партиями по ${AVAILABILITY_CONCURRENCY}...`);
      const availabilityResults = await runWithConcurrency(
        products,
        AVAILABILITY_CONCURRENCY,
        async (product) => {
          const record = asRecord(product);
          const sku = String(record.sku ?? "").trim();
          const shippingProfileID = productShippingProfileId(record);
          if (!sku) {
            throw new Error("missing sku");
          }
          if (!shippingProfileID) {
            throw new Error("missing shipping profile");
          }
          const availabilityResponse = await fetch("/api/products/create-availability", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sku,
              quantity: "20",
              shippingProfileID,
              controller,
            }),
            cache: "no-store",
          });
          const availabilityParsed = await readJsonResponse<AvailabilitySubmitResponse>(availabilityResponse);
          if (!availabilityResponse.ok) {
            throw new Error(readApiErrorMessage(availabilityParsed, `Availability failed for ${sku}`, availabilityResponse.status));
          }
          const quantityOk = Boolean(availabilityParsed?.update_quantity?.success);
          const deliveryOk = Boolean(availabilityParsed?.update_delivery?.success);
          if (!quantityOk || !deliveryOk) {
            const quantityError = availabilityParsed?.update_quantity?.errors ?? "";
            const deliveryError = availabilityParsed?.update_delivery?.errors ?? "";
            throw new Error(`quantity=${quantityError || "failed"}, delivery=${deliveryError || "failed"}`);
          }
          return sku;
        },
      );
      const availabilityErrors: OttoErrorRow[] = availabilityResults.flatMap((result, index) => {
        if (result.status === "fulfilled") return [];
        const sku = String(asRecord(products[index]).sku ?? "unknown");
        return [{
          variation: sku,
          code: "availability_failed",
          title: result.reason instanceof Error ? result.reason.message : "Availability request failed",
          jsonPath: "availability",
        }];
      });
      if (availabilityErrors.length > 0) {
        setOttoErrors(availabilityErrors);
        setState("error");
        setIssues(availabilityErrors.map((item) => `${item.variation}: ${item.code}`));
        setUiMessage(`Availability завершен с ошибками: ${availabilityErrors.length} из ${products.length}.`);
        return;
      }

      resetCreatorWorkspace("Успешно загружено.", "success");
      void clearBackendProcess(processId);
    } catch (caughtError) {
      setState("error");
      setUiMessage(caughtError instanceof Error ? `Ошибка запроса: ${caughtError.message}` : "Ошибка запроса");
    }
  }

  async function handleClear() {
    const staleProcessId = processId;
    resetCreatorWorkspace("Состояние очищено.");
    await clearBackendProcess(staleProcessId);
  }

  if (isLoading || !hydratedDraft || isRestoringProcess) {
    return <PageLoadingShell contentMode="form" />;
  }

  const normalizedFabricQuery = normalizeFieldToken(fabricQuery);
  const filteredFabrics = normalizedFabricQuery
    ? fabrics.filter((item) =>
        normalizeFieldToken(`${item.name ?? ""} ${item.id ?? ""}`).includes(normalizedFabricQuery),
      )
    : fabrics;
  const visibleFabrics = selectedFabricId && !filteredFabrics.some((item) => item.id === selectedFabricId)
    ? [
        ...fabrics.filter((item) => item.id === selectedFabricId),
        ...filteredFabrics,
      ]
    : filteredFabrics;
  const selectedFabric = fabrics.find((item) => item.id === selectedFabricId);
  const fabricPickerDisabled = isLoadingFabrics || state === "loading" || fabrics.length === 0;

  return (
    <AppWorkspaceShell
      activeHref="/creator"
      currentUser={currentUser}
      sectionLabel="Создание"
      title="Подготовка по Fabric"
      description="Подготовка, проверка и публикация товаров в OTTO"
      compactSidebar
    >
      <div className={`creator-workspace creator-ref-workspace ${isCategoryStage ? "is-category-stage" : ""}`}>
        {error ? <p className="helper-banner">{error}</p> : null}
        {isEnrichmentLoading || isOttoSubmitLoading ? (
          <section className="product-enrichment-loading" role="status" aria-live="polite">
            <RefreshCw className="spin" size={34} aria-hidden="true" />
            <div>
              <h2>{isOttoSubmitLoading ? "Отправляем товары в OTTO" : "Подготавливаем данные товаров"}</h2>
              <p>{isOttoSubmitLoading ? "Идёт создание товаров и отправка availability. Дождитесь результата обработки." : "Загружаем описания, атрибуты и изображения. Работа с товарами станет доступна после завершения подготовки."}</p>
            </div>
            <div className="product-enrichment-loading-progress" aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(100, Math.round(taskProgress.percent || 0)))}%` }} />
            </div>
            <strong>{`${Math.max(0, Math.round(taskProgress.percent || 0))}%`}</strong>
          </section>
        ) : (
        <section className={`creator-ref-top-grid ${isCategoryStage ? "is-category-stage" : "is-preparation-stage"}`}>
          <article className="creator-ref-card creator-ref-card-action">
            <h2>Загрузка товаров</h2>
            <p className="creator-ref-card-subtitle">Выберите источник и подготовьте товары к проверке.</p>
            <div className="creator-mode-switch">
              <label>Controller
                <select value={controller} onChange={(event) => setController(event.target.value as ControllerOption)} disabled={state === "loading"}>
                  <option value="jv">JV</option><option value="xl">XL</option>
                </select>
              </label>
              <label>Fabric
                <div
                  className="fabric-picker"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setFabricDropdownOpen(false);
                    }
                  }}
                >
                  <button
                    type="button"
                    className="fabric-picker-trigger"
                    disabled={fabricPickerDisabled}
                    aria-haspopup="listbox"
                    aria-expanded={fabricDropdownOpen}
                    onClick={() => {
                      if (fabricPickerDisabled) return;
                      setFabricDropdownOpen((open) => !open);
                    }}
                  >
                    <span>{isLoadingFabrics ? "Загрузка fabrics..." : selectedFabric ? `${selectedFabric.name ?? selectedFabric.id} (${selectedFabric.items_count ?? 0})` : "Выберите fabric"}</span>
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                  {fabricDropdownOpen ? (
                    <div className="fabric-picker-menu">
                      <div className="creator-search-wrap fabric-search">
                        <Search size={16} className="creator-search-icon" />
                        <input
                          autoFocus
                          className="creator-search-input"
                          type="search"
                          value={fabricQuery}
                          onChange={(event) => setFabricQuery(event.target.value)}
                          placeholder="Поиск fabric..."
                        />
                      </div>
                      <div className="fabric-picker-options" role="listbox">
                        {visibleFabrics.length === 0 ? (
                          <span className="fabric-picker-empty">Ничего не найдено</span>
                        ) : visibleFabrics.map((item) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={item.id === selectedFabricId}
                            className={item.id === selectedFabricId ? "is-selected" : ""}
                            key={item.id}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              setSelectedFabricId(item.id);
                              setFabricDropdownOpen(false);
                            }}
                          >
                            <span>{item.name ?? item.id}</span>
                            <small>{`${item.items_count ?? 0} товаров`}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </label>
              <button
                type="button"
                className="creator-ref-refresh-btn"
                onClick={() => void refreshFabrics()}
                disabled={state === "loading" || isLoadingFabrics || isRefreshingFabrics}
                title="Обновить список фабрик"
                aria-label="Обновить список фабрик"
              >
                <RefreshCw size={18} className={isRefreshingFabrics ? "spin" : ""} />
              </button>
            </div>
            <div className="creator-ref-launch-actions">
              <Button className="creator-ref-launch-btn" size="lg" type="button" onClick={handleCreate} disabled={state === "loading" || !selectedFabricId}>
                {state === "loading" ? "Подготовка..." : "Подготовить товары"}
              </Button>
              <Button className="creator-ref-reset-btn" variant="secondary" size="lg" type="button" onClick={() => void handleClear()} disabled={!processId && state === "idle" && products.length === 0}>
                Сбросить
              </Button>
            </div>
            <div className={`creator-ref-inline-alert ${state === "error" ? "is-error" : state === "success" ? "is-success" : "is-info"}`}>
              <span className="creator-ref-inline-alert-icon" aria-hidden="true">
                {state === "error" ? <AlertCircle size={16} /> : state === "success" ? <Check size={16} /> : "i"}
              </span>
              <p>{state === "success" && products.length > 0 ? `${products.length} товаров готовы к проверке` : message}</p>
            </div>
          </article>

          <article className="creator-ref-card creator-ref-card-main">
            {isCategoryStage ? (
              <>
                <CategoryCheckSummary categoryKpis={categoryKpis} processState={processState} />
                <CategoryCheckProgress
                  currentStep={currentStep}
                  processState={processState}
                  progressPercent={taskProgress.percent}
                  progressLabel={progressTitle(currentStep)}
                  preparationCounts={preparationCounts}
                  realtimeMode={realtimeMode}
                  processId={processId}
                  ottoProcessId={ottoProcessId}
                  stepElapsed={stepElapsed}
                  heartbeatLag={heartbeatLag}
                  copiedRuntimeField={copiedRuntimeField}
                  runtimeCopyErrorField={runtimeCopyErrorField}
                  copyText={(value, field) => void copyText(value, field)}
                />
                {stuckMessage ? <p className="helper-banner error">{stuckMessage}</p> : null}
              </>
            ) : (
              <>
                {processState === "IDLE" && products.length === 0 ? (
                  <div className="creator-preparation-empty">
                    <span className="creator-preparation-empty-icon"><Box size={22} /></span>
                    <div>
                      <h2>Подготовка товаров</h2>
                      <p>Выберите Controller и Fabric, затем запустите подготовку. Здесь появится текущий статус обработки.</p>
                    </div>
                    <Badge className="creator-ref-status-badge pending">Ожидание запуска</Badge>
                  </div>
                ) : (
                  <>
                    <div className="creator-ref-main-head">
                      <h2>Последняя загрузка</h2>
                    </div>
                    <div className="creator-ref-status-line">
                      <span className="creator-ref-status-label">Статус</span>
                      <Badge
                        className={`creator-ref-status-badge creator-ref-status-badge-animated ${
                          processState === "DONE"
                            ? "done"
                            : processState === "FAILED"
                              ? "failed"
                              : "progress"
                        }`}
                      >
                        {processState}
                      </Badge>
                    </div>
                    <div className="creator-ref-metrics">
                    <Card className="metric neutral">
                      <span className="metric-icon"><Box size={18} /></span>
                      <small>Всего</small>
                      <strong>{kpiTotal}</strong>
                    </Card>
                    <Card className="metric success">
                      <span className="metric-icon"><Check size={18} /></span>
                      <small>Успешно</small>
                      <strong>{kpiSucceeded}</strong>
                    </Card>
                    <Card className="metric error">
                      <span className="metric-icon"><X size={18} /></span>
                      <small>Ошибки</small>
                      <strong>{kpiFailed}</strong>
                    </Card>
                    </div>
                    {processState === "IN_PROGRESS" ? (
                      <div className="creator-ref-progress">
                        <div className="creator-ref-progress-head">
                          <strong>{progressTitle(currentStep)}</strong>
                          <span>{`${Math.max(0, Math.round(taskProgress.percent))}%`}</span>
                        </div>
                        <div className="creator-ref-progress-track" aria-hidden="true">
                          <span style={{ width: `${Math.max(0, Math.min(100, Math.round(taskProgress.percent || 0)))}%` }} />
                        </div>
                        <p>{realtimeMode === "websocket" ? "Live updates через WebSocket" : "Live updates через polling fallback"}</p>
                      </div>
                    ) : null}
                  </>
                )}
              </>
            )}
          </article>
        </section>
        )}

        {isCategoryStage ? (
        <section className="category-check-page">
          {state === "error" ? (
            <div className="category-check-alert">
              <AlertCircle size={16} />
              <span>{message}</span>
              <button type="button" onClick={handleCreate} disabled={!selectedFabricId}>Повторить</button>
            </div>
          ) : null}
          <Card className="category-check-panel">
            <div className="category-check-panel-head">
              <div>
                <h2>Категории товаров</h2>
                <p>{processState === "IN_PROGRESS" ? "Live updates включены. Новые строки появляются по мере готовности." : "Проверьте, подтвердите или измените категории перед генерацией данных."}</p>
              </div>
              <div className="category-check-panel-actions">
                <button className="primary-btn creator-category-submit-btn" type="button" onClick={confirmCategories} disabled={state === "loading" || filteredRows.length === 0 || missingCategoryCount > 0 || categoryKpis.requiresReview > 0}>
                  Создать товары
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            <CategoryCheckToolbar
              tableQuery={tableQuery}
              setTableQuery={setTableQuery}
              categoryFilter={categoryFilter}
              setCategoryFilter={setCategoryFilter}
              categoryFilterOptions={categoryFilterOptions}
              categoryGroupDisplayByValue={categoryGroupDisplayByValue}
              statusFilter={categoryStatusFilter}
              setStatusFilter={setCategoryStatusFilter}
              categorySort={categorySort}
              setCategorySort={setCategorySort}
              setPage={setPage}
            />
            <CategoryCheckBatchActions
              selectedCount={selectedCategoryRowIndexes.length}
              selectedConfirmableCount={selectedConfirmableCount}
              editSelected={() => setIsBulkCategoryDrawerOpen(true)}
              confirmSelected={() => confirmCategoryRows(selectedCategoryRowIndexes)}
              skipSelected={() => skipCategoryRows(selectedCategoryRowIndexes)}
              resetSelected={() => {
                setSelectedCategoryRowIndexes([]);
                setIsBulkCategoryDrawerOpen(false);
                setBulkCategoryValue("");
              }}
            />
            <CategoryCheckTable
              rows={pagedRows}
              categoryRowStatuses={categoryRowStatuses}
              categoryDisplayByValue={categoryDisplayByValue}
              categoryGroupDisplayByValue={categoryGroupDisplayByValue}
              selectedCategoryIndexSet={selectedCategoryIndexSet}
              allFilteredRowsSelected={allFilteredRowsSelected}
              toggleAllFilteredRows={toggleAllFilteredRows}
              toggleCategorySelection={toggleCategorySelection}
              confirmCategoryRows={confirmCategoryRows}
              openDetails={setDetailsCategoryIndex}
              selectedIndex={selectedIndex}
              setSelectedIndex={setSelectedIndex}
              pageSize={pageSize}
              setPageSize={setPageSize}
              safePage={safePage}
              totalPages={totalPages}
              paginationItems={paginationItems}
              setPage={setPage}
              filteredCount={filteredRows.length}
              state={state}
              processState={processState}
              rowNumberStart={(safePage - 1) * pageSize}
            />
          </Card>
          <CategoryEditDrawer
            row={editingCategoryRow}
            categoryOptionsByGroup={categoryOptionsByGroup}
            categoryGroupDisplayByValue={categoryGroupDisplayByValue}
            categoryDisplayByValue={categoryDisplayByValue}
            open={editingCategoryIndex !== null}
            onSave={(category, comment) => {
              if (editingCategoryIndex !== null) saveCategoryEdit(editingCategoryIndex, category, comment);
            }}
            onClose={() => setEditingCategoryIndex(null)}
          />
          <BulkCategoryEditDrawer
            open={isBulkCategoryDrawerOpen}
            count={selectedCategoryRowIndexes.length}
            groups={selectedCategoryGroups}
            categoryGroupDisplayByValue={categoryGroupDisplayByValue}
            categoryDisplayByValue={categoryDisplayByValue}
            options={bulkCategoryOptions}
            value={bulkCategoryValue}
            setValue={setBulkCategoryValue}
            onClose={() => setIsBulkCategoryDrawerOpen(false)}
            onApply={applyBulkCategory}
          />
          <CategoryReviewModal
            row={detailsCategoryRow}
            rows={filteredRows}
            statuses={categoryRowStatuses}
            status={detailsCategoryStatus}
            categoryOptionsByGroup={categoryOptionsByGroup}
            categoryGroupDisplayByValue={categoryGroupDisplayByValue}
            categoryDisplayByValue={categoryDisplayByValue}
            open={detailsCategoryIndex !== null}
            onSave={(category, comment) => {
              if (detailsCategoryIndex !== null) saveCategoryEdit(detailsCategoryIndex, category, comment);
            }}
            position={detailsCategoryPosition}
            total={filteredRows.length}
            onPrevious={() => navigateCategoryDetails(detailsCategoryPosition - 1)}
            onNext={() => navigateCategoryDetails(detailsCategoryPosition + 1)}
            onSelectProduct={(rowIndex) => {
              const nextPosition = filteredRows.findIndex((item) => item.index === rowIndex);
              if (nextPosition >= 0) navigateCategoryDetails(nextPosition);
            }}
            onClose={() => setDetailsCategoryIndex(null)}
          />
        </section>
        ) : null}

        {!isEnrichmentLoading && workflowStep !== "categories" ? (
          <ProductReviewPage>
            {bulkToast ? <div className={`bulk-edit-toast${bulkToast.error ? " is-error" : ""}`} role="status">{bulkToast.error ? <AlertCircle size={16} /> : <Check size={16} />}{bulkToast.message}</div> : null}
            <BulkSelectionBar
              count={selectedReviewRowIndexes.length}
              onBulkEdit={() => bulkAttributeEdit.setOpen(true)}
              onApprove={approveSelectedReviewProducts}
              onReject={rejectSelectedReviewProducts}
              onClear={() => setSelectedReviewRowIndexes([])}
            />
            <div className="product-review-layout">
              <ProductList
                rows={reviewRows}
                selectedIndex={selectedIndex}
                selectedReviewIndexes={selectedReviewRowIndexes}
                onSelect={setSelectedIndex}
                onToggleSelect={toggleReviewSelection}
                searchRef={reviewSearchRef}
                query={reviewSearchQuery}
                setQuery={setReviewSearchQuery}
                filter={reviewQueueFilter}
                setFilter={setReviewQueueFilter}
              />
              <main className="product-review-workspace">
                {products.length === 0 ? (
                  <div className="product-review-empty workspace"><strong>Select a product to review</strong></div>
                ) : (
                  <>
                    <ProductReviewHeader
                      row={selectedReviewRowForRender}
                      image={selectedImage}
                      categoryDisplayByValue={categoryDisplayByValue}
                      categoryGroupDisplayByValue={categoryGroupDisplayByValue}
                    />
                    {selectedProductErrors.length > 0 ? (
                      <button className="product-review-error-indicator" type="button" onClick={() => setIsErrorDrawerOpen(true)}>
                        <AlertCircle size={16} />
                        {`Errors (${selectedProductErrors.length})`}
                      </button>
                    ) : null}
                    <ReviewTabs value={editorTab} setValue={setEditorTab} />
                    {editorTab === "general" ? (
                      <div className="product-overview-grid">
                        <section className="product-overview-card product-overview-identifiers">
                          <div className="product-overview-card-head"><h3>Identifiers</h3></div>
                          <div className="product-overview-fields">
                            {[
                              { key: "sku", label: "SKU", value: String(selectedProduct.sku ?? ""), path: ["sku"] },
                              { key: "ean", label: "EAN", value: String(selectedProduct.ean ?? ""), path: ["ean"] },
                              { key: "product-reference", label: "Product Reference", value: String(selectedProduct.productReference ?? ""), path: ["productReference"] },
                            ].map((field) => {
                              const copyKey = `overview-${field.key}`;
                              const editing = editingOverviewField === field.key;
                              return (
                                <div className="product-overview-field attribute-field-card" key={field.key}>
                                  <div className="product-overview-field-head attribute-field-card-head">
                                    <span>{field.label}</span>
                                    {!editing ? <OverviewActionsMenu onEdit={() => setEditingOverviewField(field.key)} onCopy={() => void copyText(field.value, copyKey)} canCopy={Boolean(field.value)} copied={copiedRuntimeField === copyKey} /> : null}
                                  </div>
                                  {editing ? (
                                    <div className="attribute-field-editor"><input autoFocus value={field.value} onChange={(event) => updateSelected(field.path, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setEditingOverviewField(null); }} /><div><button type="button" onClick={() => setEditingOverviewField(null)}>Done</button></div></div>
                                  ) : (
                                    <button type="button" className={`attribute-field-value${field.value ? "" : " is-empty"}`} onClick={() => setEditingOverviewField(field.key)}>{field.value || "Not provided"}</button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </section>

                        <section className="product-overview-card">
                          <div className="product-overview-card-head"><h3>Product Info</h3></div>
                          <div className="product-overview-field attribute-field-card">
                            <div className="product-overview-field-head attribute-field-card-head">
                              <span>Title</span>
                              {editingOverviewField !== "title" ? <OverviewActionsMenu onEdit={() => setEditingOverviewField("title")} onCopy={() => void copyText(selectedReviewRowForRender?.title ?? "", "overview-title")} canCopy={Boolean(selectedReviewRowForRender?.title)} copied={copiedRuntimeField === "overview-title"} /> : null}
                            </div>
                            {editingOverviewField === "title" ? (
                              <div className="attribute-field-editor"><input autoFocus value={selectedReviewRowForRender?.title ?? ""} onChange={(event) => updateSelectedTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setEditingOverviewField(null); }} /><div><button type="button" onClick={() => setEditingOverviewField(null)}>Done</button></div></div>
                            ) : (
                              <button type="button" className={`attribute-field-value${selectedReviewRowForRender?.title?.trim() ? "" : " is-empty"}`} onClick={() => setEditingOverviewField("title")}>{selectedReviewRowForRender?.title?.trim() || "Not provided"}</button>
                            )}
                          </div>
                          <div className="product-overview-field attribute-field-card">
                            <div className="product-overview-field-head attribute-field-card-head">
                              <span>Product Line</span>
                              {editingOverviewField !== "product-line" ? <OverviewActionsMenu onEdit={() => setEditingOverviewField("product-line")} /> : null}
                            </div>
                            {editingOverviewField === "product-line" ? (
                              <div className="attribute-field-editor"><input autoFocus value={String(selectedDescription.productLine ?? "")} onChange={(event) => updateSelectedTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setEditingOverviewField(null); }} /><div><button type="button" onClick={() => setEditingOverviewField(null)}>Done</button></div></div>
                            ) : (
                              <button type="button" className={`attribute-field-value${String(selectedDescription.productLine ?? "").trim() ? "" : " is-empty"}`} onClick={() => setEditingOverviewField("product-line")}>{String(selectedDescription.productLine ?? "").trim() || "Not provided"}</button>
                            )}
                          </div>
                          <div className="product-overview-field attribute-field-card">
                            <div className="product-overview-field-head attribute-field-card-head">
                              <span>Delivery days</span>
                            </div>
                            <select
                              value={selectedShippingProfileId}
                              onChange={(event) => updateRowShippingProfile(selectedIndex, event.target.value)}
                              disabled={shippingProfiles.length === 0}
                            >
                              {selectedShippingProfileId && !shippingProfiles.some((item) => item.id === selectedShippingProfileId) ? (
                                <option value={selectedShippingProfileId}>{selectedReviewRowForRender?.shippingProfileName || selectedShippingProfileId}</option>
                              ) : null}
                              {shippingProfiles.length === 0 ? (
                                <option value="">{selectedShippingProfileId || "No delivery profiles"}</option>
                              ) : (
                                shippingProfiles.map((item) => (
                                  <option key={item.id} value={item.id}>{item.name}</option>
                                ))
                              )}
                            </select>
                          </div>
                        </section>

                        <section className="product-overview-card product-overview-pricing">
                          <div className="product-overview-card-head"><h3>Pricing</h3></div>
                          <div className="product-overview-field attribute-field-card">
                            <div className="product-overview-field-head attribute-field-card-head">
                              <span>Price</span>
                              {editingOverviewField !== "price" ? <OverviewActionsMenu onEdit={() => setEditingOverviewField("price")} /> : null}
                            </div>
                            {editingOverviewField === "price" ? (
                              <div className="attribute-field-editor"><div className="product-overview-price-input">
                                <input autoFocus inputMode="decimal" value={String(selectedStandardPrice.amount ?? "")} onChange={(event) => {
                                  const amount = Number(event.target.value.trim() || 0);
                                  if (Number.isNaN(amount)) return;
                                  setProducts((prev) => {
                                    const next = [...prev];
                                    next[selectedIndex] = updateProductField(asRecord(next[selectedIndex]), ["pricing", "standardPrice", "amount"], amount);
                                    return next;
                                  });
                                }} onKeyDown={(event) => { if (event.key === "Enter") setEditingOverviewField(null); }} />
                                {selectedCurrencyLabel ? <span>{selectedCurrencyLabel}</span> : null}
                              </div><div><button type="button" onClick={() => setEditingOverviewField(null)}>Done</button></div></div>
                            ) : (
                              <button type="button" className={`attribute-field-value${selectedStandardPrice.amount === undefined || selectedStandardPrice.amount === null || selectedStandardPrice.amount === "" ? " is-empty" : ""}`} onClick={() => setEditingOverviewField("price")}>{selectedStandardPrice.amount === undefined || selectedStandardPrice.amount === null || selectedStandardPrice.amount === "" ? "Not provided" : `${String(selectedStandardPrice.amount)}${selectedCurrencyLabel ? ` ${selectedCurrencyLabel}` : ""}`}</button>
                            )}
                          </div>
                        </section>

                        <section className="product-overview-card product-overview-generated">
                          <div className="product-overview-card-head">
                            <h3>Generated Content</h3>
                            {editingOverviewField !== "bullet-points" ? <OverviewActionsMenu onEdit={() => setEditingOverviewField("bullet-points")} /> : <button type="button" onClick={() => setEditingOverviewField(null)}>Done</button>}
                          </div>
                          <div className="product-overview-field product-overview-bullets">
                            <span>Bullet Points</span>
                            {editingOverviewField === "bullet-points" ? (
                              <textarea autoFocus value={selectedBulletPoints.join("\n")} onChange={(event) => {
                                const next = event.target.value.split("\n").map((line) => line.trim()).filter(Boolean);
                                setProducts((prev) => {
                                  const copy = [...prev];
                                  copy[selectedIndex] = updateProductField(asRecord(copy[selectedIndex]), ["productDescription", "bulletPoints"], next);
                                  return copy;
                                });
                              }} />
                            ) : selectedBulletPoints.length > 0 ? (
                              <ul>{selectedBulletPoints.map((bulletPoint, index) => <li key={`${index}-${bulletPoint}`}>{bulletPoint}</li>)}</ul>
                            ) : (
                              <div className="product-overview-empty"><strong>No generated content</strong><span>Bullet points have not been generated yet.</span></div>
                            )}
                          </div>
                        </section>
                      </div>
                    ) : null}
                    {editorTab === "attributes" ? (
                      <>
                        <AttributeEditor
                          attributes={attributeCards}
                          basePrice={String(selectedStandardPrice.amount ?? "")}
                          categoryAttributes={categoryAttributes}
                          isLoadingCategoryAttributes={isLoadingCategoryAttributes}
                          categoryAttributesError={categoryAttributesError}
                          newAttributeName={newAttributeName}
                          setNewAttributeName={setNewAttributeName}
                          newAttributeValue={newAttributeValue}
                          setNewAttributeValue={setNewAttributeValue}
                          addAttribute={addAttribute}
                          editingAttribute={editingAttribute}
                          editingDraft={editingDraft}
                          setEditingDraft={setEditingDraft}
                          startAttributeEdit={startAttributeEdit}
                          saveAttributeEdit={saveAttributeEdit}
                          cancelAttributeEdit={cancelAttributeEdit}
                          deleteAttribute={deleteAttribute}
                          invalidAttributeNames={invalidAttributeNames}
                        />
                        <VariantManager
                          product={selectedProduct}
                          categoryAttributes={categoryAttributes}
                          onGenerate={generateVariantsForSelectedProduct}
                          onPatchVariant={patchSelectedVariant}
                          onDeleteVariant={deleteSelectedVariant}
                          onRegenerateVariant={regenerateSelectedVariant}
                        />
                      </>
                    ) : null}
                    {editorTab === "json" ? (
                      <section className="product-review-section">
                        <div className="product-review-section-head"><h3>Raw Payload</h3></div>
                        <textarea className="product-review-json" value={JSON.stringify(selectedProduct, null, 2)} readOnly rows={18} />
                      </section>
                    ) : null}
                    {editorTab === "diff" ? <DiffViewer aftercool={selectedAftercoolData} /> : null}
                  </>
                )}
              </main>
            </div>
            <StickyActionBar
              onReject={() => rejectReviewProduct(selectedIndex)}
              onSave={saveReviewDraft}
              onRegenerate={regenerateAiProducts}
              onApprove={() => approveReviewProduct(selectedIndex)}
              onSubmit={submitEditedProducts}
              approved={approvedComparisonIndexSet.has(selectedIndex)}
              approvedCount={comparisonApprovedCount}
              totalCount={rows.length}
              allApproved={allComparisonsApproved}
              disabled={products.length === 0 || state === "loading"}
            />
            <ErrorDrawer open={isErrorDrawerOpen} errors={selectedProductErrors} onClose={() => setIsErrorDrawerOpen(false)} />
            <BulkAttributeEditDrawer
              count={selectedReviewRowIndexes.length}
              options={bulkAttributeOptions}
              isLoading={isLoadingCategoryAttributes}
              state={bulkAttributeEdit}
              onClose={bulkAttributeEdit.reset}
              onApply={applyBulkAttributeChanges}
            />
            <CategoryEditDrawer
              row={rowByIndex.get(selectedIndex) ?? null}
              categoryOptionsByGroup={categoryOptionsByGroup}
              categoryGroupDisplayByValue={categoryGroupDisplayByValue}
              categoryDisplayByValue={categoryDisplayByValue}
              open={editingCategoryIndex === selectedIndex}
              onSave={(category, comment) => saveCategoryEdit(selectedIndex, category, comment)}
              onClose={() => setEditingCategoryIndex(null)}
            />
          </ProductReviewPage>
        ) : null}
      </div>
    </AppWorkspaceShell>
  );
}
