import React from "react";

export interface GearSpinnerProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  color?: "accent" | "muted" | "primary" | "current";
}

const sizeMap = {
  xs: "w-4 h-4",
  sm: "w-6 h-6",
  md: "w-10 h-10",
  lg: "w-16 h-16",
  xl: "w-24 h-24",
};

const colorMap = {
  accent: "text-accent",
  muted: "text-text-muted",
  primary: "text-text-primary",
  current: "currentColor",
};

/**
 * Precision 8-tooth mechanical gear icon that rotates smoothly.
 */
export function GearIcon({
  className = "w-8 h-8",
  reverse = false,
}: {
  className?: string;
  reverse?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} animate-spin ${
        reverse ? "[animation-direction:reverse]" : ""
      }`}
      style={{ animationDuration: reverse ? "4s" : "3s" }}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M21 4C21 3.44772 21.4477 3 22 3H26C26.5523 3 27 3.44772 27 4V8.14078C28.4682 8.49071 29.8647 9.07106 31.1444 9.85121L34.0724 6.92323C34.4629 6.5327 35.0961 6.5327 35.4866 6.92323L38.315 9.75165C38.7055 10.1422 38.7055 10.7753 38.315 11.1659L35.387 14.0938C36.1672 15.3736 36.7475 16.7701 37.0975 18.2382H41.2382C41.7905 18.2382 42.2382 18.6859 42.2382 19.2382V23.2382C42.2382 23.7905 41.7905 24.2382 41.2382 24.2382H37.0975C36.7475 25.7064 36.1672 27.1028 35.387 28.3826L38.315 31.3106C38.7055 31.7011 38.7055 32.3343 38.315 32.7248L35.4866 35.5532C35.0961 35.9437 34.4629 35.9437 34.0724 35.5532L31.1444 32.6253C29.8647 33.4054 28.4682 33.9858 27 34.3357V38.4764C27 39.0287 26.5523 39.4764 26 39.4764H22C21.4477 39.4764 21 39.0287 21 38.4764V34.3357C20.4682 33.9858 19.0717 33.4054 17.792 32.6253L14.864 35.5532C14.4735 35.9437 13.8403 35.9437 13.4498 35.5532L10.6214 32.7248C10.2309 32.3343 10.2309 31.7011 10.6214 31.3106L13.5494 28.3826C12.7692 27.1028 12.1889 25.7064 11.8389 24.2382H7.69822C7.14594 24.2382 6.69822 23.7905 6.69822 23.2382V19.2382C6.69822 18.6859 7.14594 18.2382 7.69822 18.2382H11.8389C12.1889 16.7701 12.7692 15.3736 13.5494 14.0938L10.6214 11.1659C10.2309 10.7753 10.2309 10.1422 10.6214 9.75165L13.4498 6.92323C13.8403 6.5327 14.4735 6.5327 14.864 6.92323L17.792 9.85121C19.0717 9.07106 20.4682 8.49071 21 8.14078V4ZM24 16C19.5817 16 16 19.5817 16 24C16 28.4183 19.5817 32 24 32C28.4183 32 32 28.4183 32 24C32 19.5817 28.4183 16 24 16Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Dual interlocking mechanical gears rotating in opposite directions.
 */
export function DualGearSpinner({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const containerSizes = {
    sm: "w-12 h-10",
    md: "w-18 h-14",
    lg: "w-24 h-18",
  };

  const primarySizes = {
    sm: "w-7 h-7",
    md: "w-11 h-11",
    lg: "w-14 h-14",
  };

  const secondarySizes = {
    sm: "w-5 h-5",
    md: "w-7 h-7",
    lg: "w-9 h-9",
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${containerSizes[size]} ${className}`}>
      {/* Primary Gear (Clockwise) */}
      <div className={`absolute top-0 left-0 ${primarySizes[size]} text-accent`}>
        <GearIcon className="w-full h-full" reverse={false} />
      </div>

      {/* Secondary Interlocking Gear (Counter-Clockwise) */}
      <div className={`absolute bottom-0 right-0 ${secondarySizes[size]} text-text-muted`}>
        <GearIcon className="w-full h-full" reverse={true} />
      </div>
    </div>
  );
}

/**
 * Single Rotating Gear Spinner.
 */
export function GearSpinner({
  size = "md",
  className = "",
  color = "accent",
}: GearSpinnerProps) {
  return (
    <div className={`inline-flex items-center justify-center ${sizeMap[size]} ${colorMap[color]} ${className}`}>
      <GearIcon className="w-full h-full" />
    </div>
  );
}

export interface LoadingProps {
  label?: string;
  subtext?: string;
  size?: "sm" | "md" | "lg";
  fullScreen?: boolean;
  className?: string;
  showDualGears?: boolean;
}

/**
 * Main Loading component with rotating industrial gears.
 * Can be used as a full-page transition screen, route loader, or inside delayed containers.
 */
export default function Loading({
  label = "LOADING WORKSPACE...",
  subtext = "SYNCHRONIZING INDUSTRIAL DATA // SYS.ONLINE",
  size = "md",
  fullScreen = false,
  className = "",
  showDualGears = true,
}: LoadingProps) {
  const containerClass = fullScreen
    ? "fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg-base/90 backdrop-blur-xs p-6"
    : "flex-1 flex flex-col items-center justify-center min-h-[320px] p-8";

  return (
    <div className={`${containerClass} ${className} select-none animate-in fade-in duration-300`}>
      <div className="flex flex-col items-center text-center space-y-4 max-w-sm">
        {/* Animated Rotating Gear Mechanism */}
        <div className="p-3 bg-bg-surface border border-border-default rounded-sm shadow-xs flex items-center justify-center">
          {showDualGears ? (
            <DualGearSpinner size={size} />
          ) : (
            <GearSpinner size={size} color="accent" />
          )}
        </div>

        {/* Labels & Status Text */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
            <span className="font-heading font-bold text-xs tracking-wider uppercase text-text-primary">
              {label}
            </span>
          </div>

          {subtext && (
            <p className="font-mono text-[10px] text-text-muted tracking-wider uppercase">
              {subtext}
            </p>
          )}
        </div>

        {/* Subtle Industrial Accent Line */}
        <div className="w-24 h-0.5 bg-border-default overflow-hidden rounded-full">
          <div className="w-full h-full bg-accent animate-pulse origin-left" />
        </div>
      </div>
    </div>
  );
}
