"use server";

import { RFQSchema } from "@/lib/schemas";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { ActionResult, RFQ, RFQComparisonData, RFQVendorWithDetails, Quote } from "@/types";
import { revalidatePath } from "next/cache";
import { sendRFQEmail } from "@/lib/resend";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

export async function getRFQs(): Promise<ActionResult<{ active: RFQ[]; deleted: RFQ[] }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user || !supabase) return { success: false, error: "Unauthorized" };


  try {
    const { data: allRfqs, error } = await supabase
      .from("rfqs")
      .select("*")
      .eq("company_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getRFQs] DB error:", error.message);
      return { success: false, error: "Failed to fetch RFQs." };
    }

    const now = Date.now();
    const active: RFQ[] = [];
    const deleted: RFQ[] = [];
    const expiredIdsToHardDelete: string[] = [];

    (allRfqs || []).forEach((rfq: any) => {
      // Ignore permanently deleted records
      if (
        rfq.status === "permanently_deleted" ||
        rfq.parsed_data?.permanently_deleted === true ||
        rfq.parsed_data?.is_permanently_deleted === true
      ) {
        return;
      }

      const isDeleted =
        rfq.status === "deleted" ||
        rfq.parsed_data?.is_deleted === true ||
        Boolean(rfq.parsed_data?.deleted_at);

      if (isDeleted) {
        const deletedAtStr =
          rfq.deleted_at ||
          rfq.parsed_data?.deleted_at ||
          rfq.updated_at ||
          rfq.created_at;
        const deletedTime = new Date(deletedAtStr).getTime();

        if (now - deletedTime >= SEVEN_DAYS_MS) {
          expiredIdsToHardDelete.push(rfq.id);
        } else {
          deleted.push({
            ...rfq,
            status: "deleted",
            deleted_at: deletedAtStr,
          });
        }
      } else {
        active.push(rfq);
      }
    });

    // Auto hard-delete RFQs older than 7 days
    if (expiredIdsToHardDelete.length > 0) {
      for (const id of expiredIdsToHardDelete) {
        await hardDeleteRFQ(id);
      }
    }

    return { success: true, data: { active, deleted } };
  } catch (err: any) {
    console.error("[getRFQs] Unexpected error:", err?.message || err);
    return { success: false, error: "Something went wrong while fetching RFQs." };
  }
}

