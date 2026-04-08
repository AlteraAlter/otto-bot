"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useRef, useState } from "react";

import { Product, SortByField, SortOrder } from "./types";
import { formatCurrency, formatDateTime, formatText } from "./utils";

type CatalogPanelProps = {
  categories: string[];
  categoryFilter: string;
  dbTotal: number;
  isCompact: boolean;
  isLoading: boolean;
  products: Product[];
  query: string;
  selectedId: string;
  sortBy: SortByField;
  sortOrder: SortOrder;
  tablePage: number;
  totalTablePages: number;
  onCategoryFilterChange: (value: string) => void;
  onOpenProduct: (productId: string) => void;
  onPageChange: (updater: number | ((prev: number) => number)) => void;
  onQueryChange: (value: string) => void;
  onSortByChange: (value: SortByField) => void;
  onSortOrderChange: (value: SortOrder) => void;
};

type ProductRowProps = {
  isCompact: boolean;
  isActiveRow: boolean;
  product: Product;
  onOpen: (productId: string) => void;
};

const ProductRow = memo(function ProductRow({
  isCompact,
  isActiveRow,
  product,
  onOpen,
}: ProductRowProps) {
  const previewImage = product.mediaAssetLinks[0] ?? null;
  const isInactive = formatText(product.activeStatus).toLowerCase().includes("inaktiv");
  const isError = Boolean(product.errorMessage);

  return (
    <div className={`product-row ${isActiveRow ? "selected" : ""}`}>
      <button type="button" className="row-open-btn" onClick={() => onOpen(product.id)}>
        {isCompact ? (
          <span className="row-primary-cell row-primary-cell-compact">
            <span className="row-thumbnail" aria-hidden="true">
              {previewImage ? (
                <img alt="" loading="lazy" src={previewImage} />
              ) : (
                <span>{formatText(product.sku).slice(0, 1) || "S"}</span>
              )}
            </span>
            <span className="row-primary-copy">
              <strong title={formatText(product.sku)}>{formatText(product.sku)}</strong>
            </span>
          </span>
        ) : (
          <>
            <span className="row-primary-cell">
              <span className="row-thumbnail" aria-hidden="true">
                {previewImage ? (
                  <img alt="" loading="lazy" src={previewImage} />
                ) : (
                  <span>{formatText(product.productReference).slice(0, 1) || "P"}</span>
                )}
              </span>
              <span className="row-primary-copy">
                <strong title={formatText(product.productReference)}>
                  {formatText(product.productReference)}
                </strong>
                <small title={formatText(product.ean)}>
                  {product.ean ? `EAN ${formatText(product.ean)}` : "Без EAN"}
                </small>
              </span>
            </span>
            <span className="row-stack-cell" title={formatText(product.sku)}>
              <strong>{formatText(product.sku)}</strong>
              <small>{product.moin ? `MOIN ${formatText(product.moin)}` : "Без MOIN"}</small>
            </span>
            <span>
              <span className="table-pill" title={formatText(product.productCategory)}>
                {formatText(product.productCategory)}
              </span>
            </span>
            <span className="row-stack-cell" title={formatText(product.marketplaceStatus)}>
              <strong>{formatText(product.marketplaceStatus)}</strong>
              <small>{formatText(product.deliveryTime)}</small>
            </span>
            <span>
              <span
                className={`table-status-pill ${
                  isError ? "danger" : isInactive ? "muted" : "success"
                }`}
                title={formatText(product.activeStatus)}
              >
                {formatText(product.activeStatus)}
              </span>
            </span>
            <span className="row-stack-cell row-price-cell">
              <strong>{formatCurrency(product.price)}</strong>
              <small>{formatDateTime(product.lastChangedAt)}</small>
            </span>
          </>
        )}
      </button>
    </div>
  );
});

