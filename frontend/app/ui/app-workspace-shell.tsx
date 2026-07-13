"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Home, ListChecks, LogOut, Menu, Package2, Trash2, X } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";

import { OttoLogo } from "@/components/otto-logo";

import { CurrentUser } from "../hooks/use-current-user";

type AppWorkspaceShellProps = {
  currentUser: CurrentUser | null;
  activeHref: "/" | "/creator" | "/tasks" | "/imports" | "/attribute-fill";
  sectionLabel: string;
  title: string;
  description: string;
  compactSidebar?: boolean;
  hidePageHead?: boolean;
  children: ReactNode;
};

export function AppWorkspaceShell({
  currentUser,
  activeHref,
  sectionLabel,
  title,
  description,
  hidePageHead = false,
  children,
}: AppWorkspaceShellProps) {
  const router = useRouter();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const navItems = [
    { href: "/", label: "Каталог", icon: Home },
    { href: "/creator", label: "Создание товара", icon: Package2 },
    { href: "/attribute-fill", label: "AI атрибуты", icon: ListChecks },
    { href: "/tasks", label: "Удаление товара", icon: Trash2 },
    { href: "/imports", label: "XLSX импорт", icon: FileSpreadsheet },
  ];

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [activeHref]);

  useEffect(() => {
    if (!isMobileNavOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isMobileNavOpen]);

  return (
    <main className="otto-page">
      <section className="app-shell workspace-navbar-shell">
        <header className="workspace-navbar" aria-label="Основная навигация">
          <div className="workspace-brand-panel">
            <div className="workspace-brand-mark" aria-hidden="true">
              <OttoLogo className="workspace-brand-logo" title="OTTO Контроль" />
            </div>
            <div className="workspace-brand-copy">
              <p className="workspace-brand-title">OTTO Контроль</p>
            </div>
          </div>

          <button
            className="workspace-mobile-toggle"
            type="button"
            onClick={() => setIsMobileNavOpen((prev) => !prev)}
            aria-label={isMobileNavOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={isMobileNavOpen}
          >
            {isMobileNavOpen ? <X size={20} strokeWidth={2.2} /> : <Menu size={20} strokeWidth={2.2} />}
          </button>

          <span className="workspace-navbar-divider" aria-hidden="true" />

          <nav className="workspace-nav-links">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === activeHref;

              if (isActive) {
                return (
                  <span key={item.href} className="workspace-nav-link is-active" aria-current="page">
                    <Icon size={18} strokeWidth={2} aria-hidden="true" />
                    <span>{item.label}</span>
                  </span>
                );
              }

              return (
                <Link key={item.href} className="workspace-nav-link" href={item.href}>
                  <Icon size={18} strokeWidth={2} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="workspace-navbar-side">
            <div className="workspace-user-pill">
              <span className="workspace-user-email">{currentUser?.email ?? "workspace@example.com"}</span>
              <span className="workspace-user-role">{currentUser?.role ?? "USER"}</span>
            </div>

            <span className="workspace-navbar-divider" aria-hidden="true" />

            <button className="workspace-logout-btn" onClick={handleLogout} type="button">
              <LogOut size={18} strokeWidth={2} aria-hidden="true" />
              <span>Выйти</span>
            </button>
          </div>
        </header>

        {isMobileNavOpen ? (
          <div className="workspace-mobile-menu-backdrop" onClick={() => setIsMobileNavOpen(false)}>
            <aside
              className="workspace-mobile-menu"
              aria-label="Мобильная навигация"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="workspace-mobile-menu-head">
                <div className="workspace-brand-panel">
                  <div className="workspace-brand-mark" aria-hidden="true">
                    <OttoLogo className="workspace-brand-logo" title="OTTO Контроль" />
                  </div>
                  <div className="workspace-brand-copy">
                    <p className="workspace-brand-title">OTTO Контроль</p>
                  </div>
                </div>
                <button
                  className="workspace-mobile-close"
                  type="button"
                  onClick={() => setIsMobileNavOpen(false)}
                  aria-label="Закрыть меню"
                >
                  <X size={18} strokeWidth={2.2} />
                </button>
              </div>

              <div className="workspace-mobile-user">
                <strong>{currentUser?.email ?? "workspace@example.com"}</strong>
                <span>{currentUser?.role ?? "USER"}</span>
              </div>

              <nav className="workspace-mobile-nav-links">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.href === activeHref;

                  return (
                    <Link
                      key={item.href}
                      className={`workspace-mobile-nav-link ${isActive ? "is-active" : ""}`}
                      href={item.href}
                      onClick={() => setIsMobileNavOpen(false)}
                    >
                      <Icon size={18} strokeWidth={2} aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <button className="workspace-mobile-logout" onClick={handleLogout} type="button">
                <LogOut size={18} strokeWidth={2} aria-hidden="true" />
                <span>Выйти</span>
              </button>
            </aside>
          </div>
        ) : null}

        <section className="workspace workspace-content" aria-label={`${sectionLabel}: ${title}`}>
          {!hidePageHead ? (
            <header className="workspace-page-head">
              <div>
                <p className="page-section-label">{sectionLabel}</p>
                <h1>{title}</h1>
                <p>{description}</p>
              </div>
            </header>
          ) : null}
          {children}
        </section>
      </section>
    </main>
  );
}
