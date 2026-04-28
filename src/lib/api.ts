import { lambdas } from './lambdas.mock';
import { createClient } from '@/utils/supabase/client';

// Récupère le JWT Supabase de la session active pour l'envoyer en header.
// Côté API Gateway, un Lambda Authorizer le valide via JWKS Supabase.
async function authHeader(): Promise<HeadersInit> {
  if (typeof window === 'undefined') return {};
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch {
    return {};
  }
}

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
    `${process.env.NEXT_PUBLIC_API_URL}/clients/clientA/lambdas`, // TODO: get clientId from url or from the auth context
    { headers: await authHeader() }
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
    `${process.env.NEXT_PUBLIC_API_URL}/clients/clientA/lambdas/${lambdaId}`,
    { headers: await authHeader() }
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
        ...(await authHeader()),
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
    `${process.env.NEXT_PUBLIC_API_URL}/clients/clientA/lambdas/${lambdaId}/logs`,
    { headers: await authHeader() }
  );
  if (!res.ok) throw new Error("Erreur lors de la récupération des logs de la lambda");
  return parseApiResponse(res);
}

export type ImageBatch = {
  batchId: string;
  prefix: string;
  count: number;
  lastModified?: string;
};

export async function fetchImageBatches(): Promise<ImageBatch[]> {
  console.log("fetchImageBatches");
  
  // Ajouter un timestamp pour éviter le cache du navigateur
  const timestamp = Date.now();
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/s3/list-folders-images?t=${timestamp}`;
  
  // Mode développement avec données mock
  if (process.env.NODE_ENV === 'development') {
    try {
      const res = await fetch(apiUrl, {
        cache: 'no-store', // Désactiver le cache
        headers: await authHeader(),
      });
      if (res.ok) {
        const data = await parseApiResponse<{ folders: string[] }>(res);
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
  
  const res = await fetch(apiUrl, {
    cache: 'no-store', // Désactiver le cache
  });
  if (!res.ok) throw new Error("Erreur lors de la récupération des lots d'images");
  const data = await parseApiResponse<{ folders: string[] }>(res);
  console.log('Réponse API brute:', data);
  
  // Transformer la réponse {"folders": [...]} en format attendu
  const transformed = transformFoldersResponse(data);
  console.log('Données transformées:', transformed);
  
  return transformed;
}

/**
 * Transforme la réponse API {"folders": ["path1", "path2"]} 
 * en format ImageBatch[]
 */
function transformFoldersResponse(data: ImageBatch[] | { folders: string[] } | any): ImageBatch[] {
  // Si la réponse est déjà au bon format, la retourner telle quelle
  if (Array.isArray(data)) {
    return data;
  }
  
  // Sinon, extraire le tableau folders
  if (data && typeof data === 'object' && 'folders' in data && Array.isArray(data.folders)) {
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

export async function downloadImageBatch(batch: ImageBatch): Promise<Blob> {
  console.log("downloadImageBatch pour lot:", batch.batchId, "prefix:", batch.prefix);
  
  // TODO: Remplacer par le nom réel de votre bucket S3
  const bucket = process.env.NEXT_PUBLIC_S3_BUCKET || "sunset-s3";
  
  const payload = {
    bucket: bucket,
    prefix: batch.prefix,
    zipName: `${batch.batchId}.zip`
  };
  
  console.log("Payload envoyé à la lambda:", payload);
  
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/s3/download-images-batch/${batch.batchId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeader()),
    },
    body: JSON.stringify(payload)
  });
  
  console.log("Status HTTP:", res.status);
  console.log("Content-Type:", res.headers.get('Content-Type'));
  console.log("Content-Length:", res.headers.get('Content-Length'));
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error("Erreur API:", errorText);
    throw new Error(`Erreur ${res.status}: ${errorText}`);
  }
  
  // La lambda retourne un JSON avec downloadUrl
  const response = await res.json();
  console.log("🔍 DEBUG - Réponse complète de la lambda:", JSON.stringify(response, null, 2));
  console.log("🔍 DEBUG - Type de response:", typeof response);
  console.log("🔍 DEBUG - Clés disponibles:", Object.keys(response));
  
  // API Gateway retourne { statusCode, headers, body } - extraire le body
  let downloadUrl;
  if (response.body) {
    // La réponse est au format API Gateway
    try {
      const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
      console.log("🔍 DEBUG - Body parsé:", body);
      downloadUrl = body.downloadUrl;
    } catch (e) {
      console.error("Erreur parsing body:", e);
    }
  } else {
    // Réponse directe (pas d'encapsulation API Gateway)
    downloadUrl = response.downloadUrl;
  }
  
  console.log("🔍 DEBUG - downloadUrl final:", downloadUrl);
  
  if (!downloadUrl) {
    console.error("❌ downloadUrl manquant dans la réponse");
    console.error("Response reçue:", response);
    throw new Error("downloadUrl manquant dans la réponse de la lambda");
  }
  
  // Redirection directe vers l'URL pré-signée (évite les problèmes CORS)
  console.log("🔗 Redirection vers:", downloadUrl);
  window.location.href = downloadUrl;
  
  // Retourner un blob vide car le téléchargement se fait via redirection
  return new Blob();
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

// === Vinted cockpit ===
// Note : la donnée DynamoDB est keyée sous clientId="sunset" (CLIENT_NAME env var de l'ingest lambda).
// Le reste du repo utilise "clientA" en hardcodé — à unifier le jour où l'auth Supabase arrivera.
const VINTED_CLIENT_ID = 'sunset';

export type VintedStats = {
  period: { from: string | null; to: string | null };
  sales: { count: number; total_revenue: number; avg_price: number };
  transactions: {
    count: number;
    total_revenue: number;
    total_frais_port_acheteur: number;
    total_net_recu: number;
    total_frais_vinted: number;
  };
  purchases: { count: number; total_spent: number };
  boosts: { count: number; total_cost: number; total_articles: number; total_days: number };
  vitrines: { count: number; total_cost: number; total_days: number };
  transferts: { count: number; total_amount: number };
  refunds: {
    count: number;
    total_amount: number;
    sunset_acheteur: { count: number; total: number };
    sunset_vendeur: { count: number; total: number };
  };
};

export type VintedEvent = {
  clientId: string;
  gmailMessageId: string;
  eventType: 'achat' | 'vente' | 'boost' | 'vitrine' | 'transfert' | 'refund' | 'transaction';
  eventDate: string;
  eventTypeIndex: string;
  payload: Record<string, unknown>;
  sourceLabel?: string;
  createdAt?: string;
};

export type VintedEventsResponse = {
  items: VintedEvent[];
  nextCursor: string | null;
  count: number;
};

export async function fetchVintedStats(from?: string, to?: string): Promise<VintedStats> {
  if (shouldUseMock()) {
    await new Promise(r => setTimeout(r, 200));
    return mockVintedStats(from, to);
  }
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const url = `${process.env.NEXT_PUBLIC_API_URL}/clients/${VINTED_CLIENT_ID}/vinted/stats${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url, { headers: await authHeader() });
  if (!res.ok) throw new Error("Erreur lors de la récupération des stats Vinted");
  return parseApiResponse<VintedStats>(res);
}

