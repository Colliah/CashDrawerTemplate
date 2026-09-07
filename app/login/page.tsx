"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setError(null);
    setLoading(true);
    const result = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
    if (result.error) {
      setError(result.error.message ?? "Unable to start Google sign-in.");
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-6">
      <section className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Cash Drawer</p>
        <p className="mt-3 text-slate-600">Sign in to record and review your cash drawer counts.</p>
        <button
          type="button"
          onClick={signIn}
          disabled={loading}
          className="mt-8 flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-3 font-medium text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {loading ? "Opening Google…" : "Sign in with Google"}
        </button>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </section>
    </main>
  );
}
