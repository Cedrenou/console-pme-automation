import React from "react";
import { FaArrowUp, FaArrowDown } from "react-icons/fa";
import Link from "next/link";

const services = [
  { id: "emailing", name: "Service Emailing", description: "Envoi automatique d&apos;emails clients.", value: "50.8K", trend: "+28.4%", trendUp: true },
  { id: "facturation", name: "Service Facturation", description: "Génération automatique des factures.", value: "$240.8K", trend: "+24.6%", trendUp: true },
  { id: "reporting", name: "Service Reporting", description: "Rapports d&apos;activité hebdomadaires.", value: "23.6K", trend: "-12.6%", trendUp: false },
];

const HomePage = () => {
  return (
    <div className="min-h-screen bg-[#151826] text-white p-8">
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">Bienvenue !</h1>
        <p className="text-gray-400">Retrouvez vos services automatisés et leur état en un coup d&apos;œil.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {services.map(service => (
          <div key={service.id} className="bg-[#23263A] rounded-2xl shadow-lg p-6 flex flex-col gap-2 border border-[#23263A] hover:border-blue-600 transition-colors">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold mb-1">{service.name}</h2>
              <span className={`flex items-center text-sm font-semibold ${service.trendUp ? 'text-green-400' : 'text-red-400'}`}>
                {service.trendUp ? <FaArrowUp className="mr-1" /> : <FaArrowDown className="mr-1" />}
                {service.trend}
              </span>
            </div>
            <div className="text-3xl font-bold mb-2">{service.value}</div>
            <p className="text-gray-400 mb-4">{service.description}</p>
            <Link href={`/lambdas/${service.id}`} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors w-full text-center">Configurer</Link>
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