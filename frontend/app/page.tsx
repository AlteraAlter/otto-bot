"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useCurrentUser } from "./hooks/use-current-user";
import { CatalogPanel } from "./products-dashboard/catalog-panel";
import { EditorPanel } from "./products-dashboard/editor-panel";
import { useProductDashboard } from "./products-dashboard/use-product-dashboard";
import { formatCurrency } from "./products-dashboard/utils";

export default function Home() {
  const dashboard = useProductDashboard();
  const router = useRouter();
  const { currentUser, error } = useCurrentUser();

  const navItems = [
    { href: "/", label: "Каталог", active: true },
    { href: "/creator", label: "Создание товара", active: false },
    ...(currentUser?.role === "SEO"
      ? [{ href: "/invitations", label: "Приглашения", active: false }]
      : []),
  ];

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="otto-page">
      <section className="app-shell">
        <aside className="sidebar">
          <div>
            <p className="brand">OTTO Контроль</p>
            <p className="brand-subtitle">
              {currentUser?.email ? currentUser.email : "Product workspace"}
            </p>
          </div>

          <nav className="side-nav">
            {navItems.map((item) =>
              item.active ? (
                <button key={item.label} className="nav-item active">
                  {item.label}
                </button>
              ) : (
                <Link key={item.href} className="nav-item" href={item.href}>
                  {item.label}
                </Link>
              ),
            )}
          </nav>

          <div className="side-card">
            <p className="side-card-title">Рабочий контур</p>
            <p className="side-card-text">
              Каталог читает данные из базы, а массовые изменения остаются в одном
              месте без лишних переходов.
            </p>
            <span className="sync-pill">{currentUser?.role ?? "USER"}</span>
          </div>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <div>
              <p className="page-section-label">Каталог</p>
              <h1>Управление товарами</h1>
              <p>
                Чистый обзор каталога, быстрый поиск и редактирование карточки без
                перегруженного интерфейса.
              </p>
            </div>
            <div className="topbar-actions">
              <div className="user-context-mini">
                <div className="user-context-mini-head">
                  <strong>{currentUser?.email ?? "Профиль"}</strong>
                  <span className="sync-pill">{currentUser?.role ?? "USER"}</span>
                </div>
              </div>
              <button
                className="secondary-btn"
                onClick={handleLogout}
                type="button"
              >
                Выйти
              </button>
              <button
                className="primary-btn"
                onClick={dashboard.syncProductsToDatabase}
                disabled={dashboard.isSyncingDb || dashboard.isLoading}
              >
                {dashboard.isSyncingDb ? "Загрузка..." : "Синк DB"}
              </button>
            </div>
          </header>

          {error ? <p className="helper-banner">{error}</p> : null}
          {dashboard.notice ? <p className="helper-banner">{dashboard.notice}</p> : null}

          <section className="kpi-grid">
            <article className="kpi-card">
              <p>Всего в каталоге</p>
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
              <p>Общая стоимость</p>
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
