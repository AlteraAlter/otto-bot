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

const CURRENT_USER_CACHE_KEY = "otto_current_user_cache_v1";
let cachedCurrentUser: CurrentUser | null | undefined;

function readCachedCurrentUser(): CurrentUser | null {
  if (cachedCurrentUser !== undefined) {
    return cachedCurrentUser;
  }

  if (typeof window === "undefined") {
    cachedCurrentUser = null;
    return cachedCurrentUser;
  }

  try {
    const raw = window.sessionStorage.getItem(CURRENT_USER_CACHE_KEY);
    cachedCurrentUser = raw ? (JSON.parse(raw) as CurrentUser) : null;
  } catch {
    cachedCurrentUser = null;
  }

  return cachedCurrentUser;
}

function writeCachedCurrentUser(user: CurrentUser | null) {
  cachedCurrentUser = user;

  if (typeof window === "undefined") {
    return;
  }

  try {
    if (user) {
      window.sessionStorage.setItem(CURRENT_USER_CACHE_KEY, JSON.stringify(user));
    } else {
      window.sessionStorage.removeItem(CURRENT_USER_CACHE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function useCurrentUser(options: UseCurrentUserOptions = {}) {
  const { redirectToLogin = true } = options;
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => readCachedCurrentUser());
  const [isLoading, setIsLoading] = useState(() => readCachedCurrentUser() === null);
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
            writeCachedCurrentUser(null);
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

        writeCachedCurrentUser(payload);
        setCurrentUser(payload);
        setError(null);
      } catch (caughtError) {
        if (!active) {
          return;
        }

        if (redirectToLogin && caughtError instanceof Error && caughtError.name !== "AbortError") {
          writeCachedCurrentUser(null);
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
