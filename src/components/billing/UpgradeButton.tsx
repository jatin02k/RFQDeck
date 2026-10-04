"use client";

import React, { useState } from "react";

interface UpgradeButtonProps {
  className?: string;
  variant?: "primary" | "amber" | "compact";
  label?: string;
}

export default function UpgradeButton({
  className = "",
  variant = "amber",
  label = "Upgrade to Pro",
}: UpgradeButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCheckout = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok || !data.checkout_url) {
        throw new Error(data.error || "Failed to initiate checkout session.");
      }

      // Redirect user directly to Dodo Payments checkout page
      window.location.href = data.checkout_url;
    } catch (err: any) {
      console.error("[Checkout] Error:", err);
      setErrorMsg(err.message || "Could not connect to payment gateway.");
      setIsLoading(false);
    }
  };

  const baseStyle =
    "font-heading font-semibold text-xs tracking-wider uppercase transition-all rounded-sm flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  const variantStyles = {
    amber:
      "bg-accent hover:bg-accent-hover text-white py-2 px-3 shadow-xs border border-accent-border",
    primary:
      "bg-text-primary hover:bg-text-secondary text-white py-2 px-4 shadow-xs",
    compact:
      "bg-accent hover:bg-accent-hover text-white py-1 px-2.5 text-[11px]",
  };

  return (
    <div className="w-full">
      <button
        onClick={handleCheckout}
        disabled={isLoading}
        className={`${baseStyle} ${variantStyles[variant]} ${className}`}
      >
        {isLoading ? (
          <span className="flex items-center gap-1.5">
            <svg
              className="animate-spin h-3.5 w-3.5 text-white"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            Redirecting...
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="square" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            {label}
          </span>
        )}
      </button>
      {errorMsg && (
        <p className="mt-1 text-[10px] text-status-error font-mono leading-tight">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
