"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { JsonObject, Product, ProductBaseline, ProductStatus, SortByField, SortOrder } from "./types";
import {
  applyPriceOperation,
  asCreatePayload,
  createProductBaseline,
  extractCollection,
  hasComparableChanges,
  isObject,
  mapProduct,
  normalizeValuesCsv,
  parseBulkPriceExpression,
  toDateLabel
} from "./utils";

const TABLE_PAGE_SIZE = 30;
const PREFETCH_BATCH_SIZE = 250;
const SEARCH_PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 350;

type KpiSummary = {
  total: number;
  active: number;
  lowStock: number;
  totalValue: number;
};

function emptyBaselines(): Record<string, ProductBaseline> {
  return {};
}

export function useProductDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
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
  const [baselineById, setBaselineById] = useState<Record<string, ProductBaseline>>(emptyBaselines);

  const detailsBySkuRef = useRef<Record<string, JsonObject>>({});
  const statusCacheRef = useRef<Record<string, ProductStatus>>({});
  const loadedChunkIndexesRef = useRef<Set<number>>(new Set());
  const isChunkLoadingRef = useRef(false);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedId) ?? null,
    [products, selectedId]
  );
  const originalSelectedProduct = selectedProduct ? baselineById[selectedProduct.id] ?? null : null;
  const selectedIdSet = useMemo(() => new Set(multiSelectedIds), [multiSelectedIds]);

  const hasProductChanges = useMemo(() => {
    if (!selectedProduct || !originalSelectedProduct) return false;
    return hasComparableChanges(selectedProduct, originalSelectedProduct);
  }, [selectedProduct, originalSelectedProduct]);

  const hasStatusChanges = useMemo(() => {
    if (!selectedProduct || !originalSelectedProduct) return false;
    return selectedProduct.status !== originalSelectedProduct.status;
  }, [selectedProduct, originalSelectedProduct]);

  const categories = useMemo(() => {
    const categorySet = new Set<string>();
    for (const product of products) {
      categorySet.add(product.category);
    }
    return Array.from(categorySet);
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
  }, [tablePage, totalTablePages, visibleProducts]);

  const allPagedSelected =
    pagedVisibleProducts.length > 0 &&
    pagedVisibleProducts.every((product) => selectedIdSet.has(product.id));

  const kpi = useMemo<KpiSummary>(() => {
    let active = 0;
    let lowStock = 0;
    let totalValue = 0;

    for (const product of products) {
      if (product.status === "active") active += 1;
      if (product.stock > 0 && product.stock < 15) lowStock += 1;
      totalValue += product.price * product.stock;
    }

    return {
      total: dbTotal,
      active,
      lowStock,
      totalValue
    };
  }, [dbTotal, products]);

  const resetLoadedProducts = useCallback(() => {
    loadedChunkIndexesRef.current = new Set();
    setProducts([]);
    setBaselineById(emptyBaselines());
    setLoadedCount(0);
    setDbTotal(0);
    setMultiSelectedIds([]);
    setSelectedId("");
  }, []);

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
        const pageSize = isSearchMode ? SEARCH_PAGE_SIZE : PREFETCH_BATCH_SIZE;
        const params = new URLSearchParams({
          page: String(chunkIndex),
          limit: String(pageSize),
          sortBy,
          sortOrder
        });
        console.log(params);

        if (categoryFilter !== "all") {
          params.set("category", categoryFilter);
        }
        if (isSearchMode) {
          params.set("search", trimmedQuery);
        }

        const productsRes = await fetch(`/api/products?${params.toString()}`, {
          cache: "no-store"
        });

        if (!productsRes.ok) {
          throw new Error(`Не удалось получить товары (${productsRes.status})`);
        }

        const productPayload: unknown = await productsRes.json();
        const productItems = extractCollection(productPayload);
        const total =
          isObject(productPayload) && typeof productPayload.total === "number"
            ? productPayload.total
            : 0;
        setDbTotal(total);

        const mapped = productItems
          .map((item, index) => mapProduct(item, chunkIndex * pageSize + index, statusCacheRef.current))
          .filter((item): item is Product => item !== null);

        loadedChunkIndexesRef.current.add(chunkIndex);
        console.log(loadedChunkIndexesRef.current)
        setProducts((prev) => {
          const source = opts?.reset ? [] : prev;
          const byId = new Map<string, Product>();
          for (const item of source) byId.set(item.id, item);
          for (const item of mapped) byId.set(item.id, item);
          const merged = Array.from(byId.values());
          setLoadedCount(merged.length);
          return merged;
        });

        setBaselineById((prev) => {
          const source = opts?.reset ? emptyBaselines() : prev;
          const next = { ...source };

          // Keep a light baseline snapshot instead of duplicating full product objects.
          for (const item of mapped) {
            if (!next[item.id]) next[item.id] = createProductBaseline(item);
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
    [dbTotal, fetchChunk, loadedCount]
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
    resetLoadedProducts();
    void fetchChunk(0, { reset: true });
  }, [categoryFilter, debouncedQuery, fetchChunk, resetLoadedProducts, sortBy, sortOrder]);

  useEffect(() => {
    void ensureChunkForPage(tablePage);
  }, [ensureChunkForPage, tablePage]);

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
    const productIdSet = new Set(products.map((item) => item.id));
    setMultiSelectedIds((prev) => prev.filter((id) => productIdSet.has(id)));
  }, [products]);

  useEffect(() => {
    if (multiSelectedIds.length > 1) {
      setIsDetailOpen(false);
    }
  }, [multiSelectedIds]);

  const ensureProductDetail = useCallback(async (sku: string): Promise<JsonObject | null> => {
    const cached = detailsBySkuRef.current[sku];
    if (cached) return cached;

    const response = await fetch(`/api/products/${encodeURIComponent(sku)}`, {
      cache: "no-store"
    });
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    if (!isObject(payload)) return null;

    detailsBySkuRef.current[sku] = payload;
    return payload;
  }, []);

  const openProduct = useCallback((productId: string) => {
    setSelectedId(productId);
    setIsDetailOpen(true);
  }, []);

  const toggleProductSelection = useCallback((productId: string) => {
    setMultiSelectedIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  }, []);

  const togglePageSelection = useCallback(() => {
    const pageIds = pagedVisibleProducts.map((item) => item.id);
    setMultiSelectedIds((prev) => {
      const prevSet = new Set(prev);
      const pageIdSet = new Set(pageIds);
      const everySelected = pageIds.every((id) => prevSet.has(id));

      if (everySelected) {
        return prev.filter((id) => !pageIdSet.has(id));
      }

      const next = [...prev];
      for (const id of pageIds) {
        if (!prevSet.has(id)) next.push(id);
      }
      return next;
    });
  }, [pagedVisibleProducts]);

  const updateSelected = useCallback(
    <K extends keyof Product>(field: K, value: Product[K]) => {
      if (!selectedProduct) return;

      setProducts((prev) =>
        prev.map((item) =>
          item.id === selectedProduct.id
            ? {
              ...item,
              [field]: value,
              updatedAt: toDateLabel(new Date().toISOString())
            }
            : item
        )
      );
    },
    [selectedProduct]
  );

  const updateBulletPoint = useCallback(
    (index: number, value: string) => {
      if (!selectedProduct) return;
      const nextBulletPoints = selectedProduct.bulletPoints.map((item, itemIndex) =>
        itemIndex === index ? value : item
      );
      updateSelected("bulletPoints", nextBulletPoints);
    },
    [selectedProduct, updateSelected]
  );

  const addBulletPoint = useCallback(() => {
    if (!selectedProduct) return;
    updateSelected("bulletPoints", [...selectedProduct.bulletPoints, ""]);
  }, [selectedProduct, updateSelected]);

  const removeBulletPoint = useCallback(
    (index: number) => {
      if (!selectedProduct) return;
      const nextBulletPoints = selectedProduct.bulletPoints.filter((_, itemIndex) => itemIndex !== index);
      updateSelected("bulletPoints", nextBulletPoints);
    },
    [selectedProduct, updateSelected]
  );

  const updateAttributeName = useCallback(
    (index: number, value: string) => {
      if (!selectedProduct) return;
      const nextAttributes = selectedProduct.attributes.map((item, itemIndex) =>
        itemIndex === index ? { ...item, name: value } : item
      );
      updateSelected("attributes", nextAttributes);
      updateSelected("attributesCount", nextAttributes.length);
    },
    [selectedProduct, updateSelected]
  );

  const updateAttributeValues = useCallback(
    (index: number, value: string) => {
      if (!selectedProduct) return;
      const nextAttributes = selectedProduct.attributes.map((item, itemIndex) =>
        itemIndex === index ? { ...item, values: normalizeValuesCsv(value) } : item
      );
      updateSelected("attributes", nextAttributes);
      updateSelected("attributesCount", nextAttributes.length);
    },
    [selectedProduct, updateSelected]
  );

  const updateAttributeAdditional = useCallback(
    (index: number, value: boolean) => {
      if (!selectedProduct) return;
      const nextAttributes = selectedProduct.attributes.map((item, itemIndex) =>
        itemIndex === index ? { ...item, additional: value } : item
      );
      updateSelected("attributes", nextAttributes);
      updateSelected("attributesCount", nextAttributes.length);
    },
    [selectedProduct, updateSelected]
  );

  const addAttribute = useCallback(() => {
    if (!selectedProduct) return;
    const nextAttributes = [...selectedProduct.attributes, { name: "", values: [], additional: false }];
    updateSelected("attributes", nextAttributes);
    updateSelected("attributesCount", nextAttributes.length);
  }, [selectedProduct, updateSelected]);

  const removeAttribute = useCallback(
    (index: number) => {
      if (!selectedProduct) return;
      const nextAttributes = selectedProduct.attributes.filter((_, itemIndex) => itemIndex !== index);
      updateSelected("attributes", nextAttributes);
      updateSelected("attributesCount", nextAttributes.length);
    },
    [selectedProduct, updateSelected]
  );

  const saveChanges = useCallback(async () => {
    if (!selectedProduct || !originalSelectedProduct) return;

    if (!hasProductChanges && !hasStatusChanges) {
      setNotice("Изменений нет: ничего отправлять не нужно.");
      return;
    }

    setNotice(null);
    setIsApplying(true);

    try {
      const requests: Promise<{ ok: boolean; message: string }>[] = [];

      if (hasProductChanges) {
        requests.push(
          (async () => {
            const detail = await ensureProductDetail(originalSelectedProduct.sku);
            if (!detail) {
              return {
                ok: false,
                message: "Не удалось загрузить полные данные товара для /v1/products/create"
              };
            }

            const payload = asCreatePayload(detail, selectedProduct);
            if (!payload) {
              return {
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
                ok: false,
                message: `Карточка не сохранена (${response.status}): ${text.slice(0, 180)}`
              };
            }

            return {
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
                ok: false,
                message: `Статус не обновлён (${response.status}): ${text.slice(0, 180)}`
              };
            }

            statusCacheRef.current = {
              ...statusCacheRef.current,
              [selectedProduct.sku]: targetStatus
            };

            return {
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
        setBaselineById((prev) => ({
          ...prev,
          [selectedProduct.id]: createProductBaseline(selectedProduct)
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка сохранения";
      setNotice(message);
    } finally {
      setIsApplying(false);
    }
  }, [
    ensureProductDetail,
    hasProductChanges,
    hasStatusChanges,
    originalSelectedProduct,
    selectedProduct
  ]);

  const buildBulkPricePlan = useCallback(() => {
    if (multiSelectedIds.length === 0) {
      return {
        ok: false as const,
        error: "Сначала выберите товары для группового изменения цены."
      };
    }

    const parsed = parseBulkPriceExpression(bulkPriceExpression);
    if (!parsed) {
      return {
        ok: false as const,
        error:
          "Неверный формат операции. Примеры: 15 (добавить 15), -20 (уменьшить на 20), -20% (снизить на 20%), =99.99 (установить цену)."
      };
    }

    const selectedProducts = products.filter((item) => selectedIdSet.has(item.id));
    if (selectedProducts.length === 0) {
      return {
        ok: false as const,
        error: "Выбранные товары не найдены в текущем списке."
      };
    }

    const updatesById = new Map<string, number>();
    for (const product of selectedProducts) {
      updatesById.set(product.id, applyPriceOperation(product.price, parsed.operation, parsed.value));
    }

    return { ok: true as const, parsed, selectedProducts, updatesById };
  }, [bulkPriceExpression, multiSelectedIds.length, products, selectedIdSet]);

  const applyBulkPriceLocally = useCallback((updatesById: Map<string, number>) => {
    setProducts((prev) =>
      prev.map((item) => {
        const nextPrice = updatesById.get(item.id);
        if (nextPrice === undefined) return item;
        return {
          ...item,
          price: nextPrice,
          updatedAt: toDateLabel(new Date().toISOString())
        };
      })
    );
  }, []);

  const applyBulkPriceChanges = useCallback(() => {
    const plan = buildBulkPricePlan();
    if (!plan.ok) {
      setNotice(plan.error);
      return;
    }

    applyBulkPriceLocally(plan.updatesById);
    setNotice(`Изменена цена у ${plan.selectedProducts.length} товаров.`);
  }, [applyBulkPriceLocally, buildBulkPricePlan]);

  const applyAndSaveBulkPriceChanges = useCallback(async () => {
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
      console.log(`BaseLineId: ${baselineById}`)
      for (const selectedProduct of plan.selectedProducts) {
        const baseline = baselineById[selectedProduct.id];
        if (!baseline) {
          failures.push(`${selectedProduct.sku}: нет исходных данных`);
          continue;
        }

        const nextPrice = plan.updatesById.get(selectedProduct.id);
        if (nextPrice === undefined) {
          failures.push(`${selectedProduct.sku}: не удалось рассчитать цену`);
          continue;
        }

        const detail = await ensureProductDetail(baseline.sku);
        if (!detail) {
          failures.push(`${selectedProduct.sku}: нет данных товара для payload`);
          continue;
        }

        const payload = asCreatePayload(detail, {
          ...selectedProduct,
          price: nextPrice
        });
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
        setBaselineById((prev) => {
          const next = { ...prev };

          // Only refresh baselines that were actually persisted.
          for (const product of products) {
            if (!succeededSet.has(product.id)) continue;
            const updatedPrice = plan.updatesById.get(product.id);
            if (updatedPrice === undefined) continue;
            next[product.id] = createProductBaseline({
              ...product,
              price: updatedPrice,
              updatedAt: toDateLabel(new Date().toISOString())
            });
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
  }, [applyBulkPriceLocally, baselineById, buildBulkPricePlan, ensureProductDetail, products]);

  const deleteProduct = useCallback(() => {
    setNotice("Удаление пока недоступно: в backend нет DELETE /v1/products/{sku}");
  }, []);

  const syncProductsToDatabase = useCallback(async () => {
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
      resetLoadedProducts();
      await fetchChunk(0, { reset: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось синхронизировать данные с БД";
      setNotice(message);
    } finally {
      setIsSyncingDb(false);
    }
  }, [fetchChunk, resetLoadedProducts]);

  return {
    allPagedSelected,
    bulkPriceExpression,
    categories,
    categoryFilter,
    dbTotal,
    hasProductChanges,
    hasStatusChanges,
    isApplying,
    isBulkSaving,
    isDetailOpen,
    isLoading,
    isSyncingDb,
    kpi,
    multiSelectedIds,
    notice,
    pagedVisibleProducts,
    products,
    query,
    selectedId,
    selectedIdSet,
    selectedProduct,
    sortBy,
    sortOrder,
    statusFilter,
    tablePage,
    totalTablePages,
    visibleProducts,
    addAttribute,
    addBulletPoint,
    applyAndSaveBulkPriceChanges,
    applyBulkPriceChanges,
    deleteProduct,
    openProduct,
    removeAttribute,
    removeBulletPoint,
    saveChanges,
    setBulkPriceExpression,
    setCategoryFilter,
    setIsDetailOpen,
    setMultiSelectedIds,
    setQuery,
    setSortBy,
    setSortOrder,
    setStatusFilter,
    setTablePage,
    syncProductsToDatabase,
    togglePageSelection,
    toggleProductSelection,
    updateAttributeAdditional,
    updateAttributeName,
    updateAttributeValues,
    updateBulletPoint,
    updateSelected
  };
}
