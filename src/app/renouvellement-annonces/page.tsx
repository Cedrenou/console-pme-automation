"use client";
import React, { useEffect, useState } from "react";
import { fetchImageBatches, downloadImageBatch, getBatchPreview, type ImageBatch } from "@/lib/api";
import { FaDownload, FaImages, FaCalendar, FaEye } from "react-icons/fa";

const RenouvellementAnnoncesPage = () => {
  const [batches, setBatches] = useState<ImageBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingBatch, setDownloadingBatch] = useState<string | null>(null);
  const [previewBatches, setPreviewBatches] = useState<Record<string, string[]>>({});
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadBatches();
  }, []);

  const loadBatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchImageBatches();
      console.log('Lots d\'images reçus:', data);
      setBatches(data);
    } catch (e) {
      setError("Erreur lors du chargement des lots d'images.");
      console.error('Erreur fetchImageBatches:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (batch: ImageBatch) => {
    setDownloadingBatch(batch.batchId);
    try {
      const blob = await downloadImageBatch(batch.batchId);
      
      // Créer un lien de téléchargement
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${batch.batchId}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('Téléchargement réussi pour le lot:', batch.batchId);
    } catch (e) {
      console.error('Erreur téléchargement:', e);
      alert('Erreur lors du téléchargement du lot');
    } finally {
      setDownloadingBatch(null);
    }
  };

  const handlePreview = async (batch: ImageBatch) => {
    if (previewBatches[batch.batchId]) {
      // L'aperçu existe déjà, ne rien faire
      return;
    }

    setPreviewLoading(prev => ({ ...prev, [batch.batchId]: true }));
    try {
      const previewUrls = await getBatchPreview(batch.batchId);
      setPreviewBatches(prev => ({ ...prev, [batch.batchId]: previewUrls }));
    } catch (e) {
      console.error('Erreur lors de la récupération de l\'aperçu:', e);
      alert('Erreur lors de la récupération de l\'aperçu');
    } finally {
      setPreviewLoading(prev => ({ ...prev, [batch.batchId]: false }));
    }
  };

  if (loading) return <div className="text-white p-8">Chargement...</div>;
  if (error) return <div className="text-red-400 p-8">{error}</div>;

  return (
    <div className="min-h-screen bg-[#151826] text-white p-8">
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">Renouvellement Annonces</h1>
        <p className="text-gray-400">Consultez et téléchargez vos lots d'images depuis S3.</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {batches.length === 0 ? (
          <div className="bg-[#23263A] rounded-2xl shadow-lg p-8 text-center">
            <FaImages className="text-6xl text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">Aucun lot d'images disponible</p>
          </div>
        ) : (
          batches.map(batch => (
            <div key={batch.batchId} className="bg-[#23263A] rounded-2xl shadow-lg p-6 border border-[#23263A] hover:border-blue-600 transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2">{batch.prefix}</h3>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                    <div className="flex items-center gap-2">
                      <FaImages />
                      <span>{batch.count} images</span>
                    </div>
                    {batch.lastModified && (
                      <div className="flex items-center gap-2">
                        <FaCalendar />
                        <span>{new Date(batch.lastModified).toLocaleDateString('fr-FR')}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handlePreview(batch)}
                    disabled={previewLoading[batch.batchId]}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {previewLoading[batch.batchId] ? (
                      <>
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Chargement...
                      </>
                    ) : (
                      <>
                        <FaEye />
                        Aperçu
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDownload(batch)}
                    disabled={downloadingBatch === batch.batchId}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {downloadingBatch === batch.batchId ? (
                      <>
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Téléchargement...
                      </>
                    ) : (
                      <>
                        <FaDownload />
                        Télécharger
                      </>
                    )}
                  </button>
                </div>
              </div>

              {previewBatches[batch.batchId] && previewBatches[batch.batchId].length > 0 && (
                <div className="mt-4 border-t border-[#151826] pt-4">
                  <h4 className="text-sm font-semibold mb-3 text-gray-300">Aperçu des images</h4>
                  <div className="grid grid-cols-4 gap-3">
                    {previewBatches[batch.batchId].map((url, idx) => (
                      <div key={idx} className="relative overflow-hidden rounded-lg bg-[#151826] aspect-square">
                        <img
                          src={url}
                          alt={`Aperçu ${idx + 1}`}
                          className="w-full h-full object-cover hover:scale-105 transition-transform"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RenouvellementAnnoncesPage;

