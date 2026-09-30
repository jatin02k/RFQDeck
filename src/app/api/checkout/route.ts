import { createClient } from "@/lib/supabase/server";
import DodoPayments from "dodopayments";
import { NextRequest, NextResponse } from "next/server";

const dodo = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  environment: process.env.DODO_PAYMENTS_ENVIRONMENT as
    | "test_mode"
    | "live_mode",
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const productId = process.env.DODO_PRODUCT_ID_PRO

    if (!productId) {
      return NextResponse.json({ error: "Product ID not configured" }, { status: 500 })
    }

    const session = await dodo.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: { 
        email: user.email!,
        name: user.user_metadata?.full_name || "Procurement Manager"
       },
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
      metadata: {
        user_id: user.id,
      },
    });

    return NextResponse.json({ checkout_url: session.checkout_url })
  } catch (error:any) {
    console.error("Dodo Checkout Error:", error)
    return NextResponse.json({ error: error.message }, { status:500 })
  }
}
