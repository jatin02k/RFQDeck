"use client";

import React, { useEffect, useState, useTransition } from "react";
import { VendorSchema } from "@/lib/schemas";
import { addVendors, updateVendor } from "@/actions/vendor";
import { Vendor } from "@/types";
import UpgradeButton from "@/components/billing/UpgradeButton";

interface VendorFormProps {
  isOpen: boolean;
  onClose: () => void;
  vendor?: Vendor | null;
  onSuccess: () => void;
}

const CATEGORIES = [
  "Raw Material",
  "Components",
  "Packaging",
  "Electrical",
  "Chemicals",
  "Machinery",
  "Other",
] as const;

export default function VendorForm({
  isOpen,
  onClose,
  vendor,
  onSuccess,
}: VendorFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("Raw Material");
  
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    phone?: string;
    category?: string;
  }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  
  const [isPending, startTransition] = useTransition();

  // Populate form fields if we are in edit mode
  useEffect(() => {
    if (vendor) {
      setName(vendor.name);
      setEmail(vendor.email);
      setPhone(vendor.phone || "");
      setCategory(vendor.category);
    } else {
      setName("");
      setEmail("");
      setPhone("");
      setCategory("Raw Material");
    }
    setFieldErrors({});
    setGeneralError(null);
  }, [vendor, isOpen]);

  // Handle escape key to close dialog
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setGeneralError(null);

    const payload = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      category,
    };

    // Client-side validation
    const result = VendorSchema.safeParse(payload);
    if (!result.success) {
      const formattedErrors: typeof fieldErrors = {};
      result.error.issues.forEach((issue) => {
        const path = issue.path[0] as keyof typeof fieldErrors;
        if (path) {
          formattedErrors[path] = issue.message;
        }
      });
      setFieldErrors(formattedErrors);
      return;
    }

    startTransition(async () => {
      try {
        let res;
        if (vendor) {
          res = await updateVendor(vendor.id, payload);
        } else {
          res = await addVendors(payload);
        }

        if (res.success) {
          onSuccess();
          onClose();
        } else {
          setGeneralError(res.error || "Failed to save vendor profile.");
        }
      } catch (err) {
        console.error(err);
        setGeneralError("An unexpected error occurred. Please try again.");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-bg-base border border-border-strong p-4 sm:p-6 shadow-2xl relative animate-in zoom-in-95 slide-in-from-bottom-4 duration-200 rounded-sm"
        style={{ borderRadius: "4px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border-default mb-5">
          <div>
            <span className="font-mono text-[9px] text-accent font-semibold tracking-wider uppercase block">
              {vendor ? "MUTATION // EDIT RECORD" : "PROVISION // NEW ENTRY"}
            </span>
            <h2
              id="modal-title"
              className="font-heading text-xl font-bold tracking-tight text-text-primary mt-0.5"
            >
              {vendor ? "Edit Vendor Details" : "Add New Supplier"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary p-1.5 hover:bg-bg-sunken rounded-sm transition-colors cursor-pointer animate-duration-100"
            aria-label="Close dialog"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="square" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Error or Plan Limit Banner */}
        {generalError === "PLAN_LIMIT_REACHED" ? (
          <div className="mb-5 p-3.5 bg-accent-light border border-accent-border text-text-primary text-xs rounded-sm space-y-2.5">
            <div className="flex items-start gap-2.5">
              <span className="text-accent font-bold text-sm">⚠</span>
              <div>
                <div className="font-heading font-bold text-text-primary">
                  Vendor Directory Limit Reached (10/10)
                </div>
                <div className="font-body text-text-secondary text-[11px] mt-0.5">
                  The Free plan includes up to 10 active vendors. Upgrade to Pro for unlimited vendor profiles.
                </div>
              </div>
            </div>
            <UpgradeButton variant="amber" label="Upgrade to Pro" className="w-full" />
          </div>
        ) : generalError ? (
          <div className="mb-5 p-3.5 bg-status-error-bg border border-status-error text-status-error text-xs flex items-start gap-2.5 rounded-sm">
            <svg className="w-4.5 h-4.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="square" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="font-body leading-normal">{generalError}</div>
          </div>
        ) : null}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Supplier Name */}
          <div>
            <label
              htmlFor="vendor-name"
              className="block font-heading text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5"
            >
              Supplier / Company Name <span className="text-accent">*</span>
            </label>
            <input
              id="vendor-name"
              type="text"
              required
              disabled={isPending}
              placeholder="e.g., Acme Metalworks Ltd"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full px-3 py-2 bg-bg-surface border rounded-sm font-body text-sm text-text-primary transition-all outline-hidden placeholder:text-text-muted/60 focus:bg-bg-base ${
                fieldErrors.name
                  ? "border-status-error focus:border-status-error focus:ring-1 focus:ring-status-error"
                  : "border-border-default focus:border-accent focus:ring-1 focus:ring-accent"
              }`}
            />
            {fieldErrors.name && (
              <p className="mt-1 text-xs text-status-error font-mono">{fieldErrors.name}</p>
            )}
          </div>

          {/* Email Address */}
          <div>
            <label
              htmlFor="vendor-email"
              className="block font-heading text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5"
            >
              Primary Email Address <span className="text-accent">*</span>
            </label>
            <input
              id="vendor-email"
              type="email"
              required
              disabled={isPending}
              placeholder="operator@supplier.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full px-3 py-2 bg-bg-surface border rounded-sm font-body text-sm text-text-primary transition-all outline-hidden placeholder:text-text-muted/60 focus:bg-bg-base ${
                fieldErrors.email
                  ? "border-status-error focus:border-status-error focus:ring-1 focus:ring-status-error"
                  : "border-border-default focus:border-accent focus:ring-1 focus:ring-accent"
              }`}
            />
            {fieldErrors.email && (
              <p className="mt-1 text-xs text-status-error font-mono">{fieldErrors.email}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Category */}
            <div>
              <label
                htmlFor="vendor-category"
                className="block font-heading text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5"
              >
                Operational Category <span className="text-accent">*</span>
              </label>
              <div className="relative">
                <select
                  id="vendor-category"
                  value={category}
                  disabled={isPending}
                  onChange={(e) => setCategory(e.target.value as typeof CATEGORIES[number])}
                  className={`w-full px-3 py-2 bg-bg-surface border border-border-default rounded-sm font-body text-sm text-text-primary appearance-none transition-all focus:border-accent focus:bg-bg-base focus:ring-1 focus:ring-accent outline-hidden pr-8 cursor-pointer`}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-text-muted">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="square" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              {fieldErrors.category && (
                <p className="mt-1 text-xs text-status-error font-mono">{fieldErrors.category}</p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label
                htmlFor="vendor-phone"
                className="block font-heading text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5"
              >
                Phone Number <span className="text-text-muted text-[10px] lowercase font-normal">(optional)</span>
              </label>
              <input
                id="vendor-phone"
                type="tel"
                disabled={isPending}
                placeholder="+1 (555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`w-full px-3 py-2 bg-bg-surface border rounded-sm font-body text-sm text-text-primary transition-all outline-hidden placeholder:text-text-muted/60 focus:bg-bg-base ${
                  fieldErrors.phone
                    ? "border-status-error focus:border-status-error focus:ring-1 focus:ring-status-error"
                    : "border-border-default focus:border-accent focus:ring-1 focus:ring-accent"
                }`}
              />
              {fieldErrors.phone && (
                <p className="mt-1 text-xs text-status-error font-mono">{fieldErrors.phone}</p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-default mt-6">
            <button
              id="vendor-form-cancel"
              type="button"
              disabled={isPending}
              onClick={onClose}
              className="px-4 py-2 border border-border-default hover:bg-bg-sunken text-text-secondary hover:text-text-primary text-sm font-semibold rounded-sm transition-all cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              id="vendor-form-submit"
              type="submit"
              disabled={isPending}
              className="bg-accent hover:bg-accent-hover text-white text-sm font-semibold px-5 py-2 border border-accent-hover rounded-sm transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <svg
                    className="animate-spin -ml-1 h-4 w-4 text-white"
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
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Processing...</span>
                </>
              ) : (
                <span>{vendor ? "Save Changes" : "Register Supplier"}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
