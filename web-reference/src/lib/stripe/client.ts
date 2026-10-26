import "server-only";
import Stripe from "stripe";
import { serverEnv } from "@/lib/env";

let instance: Stripe | null = null;

export function stripe(): Stripe {
  if (!instance) {
    instance = new Stripe(serverEnv.stripeSecretKey(), {
      appInfo: { name: "GreekGeek", version: "0.1.0" },
      maxNetworkRetries: 2,
      timeout: 20_000,
    });
  }
  return instance;
}
