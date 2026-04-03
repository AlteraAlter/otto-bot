"use client";

import { memo } from "react";

import { formatCurrency } from "./utils";
import { Product, ProductStatus, SortByField, SortOrder } from "./types";

type CatalogPanelProps = {
  allPagedSelected: boolean;
  bulkPriceExpression: string;
  categories: string[];
  categoryFilter: string;
  dbTotal: number;
  isBulkSaving: boolean;
  isLoading: boolean;
  multiSelectedIds: string[];
  pagedVisibleProducts: Product[];
  products: Product[];
  query: string;
  selectedId: string;
  selectedIdSet: Set<string>;
  sortBy: SortByField;
  sortOrder: SortOrder;
  statusFilter: "all" | ProductStatus;
  tablePage: number;
  totalTablePages: number;
  visibleProducts: Product[];
  onApplyAndSaveBulkPriceChanges: () => void;
  onApplyBulkPriceChanges: () => void;
  onBulkPriceExpressionChange: (value: string) => void;
  onCategoryFilterChange: (value: string) => void;
  onClearSelection: () => void;
  onOpenProduct: (productId: string) => void;
  onPageChange: (updater: number | ((prev: number) => number)) => void;
  onQueryChange: (value: string) => void;
  onSortByChange: (value: SortByField) => void;
  onSortOrderChange: (value: SortOrder) => void;
  onStatusFilterChange: (value: "all" | ProductStatus) => void;
  onTogglePageSelection: () => void;
  onToggleProductSelection: (productId: string) => void;
};

type ProductRowProps = {
  isActiveRow: boolean;
  isMultiSelected: boolean;
  product: Product;
  onOpen: (productId: string) => void;
  onToggleSelection: (productId: string) => void;
};

const ProductRow = memo(function ProductRow({
  isActiveRow,
  isMultiSelected,
  product,
  onOpen,
  onToggleSelection
}: ProductRowProps) {
  return (
    <div
      className={`product-row ${isActiveRow ? "selected" : ""} ${
        isMultiSelected ? "multi-selected" : ""
      }`}
    >
      <button
        type="button"
        className={`row-select-btn ${isMultiSelected ? "active" : ""}`}
        onClick={() => onToggleSelection(product.id)}
        title={
          isMultiSelected ? "Убрать из группового выбора" : "Добавить в групповой выбор"
        }
      >
        {isMultiSelected ? "✓" : "+"}
      </button>
      <button type="button" className="row-open-btn" onClick={() => onOpen(product.id)}>
        <span className="row-name" title={product.name}>
          {product.name}
        </span>
        <span title={product.sku}>{product.sku}</span>
        <span title={product.brandId}>{product.brandId}</span>
        <span title={product.category}>{product.category}</span>
        <span>
          <span
            className={`status ${
              product.status === "active" ? "status-active" : "status-paused"
            }`}
          >
            {product.status === "active" ? "Активен" : "Неактивен"}
          </span>
        </span>
        <span>{product.stock}</span>
        <span>{formatCurrency(product.price)}</span>
        <span>{product.updatedAt}</span>
      </button>
    </div>
  );
});

