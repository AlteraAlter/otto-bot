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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          signal: controller.signal,
        });

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
            ? caughtError.name === "AbortError"
              ? "Таймаут загрузки профиля. Обновите страницу."
              : caughtError.message
            : "Ошибка загрузки профиля",
        );
      } finally {
        clearTimeout(timeoutId);
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
