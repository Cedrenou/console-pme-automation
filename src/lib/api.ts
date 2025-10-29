import { lambdas } from './lambdas.mock';

// Fonction utilitaire pour déterminer si on utilise les mocks
function shouldUseMock(): boolean {
  // Sur la branche develop, utiliser les mocks
  if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'development') {
    return true;
  }
  
  // Si pas d'URL API configurée, utiliser les mocks
  if (!process.env.NEXT_PUBLIC_API_URL) {
    return true;
  }
  
  return false;
}

// Fonction utilitaire pour normaliser les réponses de l'API
// Gère le cas où l'API retourne un format Lambda avec statusCode, headers, body
async function parseApiResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  
  // Si la réponse est au format Lambda (contient statusCode et body)
  if (data && typeof data === 'object' && 'statusCode' in data && 'body' in data) {
    // Si le body est une string JSON, le parser
    if (typeof data.body === 'string') {
      try {
        const parsedBody = JSON.parse(data.body);
        // Si le body contient une propriété 'folders' ou autre structure attendue
        // on peut extraire directement la donnée utile
        return parsedBody as T;
      } catch (e) {
        console.error('Erreur lors du parsing du body:', e);
        throw new Error('Format de réponse API non valide: body n\'est pas un JSON valide');
      }
    }
    // Si le body est déjà un objet, le retourner directement
    return data.body as T;
  }
  
  // Sinon, retourner la réponse telle quelle
  return data as T;
}

// Mock des logs pour les lambdas
const mockLogs = {
  emailing: [
    { id: '1', timestamp: '2024-01-15T10:30:00Z', level: 'INFO', message: 'Email envoyé avec succès à client@example.com' },
    { id: '2', timestamp: '2024-01-15T10:25:00Z', level: 'WARN', message: 'Limite quotidienne presque atteinte (450/500)' },
    { id: '3', timestamp: '2024-01-15T10:20:00Z', level: 'INFO', message: 'Campagne email démarrée pour 150 destinataires' },
  ],
  facturation: [
    { id: '4', timestamp: '2024-01-15T09:45:00Z', level: 'INFO', message: 'Facture générée pour la commande #12345' },
    { id: '5', timestamp: '2024-01-15T09:30:00Z', level: 'ERROR', message: 'Erreur lors de la génération de la facture #12344' },
    { id: '6', timestamp: '2024-01-15T09:15:00Z', level: 'INFO', message: 'Rapport mensuel de facturation généré' },
  ]
};

export async function fetchLambdas() {
  console.log("fetchLambdas");
  
  if (shouldUseMock()) {
    console.log("Utilisation des mocks pour fetchLambdas");
    // Simuler un délai réseau
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Transformer les données mock pour correspondre au format attendu par l'interface
    return lambdas.map(lambda => ({
      clientId: 'clientA',
      lambdaName: lambda.id,
      displayName: lambda.name,
      description: lambda.description,
      parameters: lambda.variables.reduce((acc, variable) => {
        acc[variable.key] = variable.value;
        return acc;
      }, {} as Record<string, string | number | boolean>)
    }));
  }
  
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/clients/clientA/lambdas` // TODO: get clientId from url or from the auth context
  );
  if (!res.ok) throw new Error("Erreur lors de la récupération des lambdas");
  return parseApiResponse(res);
}

export async function fetchLambdaDetails(lambdaId: string) {
  console.log("fetchLambdaDetails pour lambda:", lambdaId);
  
  if (shouldUseMock()) {
    console.log("Utilisation des mocks pour fetchLambdaDetails");
    // Simuler un délai réseau
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const lambda = lambdas.find(l => l.id === lambdaId);
    if (!lambda) {
      throw new Error(`Lambda ${lambdaId} non trouvée`);
    }
    
    // Convertir le format mock vers le format attendu par l'API
    const config: Record<string, string> = {};
    lambda.variables.forEach(variable => {
      config[variable.key] = String(variable.value);
    });
    
    return {
      clientId: 'clientA',
      lambdaName: lambda.id,
      displayName: lambda.name,
      description: lambda.description,
      config,
      active: true,
      order: 1
    };
  }
  
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/clients/clientA/lambdas/${lambdaId}`
  );
  if (!res.ok) throw new Error("Erreur lors de la récupération des détails de la lambda");
  return parseApiResponse(res);
}

export async function updateLambda(lambdaId: string, config: Record<string, string>) {
  console.log("updateLambda pour lambda:", lambdaId);
  
  if (shouldUseMock()) {
    console.log("Utilisation des mocks pour updateLambda");
    // Simuler un délai réseau
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Mettre à jour les valeurs dans le mock
    const lambda = lambdas.find(l => l.id === lambdaId);
    if (lambda) {
      lambda.variables.forEach(variable => {
        if (config[variable.key] !== undefined) {
          // Convertir la valeur selon le type
          if (variable.type === 'number') {
            variable.value = Number(config[variable.key]);
          } else if (variable.type === 'boolean') {
            variable.value = config[variable.key] === 'true';
          } else {
            variable.value = config[variable.key];
          }
        }
      });
    }
    
    return { success: true, message: 'Configuration mise à jour avec succès (mock)' };
  }
  
  const requestBody = { config };
  console.log("updateLambda - Request URL:", `${process.env.NEXT_PUBLIC_API_URL}/clients/clientA/lambdas/${lambdaId}`);
  console.log("updateLambda - Request Body:", JSON.stringify(requestBody, null, 2));
  
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/clients/clientA/lambdas/${lambdaId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error("updateLambda - Error Response:", {
      status: res.status,
      statusText: res.statusText,
      body: errorText
    });
    throw new Error(`Erreur lors de la mise à jour de la lambda: ${errorText}`);
  }
  
  const responseData = await parseApiResponse(res);
  console.log("updateLambda - Success Response:", responseData);
  return responseData;
}

export async function fetchLambdaLogs(lambdaId: string) {
  console.log("fetchLambdaLogs pour lambda:", lambdaId);
  
  if (shouldUseMock()) {
    console.log("Utilisation des mocks pour fetchLambdaLogs");
    // Simuler un délai réseau
    await new Promise(resolve => setTimeout(resolve, 400));
    
    const logs = mockLogs[lambdaId as keyof typeof mockLogs] || [];
    return logs;
  }
  
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/clients/clientA/lambdas/${lambdaId}/logs`
  );
  if (!res.ok) throw new Error("Erreur lors de la récupération des logs de la lambda");
  return parseApiResponse(res);
} 