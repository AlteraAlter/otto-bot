"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useCurrentUser } from "./hooks/use-current-user";
import { CatalogPanel } from "./products-dashboard/catalog-panel";
import { EditorPanel } from "./products-dashboard/editor-panel";
import { useProductDashboard } from "./products-dashboard/use-product-dashboard";

export default function Home() {
  const dashboard = useProductDashboard();
  const router = useRouter();
  const { currentUser, error } = useCurrentUser();
  const heroStats = [
    { label: "Всего", value: dashboard.kpi.total },
    { label: "Активные", value: dashboard.kpi.active },
    { label: "С ошибками", value: dashboard.kpi.withErrors },
    { label: "На распродаже", value: dashboard.kpi.onSale },
  ];

  const navItems = [
    { href: "/", label: "Каталог", active: true },
    { href: "/creator", label: "Создание товара", active: false },
    ...(currentUser?.role === "SEO"
      ? [
          { href: "/imports", label: "Data Operations", active: false },
          { href: "/invitations", label: "Приглашения", active: false },
        ]
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
              {currentUser?.email ? currentUser.email : "Catalog workspace"}
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

          <div className="side-note">
            <span className="sync-pill">{currentUser?.role ?? "USER"}</span>
            <p>Спокойная рабочая зона для просмотра импортированных XLSX-товаров из базы.</p>
          </div>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <div className="topbar-copy">
              <p className="page-section-label">Каталог</p>
              <h1>Управление товарами</h1>
              <p>
                Минималистичный обзор базы товаров с правильными полями из
                импортированной таблицы.
              </p>
              <div className="hero-stats" aria-label="Ключевые показатели каталога">
                {heroStats.map((item) => (
                  <div className="hero-stat" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
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
            </div>
          </header>

          {error ? <p className="helper-banner">{error}</p> : null}
          {dashboard.notice ? <p className="helper-banner">{dashboard.notice}</p> : null}

          <section className="content-grid">
            <CatalogPanel
              categories={dashboard.categories}
              categoryFilter={dashboard.categoryFilter}
              dbTotal={dashboard.dbTotal}
              isLoading={dashboard.isLoading}
              products={dashboard.products}
              query={dashboard.query}
              selectedId={dashboard.selectedId}
              sortBy={dashboard.sortBy}
              sortOrder={dashboard.sortOrder}
              tablePage={dashboard.tablePage}
              totalTablePages={dashboard.totalTablePages}
              onCategoryFilterChange={dashboard.setCategoryFilter}
              onOpenProduct={dashboard.openProduct}
              onPageChange={dashboard.setTablePage}
              onQueryChange={dashboard.setQuery}
              onSortByChange={dashboard.setSortBy}
              onSortOrderChange={dashboard.setSortOrder}
            />

            <EditorPanel
              isDetailOpen={dashboard.isDetailOpen}
              selectedProduct={dashboard.selectedProduct}
              onClose={() => dashboard.setIsDetailOpen(false)}
            />
          </section>
        </section>
      </section>
    </main>
  );
}
