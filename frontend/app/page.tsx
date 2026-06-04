"use client";

import { useEffect, useRef, useState } from "react";

import { useCurrentUser } from "./hooks/use-current-user";
import { CatalogPanel } from "./products-dashboard/catalog-panel";
import { EditorPanel } from "./products-dashboard/editor-panel";
import { AppWorkspaceShell } from "./ui/app-workspace-shell";
import { useProductDashboard } from "./products-dashboard/use-product-dashboard";

const DETAIL_PANEL_ANIMATION_MS = 220;

export default function Home() {
  const dashboard = useProductDashboard();
  const { currentUser, error } = useCurrentUser();
  const [closingProduct, setClosingProduct] = useState(dashboard.selectedProduct);
  const [isClosingPanel, setIsClosingPanel] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDetailVisible = dashboard.isDetailOpen && Boolean(dashboard.selectedProduct);
  const renderedProduct = dashboard.selectedProduct ?? closingProduct;
  const isPanelRendered = isDetailVisible || Boolean(closingProduct);
  const heroStats = [
    {
      label: "Всего",
      value: dashboard.kpi.total,
      tone: "neutral",
      caption: "Все импортированные позиции",
    },
    {
      label: "Активные",
      value: dashboard.kpi.active,
      tone: "primary",
      caption: "Опубликованы и доступны",
    },
    {
      label: "С ошибками",
      value: dashboard.kpi.withErrors,
      tone: "danger",
      caption: "Нуждаются в проверке",
    },
    {
      label: "На распродаже",
      value: dashboard.kpi.onSale,
      tone: "neutral",
      caption: "С активной sale price",
    },
  ];

  function handleClosePanel() {
    if (!dashboard.selectedProduct || isClosingPanel) {
      return;
    }

    setClosingProduct(dashboard.selectedProduct);
    setIsClosingPanel(true);

    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }

    closeTimeoutRef.current = setTimeout(() => {
      dashboard.closeProduct();
      setClosingProduct(null);
      setIsClosingPanel(false);
      closeTimeoutRef.current = null;
    }, DETAIL_PANEL_ANIMATION_MS);
  }

  useEffect(() => {
    if (isDetailVisible && dashboard.selectedProduct) {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
      setClosingProduct(dashboard.selectedProduct);
      setIsClosingPanel(false);
    }
  }, [dashboard.selectedProduct, isDetailVisible]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  return (
    <AppWorkspaceShell
      activeHref="/"
      currentUser={currentUser}
      sectionLabel="Каталог"
      title="Управление товарами"
      description="Минималистичный обзор базы товаров с правильными полями из импортированной таблицы."
    >
      <section className="topbar">
        <div className="topbar-copy">
          <p className="page-section-label">Каталог</p>
          <h1>Управление товарами</h1>
          <p>
            Минималистичный обзор базы товаров с правильными полями из
            импортированной таблицы.
          </p>
          <div className="hero-stats" aria-label="Ключевые показатели каталога">
            {heroStats.map((item) => (
              <div className={`hero-stat ${item.tone}`} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <em>{item.caption}</em>
                <i aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {error ? <p className="helper-banner">{error}</p> : null}
      {dashboard.notice ? <p className="helper-banner">{dashboard.notice}</p> : null}

      <section
        className={`content-grid ${
          isPanelRendered ? "content-grid-detail" : "content-grid-full"
        }`.trim()}
      >
        <CatalogPanel
          categories={dashboard.categories}
          categoryFilter={dashboard.categoryFilter}
          dbTotal={dashboard.dbTotal}
          isCompact={isPanelRendered}
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

        {isPanelRendered ? (
          <EditorPanel
            isClosing={isClosingPanel}
            isDetailOpen={isPanelRendered}
            selectedProduct={renderedProduct}
            onClose={handleClosePanel}
          />
        ) : null}
      </section>
    </AppWorkspaceShell>
  );
}
