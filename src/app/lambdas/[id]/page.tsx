"use client";
import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { fetchLambdaDetails, updateLambda, fetchLambdaLogs } from "@/lib/api";
import type { LambdaDetails } from "@/lib/lambdas.mock";
import LogItem from "@/components/LogItem";

type LogEntry = {
  timestamp: number;
  message: string;
};

const LambdaConfigPage = () => {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [lambda, setLambda] = useState<LambdaDetails | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadLambdaDetails = async () => {
      try {
        const data = await fetchLambdaDetails(id);
        setLambda(data as LambdaDetails);
        setConfig((data as LambdaDetails).config);
        const logsData = await fetchLambdaLogs(id);
        setLogs(logsData as LogEntry[]);
      } catch (err) {
        setError("Erreur lors du chargement des détails de la lambda");
        console.error('Erreur fetchLambdaDetails:', err);
      } 
    };
    loadLambdaDetails();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(false);
    setError(null);
    setSaving(true);
    
    try {
      await updateLambda(lambda?.lambdaName || '', config);
      setSuccess(true);
      // Rafraîchir les données après la mise à jour
      const updatedData = await fetchLambdaDetails(lambda?.lambdaName || '');
      setLambda(updatedData as LambdaDetails);
      setConfig((updatedData as LambdaDetails).config);
      const logsData = await fetchLambdaLogs(lambda?.lambdaName || '');
      setLogs(logsData as LogEntry[]);
      
      // Masquer le message de succès après 3 secondes
      setTimeout(() => {
        setSuccess(false);
      }, 3000);
    } catch (err) {
      setError("Erreur lors de la sauvegarde des modifications");
      console.error('Erreur sauvegarde:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#151826] text-white p-8">
      <div className="max-w-2xl w-full mx-auto">
        <button onClick={() => router.back()} className="mb-6 text-blue-400 hover:underline">&larr; Retour</button>
        <div className="bg-[#23263A] rounded-2xl shadow-lg px-8 py-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">{lambda?.displayName}</h1>
              <p className="text-gray-400">{lambda?.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-sm ${lambda?.active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`} title={lambda?.active ? 'Actif' : 'Inactif'}>
                {lambda?.active ? 'Actif' : 'Inactif'}
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
                    onChange={e => setConfig(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded bg-[#151826] text-white border border-[#23263A] focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[400px]"
                    placeholder={`Valeur pour ${key}`}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-4 mt-6">
              <button
                type="submit"
                disabled={saving}
                className={`${saving ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white font-semibold py-2 px-6 rounded-lg transition-colors flex items-center gap-2`}
              >
                {saving && (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => router.back()}
                className={`${saving ? 'bg-gray-400 cursor-not-allowed' : 'bg-gray-600 hover:bg-gray-700'} text-white font-semibold py-2 px-6 rounded-lg transition-colors`}
              >
                Annuler
              </button>
            </div>
            
            {success && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 mt-4 flex items-center gap-3">
                <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-green-400 font-semibold">
                  ✅ Modifications sauvegardées avec succès !
                </span>
              </div>
            )}
            
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mt-4 flex items-center gap-3">
                <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="text-red-400 font-semibold">
                  ❌ {error}
                </span>
              </div>
            )}
          </form>
        </div>

        <div className="bg-[#23263A] rounded-2xl shadow-lg px-8 py-10 mt-8">
            <h2 className="text-xl font-semibold mb-4">Logs d&apos;exécution</h2>
            <div className="bg-[#151826] rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
              {logs.length > 0 ? (
                logs.map((log, index) => (
                  <LogItem key={index} log={log} />
                ))
              ) : (
                <p className="text-gray-500">Aucun log disponible.</p>
              )}
            </div>
          </div>
      </div>
    </div>
  );
};

export default LambdaConfigPage; 