"use client";
import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { FaSignInAlt } from "react-icons/fa";

// Sous-composant qui consomme useSearchParams. Doit être wrappé dans <Suspense>
// car Next 15 force le prerender à attendre les query params côté client.
const LoginForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "signing">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("signing");
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus("idle");
      setError(
        error.message.includes("Invalid login credentials")
          ? "Email ou mot de passe incorrect."
          : error.message,
      );
      return;
    }

    router.push(next);
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-[#151826] text-white flex items-center justify-center p-8">
      <div className="bg-[#23263A] rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <span className="inline-block w-3 h-3 bg-blue-500 rounded-full" />
          <h1 className="text-2xl font-bold">Console Sunset</h1>
        </div>
        <p className="text-sm text-gray-400 mb-6">
          Connecte-toi pour accéder au cockpit Vinted.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-gray-300">Email</span>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="px-3 py-2 rounded bg-[#151826] text-white border border-[#2c3048] focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ton.email@example.com"
              autoComplete="email"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-gray-300">Mot de passe</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="px-3 py-2 rounded bg-[#151826] text-white border border-[#2c3048] focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="current-password"
            />
          </label>

          <button
            type="submit"
            disabled={status === "signing"}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <FaSignInAlt />
            {status === "signing" ? "Connexion…" : "Se connecter"}
          </button>

          {error && (
            <div className="bg-red-500/15 border border-red-500/40 text-red-300 text-sm rounded-lg p-3">
              {error}
            </div>
          )}
        </form>

        <p className="text-xs text-gray-500 mt-8 text-center">
          Mot de passe perdu ? Ton admin peut le réinitialiser.
        </p>
      </div>
    </div>
  );
};

const LoginPage = () => (
  <Suspense fallback={<div className="min-h-screen bg-[#151826]" />}>
    <LoginForm />
  </Suspense>
);

export default LoginPage;
