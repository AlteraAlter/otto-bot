"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useState } from "react";

import { CurrentUser } from "../hooks/use-current-user";

type AppWorkspaceShellProps = {
  currentUser: CurrentUser | null;
  activeHref: "/" | "/creator" | "/imports" | "/invitations";
  sectionLabel: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function AppWorkspaceShell({
  currentUser,
  activeHref,
  sectionLabel,
  title,
  description,
  children,
}: AppWorkspaceShellProps) {
  const router = useRouter();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const navItems = [
    { href: "/", label: "Каталог", shortLabel: "К" },
    { href: "/creator", label: "Создание товара", shortLabel: "+" },
    ...(currentUser?.role === "SEO"
      ? [
          { href: "/imports", label: "Data Operations", shortLabel: "D" },
          { href: "/invitations", label: "Приглашения", shortLabel: "П" },
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
      <section className={`app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`.trim()}>
        <aside className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""}`.trim()}>
          <div className="sidebar-header">
            <div className="sidebar-brand-block">
              <div className="brand-mark" aria-hidden="true">
                O
              </div>
              <div className="sidebar-brand-copy">
                <p className="brand">OTTO Контроль</p>
                <p className="brand-subtitle">
                  {currentUser?.email ? currentUser.email : "Workspace"}
                </p>
              </div>
            </div>
            <button
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="sidebar-toggle"
              onClick={() => setIsSidebarCollapsed((current) => !current)}
              type="button"
            >
              {isSidebarCollapsed ? "›" : "‹"}
            </button>
          </div>

          <nav className="side-nav">
            {navItems.map((item) =>
              item.href === activeHref ? (
                <button key={item.href} className="nav-item active" title={item.label} type="button">
                  <span className="nav-item-short" aria-hidden="true">
                    {item.shortLabel}
                  </span>
                  <span className="nav-item-label">{item.label}</span>
                </button>
              ) : (
                <Link key={item.href} className="nav-item" href={item.href} title={item.label}>
                  <span className="nav-item-short" aria-hidden="true">
                    {item.shortLabel}
                  </span>
                  <span className="nav-item-label">{item.label}</span>
                </Link>
              ),
            )}
          </nav>

          <div className="side-note">
            <span className="sync-pill">{currentUser?.role ?? "USER"}</span>
            <p>Unified navigation for catalog work, creation flows, imports, and internal tasks.</p>
          </div>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <div className="topbar-copy">
              <p className="page-section-label">{sectionLabel}</p>
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
            <div className="topbar-actions">
              <div className="user-context-mini">
                <div className="user-context-mini-head">
                  <strong>{currentUser?.email ?? "Профиль"}</strong>
                  <span className="sync-pill">{currentUser?.role ?? "USER"}</span>
                </div>
              </div>
              <button className="secondary-btn" onClick={handleLogout} type="button">
                Выйти
              </button>
            </div>
          </header>

          {children}
        </section>
      </section>
    </main>
  );
}
