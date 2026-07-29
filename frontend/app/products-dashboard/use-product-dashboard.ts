"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Product, SortByField, SortOrder } from "./types";
import { extractCollection, isActiveStatus, isObject, mapProduct } from "./utils";

const TABLE_PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 350;

type KpiSummary = {
  total: number;
  active: number;
  withErrors: number;
  onSale: number;
};

type CategoryListResponse = {
  success?: boolean;
  items?: string[];
};

export type PriceUpdateItem = {
  id: string;
  price?: number | null;
  recommendedRetailPrice?: number | null;
  salePrice?: number | null;
};

export type PriceUpdateController = "auto" | "jv" | "xl";

type PriceUpdateResponse = {
  items?: unknown[];
  message?: string;
  updated?: number;
};

function isAllCategoriesValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "" || normalized === "all" || normalized === "all categories";
}

function redirectToLoginIfUnauthorized(status: number) {
  if (status === 401 && typeof window !== "undefined") {
    window.location.assign("/login?expired=1");
  }
}

export function useProductDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortByField>("id");
  const [sortOrder, setSortOrder] = useState<SortOrder>("DESC");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(
    () => new Set()
  );
  const [tablePage, setTablePage] = useState(1);
  const [dbTotal, setDbTotal] = useState(0);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedId) ?? null,
    [products, selectedId]
  );

  const totalTablePages = useMemo(
    () => Math.max(1, Math.ceil(dbTotal / TABLE_PAGE_SIZE)),
    [dbTotal]
  );

  const kpi = useMemo<KpiSummary>(() => {
    let active = 0;
    let withErrors = 0;
    let onSale = 0;

    for (const product of products) {
      if (isActiveStatus(product.activeStatus)) active += 1;
      if (product.errorMessage) withErrors += 1;
      if (product.salePrice !== null) onSale += 1;
    }

    return {
      total: dbTotal,
      active,
      withErrors,
      onSale,
    };
  }, [dbTotal, products]);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setNotice(null);

    try {
      const params = new URLSearchParams({
        page: String(Math.max(0, tablePage - 1)),
        limit: String(TABLE_PAGE_SIZE),
        sortBy,
        sortOrder,
      });

      if (!isAllCategoriesValue(categoryFilter)) {
        params.set("category", categoryFilter);
      }

      if (debouncedQuery.trim().length > 0) {
        params.set("search", debouncedQuery.trim());
      }

      const response = await fetch(`/api/db-products?${params.toString()}`, {
        cache: "no-store",
      });
      redirectToLoginIfUnauthorized(response.status);

      if (!response.ok) {
        throw new Error(`Не удалось получить товары (${response.status})`);
      }

      const payload: unknown = await response.json();
      const items = extractCollection(payload)
        .map((item, index) => mapProduct(item, index))
        .filter((item): item is Product => item !== null);

      setProducts(items);
      setDbTotal(
        isObject(payload) && typeof payload.total === "number" ? payload.total : items.length
      );
      const currentPageIds = new Set(items.map((item) => item.id));
      setSelectedProductIds(
        (current) =>
          new Set(Array.from(current).filter((id) => currentPageIds.has(id)))
      );

      setSelectedId((currentSelectedId) => {
        const nextSelectedId = items.some((item) => item.id === currentSelectedId)
          ? currentSelectedId
          : "";

        if (!nextSelectedId) {
          setIsDetailOpen(false);
        }

        return nextSelectedId;
      });

      if (items.length === 0) {
        setIsDetailOpen(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка загрузки товаров";
      setProducts([]);
      setDbTotal(0);
      setSelectedId("");
      setIsDetailOpen(false);
      setNotice(message);
    } finally {
      setIsLoading(false);
    }
  }, [categoryFilter, debouncedQuery, sortBy, sortOrder, tablePage]);

  const openProduct = useCallback((productId: string) => {
    setSelectedId(productId);
    setIsDetailOpen(true);
  }, []);

  const closeProduct = useCallback(() => {
    setIsDetailOpen(false);
    setSelectedId("");
  }, []);

  const toggleProductSelection = useCallback((productId: string) => {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }, []);

  const togglePageSelection = useCallback(() => {
    setSelectedProductIds((current) => {
      const currentPageIds = products.map((product) => product.id);
      const hasEveryVisibleProduct =
        currentPageIds.length > 0 && currentPageIds.every((id) => current.has(id));
      if (hasEveryVisibleProduct) {
        return new Set();
      }
      return new Set(currentPageIds);
    });
  }, [products]);

  const clearProductSelection = useCallback(() => {
    setSelectedProductIds(new Set());
  }, []);

  const updateProductPrices = useCallback(async (
    items: PriceUpdateItem[],
    controller: PriceUpdateController = "auto",
  ) => {
    if (items.length === 0) {
      throw new Error("Не выбраны товары для обновления");
    }

    const response = await fetch("/api/db-products/prices", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ controller, items }),
      cache: "no-store",
    });
    redirectToLoginIfUnauthorized(response.status);
    const payload = (await response.json().catch(() => null)) as PriceUpdateResponse | null;

    if (!response.ok) {
      throw new Error(payload?.message ?? `Не удалось обновить цены (${response.status})`);
    }

    const updatedProducts = (payload?.items ?? [])
      .map((item, index) => mapProduct(item, index))
      .filter((item): item is Product => item !== null);
    if (updatedProducts.length > 0) {
      const updatedById = new Map(updatedProducts.map((product) => [product.id, product]));
      setProducts((current) =>
        current.map((product) => updatedById.get(product.id) ?? product)
      );
    }
    setNotice(`Цены отправлены в OTTO и обновлены локально: ${payload?.updated ?? updatedProducts.length}`);
    return updatedProducts;
  }, []);

  useEffect(() => {
    let active = true;

    async function loadCategories() {
      try {
        const response = await fetch("/api/products/available-categories", {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as CategoryListResponse;
        if (!active) {
          return;
        }

        setCategories(
          Array.isArray(payload.items)
            ? payload.items.filter((item): item is string => typeof item === "string")
            : []
        );
      } catch {
        if (active) {
          setCategories([]);
        }
      }
    }

    void loadCategories();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  useEffect(() => {
    setTablePage(1);
  }, [query, categoryFilter, sortBy, sortOrder]);

  useEffect(() => {
    if (tablePage > totalTablePages) {
      setTablePage(totalTablePages);
    }
  }, [tablePage, totalTablePages]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  return {
    categories,
    categoryFilter,
    dbTotal,
    isDetailOpen,
    isLoading,
    kpi,
    notice,
    closeProduct,
    clearProductSelection,
    openProduct,
    products,
    query,
    selectedId,
    selectedProductIds,
    selectedProduct,
    setCategoryFilter: (value: string) =>
      setCategoryFilter(isAllCategoriesValue(value) ? "all" : value),
    setIsDetailOpen,
    setQuery,
    setSortBy,
    setSortOrder,
    setTablePage,
    sortBy,
    sortOrder,
    tablePage,
    togglePageSelection,
    toggleProductSelection,
    totalTablePages,
    updateProductPrices,
  };
}
