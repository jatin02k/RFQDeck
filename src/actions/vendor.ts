"use server";

import { VendorSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { ActionResult } from "@/types";
import { revalidatePath } from "next/cache";

// Helper that returns consistent shape — used internally only
async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

export async function getVendors() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user || !supabase) return { success: false, error: "Unauthorized" };

  try {
    const { data, error } = await supabase
      .from("vendors")
      .select("*")
      .eq("company_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getVendors] DB error:", error.message);
      return { success: false, error: "Failed to get vendors." };
    }

    return { success: true, data };
  } catch (err) {
    console.error("[getVendors] Unexpected error:", err);
    return { success: false, error: "Something went wrong." };
  }
}

export async function addVendors(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user || !supabase) return { success: false, error: "Unauthorized" };

  // CHECK PLAN LIMITS
  const { data: company } = await supabase
    .from("companies")
    .select("plan")
    .eq("id", user.id)
    .single();

  const isFree = (company?.plan || "free").toLowerCase() === "free";
  if (isFree) {
    const { count: vendorCount } = await supabase
      .from("vendors")
      .select("*", { count: "exact", head: true })
      .eq("company_id", user.id)
      .eq("is_active", true);

    if ((vendorCount ?? 0) >= 10) {
      return { success: false, error: "PLAN_LIMIT_REACHED" };
    }
  }

  const result = VendorSchema.safeParse(input);
  if (!result.success) {
    return { success: false, error: result.error.issues[0].message };
  }

  try {
    const { data, error } = await supabase
      .from("vendors")
      .insert({
        name: result.data.name.trim(),
        email: result.data.email.toLowerCase().trim(),
        phone: result.data.phone?.trim() || null,
        category: result.data.category,
        company_id: user.id,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[addVendors] DB error:", error.message);
      return { success: false, error: "Failed to add vendor." };
    }

    revalidatePath("/vendors");
    return { success: true, data: { id: data.id } };
  } catch (err) {
    console.error("[addVendors] Unexpected error:", err);
    return { success: false, error: "Something went wrong." };
  }
}

export async function updateVendor(id: string, input: unknown) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user || !supabase) return { success: false, error: "Unauthorized" };

  const result = VendorSchema.partial().safeParse(input);
  if (!result.success) {
    return { success: false, error: result.error.issues[0].message };
  }
  const cleanData = Object.fromEntries(
    Object.entries(result.data).filter(([_, v]) => v !== undefined),
  );
  try {
    const { data, error } = await supabase
      .from("vendors")
      .update(cleanData)
      .eq("id", id)
      .eq("company_id", user.id)
      .select()
      .single();
    if (error) {
      console.log("[updateVendor] DB error:", error.message);
      return { success: false, error: "Failed to update vendor." };
    }
    revalidatePath("/vendors");
    return { success: true, data: { id: data.id } };
  } catch (err) {
    console.error("[updateVendor] Unexpected error:", err);
    return { success: false, error: "Something went wrong." };
  }
}

export async function deleteVendor(id: string) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user || !supabase) return { success: false, error: "Unauthorized" };

  try {
    const { error } = await supabase
      .from("vendors")
      .delete()
      .eq("id", id)
      .eq("company_id", user.id);

    if (error) {
      console.error("[deleteVendor] DB error:", error.message);
      return { success: false, error: "Failed to delete vendor." };
    }

    revalidatePath("/vendors");
    return { success: true };
  } catch (err) {
    console.error("[deleteVendor] Unexpected error:", err);
    return { success: false, error: "Something went wrong." };
  }
}
