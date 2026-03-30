"use client";

import Link from "next/link";

import { CatalogPanel } from "./products-dashboard/catalog-panel";
import { EditorPanel } from "./products-dashboard/editor-panel";
import { useProductDashboard } from "./products-dashboard/use-product-dashboard";
import { formatCurrency } from "./products-dashboard/utils";

export default function Home() {
  const dashboard = useProductDashboard();

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
            <button
              className="primary-btn"
              onClick={dashboard.syncProductsToDatabase}
              disabled={dashboard.isSyncingDb || dashboard.isLoading}
            >
              {dashboard.isSyncingDb ? "Загрузка..." : "Синк DB"}
            </button>
          </header>

          {dashboard.notice ? <p className="helper-banner">{dashboard.notice}</p> : null}

          <section className="kpi-grid">
            <article className="kpi-card">
              <p>Всего в БД</p>
              <strong>{dashboard.kpi.total}</strong>
            </article>
            <article className="kpi-card">
              <p>Активные</p>
              <strong>{dashboard.kpi.active}</strong>
            </article>
            <article className="kpi-card">
              <p>Низкий остаток</p>
              <strong>{dashboard.kpi.lowStock}</strong>
            </article>
            <article className="kpi-card">
              <p>Стоимость</p>
              <strong>{formatCurrency(dashboard.kpi.totalValue)}</strong>
            </article>
          </section>

          <section className="content-grid">
            <CatalogPanel
              allPagedSelected={dashboard.allPagedSelected}
              bulkPriceExpression={dashboard.bulkPriceExpression}
              categories={dashboard.categories}
              categoryFilter={dashboard.categoryFilter}
              dbTotal={dashboard.dbTotal}
              isBulkSaving={dashboard.isBulkSaving}
              isLoading={dashboard.isLoading}
              multiSelectedIds={dashboard.multiSelectedIds}
              pagedVisibleProducts={dashboard.pagedVisibleProducts}
              products={dashboard.products}
              query={dashboard.query}
              selectedId={dashboard.selectedId}
              selectedIdSet={dashboard.selectedIdSet}
              sortBy={dashboard.sortBy}
              sortOrder={dashboard.sortOrder}
              statusFilter={dashboard.statusFilter}
              tablePage={dashboard.tablePage}
              totalTablePages={dashboard.totalTablePages}
              visibleProducts={dashboard.visibleProducts}
              onApplyAndSaveBulkPriceChanges={dashboard.applyAndSaveBulkPriceChanges}
              onApplyBulkPriceChanges={dashboard.applyBulkPriceChanges}
              onBulkPriceExpressionChange={dashboard.setBulkPriceExpression}
              onCategoryFilterChange={dashboard.setCategoryFilter}
              onClearSelection={() => dashboard.setMultiSelectedIds([])}
              onOpenProduct={dashboard.openProduct}
              onPageChange={dashboard.setTablePage}
              onQueryChange={dashboard.setQuery}
              onSortByChange={dashboard.setSortBy}
              onSortOrderChange={dashboard.setSortOrder}
              onStatusFilterChange={dashboard.setStatusFilter}
              onTogglePageSelection={dashboard.togglePageSelection}
              onToggleProductSelection={dashboard.toggleProductSelection}
            />

            <EditorPanel
              hasProductChanges={dashboard.hasProductChanges}
              hasStatusChanges={dashboard.hasStatusChanges}
              isApplying={dashboard.isApplying}
              isBulkSaving={dashboard.isBulkSaving}
              isDetailOpen={dashboard.isDetailOpen}
              multiSelectedIds={dashboard.multiSelectedIds}
              selectedProduct={dashboard.selectedProduct}
              onAddAttribute={dashboard.addAttribute}
              onAddBulletPoint={dashboard.addBulletPoint}
              onClose={() => dashboard.setIsDetailOpen(false)}
              onDeleteProduct={dashboard.deleteProduct}
              onRemoveAttribute={dashboard.removeAttribute}
              onRemoveBulletPoint={dashboard.removeBulletPoint}
              onSaveChanges={dashboard.saveChanges}
              onUpdateAttributeAdditional={dashboard.updateAttributeAdditional}
              onUpdateAttributeName={dashboard.updateAttributeName}
              onUpdateAttributeValues={dashboard.updateAttributeValues}
              onUpdateBulletPoint={dashboard.updateBulletPoint}
              onUpdateSelected={dashboard.updateSelected}
            />
          </section>
        </section>
      </section>
    </main>
  );
}
