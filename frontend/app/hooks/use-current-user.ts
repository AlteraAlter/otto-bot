"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export type CurrentUserRole = "SEO" | "EMPLOYEE" | null;

export type CurrentUser = {
  id?: number;
  name?: string;
  email: string;
  last_name?: string;
  role: CurrentUserRole;
};

type UseCurrentUserOptions = {
  redirectToLogin?: boolean;
};

export function useCurrentUser(options: UseCurrentUserOptions = {}) {
  const { redirectToLogin = true } = options;
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadCurrentUser() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });

        if (!response.ok) {
          if (response.status === 401 && redirectToLogin) {
            router.replace("/login?expired=1");
            router.refresh();
            return;
          }

          throw new Error(`Не удалось загрузить профиль (${response.status})`);
        }

        const payload = (await response.json()) as CurrentUser;
        if (!active) {
          return;
        }

        setCurrentUser(payload);
      } catch (caughtError) {
        if (!active) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Ошибка загрузки профиля",
        );
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadCurrentUser();

    return () => {
      active = false;
    };
  }, [redirectToLogin, router]);

  return {
    currentUser,
    isLoading,
    error,
  };
}
