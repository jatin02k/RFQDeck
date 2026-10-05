import { createAdminClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { Webhook } from "standardwebhooks";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const webhookSecret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("DODO_PAYMENTS_WEBHOOK_SECRET is not configured.");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const rawBody = await request.text();

  const headerPayload = await headers();
  const webhookHeaders = {
    "webhook-id": headerPayload.get("webhook-id") ?? "",
    "webhook-signature": headerPayload.get("webhook-signature") ?? "",
    "webhook-timestamp": headerPayload.get("webhook-timestamp") ?? "",
  };

  try {
    const webhook = new Webhook(webhookSecret);
    await webhook.verify(rawBody, webhookHeaders);
  } catch (err) {
    console.error("Dodo Webhook verification failed:", err);
    return new Response("Invalid Signature", { status: 400 });
  }

  const payload = JSON.parse(rawBody);
  const eventType = payload.type;
  const data = payload.data;

  const supabaseAdmin = createAdminClient();

  try {
    switch (eventType) {
      // 1. Log completed payment transactions
      case "payment.succeeded": {
        const customerEmail = data.customer?.email;
        if (customerEmail) {
          console.log(`Payment received for ${customerEmail}: ${data.amount}`);
        }
        break;
      }

      // 2. Provision or renew Pro access
      case "subscription.active":
      case "subscription.renewed": {
        const customerEmail = data.customer?.email;
        const customerId = data.customer?.customer_id;
        const subscriptionId = data.subscription_id;
        const periodEnd = data.next_billing_date
          ? new Date(data.next_billing_date).toISOString()
          : null;

        if (customerEmail) {
          await supabaseAdmin
            .from("companies")
            .update({
              plan: "pro",
              subscription_status: "active",
              dodo_customer_id: customerId,
              dodo_subscription_id: subscriptionId,
              plan_expires_at: periodEnd,
              updated_at: new Date().toISOString(),
            })
            .eq("email", customerEmail);
        }
        break;
      }

      // 3. Revoke Pro access
      case "subscription.cancelled":
      case "subscription.expired":
      case "subscription.failed": {
        const customerEmail = data.customer?.email;

        if (customerEmail) {
          await supabaseAdmin
            .from("companies")
            .update({
              plan: "free",
              subscription_status: "inactive",
              updated_at: new Date().toISOString(),
            })
            .eq("email", customerEmail);
        }
        break;
      }
    }
    return new Response("Webhook handled successfully", { status: 200 });
  } catch (error) {
    console.error("Error processing webhook payload:", error);
    return new Response("Internal server error", { status: 500 });
  }
}