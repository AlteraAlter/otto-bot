import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-slate-800",
        secondary: "border border-[var(--border-strong)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted-bg)]",
        ghost: "border border-[var(--border-strong)] bg-transparent text-[var(--foreground)] hover:bg-[var(--muted-bg)]",
        destructive: "border border-red-300 bg-red-50 text-red-700 hover:bg-red-100",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...(!asChild ? { type } : {})}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
