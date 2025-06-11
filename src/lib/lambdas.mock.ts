export type LambdaVariable = {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  value: string | number | boolean;
  description?: string;
};

export type LambdaConfig = {
  id: string;
  name: string;
  description: string;
  variables: LambdaVariable[];
};

export const lambdas: LambdaConfig[] = [
  {
    id: 'emailing',
    name: 'Service Emailing',
    description: "Envoi automatique d&apos;emails clients.",
    variables: [
      { key: 'sender', label: 'Expéditeur', type: 'string', value: 'noreply@entreprise.com', description: 'Adresse email utilisée pour l\'envoi.' },
      { key: 'dailyLimit', label: 'Limite quotidienne', type: 'number', value: 500, description: 'Nombre maximum d\'emails envoyés par jour.' },
      { key: 'enabled', label: 'Activer le service', type: 'boolean', value: true, description: 'Active ou désactive le service.' },
    ],
  },
  {
    id: 'facturation',
    name: 'Service Facturation',
    description: 'Génération automatique des factures.',
    variables: [
      { key: 'tva', label: 'Taux de TVA (%)', type: 'number', value: 20, description: 'Taux de TVA appliqué.' },
      { key: 'autoSend', label: 'Envoi automatique', type: 'boolean', value: false, description: 'Envoi automatique des factures par email.' },
    ],
  },
]; 