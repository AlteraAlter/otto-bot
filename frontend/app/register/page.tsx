"use client";

import Link from "next/link";

import { AuthShell } from "../ui/auth-shell";

export default function RegisterPage() {
  return (
    <AuthShell
      title="Самостоятельная регистрация отключена"
      description="Сотрудник создаёт аккаунт только по приглашению. Это сохраняет правильную роль, email и доступы внутри рабочей зоны."
      sideContent={
        <div className="auth-note">
          <p>Как зарегистрироваться:</p>
          <ul className="auth-list">
            <li>получите письмо с приглашением</li>
            <li>откройте ссылку из письма</li>
            <li>заполните имя, фамилию и пароль</li>
          </ul>
        </div>
      }
    >
      <div className="form-stack">
        <p className="auth-hint">
          Если у вас уже есть аккаунт, используйте обычный вход.
        </p>

        <Link className="primary-btn full" href="/login">
          Перейти ко входу
        </Link>
      </div>
    </AuthShell>
  );
}
