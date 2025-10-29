"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { fetchLambdas } from "@/lib/api";

type Service = {
  displayName: string;
  lambdaName: string;
  description: string;
  clientId: string;
  parameters: Record<string, string | number | boolean>;
};

const HomePage = () => {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLambdas()
      .then(data => {
        console.log('Lambdas reçues:', data);
        setServices(data);
      })
      .catch((e) => {
        setError("Erreur lors du chargement des services.");
        console.error('Erreur fetchLambdas:', e);
      })
      .finally(() => {
        console.log('Fin du chargement des lambdas');
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-white p-8">Chargement...</div>;
  if (error) return <div className="text-red-400 p-8">{error}</div>;

  return (
    <div className="min-h-screen bg-[#151826] text-white p-8">
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">Bienvenue !</h1>
        <p className="text-gray-400">Retrouvez vos services automatisés et leur état en un coup d&apos;œil.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {services.map((service, index) => (
          <div key={index} className="bg-[#23263A] rounded-2xl shadow-lg p-6 flex flex-col gap-2 border border-[#23263A] hover:border-blue-600 transition-colors">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold mb-1">{service.displayName}</h2>
            </div>
            <p className="text-gray-400 mb-4">{service.description}</p>
            <Link href={`/lambdas/${service.lambdaName}`} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors w-full text-center">Configurer</Link>
          </div>
        ))}
      </div>
      <div className="bg-[#23263A] rounded-2xl shadow-lg p-8 mt-8">
        <h3 className="text-2xl font-bold mb-4">Aperçu des rapports</h3>
        <div className="text-gray-400">(Ici, vous pouvez ajouter des graphiques, des statistiques ou d&apos;autres widgets personnalisés.)</div>
      </div>
    </div>
  );
};

export default HomePage; 