export type VintedTopCategory = { category: string; count: number; total_revenue: number; share_pct: number };
export type VintedTopGender = { gender: string; count: number; total_revenue: number; share_pct: number };
export type VintedTopTitle = { title: string; count: number; total_revenue: number; avg_price: number };

export type VintedTopArticles = {
  period: { from: string | null; to: string | null };
  total_count: number;
  total_revenue: number;
  by_category: VintedTopCategory[];
  by_gender: VintedTopGender[];
  top_titles: VintedTopTitle[];
};

export async function fetchVintedTopArticles(opts: { from?: string; to?: string } = {}): Promise<VintedTopArticles> {
  if (shouldUseMock()) {
    await new Promise(r => setTimeout(r, 200));
    return mockVintedTopArticles();
  }
  const params = new URLSearchParams();
  if (opts.from) params.set('from', opts.from);
  if (opts.to) params.set('to', opts.to);
  const url = `${process.env.NEXT_PUBLIC_API_URL}/clients/${VINTED_CLIENT_ID}/vinted/top-articles?${params}`;
  const res = await fetch(url, { headers: await authHeader() });
  if (!res.ok) throw new Error("Erreur lors de la récupération des top articles Vinted");
  return parseApiResponse<VintedTopArticles>(res);
}

export type VintedPatternsBucket = { day: number; hour: number; count: number; total_revenue: number };
export type VintedPatternsDayBucket = { day: number; label: string; count: number; total_revenue: number };
export type VintedPatternsHourBucket = { hour: number; count: number; total_revenue: number };

export type VintedPatterns = {
  period: { from: string | null; to: string | null };
  ventes_count: number;
  by_day_of_week: VintedPatternsDayBucket[];
  by_hour_of_day: VintedPatternsHourBucket[];
  heatmap: VintedPatternsBucket[];
};