export async function createRFQ(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user || !supabase) return { success: false, error: "Unauthorized" };

  // Check Plan & Monthly RFQ Limit
  const { data: company } = await supabase
    .from("companies")
    .select("plan, rfq_count_this_month")
    .eq("id", user.id)
    .single();

  let currentCount = company?.rfq_count_this_month;
  if (currentCount === undefined || currentCount === null) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from("rfqs")
      .select("*", { count: "exact", head: true })
      .eq("company_id", user.id)
      .gte("created_at", startOfMonth.toISOString());

    currentCount = count ?? 0;
  }

  const isFree = (company?.plan || "free").toLowerCase() === "free";
  if (isFree && currentCount >= 3) {
    return { success: false, error: "PLAN_LIMIT_REACHED" };
  }

  let payload: any = input;
  let fileToUpload: File | null = null;

  if (typeof FormData !== "undefined" && input instanceof FormData) {
    const rawParsed = input.get("parsed_data");
    let parsedObj = {};
    if (typeof rawParsed === "string" && rawParsed.trim()) {
      try {
        parsedObj = JSON.parse(rawParsed);
      } catch (_) {}
    }

    const pdf = input.get("pdf");
    if ( pdf && pdf instanceof File && pdf.size > 0){
      fileToUpload = pdf
    }

    payload = {
      title: input.get("title")?.toString() || "",
      raw_text: input.get("raw_text")?.toString() || input.get("description")?.toString() || null,
      deadline: input.get("deadline")?.toString() || input.get("delivery_deadline")?.toString() || null,
      parsed_data: parsedObj,
    };
  }

  const result = RFQSchema.safeParse(payload);
  if (!result.success) {
    return { success: false, error: result.error.issues[0].message };
  }

  try {

    let attachmentUrl: string | null = null;

    if(fileToUpload){
      const fileExt = fileToUpload.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `drawings/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("rfq-attachments")
        .upload(filePath, fileToUpload, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("[createRFQ] Storage upload error:", uploadError.message);
        return { success: false, error: `Failed to upload PDF: ${uploadError.message}` };
      }

      // 3. Get public URL for the uploaded drawing
      const { data: publicUrlData } = supabase.storage
        .from("rfq-attachments")
        .getPublicUrl(filePath);

      attachmentUrl = publicUrlData.publicUrl;
    }

    const { data, error } = await supabase
      .from("rfqs")
      .insert({
        company_id: user.id,
        title: result.data.title.trim(),
        raw_text: result.data.raw_text?.trim() || null,
        deadline: result.data.deadline || null,
        parsed_data: result.data.parsed_data || {},
        attachment_url:attachmentUrl,
        status: "draft",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[createRFQ] DB error:", error.message);
      return { success: false, error: "Failed to create RFQ." };
    }

    if (isFree) {
      await supabase
        .from("companies")
        .update({ rfq_count_this_month: currentCount + 1 })
        .eq("id", user.id);
    }

    revalidatePath("/rfqs");
    return { success: true, data: { id: data.id } };
  } catch (err: any) {
    console.error("[createRFQ] Unexpected error:", err?.message || err);
    return { success: false, error: "Something went wrong while creating RFQ." };
  }
}

export async function updateRFQDraft(
  id: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user || !supabase) return { success: false, error: "Unauthorized" };

  let payload: any = input;
  if (typeof FormData !== "undefined" && input instanceof FormData) {
    const rawParsed = input.get("parsed_data");
    let parsedObj = undefined;
    if (typeof rawParsed === "string" && rawParsed.trim()) {
      try {
        parsedObj = JSON.parse(rawParsed);
      } catch (_) {}
    }

    payload = {
      title: input.get("title")?.toString() || undefined,
      raw_text: input.get("raw_text")?.toString() || input.get("description")?.toString() || undefined,
      deadline: input.get("deadline")?.toString() || input.get("delivery_deadline")?.toString() || undefined,
      parsed_data: parsedObj,
    };
  }

  const result = RFQSchema.partial().safeParse(payload);
  if (!result.success) {
    return { success: false, error: result.error.issues[0].message };
  }

  const cleanData = Object.fromEntries(
    Object.entries(result.data).filter(([_, v]) => v !== undefined)
  );

  try {
    const { data, error } = await supabase
      .from("rfqs")
      .update(cleanData)
      .eq("id", id)
      .eq("company_id", user.id)
      .select("id")
      .single();

    if (error) {
      console.error("[updateRFQDraft] DB error:", error.message);
      return { success: false, error: "Failed to update RFQ draft." };
    }

    revalidatePath("/rfqs");
    return { success: true, data: { id: data.id } };
  } catch (err: any) {
    console.error("[updateRFQDraft] Unexpected error:", err?.message || err);
    return { success: false, error: "Something went wrong while updating RFQ draft." };
  }
}

export async function getRFQ(id: string): Promise<ActionResult<RFQ>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user || !supabase) return { success: false, error: "Unauthorized" };

  try {
    const { data, error } = await supabase
      .from("rfqs")
      .select("*")
      .eq("id", id)
      .eq("company_id", user.id)
      .single();

    if (error) {
      console.error("[getRFQ] DB error:", error.message);
      return { success: false, error: "RFQ not found or access denied." };
    }

    return { success: true, data: data as RFQ };
  } catch (err: any) {
    console.error("[getRFQ] Unexpected error:", err?.message || err);
    return { success: false, error: "Something went wrong while fetching RFQ details." };
  }
}

export async function deleteRFQ(id: string): Promise<ActionResult> {
  const { user } = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const adminSupabase = createAdminClient();
    const nowIso = new Date().toISOString();

    const { data: existing } = await adminSupabase
      .from("rfqs")
      .select("parsed_data")
      .eq("id", id)
      .single();

    const existingParsed =
      existing?.parsed_data && typeof existing.parsed_data === "object"
        ? existing.parsed_data
        : {};
    const updatedParsed = {
      ...existingParsed,
      deleted_at: nowIso,
      is_deleted: true,
    };

    const { error } = await adminSupabase
      .from("rfqs")
      .update({
        status: "deleted",
        parsed_data: updatedParsed,
      })
      .eq("id", id);

    if (error) {
      console.error("[deleteRFQ] Admin DB error:", error.message);
      return { success: false, error: "Failed to delete RFQ: " + error.message };
    }

    revalidatePath("/rfqs");
    return { success: true, data: null };
  } catch (err: any) {
    console.error("[deleteRFQ] Unexpected error:", err?.message || err);
    return { success: false, error: "Something went wrong while deleting RFQ." };
  }
}

export async function restoreRFQ(id: string): Promise<ActionResult> {
  const { user } = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const adminSupabase = createAdminClient();

    const { data: existing } = await adminSupabase
      .from("rfqs")
      .select("parsed_data")
      .eq("id", id)
      .single();

    const existingParsed =
      existing?.parsed_data && typeof existing.parsed_data === "object"
        ? { ...existing.parsed_data }
        : {};
    delete existingParsed.deleted_at;
    delete existingParsed.is_deleted;
    delete existingParsed.permanently_deleted;

    const { error } = await adminSupabase
      .from("rfqs")
      .update({
        status: "draft",
        parsed_data: existingParsed,
      })
      .eq("id", id);

    if (error) {
      console.error("[restoreRFQ] Admin DB error:", error.message);
      return { success: false, error: "Failed to restore RFQ: " + error.message };
    }

    revalidatePath("/rfqs");
    return { success: true, data: null };
  } catch (err: any) {
    console.error("[restoreRFQ] Unexpected error:", err?.message || err);
    return { success: false, error: "Something went wrong while restoring RFQ." };
  }
}

export async function hardDeleteRFQ(id: string): Promise<ActionResult> {
  const { user } = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const adminSupabase = createAdminClient();

    // 1. Delete child records first to satisfy foreign key constraints
    try {
      const { data: rvList } = await adminSupabase
        .from("rfq_vendors")
        .select("id")
        .eq("rfq_id", id);
      if (rvList && rvList.length > 0) {
        const rvIds = rvList.map((rv) => rv.id);
        await adminSupabase.from("quotes").delete().in("rfq_vendor_id", rvIds);
      }
    } catch (_) {}
    try {
      await adminSupabase.from("rfq_vendors").delete().eq("rfq_id", id);
    } catch (_) {}

    // 2. HARD DELETE the RFQ row directly from the Postgres database table!
    const { error } = await adminSupabase
      .from("rfqs")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[hardDeleteRFQ] Admin DB Hard Delete error:", error.message);
      return { success: false, error: "Failed to permanently delete RFQ: " + error.message };
    }

    revalidatePath("/rfqs");
    return { success: true, data: null };
  } catch (err: any) {
    console.error("[hardDeleteRFQ] Unexpected error:", err?.message || err);
    return { success: false, error: "Something went wrong while deleting RFQ permanently." };
  }
}

export async function duplicateRFQ(id: string): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user || !supabase) return { success: false, error: "Unauthorized" };

  try {
    const { data: original, error: fetchError } = await supabase
      .from("rfqs")
      .select("*")
      .eq("id", id)
      .eq("company_id", user.id)
      .single();

    if (fetchError || !original) {
      console.error("[duplicateRFQ] Fetch original error:", fetchError?.message);
      return { success: false, error: "RFQ not found or access denied." };
    }

    const newTitle = original.title.endsWith("(Copy)")
      ? original.title
      : `${original.title} (Copy)`;

    const { data: newRfq, error: insertError } = await supabase
      .from("rfqs")
      .insert({
        company_id: user.id,
        title: newTitle,
        raw_text: original.raw_text,
        parsed_data: original.parsed_data || {},
        deadline: original.deadline,
        status: "draft",
        vendors_contacted: 0,
        quotes_received: 0,
      })
      .select("id")
      .single();

    if (insertError || !newRfq) {
      console.error("[duplicateRFQ] Insert error:", insertError?.message);
      return { success: false, error: "Failed to duplicate RFQ." };
    }

    revalidatePath("/rfqs");
    return { success: true, data: { id: newRfq.id } };
  } catch (err: any) {
    console.error("[duplicateRFQ] Unexpected error:", err?.message || err);
    return { success: false, error: "Something went wrong while duplicating RFQ." };
  }
}

export async function getRFQVendors(rfqId: string): Promise<ActionResult<Array<{
  id: string;
  rfq_id: string;
  vendor_id: string;
  token: string;
  status: string;
  email_sent_at: string | null;
}>>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user || !supabase) return { success: false, error: "Unauthorized" };

  try {
    const { data, error } = await supabase
      .from("rfq_vendors")
      .select("*")
      .eq("rfq_id", rfqId);

    if (error) {
      console.error("[getRFQVendors] DB error:", error.message);
      return { success: false, error: "Failed to fetch RFQ vendor tracking." };
    }

    return { success: true, data: data || [] };
  } catch (err: any) {
    console.error("[getRFQVendors] Unexpected error:", err?.message || err);
    return { success: false, error: "Something went wrong fetching vendor tracking data." };
  }
}

export async function getCompanyName(): Promise<string> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user || !supabase) return "Industrial Sourcing";

  try {
    const { data } = await supabase
      .from("companies")
      .select("name")
      .eq("id", user.id)
      .single();

    if (data?.name) return data.name;

    if (user.user_metadata?.company_name) return user.user_metadata.company_name;
    const emailPrefix = user.email?.split("@")[0] || "Manufacturing";
    return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1) + " Corp";
  } catch (_) {
    return "Industrial Sourcing";
  }
}

export async function dispatchRFQToVendors(
  rfqId: string,
  vendorIds: string[]
): Promise<{
  success: boolean;
  sentCount: number;
  failedCount: number;
  error: string | null;
}> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user || !supabase) {
    return {
      success: false,
      sentCount: 0,
      failedCount: vendorIds?.length || 0,
      error: "Failed to send emails to selected vendors.",
    };
  }

  if (!rfqId || !Array.isArray(vendorIds) || vendorIds.length === 0) {
    return {
      success: false,
      sentCount: 0,
      failedCount: 0,
      error: "Failed to send emails to selected vendors.",
    };
  }

  let successCount = 0;
  let failureCount = 0;

  try {
    // 1. Fetch RFQ & verify ownership
    const { data: rfq, error: rfqError } = await supabase
      .from("rfqs")
      .select("*")
      .eq("id", rfqId)
      .eq("company_id", user.id)
      .single();

    if (rfqError || !rfq) {
      console.error("[dispatchRFQToVendors] RFQ not found or access denied:", rfqError?.message);
      return {
        success: false,
        sentCount: 0,
        failedCount: vendorIds.length,
        error: "Failed to send emails to selected vendors.",
      };
    }

    // 2. Fetch company name
    const companyName = await getCompanyName();

    // 3. Fetch existing rfq_vendors for skipping already sent
    const { data: existingRfqVendors } = await supabase
      .from("rfq_vendors")
      .select("*")
      .eq("rfq_id", rfqId);

    const alreadySentVendorMap = new Map<string, string>();
    (existingRfqVendors || []).forEach((row: any) => {
      if (row.email_sent_at) {
        alreadySentVendorMap.set(row.vendor_id, row.token);
      }
    });

    // 4. Generate signed URL for attachment if exists
    let attachmentSignedUrl: string | null = null;
    let attachmentName: string | null = rfq.attachment_name || null;

    if (rfq.attachment_url) {
      if (!attachmentName) attachmentName = "RFQ_Drawing_Attachment.pdf";
      try {
        let storagePath = rfq.attachment_url;
        if (storagePath.includes("/rfq-attachments/")) {
          storagePath = storagePath.split("/rfq-attachments/")[1];
        }
        const { data: signedData, error: signedErr } = await supabase.storage
          .from("rfq-attachments")
          .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

        if (!signedErr && signedData?.signedUrl) {
          attachmentSignedUrl = signedData.signedUrl;
        } else {
          attachmentSignedUrl = rfq.attachment_url;
        }
      } catch (_) {
        attachmentSignedUrl = rfq.attachment_url;
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    for (const vendorId of vendorIds) {
      if (alreadySentVendorMap.has(vendorId)) {
        continue;
      }

      try {
        const { data: vendor, error: vError } = await supabase
          .from("vendors")
          .select("*")
          .eq("id", vendorId)
          .eq("company_id", user.id)
          .single();

        if (vError || !vendor || !vendor.email) {
          console.error("[dispatchRFQToVendors] Invalid vendor record for ID:", vendorId, vError?.message);
          failureCount++;
          continue;
        }

        const token = crypto.randomUUID();
        const responseLink = `${appUrl}/respond/${token}`;
        const nowIso = new Date().toISOString();

        // Database upsert
        const { error: upsertError } = await supabase
          .from("rfq_vendors")
          .upsert(
            {
              rfq_id: rfqId,
              vendor_id: vendorId,
              token,
              status: "pending",
              email_sent_at: nowIso,
            },
            { onConflict: "rfq_id,vendor_id" }
          );

        if (upsertError) {
          console.error("[dispatchRFQToVendors] Failed upserting rfq_vendors:", upsertError.message);
          failureCount++;
          continue;
        }

        // Resend email call
        const emailSuccess = await sendRFQEmail({
          vendorEmail: vendor.email,
          vendorName: vendor.name,
          companyName,
          rfqTitle: rfq.title,
          parsedData: rfq.parsed_data || {},
          rawText: rfq.raw_text,
          attachmentName,
          attachmentUrl: attachmentSignedUrl,
          responseLink,
          deadline: rfq.deadline,
        });

        if (emailSuccess) {
          successCount++;
        } else {
          console.error(`[dispatchRFQToVendors] Email dispatch returned false for vendor ID ${vendorId}`);
          failureCount++;
        }
      } catch (vendorErr: any) {
        console.error(`[dispatchRFQToVendors] Exception during vendor ${vendorId} email dispatch:`, vendorErr?.message || vendorErr);
        failureCount++;
      }
    }

    if (successCount > 0) {
      const { data: updatedRfqVendors } = await supabase
        .from("rfq_vendors")
        .select("id")
        .eq("rfq_id", rfqId)
        .not("email_sent_at", "is", null);

      const totalContacted = updatedRfqVendors?.length || (alreadySentVendorMap.size + successCount);

      await supabase
        .from("rfqs")
        .update({
          status: "sent",
          vendors_contacted: totalContacted,
        })
        .eq("id", rfqId);

      revalidatePath("/rfqs");
      revalidatePath(`/rfqs/${rfqId}`);
    }

    return {
      success: successCount > 0,
      sentCount: successCount,
      failedCount: failureCount,
      error: successCount === 0 ? "Failed to send emails to selected vendors." : null,
    };
  } catch (err: any) {
    console.error("[dispatchRFQToVendors] Unexpected error in dispatching RFQ:", err?.message || err);
    return {
      success: false,
      sentCount: successCount,
      failedCount: failureCount || vendorIds.length,
      error: "Failed to send emails to selected vendors.",
    };
  }
}

export async function sendRFQ(
  rfqId: string,
  vendorIds: string[]
): Promise<ActionResult<{ sent: number; failed: number }>> {
  const result = await dispatchRFQToVendors(rfqId, vendorIds);
  if (result.success) {
    return {
      success: true,
      data: { sent: result.sentCount, failed: result.failedCount },
    };
  }
  return {
    success: false,
    error: result.error || "Failed to send emails to selected vendors.",
  };
}

export async function getRFQComparisonData(
  rfqId: string
): Promise<ActionResult<RFQComparisonData>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user || !supabase) return { success: false, error: "Unauthorized" };

  try {
    // 1. Fetch single RFQ row
    const { data: rfq, error: rfqError } = await supabase
      .from("rfqs")
      .select("*")
      .eq("id", rfqId)
      .eq("company_id", user.id)
      .single();

    if (rfqError || !rfq) {
      console.error("[getRFQComparisonData] DB error fetching RFQ:", rfqError?.message);
      return { success: false, error: "RFQ not found or access denied." };
    }

    // 2. Fetch all rfq_vendors records associated with rfq_id, with joined vendors and quotes
    const { data: rfqVendorsData, error: rvError } = await supabase
      .from("rfq_vendors")
      .select(`
        id,
        rfq_id,
        vendor_id,
        token,
        status,
        email_sent_at,
        created_at,
        vendors (
          id,
          name,
          email,
          phone,
          category
        ),
        quotes (
          id,
          unit_price,
          quantity_available,
          lead_time_days,
          payment_terms,
          valid_until,
          notes
        )
      `)
      .eq("rfq_id", rfqId);

    if (rvError) {
      console.error("[getRFQComparisonData] DB error fetching RFQ vendors:", rvError.message);
      return { success: false, error: "Failed to fetch vendor records for comparison." };
    }

    const rfqParsed = (rfq.parsed_data || {}) as Record<string, any>;
    const requestedQtyNumber = Number(rfqParsed.quantity) || 1;

    // 3. Format vendor & quote payload
    const vendors: RFQVendorWithDetails[] = (rfqVendorsData || []).map((item: any) => {
      const rawVendor = Array.isArray(item.vendors) ? item.vendors[0] : item.vendors;
      const rawQuote = Array.isArray(item.quotes) ? item.quotes[0] : item.quotes;

      let quoteData: Quote | null = null;
      if (rawQuote && rawQuote.unit_price !== undefined) {
        const unitPrice = Number(rawQuote.unit_price) || 0;
        // Domain Rule: Total Cost = Unit Price * Requested RFQ Quantity
        const totalCost = Number((unitPrice * requestedQtyNumber).toFixed(2));

        quoteData = {
          id: rawQuote.id,
          rfq_vendor_id: item.id,
          unit_price: unitPrice,
          quantity_available: Number(rawQuote.quantity_available) || requestedQtyNumber,
          total_cost: totalCost,
          lead_time_days: Number(rawQuote.lead_time_days) || 0,
          payment_terms: rawQuote.payment_terms || "N/A",
          valid_until: rawQuote.valid_until || "",
          notes: rawQuote.notes || null,
          created_at: "",
        };
      }

      return {
        id: item.id,
        rfq_id: item.rfq_id,
        vendor_id: item.vendor_id,
        token: item.token,
        status: item.status || "pending",
        email_sent_at: item.email_sent_at || null,
        created_at: item.created_at,
        vendor: {
          id: rawVendor?.id || item.vendor_id,
          name: rawVendor?.name || "Unknown Supplier",
          email: rawVendor?.email || "",
          phone: rawVendor?.phone || null,
          category: rawVendor?.category || undefined,
        },
        quote: quoteData,
      };
    });

    // 4. Calculate lowestUnitPrice among all active submitted quotes
    const submittedPrices = vendors
      .map((v) => (v.quote ? v.quote.unit_price : undefined))
      .filter((p): p is number => typeof p === "number" && !isNaN(p) && p > 0);

    const lowestUnitPrice = submittedPrices.length > 0 ? Math.min(...submittedPrices) : null;

    const itemName = rfqParsed.product_name || rfqParsed.item_name || rfq.title;
    const quantity = rfqParsed.quantity !== undefined ? rfqParsed.quantity : 1;
    const unit = rfqParsed.unit || "";

    return {
      success: true,
      data: {
        rfq: {
          id: rfq.id,
          company_id: rfq.company_id,
          title: rfq.title,
          status: rfq.status,
          item_name: itemName,
          quantity,
          unit,
          deadline: rfq.deadline,
          raw_text: rfq.raw_text,
          parsed_data: rfq.parsed_data,
          recommendation: rfq.recommendation || null,
          attachment_url: rfq.attachment_url,
          attachment_name: rfq.attachment_name,
          vendors_contacted: rfq.vendors_contacted,
          quotes_received: rfq.quotes_received,
          created_at: rfq.created_at,
        },
        vendors,
        lowestUnitPrice,
      },
    };
  } catch (err: any) {
    console.error("[getRFQComparisonData] Unexpected error:", err?.message || err);
    return { success: false, error: "Something went wrong while fetching RFQ comparison data." };
  }
}

export async function closeRFQ(rfqId: string): Promise<ActionResult<{ success: true }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user || !supabase) return { success: false, error: "Unauthorized" };

  try {
    const { error } = await supabase
      .from("rfqs")
      .update({ status: "closed" })
      .eq("id", rfqId)
      .eq("company_id", user.id);

    if (error) {
      console.error("[closeRFQ] DB error:", error.message);
      return { success: false, error: "Failed to close RFQ." };
    }

    revalidatePath("/rfqs");
    revalidatePath(`/rfqs/${rfqId}`);
    return { success: true, data: { success: true } };
  } catch (err: any) {
    console.error("[closeRFQ] Unexpected error:", err?.message || err);
    return { success: false, error: "Something went wrong while closing RFQ." };
  }
}

export async function saveRecommendation(
  rfqId: string,
  recommendationData: object
): Promise<ActionResult<{ success: true }>> {
  if (!rfqId) {
    return { success: false, error: "RFQ ID is required." };
  }

  try {
    const adminSupabase = createAdminClient();

    const { error } = await adminSupabase
      .from("rfqs")
      .update({ recommendation: recommendationData })
      .eq("id", rfqId);

    if (error) {
      console.error("[saveRecommendation] Admin DB error:", error.message);
      return { success: false, error: "Failed to save recommendation: " + error.message };
    }

    revalidatePath(`/rfqs/${rfqId}`);
    return { success: true, data: { success: true } };
  } catch (err: any) {
    console.error("[saveRecommendation] Unexpected error:", err?.message || err);
    return { success: false, error: "Something went wrong while saving recommendation." };
  }
}

