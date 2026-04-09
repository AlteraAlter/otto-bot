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

type CurrentUserRequestResult = {
  ok: boolean;
  status: number;
  user: CurrentUser | null;
};

type UseCurrentUserOptions = {
  redirectToLogin?: boolean;
};

let cachedCurrentUserResult: CurrentUserRequestResult | null = null;
let currentUserRequestInFlight: Promise<CurrentUserRequestResult> | null = null;

async function requestCurrentUser(): Promise<CurrentUserRequestResult> {
  const response = await fetch("/api/auth/me", { cache: "no-store" });
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      user: null,
    };
  }

  const payload = (await response.json()) as CurrentUser;
  return {
    ok: true,
    status: response.status,
    user: payload,
  };
}

async function getCurrentUserOnce(): Promise<CurrentUserRequestResult> {
  if (cachedCurrentUserResult) {
    return cachedCurrentUserResult;
  }
  if (currentUserRequestInFlight) {
    return currentUserRequestInFlight;
  }

  currentUserRequestInFlight = requestCurrentUser()
    .then((result) => {
      cachedCurrentUserResult = result;
      return result;
    })
    .finally(() => {
      currentUserRequestInFlight = null;
    });

  return currentUserRequestInFlight;
}

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
        const result = await getCurrentUserOnce();

        if (!result.ok) {
          if (result.status === 401 && redirectToLogin) {
            router.replace("/login?expired=1");
            router.refresh();
            return;
          }

          throw new Error(`Не удалось загрузить профиль (${result.status})`);
        }
        if (!active) {
          return;
        }

        setCurrentUser(result.user);
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
