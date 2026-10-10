import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/paystack-verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyPaystackPayment } = await import("@/server/payments/paystack-verify.server");
        return verifyPaystackPayment(request);
      },
    },
  },
});
