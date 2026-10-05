import { createClient } from "@/lib/supabase/server";
import DodoPayments from "dodopayments";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.DODO_PAYMENTS_API_KEY;
    const productId = process.env.DODO_PRODUCT_ID_PRO;

    if (!apiKey || !productId) {
      return NextResponse.json(
        { error: "Payment credentials or Product ID not configured" },
        { status: 500 }
      );
    }

    // Instantiate inside the POST handler to avoid static build evaluation errors
    const dodo = new DodoPayments({
      bearerToken: apiKey,
      environment: (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") || "live_mode",
    });

    const session = await dodo.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: {
        email: user.email!,
        name: user.user_metadata?.full_name || "Procurement Manager",
      },
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
      metadata: {
        user_id: user.id,
      },
    });

    return NextResponse.json({ checkout_url: session.checkout_url });
  } catch (error: any) {
    console.error("Dodo Checkout Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}