export async function fetchVintedPatterns(opts: { from?: string; to?: string } = {}): Promise<VintedPatterns> {
  if (shouldUseMock()) {
    await new Promise(r => setTimeout(r, 200));
    return mockVintedPatterns();
  }
  const params = new URLSearchParams();
  if (opts.from) params.set('from', opts.from);
  if (opts.to) params.set('to', opts.to);
  const url = `${process.env.NEXT_PUBLIC_API_URL}/clients/${VINTED_CLIENT_ID}/vinted/patterns?${params}`;
  const res = await fetch(url, { headers: await authHeader() });
  if (!res.ok) throw new Error("Erreur lors de la récupération des patterns Vinted");
  return parseApiResponse<VintedPatterns>(res);
}

export type VintedTimelineBucket = { date: string; count: number; total: number };

export type VintedTimeline = {
  type: VintedEvent['eventType'];
  granularity: 'day' | 'week' | 'month';
  period: { from: string | null; to: string | null };
  buckets: VintedTimelineBucket[];
};

export type VintedBordereau = {
  filename: string;
  subject: string;
  sizeBytes: number;
  pdfBase64: string;
};

export async function fetchVintedBordereau(venteId: string): Promise<VintedBordereau> {
  if (shouldUseMock()) {
    await new Promise(r => setTimeout(r, 400));
    throw new Error("Bordereau non disponible en mode mock — passe sur l'API prod pour tester");
  }
  const url = `${process.env.NEXT_PUBLIC_API_URL}/clients/${VINTED_CLIENT_ID}/vinted/bordereau?venteId=${encodeURIComponent(venteId)}`;
  const res = await fetch(url, { headers: await authHeader() });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Bordereau introuvable: ${txt}`);
  }
  return parseApiResponse<VintedBordereau>(res);
}

export async function fetchVintedTimeline(opts: {
  type?: VintedEvent['eventType'];
  from?: string;
  to?: string;
  granularity?: 'day' | 'week' | 'month';
} = {}): Promise<VintedTimeline> {
  if (shouldUseMock()) {
    await new Promise(r => setTimeout(r, 200));
    return mockVintedTimeline(opts);
  }
  const params = new URLSearchParams();
  if (opts.type) params.set('type', opts.type);
  if (opts.from) params.set('from', opts.from);
  if (opts.to) params.set('to', opts.to);
  if (opts.granularity) params.set('granularity', opts.granularity);
  const url = `${process.env.NEXT_PUBLIC_API_URL}/clients/${VINTED_CLIENT_ID}/vinted/timeline?${params}`;
  const res = await fetch(url, { headers: await authHeader() });
  if (!res.ok) throw new Error("Erreur lors de la récupération de la timeline Vinted");
  return parseApiResponse<VintedTimeline>(res);
}

export async function fetchVintedEvents(opts: {
  type: VintedEvent['eventType'];
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}): Promise<VintedEventsResponse> {
  if (shouldUseMock()) {
    await new Promise(r => setTimeout(r, 200));
    return mockVintedEvents(opts);
  }
  const params = new URLSearchParams();
  params.set('type', opts.type);
  if (opts.from) params.set('from', opts.from);
  if (opts.to) params.set('to', opts.to);
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.cursor) params.set('cursor', opts.cursor);
  const url = `${process.env.NEXT_PUBLIC_API_URL}/clients/${VINTED_CLIENT_ID}/vinted/events?${params}`;
  const res = await fetch(url, { headers: await authHeader() });
  if (!res.ok) throw new Error("Erreur lors de la récupération des events Vinted");
  return parseApiResponse<VintedEventsResponse>(res);
}

function mockVintedStats(from?: string, to?: string): VintedStats {
  return {
    period: { from: from ?? null, to: to ?? null },
    sales: { count: 234, total_revenue: 26408.99, avg_price: 112.86 },
    transactions: {
      count: 220,
      total_revenue: 24850.00,
      total_frais_port_acheteur: 658.00,
      total_net_recu: 24962.30,
      total_frais_vinted: 545.70
    },
    purchases: { count: 187, total_spent: 5851.64 },
    boosts: { count: 10, total_cost: 1129.93, total_articles: 326, total_days: 66 },
    vitrines: { count: 4, total_cost: 33.16, total_days: 28 },
    transferts: { count: 70, total_amount: 20243.32 },
    refunds: {
      count: 22,
      total_amount: 1888.90,
      sunset_acheteur: { count: 22, total: 1888.90 },
      sunset_vendeur: { count: 0, total: 0 }
    }
  };
}

function mockVintedTopArticles(): VintedTopArticles {
  return {
    period: { from: null, to: null },
    total_count: 234,
    total_revenue: 26408.99,
    by_category: [
      { category: "Veste/Blouson", count: 110, total_revenue: 12300, share_pct: 47 },
      { category: "Bottes/Chaussures", count: 51, total_revenue: 5230, share_pct: 21.8 },
      { category: "Pantalon", count: 30, total_revenue: 2850, share_pct: 12.8 },
      { category: "Gants", count: 18, total_revenue: 580, share_pct: 7.7 },
      { category: "Dorsale/Protection", count: 12, total_revenue: 540, share_pct: 5.1 },
      { category: "Autre", count: 13, total_revenue: 908.99, share_pct: 5.6 },
    ],
    by_gender: [
      { gender: "Homme", count: 134, total_revenue: 14200, share_pct: 57.3 },
      { gender: "Femme", count: 78, total_revenue: 9050, share_pct: 33.3 },
      { gender: "Mixte", count: 22, total_revenue: 3158.99, share_pct: 9.4 },
    ],
    top_titles: [
      { title: "Alpinestars Tech 5 Motorradstiefel Enduro", count: 8, total_revenue: 920, avg_price: 115 },
      { title: "Veste moto Segura Nygma L Femme", count: 5, total_revenue: 540, avg_price: 108 },
    ]
  };
}

function mockVintedPatterns(): VintedPatterns {
  const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const heatmap: VintedPatternsBucket[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      // Pic le soir 19-22h, jour de semaine plus que week-end
      const hourFactor = Math.max(0, Math.cos((h - 20) / 6));
      const dayFactor = d < 5 ? 1 : 0.6;
      const count = Math.round(20 * hourFactor * dayFactor + Math.random() * 2);
      heatmap.push({ day: d, hour: h, count, total_revenue: count * 90 });
    }
  }
  const by_day_of_week = DAYS.map((label, day) => {
    const dayItems = heatmap.filter(b => b.day === day);
    return {
      day,
      label,
      count: dayItems.reduce((a, b) => a + b.count, 0),
      total_revenue: dayItems.reduce((a, b) => a + b.total_revenue, 0),
    };
  });
  const by_hour_of_day = Array.from({ length: 24 }, (_, hour) => {
    const items = heatmap.filter(b => b.hour === hour);
    return {
      hour,
      count: items.reduce((a, b) => a + b.count, 0),
      total_revenue: items.reduce((a, b) => a + b.total_revenue, 0),
    };
  });
  return {
    period: { from: null, to: null },
    ventes_count: heatmap.reduce((a, b) => a + b.count, 0),
    by_day_of_week,
    by_hour_of_day,
    heatmap,
  };
}

function mockVintedTimeline(opts: { granularity?: 'day' | 'week' | 'month' }): VintedTimeline {
  const granularity = opts.granularity ?? 'month';
  const now = new Date();
  const buckets: VintedTimelineBucket[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const seasonality = 1 + Math.sin((d.getMonth() + 9) / 12 * 2 * Math.PI) * 0.4;
    const total = Math.round(15000 * seasonality + Math.random() * 2000);
    buckets.push({ date: key, count: Math.round(total / 90), total });
  }
  return {
    type: 'transaction',
    granularity,
    period: { from: null, to: null },
    buckets
  };
}

function mockVintedEvents(opts: { type: VintedEvent['eventType']; limit?: number }): VintedEventsResponse {
  if (opts.type !== 'vente') return { items: [], nextCursor: null, count: 0 };
  const now = Date.now();
  const titles = [
    'Casque AGV K3 Taille M Noir Mat',
    'Blouson cuir Dainese Avro D2 Homme L',
    'Gants moto Alpinestars GP Pro R3 XL',
    'Bottes Sidi Mag-1 Air Noires 43',
    'Veste Rev\'it Ignition 4 H2O Femme S'
  ];
  const items: VintedEvent[] = Array.from({ length: opts.limit ?? 20 }, (_, i) => ({
    clientId: VINTED_CLIENT_ID,
    gmailMessageId: `mock-${i}`,
    eventType: 'vente',
    eventDate: new Date(now - i * 1.5 * 3600_000).toISOString(),
    eventTypeIndex: `${VINTED_CLIENT_ID}#vente`,
    payload: {
      acheteur_username: `acheteur_${i + 1}`,
      article_titre: titles[i % titles.length],
      prix_vente: Math.round((40 + Math.random() * 250) * 100) / 100,
      vinted_pro: true
    }
  }));
  return { items, nextCursor: null, count: items.length };
}