export function CatalogPanel({
  categories,
  categoryFilter,
  dbTotal,
  isCompact,
  isLoading,
  products,
  query,
  selectedId,
  sortBy,
  sortOrder,
  tablePage,
  totalTablePages,
  onCategoryFilterChange,
  onOpenProduct,
  onPageChange,
  onQueryChange,
  onSortByChange,
  onSortOrderChange,
}: CatalogPanelProps) {
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const categoryMenuRef = useRef<HTMLDivElement | null>(null);

  const visibleCategories = useMemo(() => {
    const term = categorySearch.trim().toLowerCase();
    if (!term) {
      return categories;
    }
    return categories.filter((category) => category.toLowerCase().includes(term));
  }, [categories, categorySearch]);

  const selectedCategoryLabel =
    categoryFilter === "all" ? "Все категории" : categoryFilter;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!categoryMenuRef.current) return;
      if (!categoryMenuRef.current.contains(event.target as Node)) {
        setIsCategoryMenuOpen(false);
      }
    }

    if (isCategoryMenuOpen) {
      window.addEventListener("mousedown", handlePointerDown);
    }

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isCategoryMenuOpen]);

  return (
    <div className={`catalog-panel ${isCompact ? "catalog-panel-compact" : ""}`.trim()}>
      <div className="panel-header">
        <div>
          <h2>Товары из базы</h2>
          <p>
            Таблица показывает реальные поля импортированного XLSX, которые сейчас
            лежат в локальной базе.
          </p>
        </div>
        <div className="panel-meta">
          <span>{`На странице ${products.length}`}</span>
          <span>{`Всего в базе ${dbTotal}`}</span>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Поиск по SKU, reference, EAN, MOIN или категории"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <select
          value={sortBy}
          onChange={(event) => onSortByChange(event.target.value as SortByField)}
        >
          <option value="id">Сортировка: новые</option>
          <option value="productReference">По reference</option>
          <option value="sku">По SKU</option>
          <option value="category">По категории</option>
          <option value="ean">По EAN</option>
          <option value="moin">По MOIN</option>
          <option value="price">По цене</option>
          <option value="marketplaceStatus">По статусу маркетплейса</option>
          <option value="lastChangedAt">По дате изменения</option>
        </select>
        <select
          value={sortOrder}
          onChange={(event) => onSortOrderChange(event.target.value as SortOrder)}
        >
          <option value="DESC">По убыванию</option>
          <option value="ASC">По возрастанию</option>
        </select>
        <div className="category-filter" ref={categoryMenuRef}>
          <button
            className={`category-filter-trigger ${isCategoryMenuOpen ? "open" : ""}`}
            onClick={() => setIsCategoryMenuOpen((current) => !current)}
            type="button"
          >
            <span className="category-filter-label">{selectedCategoryLabel}</span>
            <span className="category-filter-caret">{isCategoryMenuOpen ? "▴" : "▾"}</span>
          </button>

          {isCategoryMenuOpen ? (
            <div className="category-filter-menu">
              <input
                autoFocus
                className="category-filter-search"
                onChange={(event) => setCategorySearch(event.target.value)}
                placeholder="Поиск категории..."
                type="search"
                value={categorySearch}
              />

              <div className="category-filter-options">
                <button
                  className={`category-filter-option ${categoryFilter === "all" ? "active" : ""}`}
                  onClick={() => {
                    onCategoryFilterChange("all");
                    setCategorySearch("");
                    setIsCategoryMenuOpen(false);
                  }}
                  type="button"
                >
                  Все категории
                </button>
                {visibleCategories.map((category) => (
                  <button
                    className={`category-filter-option ${
                      categoryFilter === category ? "active" : ""
                    }`}
                    key={category}
                    onClick={() => {
                      onCategoryFilterChange(category);
                      setCategorySearch("");
                      setIsCategoryMenuOpen(false);
                    }}
                    type="button"
                  >
                    {category}
                  </button>
                ))}
                {visibleCategories.length === 0 ? (
                  <div className="category-filter-empty">Ничего не найдено</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <Link className="primary-btn toolbar-create-btn" href="/creator">
          Добавить товар
        </Link>
      </div>

      <div className="product-list">
        {isLoading ? <div className="empty-state">Загрузка товаров...</div> : null}
        {!isLoading && products.length === 0 ? (
          <div className="empty-state">По текущим фильтрам товаров не найдено</div>
        ) : null}

        {!isLoading && products.length > 0 ? (
          <div className="product-table">
            <div className="product-row product-row-head">
              <div className="row-open-head">
                {isCompact ? (
                  <span>SKU</span>
                ) : (
                  <>
                    <span>Reference</span>
                    <span>SKU</span>
                    <span>Категория</span>
                    <span>Маркетплейс</span>
                    <span>Активность</span>
                    <span>Цена</span>
                  </>
                )}
              </div>
            </div>
            {products.map((product) => (
              <ProductRow
                key={product.id}
                isCompact={isCompact}
                isActiveRow={selectedId === product.id}
                product={product}
                onOpen={onOpenProduct}
              />
            ))}
          </div>
        ) : null}
      </div>

      {!isLoading && products.length > 0 ? (
        <div className="pagination-bar">
          <span className="pagination-info">{`${tablePage}/${totalTablePages} • ${dbTotal} строк`}</span>
          <div className="pagination-actions">
            <button
              className="secondary-btn"
              onClick={() => onPageChange((prev) => Math.max(1, prev - 1))}
              disabled={tablePage <= 1}
            >
              Назад
            </button>
            <button
              className="secondary-btn"
              onClick={() => onPageChange((prev) => Math.min(totalTablePages, prev + 1))}
              disabled={tablePage >= totalTablePages}
            >
              Вперёд
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
