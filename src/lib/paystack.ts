// Loads the Paystack inline script on demand and exposes a typed setup helper.
const SRC = "https://js.paystack.co/v1/inline.js";

interface PaystackHandler { openIframe: () => void }
interface PaystackOptions {
  key: string;
  email: string;
  amount: number; // kobo
  currency?: string;
  ref?: string;
  metadata?: Record<string, unknown>;
  callback: (res: { reference: string }) => void;
  onClose: () => void;
}
interface PaystackPop { setup: (o: PaystackOptions) => PaystackHandler }

declare global {
  interface Window { PaystackPop?: PaystackPop }
}

let loading: Promise<PaystackPop> | null = null;

export function PAYSTACK_PUBLIC_KEY(): string {
  return import.meta.env.VITE_PAYSTACK_PUBLIC_KEY ?? "";
}

export function loadPaystack(): Promise<PaystackPop> {
  if (typeof window === "undefined") return Promise.reject(new Error("Paystack is browser-only"));
  if (window.PaystackPop) return Promise.resolve(window.PaystackPop);
  if (loading) return loading;
  loading = new Promise<PaystackPop>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = SRC;
    el.async = true;
    el.onload = () => {
      if (window.PaystackPop) resolve(window.PaystackPop);
      else reject(new Error("Paystack failed to initialise"));
    };
    el.onerror = () => { loading = null; reject(new Error("Could not load Paystack")); };
    document.head.appendChild(el);
  });
  return loading;
}

export type { PaystackOptions };
