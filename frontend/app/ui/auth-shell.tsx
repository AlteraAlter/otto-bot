import { ReactNode } from "react";
import { Card } from "@/components/ui/card";

type AuthShellProps = {
  title: string;
  description: string;
  sideContent?: ReactNode;
  children: ReactNode;
  compact?: boolean;
};

export function AuthShell({
  title,
  description,
  sideContent,
  children,
  compact = false,
}: AuthShellProps) {
  if (compact) {
    return (
      <main className="login-page">
        <Card className="login-shell login-shell-compact">
          <div className="login-compact-head">
            <p className="brand">OTTO Контроль</p>
          </div>
          <div className="login-card">{children}</div>
        </Card>
      </main>
    );
  }

  return (
    <main className="login-page">
      <Card className="login-shell">
        <div className="login-hero">
          <p className="brand">OTTO Контроль</p>
          <p className="brand-subtitle">Product workspace</p>
          <h1>{title}</h1>
          <p className="login-copy">{description}</p>
          {sideContent ? <div className="auth-side-content">{sideContent}</div> : null}
        </div>

        <div className="login-card">{children}</div>
      </Card>
    </main>
  );
}
