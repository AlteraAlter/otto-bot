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

      setSelectedId((currentSelectedId) => {
        if (items.some((item) => item.id === currentSelectedId)) return currentSelectedId;
        return items[0]?.id ?? "";
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

  useEffect(() => {
    let active = true;

    async function loadCategories() {
      try {
        const response = await fetch("/api/products/available-categories", {
          cache: "force-cache",
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
    openProduct,
    products,
    query,
    selectedId,
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
    totalTablePages,
  };
}
