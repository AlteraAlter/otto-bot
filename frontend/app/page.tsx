"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ProductStatus = "active" | "non_active";
const BRAND_OPTIONS = ["JVmoebel", "XLmoebel"] as const;
type ProductBrand = (typeof BRAND_OPTIONS)[number];
type ProductAttribute = {
  name: string;
  values: string[];
  additional: boolean;
};

type Product = {
  id: string;
  productReference: string;
  name: string;
  sku: string;
  ean: string;
  moin: string;
  category: string;
  brand: ProductBrand;
  brandId: string;
  price: number;
  stock: number;
  mediaCount: number;
  attributesCount: number;
  attributes: ProductAttribute[];
  bulletPoints: string[];
  description: string;
  status: ProductStatus;
  rating: number;
  sales: number;
  views: number;
  updatedAt: string;
};
type SortByField =
  | "id"
  | "productLine"
  | "sku"
  | "productReference"
  | "category"
  | "brandId"
  | "ean"
  | "price";
type SortOrder = "ASC" | "DESC";
type BulkPriceOperation = "delta" | "percent" | "set";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPath(source: JsonObject, path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!isObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

function getString(source: JsonObject, paths: string[][]): string | undefined {
  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return undefined;
}

function getNumber(source: JsonObject, paths: string[][]): number | undefined {
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

function extractCollection(payload: unknown): unknown[] {
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

function statusFromText(value: string | undefined): ProductStatus | undefined {
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

function normalizeValuesCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeBrand(value: string | undefined): ProductBrand {
  if (!value) return "JVmoebel";
  const normalized = value.trim().toLowerCase();
  if (normalized === "xlmoebel") return "XLmoebel";
  return "JVmoebel";
}

function toDateLabel(input: unknown) {
  if (typeof input !== "string" || input.length === 0) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleDateString("ru-RU");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(value);
}

function statusLabel(status: ProductStatus) {
  if (status === "active") return "Активен";
  return "Неактивен";
}

function parseBulkPriceExpression(
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

function applyPriceOperation(
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

function comparableProductState(product: Product) {
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

function mapProduct(raw: unknown, index: number, statusBySku: Record<string, ProductStatus>): Product | null {
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
  const attributesCount = attributes.length;
  const mediaCount = Array.isArray(mediaAssetsRaw) ? mediaAssetsRaw.length : 0;

  const category = getString(raw, [["productDescription", "category"], ["category"]]) ?? "Без категории";
  const brand = normalizeBrand(getString(raw, [["productDescription", "brand"]]));
  const brandId = getString(raw, [["productDescription", "brandId"]]) ?? "-";
  const price = getNumber(raw, [["pricing", "standardPrice", "amount"], ["price", "amount"], ["price"]]) ?? 0;
  const stock =
    getNumber(raw, [["availability", "stockQuantity"], ["stock"], ["inventory"], ["quantity"], ["order", "maxOrderQuantity", "quantity"]]) ?? 0;

  const rawStatus =
    statusFromText(getString(raw, [["marketPlaceStatus"], ["status"], ["activeStatus"]])) ?? "non_active";

  const mappedStatus = sku ? statusBySku[sku] ?? rawStatus : rawStatus;

  return {
    id,
    productReference: productReference ?? "-",
    name: productLine ?? productReference ?? sku ?? `Товар ${index + 1}`,
    sku: sku ?? `sku-${index}`,
    ean: getString(raw, [["ean"]]) ?? "-",
    moin: getString(raw, [["moin"]]) ?? "-",
    category,
    brand,
    brandId,
    price,
    stock,
    mediaCount,
    attributesCount,
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

function asCreatePayload(detail: JsonObject, product: Product): JsonObject | null {
  const productDescription = readPath(detail, ["productDescription"]);
  const mediaAssets = readPath(detail, ["mediaAssets"]);
  const pricing = readPath(detail, ["pricing"]);
  const logistics = readPath(detail, ["logistics"]);

  if (!isObject(productDescription) || !Array.isArray(mediaAssets) || !isObject(pricing) || !isObject(logistics)) {
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

export default function Home() {
  const TABLE_PAGE_SIZE = 30;
  const PREFETCH_BATCH_SIZE = 1000;
  const SEARCH_PAGE_SIZE = 100;
  const SEARCH_DEBOUNCE_MS = 350;

  const [products, setProducts] = useState<Product[]>([]);
  const [detailsBySku, setDetailsBySku] = useState<Record<string, JsonObject>>({});
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortByField>("id");
  const [sortOrder, setSortOrder] = useState<SortOrder>("DESC");
  const [statusFilter, setStatusFilter] = useState<"all" | ProductStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);
  const [bulkPriceExpression, setBulkPriceExpression] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [isSyncingDb, setIsSyncingDb] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tablePage, setTablePage] = useState(1);
  const [dbTotal, setDbTotal] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const statusCacheRef = useRef<Record<string, ProductStatus>>({});
  const loadedChunkIndexesRef = useRef<Set<number>>(new Set());
  const isChunkLoadingRef = useRef(false);
  const [originalById, setOriginalById] = useState<Record<string, Product>>({});

  const selectedProduct = products.find((product) => product.id === selectedId) ?? null;
  const originalSelectedProduct = selectedProduct ? originalById[selectedProduct.id] ?? null : null;
  const selectedIdSet = useMemo(() => new Set(multiSelectedIds), [multiSelectedIds]);

  const hasProductChanges = useMemo(() => {
    if (!selectedProduct || !originalSelectedProduct) return false;
    return (
      JSON.stringify(comparableProductState(selectedProduct)) !==
      JSON.stringify(comparableProductState(originalSelectedProduct))
    );
  }, [selectedProduct, originalSelectedProduct]);

  const hasStatusChanges = useMemo(() => {
    if (!selectedProduct || !originalSelectedProduct) return false;
    return selectedProduct.status !== originalSelectedProduct.status;
  }, [selectedProduct, originalSelectedProduct]);

  const categories = useMemo(() => {
    return Array.from(new Set(products.map((item) => item.category)));
  }, [products]);

  const visibleProducts = useMemo(() => {
    return products.filter((product) => {
      const inStatus = statusFilter === "all" || product.status === statusFilter;
      const inCategory = categoryFilter === "all" || product.category === categoryFilter;
      return inStatus && inCategory;
    });
  }, [products, statusFilter, categoryFilter]);

  const totalTablePages = useMemo(() => {
    const sourceCount =
      statusFilter === "all" ? Math.max(dbTotal, loadedCount) : visibleProducts.length;
    return Math.max(1, Math.ceil(sourceCount / TABLE_PAGE_SIZE));
  }, [dbTotal, loadedCount, statusFilter, visibleProducts.length]);

  const pagedVisibleProducts = useMemo(() => {
    const safePage = Math.min(tablePage, totalTablePages);
    const start = (safePage - 1) * TABLE_PAGE_SIZE;
    return visibleProducts.slice(start, start + TABLE_PAGE_SIZE);
  }, [visibleProducts, tablePage, totalTablePages]);

  const allPagedSelected =
    pagedVisibleProducts.length > 0 &&
    pagedVisibleProducts.every((product) => selectedIdSet.has(product.id));

  function toggleProductSelection(productId: string) {
    setMultiSelectedIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  }

  function togglePageSelection() {
    const pageIds = pagedVisibleProducts.map((item) => item.id);
    setMultiSelectedIds((prev) => {
      const prevSet = new Set(prev);
      const everySelected = pageIds.every((id) => prevSet.has(id));

      if (everySelected) {
        return prev.filter((id) => !pageIds.includes(id));
      }

      const next = [...prev];
      for (const id of pageIds) {
        if (!prevSet.has(id)) next.push(id);
      }
      return next;
    });
  }

  const kpi = useMemo(() => {
    const total = dbTotal;
    const active = products.filter((p) => p.status === "active").length;
    const lowStock = products.filter((p) => p.stock > 0 && p.stock < 15).length;
    const totalValue = products.reduce((sum, p) => sum + p.price * p.stock, 0);
    return { total, active, lowStock, totalValue };
  }, [products, dbTotal]);

  const fetchChunk = useCallback(
    async (chunkIndex: number, opts?: { reset?: boolean }) => {
      if (isChunkLoadingRef.current || loadedChunkIndexesRef.current.has(chunkIndex)) return;
      isChunkLoadingRef.current = true;
      if (opts?.reset) {
        setIsLoading(true);
      }
      setNotice(null);

      try {
        const trimmedQuery = debouncedQuery.trim();
        const isSearchMode = trimmedQuery.length >= 2;
        const params = new URLSearchParams({
          page: String(chunkIndex),
          limit: String(isSearchMode ? SEARCH_PAGE_SIZE : PREFETCH_BATCH_SIZE)
        });
        if (categoryFilter !== "all") {
          params.set("category", categoryFilter);
        }
        if (isSearchMode) {
          params.set("search", trimmedQuery);
        }
        params.set("sortBy", sortBy);
        params.set("sortOrder", sortOrder);

        const productsRes = await fetch(`/api/products?${params.toString()}`, {
          cache: "no-store"
        });
        if (!productsRes.ok) {
          throw new Error(`Не удалось получить товары (${productsRes.status})`);
        }

        const productPayload: unknown = await productsRes.json();
        const productItems = extractCollection(productPayload);
        const total = isObject(productPayload) && typeof productPayload.total === "number" ? productPayload.total : 0;
        setDbTotal(total);

        const mapped = productItems
          .map((item, index) => mapProduct(item, chunkIndex * PREFETCH_BATCH_SIZE + index, statusCacheRef.current))
          .filter((item): item is Product => item !== null);

        loadedChunkIndexesRef.current.add(chunkIndex);
        setProducts((prev) => {
          const next = opts?.reset ? [] : prev;
          const byId = new Map<string, Product>();
          for (const item of next) byId.set(item.id, item);
          for (const item of mapped) byId.set(item.id, item);
          const merged = Array.from(byId.values());
          setLoadedCount(merged.length);
          return merged;
        });
        setOriginalById((prev) => {
          const base = opts?.reset ? {} : prev;
          const next = { ...base };
          for (const item of mapped) {
            if (!next[item.id]) next[item.id] = { ...item };
          }
          return next;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Ошибка загрузки товаров";
        setNotice(message);
      } finally {
        isChunkLoadingRef.current = false;
        setIsLoading(false);
      }
    },
    [categoryFilter, debouncedQuery, sortBy, sortOrder]
  );

  const ensureChunkForPage = useCallback(
    async (targetPage: number) => {
      const requiredItems = targetPage * TABLE_PAGE_SIZE;
      if (requiredItems <= loadedCount || loadedCount >= dbTotal) return;

      const nextChunk = Math.floor(loadedCount / PREFETCH_BATCH_SIZE);
      await fetchChunk(nextChunk);
    },
    [loadedCount, dbTotal, fetchChunk]
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  useEffect(() => {
    loadedChunkIndexesRef.current = new Set();
    setProducts([]);
    setOriginalById({});
    setLoadedCount(0);
    setDbTotal(0);
    setMultiSelectedIds([]);
    setSelectedId("");
    void fetchChunk(0, { reset: true });
  }, [categoryFilter, debouncedQuery, sortBy, sortOrder, fetchChunk]);

  useEffect(() => {
    void ensureChunkForPage(tablePage);
  }, [tablePage, ensureChunkForPage]);

  useEffect(() => {
    setTablePage(1);
  }, [query, statusFilter, categoryFilter, sortBy, sortOrder]);

  useEffect(() => {
    if (tablePage > totalTablePages) {
      setTablePage(totalTablePages);
    }
  }, [tablePage, totalTablePages]);

  useEffect(() => {
    if (selectedId.length === 0) return;
    const exists = products.some((item) => item.id === selectedId);
    if (!exists) {
      const fallback = products[0];
      setSelectedId(fallback ? fallback.id : "");
      if (!fallback) setIsDetailOpen(false);
    }
  }, [products, selectedId]);

  useEffect(() => {
    setMultiSelectedIds((prev) => prev.filter((id) => products.some((item) => item.id === id)));
  }, [products]);

  useEffect(() => {
    if (multiSelectedIds.length > 1) {
      setIsDetailOpen(false);
    }
  }, [multiSelectedIds]);

  const ensureProductDetail = useCallback(
    async (sku: string): Promise<JsonObject | null> => {
      if (detailsBySku[sku]) return detailsBySku[sku];

      const response = await fetch(`/api/products/${encodeURIComponent(sku)}`, {
        cache: "no-store"
      });

      if (!response.ok) return null;

      const payload: unknown = await response.json();
      if (!isObject(payload)) return null;

      setDetailsBySku((prev) => ({ ...prev, [sku]: payload }));
      return payload;
    },
    [detailsBySku]
  );

  function updateSelected<K extends keyof Product>(field: K, value: Product[K]) {
    if (!selectedProduct) return;

    setProducts((prev) =>
      prev.map((item) =>
        item.id === selectedProduct.id
          ? {
              ...item,
              [field]: value,
              updatedAt: new Date().toLocaleDateString("ru-RU")
            }
          : item
      )
    );
  }

  function updateBulletPoint(index: number, value: string) {
    if (!selectedProduct) return;
    const nextBulletPoints = selectedProduct.bulletPoints.map((item, itemIndex) =>
      itemIndex === index ? value : item
    );
    updateSelected("bulletPoints", nextBulletPoints);
  }

  function addBulletPoint() {
    if (!selectedProduct) return;
    updateSelected("bulletPoints", [...selectedProduct.bulletPoints, ""]);
  }

  function removeBulletPoint(index: number) {
    if (!selectedProduct) return;
    const nextBulletPoints = selectedProduct.bulletPoints.filter((_, itemIndex) => itemIndex !== index);
    updateSelected("bulletPoints", nextBulletPoints);
  }

  function updateAttributeName(index: number, value: string) {
    if (!selectedProduct) return;
    const nextAttributes = selectedProduct.attributes.map((item, itemIndex) =>
      itemIndex === index ? { ...item, name: value } : item
    );
    updateSelected("attributes", nextAttributes);
    updateSelected("attributesCount", nextAttributes.length);
  }

  function updateAttributeValues(index: number, value: string) {
    if (!selectedProduct) return;
    const nextAttributes = selectedProduct.attributes.map((item, itemIndex) =>
      itemIndex === index ? { ...item, values: normalizeValuesCsv(value) } : item
    );
    updateSelected("attributes", nextAttributes);
    updateSelected("attributesCount", nextAttributes.length);
  }

  function updateAttributeAdditional(index: number, value: boolean) {
    if (!selectedProduct) return;
    const nextAttributes = selectedProduct.attributes.map((item, itemIndex) =>
      itemIndex === index ? { ...item, additional: value } : item
    );
    updateSelected("attributes", nextAttributes);
    updateSelected("attributesCount", nextAttributes.length);
  }

  function addAttribute() {
    if (!selectedProduct) return;
    const nextAttributes = [...selectedProduct.attributes, { name: "", values: [], additional: false }];
    updateSelected("attributes", nextAttributes);
    updateSelected("attributesCount", nextAttributes.length);
  }

  function removeAttribute(index: number) {
    if (!selectedProduct) return;
    const nextAttributes = selectedProduct.attributes.filter((_, itemIndex) => itemIndex !== index);
    updateSelected("attributes", nextAttributes);
    updateSelected("attributesCount", nextAttributes.length);
  }

  async function saveChanges() {
    if (!selectedProduct || !originalSelectedProduct) return;

    if (!hasProductChanges && !hasStatusChanges) {
      setNotice("Изменений нет: ничего отправлять не нужно.");
      return;
    }

    setNotice(null);
    setIsApplying(true);

    try {
      const requests: Promise<{ kind: "product" | "status"; ok: boolean; message: string }>[] = [];

      if (hasProductChanges) {
        requests.push(
          (async () => {
            const detail = await ensureProductDetail(originalSelectedProduct.sku);
            if (!detail) {
              return {
                kind: "product",
                ok: false,
                message: "Не удалось загрузить полные данные товара для /v1/products/create"
              };
            }

            const payload = asCreatePayload(detail, selectedProduct);
            if (!payload) {
              return {
                kind: "product",
                ok: false,
                message: "Формат товара не подходит для /v1/products/create"
              };
            }

            const response = await fetch("/api/products", {
              method: "POST",
              headers: {
                "content-type": "application/json"
              },
              body: JSON.stringify(payload)
            });

            if (!response.ok) {
              const text = await response.text();
              return {
                kind: "product",
                ok: false,
                message: `Карточка не сохранена (${response.status}): ${text.slice(0, 180)}`
              };
            }

            return {
              kind: "product",
              ok: true,
              message: "Карточка обновлена через /v1/products/create"
            };
          })()
        );
      }

      if (hasStatusChanges) {
        const targetStatus = selectedProduct.status;

        requests.push(
          (async () => {
            const response = await fetch("/api/products/update-status", {
              method: "POST",
              headers: {
                "content-type": "application/json"
              },
              body: JSON.stringify({
                status: [
                  {
                    sku: selectedProduct.sku,
                    active: targetStatus === "active"
                  }
                ]
              })
            });

            if (!response.ok) {
              const text = await response.text();
              return {
                kind: "status",
                ok: false,
                message: `Статус не обновлён (${response.status}): ${text.slice(0, 180)}`
              };
            }

            statusCacheRef.current = {
              ...statusCacheRef.current,
              [selectedProduct.sku]: targetStatus
            };
            return {
              kind: "status",
              ok: true,
              message: "Статус обновлён через /v1/products/update-status"
            };
          })()
        );
      }

      const results = await Promise.all(requests);
      const failed = results.filter((result) => !result.ok);

      if (failed.length > 0) {
        setNotice(failed.map((result) => result.message).join(" | "));
      } else {
        setNotice(results.map((result) => result.message).join(" + "));
        loadedChunkIndexesRef.current = new Set();
        setProducts([]);
        setOriginalById({});
        setLoadedCount(0);
        await fetchChunk(0, { reset: true });
        await ensureChunkForPage(tablePage);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка сохранения";
      setNotice(message);
    } finally {
      setIsApplying(false);
    }
  }

  function buildBulkPricePlan() {
    if (multiSelectedIds.length === 0) {
      return { ok: false as const, error: "Сначала выберите товары для группового изменения цены." };
    }

    const parsed = parseBulkPriceExpression(bulkPriceExpression);
    if (!parsed) {
      return {
        ok: false as const,
        error:
          "Неверный формат операции. Примеры: 15 (добавить 15), -20 (уменьшить на 20), -20% (снизить на 20%), =99.99 (установить цену)."
      };
    }

    const selectedProducts = products.filter((item) => multiSelectedIds.includes(item.id));
    if (selectedProducts.length === 0) {
      return { ok: false as const, error: "Выбранные товары не найдены в текущем списке." };
    }

    const updatesById = new Map<string, number>();
    for (const product of selectedProducts) {
      const nextPrice = applyPriceOperation(product.price, parsed.operation, parsed.value);
      updatesById.set(product.id, nextPrice);
    }

    return { ok: true as const, updatesById, selectedProducts, parsed };
  }

  function applyBulkPriceLocally(updatesById: Map<string, number>) {
    setProducts((prev) =>
      prev.map((item) => {
        const nextPrice = updatesById.get(item.id);
        if (nextPrice === undefined) return item;
        return {
          ...item,
          price: nextPrice,
          updatedAt: new Date().toLocaleDateString("ru-RU")
        };
      })
    );
  }

  function applyBulkPriceChanges() {
    const plan = buildBulkPricePlan();
    if (!plan.ok) {
      setNotice(plan.error);
      return;
    }

    applyBulkPriceLocally(plan.updatesById);
    setNotice(`Изменена цена у ${plan.selectedProducts.length} товаров.`);
  }

  async function applyAndSaveBulkPriceChanges() {
    const plan = buildBulkPricePlan();
    if (!plan.ok) {
      setNotice(plan.error);
      return;
    }

    applyBulkPriceLocally(plan.updatesById);
    setNotice(`Применяем и сохраняем цену для ${plan.selectedProducts.length} товаров...`);
    setIsBulkSaving(true);

    try {
      const succeededIds: string[] = [];
      const failures: string[] = [];

      for (const selectedProduct of plan.selectedProducts) {
        const originalProduct = originalById[selectedProduct.id];
        if (!originalProduct) {
          failures.push(`${selectedProduct.sku}: нет исходных данных`);
          continue;
        }

        const nextPrice = plan.updatesById.get(selectedProduct.id);
        if (nextPrice === undefined) {
          failures.push(`${selectedProduct.sku}: не удалось рассчитать цену`);
          continue;
        }

        const detail = await ensureProductDetail(originalProduct.sku);
        if (!detail) {
          failures.push(`${selectedProduct.sku}: нет данных товара для payload`);
          continue;
        }

        const nextProduct: Product = {
          ...selectedProduct,
          price: nextPrice
        };
        const payload = asCreatePayload(detail, nextProduct);
        if (!payload) {
          failures.push(`${selectedProduct.sku}: не удалось собрать payload`);
          continue;
        }

        const response = await fetch("/api/products", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const text = await response.text();
          failures.push(`${selectedProduct.sku}: ${response.status} ${text.slice(0, 80)}`);
          continue;
        }

        succeededIds.push(selectedProduct.id);
      }

      if (succeededIds.length > 0) {
        const succeededSet = new Set(succeededIds);
        setOriginalById((prev) => {
          const next = { ...prev };
          for (const product of products) {
            if (!succeededSet.has(product.id)) continue;
            const updatedPrice = plan.updatesById.get(product.id);
            if (updatedPrice === undefined) continue;
            next[product.id] = {
              ...product,
              price: updatedPrice,
              updatedAt: new Date().toLocaleDateString("ru-RU")
            };
          }
          return next;
        });
      }

      if (failures.length > 0) {
        setNotice(
          `Сохранено: ${succeededIds.length}, ошибок: ${failures.length}. ${failures
            .slice(0, 3)
            .join(" | ")}`
        );
      } else {
        setNotice(`Цены обновлены и сохранены для ${succeededIds.length} товаров.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка группового сохранения";
      setNotice(message);
    } finally {
      setIsBulkSaving(false);
    }
  }

  function deleteProduct() {
    setNotice("Удаление пока недоступно: в backend нет DELETE /v1/products/{sku}");
  }

  async function syncProductsToDatabase() {
    setIsSyncingDb(true);
    setNotice("Загрузка из API запущена (аккаунт JV)...");

    try {
      const response = await fetch("/api/products/sync-to-db?accountSource=JV&limit=100", {
        method: "POST",
        cache: "no-store"
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          isObject(payload) && typeof payload.detail === "string"
            ? payload.detail
            : `Ошибка синхронизации (${response.status})`
        );
      }

      const fetched = isObject(payload) && typeof payload.fetched === "number" ? payload.fetched : 0;
      const upserted = isObject(payload) && typeof payload.upserted === "number" ? payload.upserted : 0;
      const pagesProcessed =
        isObject(payload) && typeof payload.pagesProcessed === "number" ? payload.pagesProcessed : 0;
      const accountSource =
        isObject(payload) && typeof payload.accountSource === "string" ? payload.accountSource : "JV";
      setNotice(
        `Синхронизация завершена: account=${accountSource}, pages=${pagesProcessed}, fetched=${fetched}, upserted=${upserted}.`
      );
      setTablePage(1);
      loadedChunkIndexesRef.current = new Set();
      setProducts([]);
      setOriginalById({});
      setLoadedCount(0);
      await fetchChunk(0, { reset: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось синхронизировать данные с БД";
      setNotice(message);
    } finally {
      setIsSyncingDb(false);
    }
  }

  return (
    <main className="otto-page">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <section className="app-shell">
        <aside className="sidebar">
          <div>
            <p className="brand">OTTO Контроль</p>
            <p className="brand-subtitle">DB</p>
          </div>

          <nav className="side-nav">
            <button className="nav-item active">Каталог</button>
            <Link className="nav-item" href="/creator">
              Создание товара
            </Link>
          </nav>

          <div className="side-card">
            <p className="side-card-title">Интеграция OTTO</p>
            <p className="side-card-text">Источник: база данных</p>
            <span className="sync-pill">DB</span>
          </div>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <div>
              <h1>Управление товарами</h1>
            </div>
            <button className="primary-btn" onClick={syncProductsToDatabase} disabled={isSyncingDb || isLoading}>
              {isSyncingDb ? "Загрузка..." : "Синк DB"}
            </button>
          </header>

          {notice ? <p className="helper-banner">{notice}</p> : null}

          <section className="kpi-grid">
            <article className="kpi-card">
              <p>Всего в БД</p>
              <strong>{kpi.total}</strong>
            </article>
            <article className="kpi-card">
              <p>Активные</p>
              <strong>{kpi.active}</strong>
            </article>
            <article className="kpi-card">
              <p>Низкий остаток</p>
              <strong>{kpi.lowStock}</strong>
            </article>
            <article className="kpi-card">
              <p>Стоимость</p>
              <strong>{formatCurrency(kpi.totalValue)}</strong>
            </article>
          </section>

          <section className="content-grid">
            <div className="catalog-panel">
              <div className="toolbar">
                <input
                  type="search"
                  placeholder="Поиск: SKU, название, reference, EAN, категория..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortByField)}>
                  <option value="id">Сортировка: новые</option>
                  <option value="productLine">По названию</option>
                  <option value="sku">По SKU</option>
                  <option value="productReference">По Reference</option>
                  <option value="category">По категории</option>
                  <option value="brandId">По бренду</option>
                  <option value="ean">По EAN</option>
                  <option value="price">По цене</option>
                </select>
                <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)}>
                  <option value="DESC">По убыванию</option>
                  <option value="ASC">По возрастанию</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as "all" | ProductStatus)}
                >
                  <option value="all">Все статусы</option>
                  <option value="active">Активные</option>
                  <option value="non_active">Неактивные</option>
                </select>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="all">Все категории</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bulk-toolbar">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={togglePageSelection}
                  disabled={pagedVisibleProducts.length === 0}
                >
                  {allPagedSelected ? "Снять страницу" : "Выбрать страницу"}
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setMultiSelectedIds([])}
                  disabled={multiSelectedIds.length === 0}
                >
                  Снять выбор
                </button>
                <span className="bulk-selected-count">Выбрано: {multiSelectedIds.length}</span>
                <input
                  type="text"
                  value={bulkPriceExpression}
                  onChange={(event) => setBulkPriceExpression(event.target.value)}
                  placeholder="Операция цены: 15, -20, -20%, =99.99"
                />
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={applyBulkPriceChanges}
                  disabled={multiSelectedIds.length === 0}
                >
                  Применить
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={applyAndSaveBulkPriceChanges}
                  disabled={multiSelectedIds.length === 0 || isBulkSaving}
                >
                  {isBulkSaving ? "Сохраняем..." : "Применить и сохранить"}
                </button>
              </div>

              <div className="product-list">
                {isLoading ? <div className="empty-state">Загрузка товаров...</div> : null}
                {!isLoading && products.length === 0 ? (
                  <div className="empty-state">В БД нет товаров</div>
                ) : null}

                {!isLoading && products.length > 0 && visibleProducts.length === 0 ? (
                  <div className="empty-state">По заданным фильтрам товары не найдены</div>
                ) : null}

                {!isLoading
                  ? (
                    <div className="product-table">
                      <div className="product-row product-row-head">
                        <span>Выбор</span>
                        <div className="row-open-head">
                          <span>Товар</span>
                          <span>SKU</span>
                          <span>Категория</span>
                          <span>Цена</span>
                        </div>
                      </div>
                      {pagedVisibleProducts.map((product) => {
                        const isActiveRow = selectedId === product.id;
                        const isMultiSelected = selectedIdSet.has(product.id);
                        return (
                          <div
                            key={product.id}
                            className={`product-row ${isActiveRow ? "selected" : ""} ${
                              isMultiSelected ? "multi-selected" : ""
                            }`}
                          >
                            <button
                              type="button"
                              className={`row-select-btn ${isMultiSelected ? "active" : ""}`}
                              onClick={() => toggleProductSelection(product.id)}
                              title={
                                isMultiSelected
                                  ? "Убрать из группового выбора"
                                  : "Добавить в групповой выбор"
                              }
                            >
                              {isMultiSelected ? "✓" : "+"}
                            </button>
                            <button
                              type="button"
                              className="row-open-btn"
                              onClick={() => {
                                setSelectedId(product.id);
                                setIsDetailOpen(true);
                              }}
                            >
                              <span className="row-name" title={product.name}>
                                {product.name}
                              </span>
                              <span title={product.sku}>{product.sku}</span>
                              <span title={product.category}>{product.category}</span>
                              <span>{formatCurrency(product.price)}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )
                  : null}

                {!isLoading && visibleProducts.length > 0 ? (
                  <div className="pagination-bar">
                    <span className="pagination-info">
                      {`${tablePage}/${totalTablePages} • ${products.length}/${dbTotal}`}
                    </span>
                    <div className="pagination-actions">
                      <button
                        className="secondary-btn"
                        onClick={() => setTablePage((prev) => Math.max(1, prev - 1))}
                        disabled={tablePage <= 1}
                      >
                        Назад
                      </button>
                      <button
                        className="secondary-btn"
                        onClick={() => setTablePage((prev) => Math.min(totalTablePages, prev + 1))}
                        disabled={tablePage >= totalTablePages}
                      >
                        Вперёд
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <aside className="editor-panel">
              {selectedProduct && isDetailOpen && multiSelectedIds.length <= 1 ? (
                <>
                  <div className="editor-head">
                    <div>
                      <h2>Карточка товара</h2>
                      <p>{selectedProduct.updatedAt}</p>
                    </div>
                    <button className="ghost-btn" onClick={() => setIsDetailOpen(false)}>
                      Закрыть
                    </button>
                  </div>

                  <div className="editor-grid">
                    <label>
                      Название
                      <input
                        value={selectedProduct.name}
                        onChange={(event) => updateSelected("name", event.target.value)}
                      />
                    </label>
                    <label>
                      SKU
                      <input
                        value={selectedProduct.sku}
                        onChange={(event) => updateSelected("sku", event.target.value)}
                      />
                    </label>
                    <label>
                      Бренд
                      <select
                        value={selectedProduct.brand}
                        onChange={(event) => updateSelected("brand", event.target.value as ProductBrand)}
                      >
                        {BRAND_OPTIONS.map((brand) => (
                          <option key={brand} value={brand}>
                            {brand}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      ID бренда
                      <input
                        value={selectedProduct.brandId}
                        onChange={(event) => updateSelected("brandId", event.target.value)}
                      />
                    </label>
                    <label>
                      Категория
                      <input
                        value={selectedProduct.category}
                        onChange={(event) => updateSelected("category", event.target.value)}
                      />
                    </label>
                    <label>
                      Статус
                      <select
                        value={selectedProduct.status}
                        onChange={(event) => updateSelected("status", event.target.value as ProductStatus)}
                      >
                        <option value="active">Активен</option>
                        <option value="non_active">Неактивен</option>
                      </select>
                    </label>
                    <label>
                      EAN
                      <input value={selectedProduct.ean} onChange={(event) => updateSelected("ean", event.target.value)} />
                    </label>
                    <label>
                      MOIN
                      <input
                        value={selectedProduct.moin}
                        onChange={(event) => updateSelected("moin", event.target.value)}
                      />
                    </label>
                    <label>
                      Цена (EUR)
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={selectedProduct.price}
                        onChange={(event) => updateSelected("price", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      Остаток
                      <input
                        type="number"
                        min="0"
                        value={selectedProduct.stock}
                        onChange={(event) => updateSelected("stock", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      Product Reference
                      <input
                        value={selectedProduct.productReference}
                        onChange={(event) => updateSelected("productReference", event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="product-actions">
                    <button className="danger" onClick={deleteProduct}>
                      Удалить
                    </button>
                  </div>

                  <div className="product-detail-card">
                    <p className="detail-title">Описание товара</p>
                    <p className="detail-description">
                      {selectedProduct.description.length > 0
                        ? selectedProduct.description.slice(0, 420)
                        : "Описание отсутствует"}
                    </p>
                    <div className="detail-bullets">
                      {selectedProduct.bulletPoints.slice(0, 3).map((point, index) => (
                        <span key={`${point}-${index}`}>{point}</span>
                      ))}
                    </div>
                  </div>

                  <div className="product-detail-card">
                    <p className="detail-title">Bullet points</p>
                    <div className="dynamic-editor">
                      {selectedProduct.bulletPoints.map((point, index) => (
                        <div className="dynamic-editor-row" key={`bullet-${index}`}>
                          <input
                            value={point}
                            onChange={(event) => updateBulletPoint(index, event.target.value)}
                            placeholder={`Bullet point ${index + 1}`}
                          />
                          <button type="button" className="ghost-btn" onClick={() => removeBulletPoint(index)}>
                            Удалить
                          </button>
                        </div>
                      ))}
                      <button type="button" className="ghost-btn" onClick={addBulletPoint}>
                        Добавить bullet point
                      </button>
                    </div>
                  </div>

                  <div className="product-detail-card">
                    <p className="detail-title">Attributes</p>
                    <div className="dynamic-editor">
                      {selectedProduct.attributes.map((attribute, index) => (
                        <div className="dynamic-editor-row attribute-row" key={`attribute-${index}`}>
                          <input
                            value={attribute.name}
                            onChange={(event) => updateAttributeName(index, event.target.value)}
                            placeholder="Название атрибута"
                          />
                          <input
                            value={attribute.values.join(", ")}
                            onChange={(event) => updateAttributeValues(index, event.target.value)}
                            placeholder="Значения через запятую"
                          />
                          <select
                            value={attribute.additional ? "true" : "false"}
                            onChange={(event) => updateAttributeAdditional(index, event.target.value === "true")}
                          >
                            <option value="false">Основной</option>
                            <option value="true">Дополнительный</option>
                          </select>
                          <button type="button" className="ghost-btn" onClick={() => removeAttribute(index)}>
                            Удалить
                          </button>
                        </div>
                      ))}
                      <button type="button" className="ghost-btn" onClick={addAttribute}>
                        Добавить атрибут
                      </button>
                    </div>
                  </div>

                  <div className="editor-analytics">
                    <article>
                      <p>Рейтинг</p>
                      <strong>{selectedProduct.rating.toFixed(1)}</strong>
                    </article>
                    <article>
                      <p>Конверсия</p>
                      <strong>
                        {selectedProduct.views === 0
                          ? "0%"
                          : `${((selectedProduct.sales / selectedProduct.views) * 100).toFixed(1)}%`}
                      </strong>
                    </article>
                    <article>
                      <p>Просмотры</p>
                      <strong>{selectedProduct.views}</strong>
                    </article>
                  </div>

                  <div className="sync-summary">
                    <p>Карточка: {hasProductChanges ? "есть" : "нет"} | Статус: {hasStatusChanges ? "есть" : "нет"}</p>
                  </div>

                  <button className="primary-btn full" onClick={saveChanges} disabled={isApplying || isBulkSaving}>
                    {isApplying ? "Сохраняем..." : "Сохранить"}
                  </button>
                </>
              ) : (
                <div className="empty-state">Выберите мини-карточку слева, чтобы открыть все данные товара</div>
              )}
            </aside>
          </section>
        </section>
      </section>
    </main>
  );
}
