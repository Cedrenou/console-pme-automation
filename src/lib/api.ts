export async function fetchLambdas() {
    console.log("fetchLambdas");
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/clients/clientA/lambdas` // TODO: get clientId from url or from the auth context
  );
  if (!res.ok) throw new Error("Erreur lors de la récupération des lambdas");
  return res.json();
}

export async function fetchLambdaDetails(lambdaId: string) {
  console.log("fetchLambdaDetails pour lambda:", lambdaId);
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/clients/clientA/lambdas/${lambdaId}`
  );
  if (!res.ok) throw new Error("Erreur lors de la récupération des détails de la lambda");
  return res.json();
}

export async function updateLambda(lambdaId: string, config: Record<string, string>) {
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
  
  const responseData = await res.json();
  console.log("updateLambda - Success Response:", responseData);
  return responseData;
}

export type ImageBatch = {
  batchId: string;
  prefix: string;
  count: number;
  lastModified?: string;
};

export async function fetchImageBatches(): Promise<ImageBatch[]> {
  console.log("fetchImageBatches");
  
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/s3/list-folders-images`;
  
  // Mode développement avec données mock
  if (process.env.NODE_ENV === 'development') {
    try {
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = await res.json();
        // Transformer la réponse {"folders": [...]} en format attendu
        return transformFoldersResponse(data);
      }
    } catch {
      console.log('Serveur non disponible, utilisation des données mock');
    }
    
    // Fallback vers les données mock
    const { mockImageBatches } = await import('./s3.mock');
    return mockImageBatches;
  }
  
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error("Erreur lors de la récupération des lots d'images");
  const data = await res.json();
  
  // Transformer la réponse {"folders": [...]} en format attendu
  return transformFoldersResponse(data);
}

/**
 * Transforme la réponse API {"folders": ["path1", "path2"]} 
 * en format ImageBatch[]
 */
function transformFoldersResponse(data: ImageBatch[] | { folders: string[] }): ImageBatch[] {
  // Si la réponse est déjà au bon format, la retourner telle quelle
  if (Array.isArray(data)) {
    return data;
  }
  
  // Sinon, extraire le tableau folders
  if (data.folders && Array.isArray(data.folders)) {
    return data.folders.map((folder: string, index: number) => {
      // Extraire un batchId propre (ex: "renouvellement-annonce-vinted" -> "announce-vinted")
      const batchId = folder.split('/').filter(Boolean).pop() || `batch-${index}`;
      
      return {
        batchId: batchId,
        prefix: folder,
        count: 0, // Peut être rempli par l'API backend si disponible
        lastModified: undefined
      };
    });
  }
  
  // Si le format n'est pas reconnu, retourner un tableau vide
  console.warn('Format de réponse API non reconnu:', data);
  return [];
}

export async function downloadImageBatch(batchId: string): Promise<Blob> {
  console.log("downloadImageBatch pour lot:", batchId);
  
  // Mode développement avec données mock
  if (process.env.NODE_ENV === 'development') {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/s3/download-images-batch/${batchId}`);
      if (res.ok) return res.blob();
    } catch {
      console.log('Serveur non disponible, simulation du téléchargement');
    }
    
    // Créer un blob mock (fichier zip vide)
    return new Blob(['Mock ZIP file for batch: ' + batchId], { type: 'application/zip' });
  }
  
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/s3/download-images-batch/${batchId}`);
  if (!res.ok) throw new Error("Erreur lors du téléchargement du lot");
  return res.blob();
}

export async function getBatchPreview(batchId: string): Promise<string[]> {
  console.log("getBatchPreview pour lot:", batchId);
  
  // Mode développement avec données mock
  if (process.env.NODE_ENV === 'development') {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/s3/preview-images-batch/${batchId}`);
      if (res.ok) return res.json();
    } catch {
      console.log('Serveur non disponible, utilisation des URLs mock');
    }
    
    // Fallback vers les données mock
    const { mockPreviewUrls } = await import('./s3.mock');
    return mockPreviewUrls[batchId] || [];
  }
  
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/s3/preview-images-batch/${batchId}`);
  if (!res.ok) throw new Error("Erreur lors de la récupération de l'aperçu");
  return res.json();
} 