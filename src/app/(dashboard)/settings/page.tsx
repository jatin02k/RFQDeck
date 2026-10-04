import React from "react";
import { getCompanyName } from "@/actions/rfq";
import { createClient } from "@/lib/supabase/server";
import UpgradeButton from "@/components/billing/UpgradeButton";

export const metadata = {
  title: "Settings & Billing | RFQDeck",
  description: "Company profile, subscription details, procurement preferences, and security settings.",
};

function getTimeRemaining(expiryDate: string | null | undefined): string | null {
  if (!expiryDate) return null;
  const now = Date.now();
  const expiry = new Date(expiryDate).getTime();
  const diff = expiry - now;

  if (diff <= 0) {
    return "Expired / Renewal Pending";
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""}, ${hours} hour${hours > 1 ? "s" : ""} remaining`;
  }
  return `${hours} hour${hours > 1 ? "s" : ""}, ${minutes} min remaining`;
}

export default async function SettingsPage() {
  const companyName = await getCompanyName();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userEmail = user?.email || "operator@rfqdeck.in";

  // Fetch company billing and subscription details
  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, plan, subscription_status, dodo_subscription_id, dodo_customer_id, plan_expires_at, updated_at, created_at, rfq_count_this_month"
    )
    .eq("id", user?.id || "")
    .single();

  const plan = (company?.plan || "free").toLowerCase();
  const isPro = plan === "pro";
  const subscriptionStatus = company?.subscription_status || (isPro ? "active" : "inactive");
  const subscriptionId = company?.dodo_subscription_id;
  const customerId = company?.dodo_customer_id;
  const expiresAt = company?.plan_expires_at;
  const subscribedAt = company?.updated_at || company?.created_at;

  const timeLeftString = getTimeRemaining(expiresAt);

  // Monthly RFQ usage count
  let rfqCount = company?.rfq_count_this_month;
  if (rfqCount === undefined || rfqCount === null) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from("rfqs")
      .select("*", { count: "exact", head: true })
      .eq("company_id", user?.id || "")
      .gte("created_at", startOfMonth.toISOString());

    rfqCount = count ?? 0;
  }

  // Active Vendors count
  const { count: vendorCount } = await supabase
    .from("vendors")
    .select("*", { count: "exact", head: true })
    .eq("company_id", user?.id || "")
    .eq("is_active", true);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="pb-6 border-b border-border-default space-y-1">
        <span className="font-mono text-[10px] text-accent font-bold tracking-widest uppercase block">
          SYSTEM PREFERENCES // P2P CONFIGURATION
        </span>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-text-primary">
          Organization & Gateways Settings
        </h1>
      </div>

      <div className="space-y-6">
        {/* SUBSCRIPTION & BILLING PANEL */}
        <div
          id="billing"
          className="bg-bg-surface border border-border-strong rounded-sm p-6 space-y-5 shadow-xs"
        >
          <div className="flex items-center justify-between pb-3 border-b border-border-default">
            <div>
              <span className="font-mono text-[9px] text-accent font-semibold tracking-wider uppercase block">
                SUBSCRIPTION & BILLING
              </span>
              <h2 className="font-heading text-base font-bold text-text-primary mt-0.5">
                Current Plan & Billing Lifecycle
              </h2>
            </div>
            {isPro ? (
              <span className="font-mono text-[10px] text-status-success bg-status-success-bg px-2.5 py-1 border border-status-success/30 rounded-sm font-bold uppercase flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-status-success animate-pulse" />
                PRO PLAN — {subscriptionStatus.toUpperCase()}
              </span>
            ) : (
              <span className="font-mono text-[10px] text-status-error bg-status-error-bg px-2.5 py-1 border border-status-error/30 rounded-sm font-bold uppercase flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-status-error" />
                FREE PLAN
              </span>
            )}
          </div>

          {isPro ? (
            /* DETAILED PRO PLAN DETAILS */
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-body">
                {/* Active Period */}
                <div className="p-3.5 bg-bg-base border border-border-default rounded-sm space-y-1">
                  <span className="text-[10px] font-mono text-text-muted uppercase">Plan Expiration / Renewal</span>
                  <div className="font-mono font-bold text-text-primary text-xs">
                    {expiresAt
                      ? new Date(expiresAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "Auto-renewing"}
                  </div>
                  <div className="text-[10px] font-mono text-text-muted">
                    {expiresAt
                      ? new Date(expiresAt).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZoneName: "short",
                        })
                      : "Next billing cycle"}
                  </div>
                </div>

                {/* Time Remaining */}
                <div className="p-3.5 bg-bg-base border border-border-default rounded-sm space-y-1">
                  <span className="text-[10px] font-mono text-text-muted uppercase">Time Left Until Expiry</span>
                  <div className="font-mono font-bold text-accent text-xs">
                    {timeLeftString || "Active (Continuous)"}
                  </div>
                  <div className="text-[10px] font-mono text-text-muted">Managed via Dodo</div>
                </div>

                {/* Subscription ID */}
                <div className="p-3.5 bg-bg-base border border-border-default rounded-sm space-y-1">
                  <span className="text-[10px] font-mono text-text-muted uppercase">Subscription ID</span>
                  <div
                    className="font-mono font-semibold text-text-primary text-xs truncate"
                    title={subscriptionId || "None"}
                  >
                    {subscriptionId || "dodo_sub_active"}
                  </div>
                  <div className="text-[10px] font-mono text-text-muted">Live Gateway ID</div>
                </div>

                {/* Subscribed Since */}
                <div className="p-3.5 bg-bg-base border border-border-default rounded-sm space-y-1">
                  <span className="text-[10px] font-mono text-text-muted uppercase">Subscribed / Updated</span>
                  <div className="font-mono font-semibold text-text-primary text-xs">
                    {subscribedAt
                      ? new Date(subscribedAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "Recent"}
                  </div>
                  <div className="text-[10px] font-mono text-text-muted">
                    {subscribedAt
                      ? new Date(subscribedAt).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </div>
                </div>
              </div>

              {/* Pro Perks Active Banner */}
              <div className="p-4 bg-status-success-bg/40 border border-status-success/30 rounded-sm text-xs space-y-2">
                <div className="font-heading font-bold text-status-success flex items-center gap-2">
                  <span>✔</span> Pro Tier Benefits Active
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] text-text-secondary">
                  <div>• Unlimited RFQ Dispatches</div>
                  <div>• Unlimited Vendor Directory</div>
                  <div>• Automated Supplier Follow-ups</div>
                </div>
              </div>
            </div>
          ) : (
            /* DETAILED FREE PLAN VIEW WITH METERS & UPGRADE NUDGE */
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-body">
                {/* RFQ Usage Meter */}
                <div className="p-4 bg-bg-base border border-border-default rounded-sm space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono text-text-muted uppercase">
                      RFQs Used This Month
                    </span>
                    <span className="font-mono font-bold text-text-primary">
                      {rfqCount} / 3
                    </span>
                  </div>
                  <div className="w-full bg-bg-sunken h-2 rounded-xs overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        rfqCount >= 3 ? "bg-status-error" : "bg-accent"
                      }`}
                      style={{
                        width: `${Math.min((rfqCount / 3) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-text-muted">
                    <span>Free plan limit: 3 per month</span>
                    <span className={rfqCount >= 3 ? "text-status-error font-bold" : ""}>
                      {3 - rfqCount > 0 ? `${3 - rfqCount} remaining` : "0 remaining"}
                    </span>
                  </div>
                </div>

                {/* Vendor Directory Meter */}
                <div className="p-4 bg-bg-base border border-border-default rounded-sm space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono text-text-muted uppercase">
                      Vendors in Directory
                    </span>
                    <span className="font-mono font-bold text-text-primary">
                      {vendorCount ?? 0} / 10
                    </span>
                  </div>
                  <div className="w-full bg-bg-sunken h-2 rounded-xs overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        (vendorCount ?? 0) >= 10 ? "bg-status-error" : "bg-accent"
                      }`}
                      style={{
                        width: `${Math.min(((vendorCount ?? 0) / 10) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-text-muted">
                    <span>Free plan limit: 10 active vendors</span>
                    <span className={(vendorCount ?? 0) >= 10 ? "text-status-error font-bold" : ""}>
                      {10 - (vendorCount ?? 0) > 0 ? `${10 - (vendorCount ?? 0)} slots open` : "0 slots open"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Upgrade Callout Card */}
              <div className="border border-accent-border bg-accent-light p-4 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-heading text-sm font-bold text-text-primary flex items-center gap-2">
                    <span>⚡</span> Upgrade to Pro for Unlimited Sourcing
                  </h3>
                  <p className="text-xs text-text-secondary">
                    Remove all RFQ and vendor caps. Access multi-vendor quote comparison matrices and automated follow-ups.
                  </p>
                </div>
                <div className="shrink-0 w-full sm:w-48">
                  <UpgradeButton variant="amber" label="Upgrade to Pro" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Company Profile Panel */}
        <div className="bg-bg-surface border border-border-strong rounded-sm p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-border-default">
            <div>
              <span className="font-mono text-[9px] text-accent font-semibold tracking-wider uppercase block">
                ORGANIZATION PROFILE
              </span>
              <h2 className="font-heading text-base font-bold text-text-primary mt-0.5">
                Company Details
              </h2>
            </div>
            <span className="font-mono text-[10px] text-status-success bg-status-success-bg px-2 py-0.5 border border-status-success/30 rounded-sm font-bold uppercase">
              {isPro ? "PRO OPERATOR" : "STANDARD TIER"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-body">
            <div>
              <label className="block font-heading text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                Company Name
              </label>
              <input
                type="text"
                readOnly
                value={companyName}
                className="w-full px-3 py-2 bg-bg-sunken border border-border-default rounded-sm font-semibold text-text-primary outline-hidden"
              />
            </div>

            <div>
              <label className="block font-heading text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                Primary Account Email
              </label>
              <input
                type="text"
                readOnly
                value={userEmail}
                className="w-full px-3 py-2 bg-bg-sunken border border-border-default rounded-sm font-mono text-text-primary outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Operational Categories & Settings */}
        <div className="bg-bg-surface border border-border-strong rounded-sm p-6 space-y-4 shadow-xs">
          <div className="pb-3 border-b border-border-default">
            <span className="font-mono text-[9px] text-accent font-semibold tracking-wider uppercase block">
              PROCUREMENT PARAMETERS
            </span>
            <h2 className="font-heading text-base font-bold text-text-primary mt-0.5">
              Default Terms & Currency
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-body">
            <div className="p-3 bg-bg-base border border-border-default rounded-sm space-y-1">
              <span className="text-[10px] font-mono text-text-muted uppercase">Default Currency</span>
              <div className="font-mono font-bold text-text-primary">INR (₹ / Rupee)</div>
            </div>
            <div className="p-3 bg-bg-base border border-border-default rounded-sm space-y-1">
              <span className="text-[10px] font-mono text-text-muted uppercase">Default Payment Terms</span>
              <div className="font-mono font-bold text-text-primary">Net 30 / Net 60</div>
            </div>
            <div className="p-3 bg-bg-base border border-border-default rounded-sm space-y-1">
              <span className="text-[10px] font-mono text-text-muted uppercase">Token Validity</span>
              <div className="font-mono font-bold text-text-primary">Single-Use Link Locked</div>
            </div>
          </div>
        </div>

        {/* Security & Multi-tenant Rules */}
        <div className="bg-bg-surface border border-border-strong rounded-sm p-6 space-y-4 shadow-xs">
          <div className="pb-3 border-b border-border-default">
            <span className="font-mono text-[9px] text-accent font-semibold tracking-wider uppercase block">
              SECURITY & COMPLIANCE
            </span>
            <h2 className="font-heading text-base font-bold text-text-primary mt-0.5">
              Data Isolation Protocol
            </h2>
          </div>

          <div className="space-y-2 text-xs font-body text-text-secondary leading-relaxed">
            <p>
              ✔ <strong>Vendor Insulation:</strong> External suppliers access quote entry forms exclusively via single-use encrypted token URLs (`/respond/[token]`).
            </p>
            <p>
              ✔ <strong>Cross-Supplier Leak Prevention:</strong> Competing suppliers cannot view each other&apos;s identity, pricing, or response status.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}