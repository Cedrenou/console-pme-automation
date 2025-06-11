"use client";
import React, { useState } from "react";
import { lambdas, LambdaVariable } from "@/lib/lambdas.mock";
import { useRouter, useParams } from "next/navigation";

const LambdaConfigPage = () => {
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;
    const lambda = lambdas.find(l => l.id === id);
    const [variables, setVariables] = useState<LambdaVariable[]>(lambda ? lambda.variables : []);
    const [success, setSuccess] = useState(false);

  if (!lambda) {
    return <div className="text-white p-8">Service introuvable.</div>;
  }

  const handleChange = (key: string, value: string | number | boolean) => {
    setVariables(vars => vars.map(v => v.key === key ? { ...v, value } : v));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(false);
    setTimeout(() => setSuccess(true), 800); // Mock d'appel API
  };

  return (
    <div className="min-h-screen bg-[#151826] text-white p-8">
      <div className="max-w-2xl w-full mx-auto">
        <button onClick={() => router.back()} className="mb-6 text-blue-400 hover:underline">&larr; Retour</button>
        <div className="bg-[#23263A] rounded-2xl shadow-lg px-8 py-10">
          <h1 className="text-3xl font-bold mb-2">{lambda.name}</h1>
          <p className="text-gray-400 mb-8">{lambda.description}</p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {variables.map(variable => (
              <div key={variable.key}>
                <label className="block font-semibold mb-1">{variable.label}</label>
                <div className="text-xs text-gray-400 mb-1">{variable.description}</div>
                {variable.type === 'string' && (
                  <input
                    type="text"
                    value={variable.value as string}
                    onChange={e => handleChange(variable.key, e.target.value)}
                    className="w-full px-3 py-2 rounded bg-[#151826] text-white border border-[#23263A] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
                {variable.type === 'number' && (
                  <input
                    type="number"
                    value={variable.value as number}
                    onChange={e => handleChange(variable.key, Number(e.target.value))}
                    className="w-full px-3 py-2 rounded bg-[#151826] text-white border border-[#23263A] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
                {variable.type === 'boolean' && (
                  <input
                    type="checkbox"
                    checked={!!variable.value}
                    onChange={e => handleChange(variable.key, e.target.checked)}
                    className="h-5 w-5 text-blue-600 rounded focus:ring-blue-500"
                  />
                )}
              </div>
            ))}
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors mt-4">Sauvegarder</button>
            {success && <div className="text-green-400 font-semibold">Modifications sauvegardées !</div>}
          </form>
        </div>
      </div>
    </div>
  );
};

export default LambdaConfigPage; 