export function CatalogPanel({
  allPagedSelected,
  bulkPriceExpression,
  categories,
  categoryFilter,
  dbTotal,
  isBulkSaving,
  isLoading,
  multiSelectedIds,
  pagedVisibleProducts,
  products,
  query,
  selectedId,
  selectedIdSet,
  sortBy,
  sortOrder,
  statusFilter,
  tablePage,
  totalTablePages,
  visibleProducts,
  onApplyAndSaveBulkPriceChanges,
  onApplyBulkPriceChanges,
  onBulkPriceExpressionChange,
  onCategoryFilterChange,
  onClearSelection,
  onOpenProduct,
  onPageChange,
  onQueryChange,
  onSortByChange,
  onSortOrderChange,
  onStatusFilterChange,
  onTogglePageSelection,
  onToggleProductSelection
}: CatalogPanelProps) {
  return (
    <div className="catalog-panel">
      <div className="panel-header">
        <div>
          <h2>Каталог товаров</h2>
          <p>
            Рабочая таблица для поиска, фильтрации, просмотра карточки и массового
            изменения цен.
          </p>
        </div>
        <div className="panel-meta">
          <span>{`Показано ${visibleProducts.length}`}</span>
          <span>{`В базе ${dbTotal}`}</span>
          <span>{`Выбрано ${multiSelectedIds.length}`}</span>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Поиск: SKU, название, reference, EAN, категория..."
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <select value={sortBy} onChange={(event) => onSortByChange(event.target.value as SortByField)}>
          <option value="id">Сортировка: новые</option>
          <option value="productLine">По названию</option>
          <option value="sku">По SKU</option>
          <option value="productReference">По Reference</option>
          <option value="category">По категории</option>
          <option value="brandId">По бренду</option>
          <option value="ean">По EAN</option>
          <option value="price">По цене</option>
        </select>
        <select value={sortOrder} onChange={(event) => onSortOrderChange(event.target.value as SortOrder)}>
          <option value="DESC">По убыванию</option>
          <option value="ASC">По возрастанию</option>
        </select>
        <select
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value as "all" | ProductStatus)}
        >
          <option value="all">Все статусы</option>
          <option value="active">Активные</option>
          <option value="non_active">Неактивные</option>
        </select>
        <select value={categoryFilter} onChange={(event) => onCategoryFilterChange(event.target.value)}>
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
          onClick={onTogglePageSelection}
          disabled={pagedVisibleProducts.length === 0}
        >
          {allPagedSelected ? "Снять страницу" : "Выбрать страницу"}
        </button>
        <button
          type="button"
          className="secondary-btn"
          onClick={onClearSelection}
          disabled={multiSelectedIds.length === 0}
        >
          Снять выбор
        </button>
        <span className="bulk-selected-count">Выбрано: {multiSelectedIds.length}</span>
        <input
          type="text"
          value={bulkPriceExpression}
          onChange={(event) => onBulkPriceExpressionChange(event.target.value)}
          placeholder="Операция цены: 15, -20, -20%, =99.99"
        />
        <button
          type="button"
          className="secondary-btn"
          onClick={onApplyBulkPriceChanges}
          disabled={multiSelectedIds.length === 0}
        >
          Применить
        </button>
        <button
          type="button"
          className="primary-btn"
          onClick={onApplyAndSaveBulkPriceChanges}
          disabled={multiSelectedIds.length === 0 || isBulkSaving}
        >
          {isBulkSaving ? "Сохраняем..." : "Применить и сохранить"}
        </button>
      </div>

      <div className="product-list">
        {isLoading ? <div className="empty-state">Загрузка товаров...</div> : null}
        {!isLoading && products.length === 0 ? <div className="empty-state">В БД нет товаров</div> : null}
        {!isLoading && products.length > 0 && visibleProducts.length === 0 ? (
          <div className="empty-state">По заданным фильтрам товары не найдены</div>
        ) : null}

        {!isLoading ? (
          <div className="product-table">
            <div className="product-row product-row-head">
              <span>Выбор</span>
              <div className="row-open-head">
                <span>Товар</span>
                <span>SKU</span>
                <span>Бренд</span>
                <span>Категория</span>
                <span>Статус</span>
                <span>Остаток</span>
                <span>Цена</span>
                <span>Обновлён</span>
              </div>
            </div>
            {pagedVisibleProducts.map((product) => (
              <ProductRow
                key={product.id}
                isActiveRow={selectedId === product.id}
                isMultiSelected={selectedIdSet.has(product.id)}
                product={product}
                onOpen={onOpenProduct}
                onToggleSelection={onToggleProductSelection}
              />
            ))}
          </div>
        ) : null}

        {!isLoading && visibleProducts.length > 0 ? (
          <div className="pagination-bar">
            <span className="pagination-info">{`${tablePage}/${totalTablePages} • ${products.length}/${dbTotal}`}</span>
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
    </div>
  );
}
