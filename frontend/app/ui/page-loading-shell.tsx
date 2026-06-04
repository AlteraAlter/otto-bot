"use client";

type PageLoadingShellProps = {
  contentMode?: "dashboard" | "form" | "table";
};

export function PageLoadingShell({ contentMode = "dashboard" }: PageLoadingShellProps) {
  return (
    <main className="otto-page">
      <section className="app-shell workspace-navbar-shell">
        <header className="workspace-navbar workspace-navbar-loading" aria-hidden="true">
          <div className="workspace-brand-panel">
            <div className="workspace-brand-mark skeleton-block" />
            <div className="workspace-brand-title skeleton-line short" />
          </div>

          <span className="workspace-navbar-divider" />

          <div className="workspace-nav-links">
            <div className="workspace-nav-link skeleton-nav-item" />
            <div className="workspace-nav-link skeleton-nav-item active" />
            <div className="workspace-nav-link skeleton-nav-item" />
          </div>

          <div className="workspace-navbar-side">
            <div className="workspace-user-pill skeleton-pill" />
            <span className="workspace-navbar-divider" />
            <div className="workspace-logout-btn skeleton-nav-item logout" />
          </div>
        </header>

        <section className={`workspace workspace-content page-loading-shell ${contentMode}`}>
          <div className="page-loading-stack">
            <div className="page-loading-card tall">
              <div className="skeleton-line title" />
              <div className="skeleton-line medium" />
              <div className="skeleton-line short" />
            </div>
            <div className="page-loading-grid">
              <div className="page-loading-card">
                <div className="skeleton-line label" />
                <div className="skeleton-line title" />
                <div className="skeleton-line medium" />
              </div>
              <div className="page-loading-card">
                <div className="skeleton-line label" />
                <div className="skeleton-line title" />
                <div className="skeleton-line medium" />
              </div>
              <div className="page-loading-card">
                <div className="skeleton-line label" />
                <div className="skeleton-line title" />
                <div className="skeleton-line medium" />
              </div>
            </div>
            <div className="page-loading-card wide">
              <div className="skeleton-line title" />
              <div className="skeleton-line long" />
              <div className="skeleton-table">
                <div className="skeleton-table-row" />
                <div className="skeleton-table-row" />
                <div className="skeleton-table-row" />
                <div className="skeleton-table-row" />
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
