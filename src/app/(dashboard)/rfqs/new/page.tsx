"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createRFQ } from "@/actions/rfq";
import UpgradeButton from "@/components/billing/UpgradeButton";

export default function NewRFQPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Form fields - Left Column
  const [title, setTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Form fields - Right Column (Parsed Details)
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("PCS");
  const [specifications, setSpecifications] = useState<string[]>([]);
  const [specInput, setSpecInput] = useState("");
  const [deadline, setDeadline] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [specialRequirements, setSpecialRequirements] = useState("");

  // AI Loading & Status state
  const [isParsing, setIsParsing] = useState(false);

  // Error & Toast state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // AI Parsing Handler - Direct State Overwrites
  const handleParseAI = async () => {
    if (!rawText.trim()) {
      setErrorMsg(
        "Please enter or paste requirement text before parsing with AI.",
      );
      return;
    }

    setIsParsing(true);
    setErrorMsg(null);
    setProductName("");
    setQuantity("");
    setUnit("");
    setSpecifications([]);
    setDeadline("");
    setDeliveryLocation("");
    setSpecialRequirements("");

    try {
      const response = await fetch("/api/parse-rfq", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: rawText.trim() }),
      });

      const result = await response.json();

      if (response.ok && result.success && result.data) {
        const data = result.data;

        // Unconditional resets to wipe out any previous/stale values
        setProductName(data.productName || "");
        setQuantity(
          data.quantity !== undefined && data.quantity !== null
            ? String(data.quantity)
            : "",
        );
        setUnit(data.unit || "PCS");
        setSpecifications(
          Array.isArray(data.specifications) ? data.specifications : [],
        );
        setDeadline(data.deliveryDeadline || "");
        setDeliveryLocation(data.deliveryLocation || "");
        setSpecialRequirements(data.specialRequirements || "");

        showToast("Requirements parsed with AI successfully!");
      } else {
        setErrorMsg(
          result.error || "Failed to parse requirement text with AI.",
        );
      }
    } catch (err: any) {
      console.error("[handleParseAI] Error:", err);
      setErrorMsg(
        "An error occurred while connecting to the AI parsing service.",
      );
    } finally {
      setIsParsing(false);
    }
  };

  // Tag management for specifications
  const handleAddSpec = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = specInput.trim();
    if (trimmed && !specifications.includes(trimmed)) {
      setSpecifications([...specifications, trimmed]);
      setSpecInput("");
    }
  };

  const handleRemoveSpec = (indexToRemove: number) => {
    setSpecifications(specifications.filter((_, idx) => idx !== indexToRemove));
  };

  // Submit handler - Save as Draft using FormData for File Upload
  const handleSaveDraft = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!title.trim() || title.trim().length < 2) {
      setErrorMsg("Please enter an RFQ title (at least 2 characters).");
      return;
    }

    const parsedPayload = {
      product_name: productName.trim() || undefined,
      quantity: quantity.trim() || undefined,
      unit: unit.trim() || undefined,
      specifications: specifications.length > 0 ? specifications : undefined,
      delivery_deadline: deadline || undefined,
      delivery_location: deliveryLocation.trim() || undefined,
      special_requirements: specialRequirements.trim() || undefined,
    };

    const formData = new FormData();
    formData.append("title", title.trim());
    if (rawText.trim()) formData.append("raw_text", rawText.trim());
    if (deadline) formData.append("deadline", deadline);
    if (selectedFile) formData.append("pdf", selectedFile);
    formData.append("parsed_data", JSON.stringify(parsedPayload));

    startTransition(async () => {
      const res = await createRFQ(formData);
      if (res.success) {
        showToast("RFQ saved as draft successfully!");
        router.push(`/rfqs/${res.data.id}`);
      } else {
        setErrorMsg(res.error || "Failed to save RFQ draft.");
      }
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 bg-bg-surface border border-accent text-text-primary px-4 py-3 rounded-sm shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-3">
          <div className="w-2 h-2 rounded-full bg-accent animate-ping" />
          <span className="font-mono text-xs font-semibold">{toastMsg}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border-default">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/rfqs"
              className="font-mono text-[10px] text-text-muted hover:text-accent transition-colors uppercase tracking-widest"
            >
              RFQs
            </Link>
            <span className="text-text-muted font-mono text-[10px]">/</span>
            <span className="font-mono text-[10px] text-accent font-bold tracking-widest uppercase">
              NEW RFQ
            </span>
          </div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-text-primary">
            Create Request for Quotation
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/rfqs"
            className="px-4 py-2 border border-border-default hover:bg-bg-sunken text-text-secondary text-sm font-semibold rounded-sm transition-colors"
          >
            Cancel
          </Link>
        </div>
      </div>

      {/* Plan Limit Error Prompt */}
      {errorMsg === "PLAN_LIMIT_REACHED" ? (
        <div className="p-4 bg-accent-light border border-accent-border text-text-primary text-xs rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-accent shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="square" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <div className="font-heading font-bold text-sm text-text-primary">
                Monthly RFQ Limit Reached (3/3 on Free Plan)
              </div>
              <p className="font-body text-text-secondary mt-0.5">
                You have reached your 3 RFQ drafts limit for this month. Upgrade to Pro for unlimited RFQs and automated dispatch.
              </p>
            </div>
          </div>
          <div className="shrink-0 w-full sm:w-44">
            <UpgradeButton variant="amber" label="Upgrade to Pro" />
          </div>
        </div>
      ) : errorMsg ? (
        <div className="p-4 bg-status-error-bg border border-status-error text-status-error text-xs rounded-sm flex items-start gap-3">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="square" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="font-body leading-normal">{errorMsg}</div>
        </div>
      ) : null}

      {/* Two Column Layout */}
      <form
        onSubmit={handleSaveDraft}
        className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start"
      >
        {/* LEFT COLUMN: Title + Raw Requirement Input */}
        <div className="space-y-6">
          {/* RFQ Title Input */}
          <div className="bg-bg-surface border border-border-default rounded-sm p-5 space-y-3 shadow-xs">
            <label
              htmlFor="rfq-title"
              className="block font-heading text-xs font-semibold text-text-secondary uppercase tracking-wider"
            >
              RFQ Title <span className="text-accent">*</span>
            </label>
            <input
              id="rfq-title"
              type="text"
              required
              disabled={isPending || isParsing}
              placeholder="e.g. 500 units SS304 Flanges for Plant B"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-bg-base border border-border-default rounded-sm font-body text-sm text-text-primary transition-all outline-hidden placeholder:text-text-muted/60 focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Raw Requirement Text Area + Actions */}
          <div className="bg-bg-surface border border-border-default rounded-sm p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <label
                htmlFor="rfq-raw-text"
                className="block font-heading text-xs font-semibold text-text-secondary uppercase tracking-wider"
              >
                Requirement Specifications
              </label>
              <span className="font-mono text-[10px] text-text-muted">
                PASTE RAW TEXT OR UPLOAD
              </span>
            </div>

            <textarea
              id="rfq-raw-text"
              rows={12}
              disabled={isPending || isParsing}
              placeholder="Paste email thread, customer specification sheet, or raw requirements here..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-bg-base border border-border-default rounded-sm font-mono text-xs text-text-primary transition-all outline-hidden placeholder:text-text-muted/60 focus:border-accent focus:ring-1 focus:ring-accent resize-y leading-relaxed"
            />

            {/* AI Parse & Upload PDF Buttons */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleParseAI}
                  disabled={isParsing || isPending || !rawText.trim()}
                  className="bg-accent hover:bg-accent-hover text-white text-xs font-semibold px-4 py-2.5 border border-accent-hover rounded-sm transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isParsing ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4 text-white"
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
                      <span>Parsing with AI...</span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="square"
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                      <span>Parse with AI</span>
                    </>
                  )}
                </button>

                <label className="px-4 py-2.5 border border-border-default bg-bg-base hover:bg-bg-sunken text-text-secondary text-xs font-semibold rounded-sm transition-colors cursor-pointer flex items-center gap-2">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="square"
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <span>Upload PDF</span>
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                        showToast(`Attached: ${e.target.files[0].name}`);
                      }
                    }}
                  />
                </label>
              </div>

              {/* Selected PDF Badge */}
              {selectedFile && (
                <div className="flex items-center justify-between bg-bg-sunken border border-border-default px-3 py-1.5 rounded-sm text-xs font-mono text-text-primary">
                  <span className="truncate">📎 {selectedFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="text-text-muted hover:text-status-error ml-2 cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Extracted / Editable Details Card */}
        <div className="space-y-6">
          <div className="bg-bg-surface border border-border-default rounded-sm p-6 space-y-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-border-default">
              <div>
                <span className="font-mono text-[9px] text-accent font-semibold tracking-wider uppercase block">
                  STRUCTURED PAYLOAD
                </span>
                <h2 className="font-heading text-lg font-bold text-text-primary mt-0.5">
                  Extracted Details
                </h2>
              </div>
              <span className="font-mono text-[10px] text-text-muted bg-bg-sunken px-2 py-1 border border-border-default rounded-sm">
                MANUAL / EDITABLE
              </span>
            </div>

            {/* Product Name */}
            <div>
              <label
                htmlFor="product-name"
                className="block font-heading text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5"
              >
                Product Name
              </label>
              <input
                id="product-name"
                type="text"
                disabled={isPending || isParsing}
                placeholder="e.g. Stainless Steel 304 Flange"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="w-full px-3 py-2 bg-bg-base border border-border-default rounded-sm font-body text-sm text-text-primary transition-all outline-hidden placeholder:text-text-muted/60 focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Quantity + Unit Side by Side */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="rfq-quantity"
                  className="block font-heading text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5"
                >
                  Quantity
                </label>
                <input
                  id="rfq-quantity"
                  type="text"
                  disabled={isPending || isParsing}
                  placeholder="e.g. 500"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-base border border-border-default rounded-sm font-body text-sm text-text-primary transition-all outline-hidden placeholder:text-text-muted/60 focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>

              <div>
                <label
                  htmlFor="rfq-unit"
                  className="block font-heading text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5"
                >
                  Unit
                </label>
                <input
                  id="rfq-unit"
                  type="text"
                  disabled={isPending || isParsing}
                  placeholder="e.g. PCS, KGs, Meters"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-base border border-border-default rounded-sm font-body text-sm text-text-primary transition-all outline-hidden placeholder:text-text-muted/60 focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            {/* Specifications Tag Input */}
            <div>
              <label
                htmlFor="rfq-spec-input"
                className="block font-heading text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5"
              >
                Specifications
              </label>

              <div className="flex gap-2 mb-2.5">
                <input
                  id="rfq-spec-input"
                  type="text"
                  disabled={isPending || isParsing}
                  placeholder="e.g. Class 150, ANSI B16.5"
                  value={specInput}
                  onChange={(e) => setSpecInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSpec();
                    }
                  }}
                  className="flex-1 px-3 py-2 bg-bg-base border border-border-default rounded-sm font-body text-sm text-text-primary transition-all outline-hidden placeholder:text-text-muted/60 focus:border-accent focus:ring-1 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => handleAddSpec()}
                  disabled={isPending || isParsing || !specInput.trim()}
                  className="px-3.5 py-2 border border-border-default bg-bg-base hover:bg-bg-sunken text-text-secondary hover:text-text-primary text-xs font-semibold rounded-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  + Add
                </button>
              </div>

              {/* Tag Pills Display */}
              <div className="flex flex-wrap gap-2 min-h-8 p-2 bg-bg-base border border-border-default rounded-sm">
                {specifications.length === 0 ? (
                  <span className="text-xs text-text-muted font-mono self-center">
                    No specifications added yet.
                  </span>
                ) : (
                  specifications.map((spec, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 bg-bg-sunken border border-border-strong px-2.5 py-1 rounded-sm text-xs font-mono text-text-primary"
                    >
                      <span>{spec}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSpec(idx)}
                        disabled={isPending || isParsing}
                        className="text-text-muted hover:text-status-error transition-colors cursor-pointer"
                        aria-label="Remove spec"
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Delivery Deadline */}
            <div>
              <label
                htmlFor="rfq-deadline"
                className="block font-heading text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5"
              >
                Delivery Deadline
              </label>
              <input
                id="rfq-deadline"
                type="date"
                disabled={isPending || isParsing}
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-3 py-2 bg-bg-base border border-border-default rounded-sm font-body text-sm text-text-primary transition-all outline-hidden focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Delivery Location */}
            <div>
              <label
                htmlFor="rfq-location"
                className="block font-heading text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5"
              >
                Delivery Location
              </label>
              <input
                id="rfq-location"
                type="text"
                disabled={isPending || isParsing}
                placeholder="e.g. Plant B, Chakan Industrial Area, Pune"
                value={deliveryLocation}
                onChange={(e) => setDeliveryLocation(e.target.value)}
                className="w-full px-3 py-2 bg-bg-base border border-border-default rounded-sm font-body text-sm text-text-primary transition-all outline-hidden placeholder:text-text-muted/60 focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Special Requirements */}
            <div>
              <label
                htmlFor="rfq-requirements"
                className="block font-heading text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5"
              >
                Special Requirements
              </label>
              <textarea
                id="rfq-requirements"
                rows={3}
                disabled={isPending || isParsing}
                placeholder="e.g. MTR test certificate required, packaging in wooden crates"
                value={specialRequirements}
                onChange={(e) => setSpecialRequirements(e.target.value)}
                className="w-full px-3 py-2 bg-bg-base border border-border-default rounded-sm font-body text-sm text-text-primary transition-all outline-hidden placeholder:text-text-muted/60 focus:border-accent focus:ring-1 focus:ring-accent resize-none"
              />
            </div>

            {/* Bottom Actions inside Right Card */}
            <div className="pt-4 border-t border-border-default flex flex-col sm:flex-row items-center justify-end gap-3">
              <button
                type="submit"
                disabled={isPending || isParsing}
                className="w-full sm:w-auto px-4 py-2.5 border border-border-default bg-bg-base hover:bg-bg-sunken text-text-primary text-xs font-bold uppercase tracking-wider rounded-sm transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <svg
                      className="animate-spin h-3.5 w-3.5 text-text-primary"
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
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save as Draft</span>
                )}
              </button>

              <button
                type="button"
                disabled={true}
                title="Coming in Stage 10"
                className="w-full sm:w-auto bg-accent/50 text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 border border-accent/50 rounded-sm cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span>Looks good, Select Vendors →</span>
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
