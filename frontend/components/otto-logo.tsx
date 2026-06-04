"use client";

import { cn } from "@/lib/utils";

type OttoLogoProps = {
  className?: string;
  title?: string;
};

export function OttoLogo({ className, title = "OTTO logo" }: OttoLogoProps) {
  return (
    <svg
      aria-label={title}
      className={cn("otto-logo", className)}
      role="img"
      viewBox="0 0 256 256"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <defs>
        <linearGradient id="otto-logo-base" x1="34" x2="222" y1="216" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0A1237" />
          <stop offset="1" stopColor="#24346D" />
        </linearGradient>
        <linearGradient id="otto-logo-accent" x1="152" x2="220" y1="224" y2="126" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1653DE" />
          <stop offset="1" stopColor="#2C80FF" />
        </linearGradient>
      </defs>

      <circle cx="128" cy="128" fill="url(#otto-logo-base)" r="104" />
      <circle cx="128" cy="128" fill="#FFFFFF" r="48" />
      <circle cx="128" cy="128" fill="#121E51" r="28" />
      <path
        d="M187.6 128a59.6 59.6 0 0 1-49.1 58.6"
        fill="none"
        stroke="url(#otto-logo-accent)"
        strokeLinecap="round"
        strokeWidth="21"
      />
    </svg>
  );
}
