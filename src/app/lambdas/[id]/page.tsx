"use client";
import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { fetchLambdaDetails, updateLambda } from "@/lib/api";
import type { LambdaDetails } from "@/lib/lambdas.mock";

const LambdaConfigPage = () => {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [lambda, setLambda] = useState<LambdaDetails | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const loadLambdaDetails = async () => {
      try {
        const data = await fetchLambdaDetails(id);
        setLambda(data);
        setConfig(data.config || {});
      } catch (err) {
        setError("Erreur lors du chargement des détails de la lambda");
        console.error('Erreur fetchLambdaDetails:', err);
      } finally {
        setLoading(false);
      }
    };

    loadLambdaDetails();
  }, [id]);

  if (loading) return <div className="text-white p-8">Chargement...</div>;
  if (error) return <div className="text-red-400 p-8">{error}</div>;
  if (!lambda) return <div className="text-white p-8">Service introuvable.</div>;

  const handleChange = (key: string, value: string) => {
    setConfig(config => ({ ...config, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(false);
    setError(null);
    
    try {
      await updateLambda(lambda.lambdaName, config);
      setSuccess(true);
      // Rafraîchir les données après la mise à jour
      const updatedData = await fetchLambdaDetails(lambda.lambdaName);
      setLambda(updatedData);
      setConfig(updatedData.config || {});
    } catch (err) {
      setError("Erreur lors de la sauvegarde des modifications");
      console.error('Erreur sauvegarde:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#151826] text-white p-8">
      <div className="max-w-2xl w-full mx-auto">
        <button onClick={() => router.back()} className="mb-6 text-blue-400 hover:underline">&larr; Retour</button>
        <div className="bg-[#23263A] rounded-2xl shadow-lg px-8 py-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">{lambda.displayName}</h1>
              <p className="text-gray-400">{lambda.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-sm ${lambda.active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {lambda.active ? 'Actif' : 'Inactif'}
              </span>
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="flex flex-col gap-6 mt-8">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Configuration</h2>
              {Object.entries(config).map(([key, value]) => (
                <div key={key} className="space-y-2">
                  <label className="block font-medium text-gray-200">
                    {key}
                  </label>
                  <textarea
                    value={value}
                    onChange={e => handleChange(key, e.target.value)}
                    className="w-full px-3 py-2 rounded bg-[#151826] text-white border border-[#23263A] focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                    placeholder={`Valeur pour ${key}`}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-4 mt-6">
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
              >
                Sauvegarder
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
              >
                Annuler
              </button>
            </div>
            
            {success && (
              <div className="text-green-400 font-semibold mt-4">
                Modifications sauvegardées avec succès !
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default LambdaConfigPage; 