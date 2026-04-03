import { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  description: string;
  sideContent?: ReactNode;
  children: ReactNode;
};

export function AuthShell({
  title,
  description,
  sideContent,
  children,
}: AuthShellProps) {
  return (
    <main className="login-page">
      <section className="login-shell">
        <div className="login-hero">
          <p className="brand">OTTO Контроль</p>
          <p className="brand-subtitle">Product workspace</p>
          <h1>{title}</h1>
          <p className="login-copy">{description}</p>
          {sideContent ? <div className="auth-side-content">{sideContent}</div> : null}
        </div>

        <div className="login-card">{children}</div>
      </section>
    </main>
  );
}
