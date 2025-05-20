import React from "react";

const services = [
  { id: 1, name: "Service Emailing", description: "Envoi automatique d'emails clients." },
  { id: 2, name: "Service Facturation", description: "Génération automatique des factures." },
  { id: 3, name: "Service Reporting", description: "Rapports d'activité hebdomadaires." },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-3xl font-bold mb-8">Dashboard – Services paramétrables</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {services.map(service => (
          <div key={service.id} className="bg-white rounded shadow p-6">
            <h2 className="text-xl font-semibold mb-2">{service.name}</h2>
            <p className="text-gray-600 mb-4">{service.description}</p>
            <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Configurer</button>
          </div>
        ))}
      </div>
    </div>
  );
} 