export type ImageBatch = {
  batchId: string;
  prefix: string;
  count: number;
  lastModified?: string;
};

// Données mock pour le développement
export const mockImageBatches: ImageBatch[] = [
  {
    batchId: 'batch-001',
    prefix: 'annonces-2024-01',
    count: 45,
    lastModified: '2024-01-15T10:30:00Z',
  },
  {
    batchId: 'batch-002',
    prefix: 'annonces-2024-02',
    count: 52,
    lastModified: '2024-02-10T14:20:00Z',
  },
  {
    batchId: 'batch-003',
    prefix: 'annonces-2024-03',
    count: 38,
    lastModified: '2024-03-05T09:15:00Z',
  },
];

// URLs mock pour l'aperçu des images
export const mockPreviewUrls: Record<string, string[]> = {
  'batch-001': [
    'https://picsum.photos/200?random=1',
    'https://picsum.photos/200?random=2',
    'https://picsum.photos/200?random=3',
    'https://picsum.photos/200?random=4',
  ],
  'batch-002': [
    'https://picsum.photos/200?random=5',
    'https://picsum.photos/200?random=6',
    'https://picsum.photos/200?random=7',
    'https://picsum.photos/200?random=8',
  ],
  'batch-003': [
    'https://picsum.photos/200?random=9',
    'https://picsum.photos/200?random=10',
    'https://picsum.photos/200?random=11',
    'https://picsum.photos/200?random=12',
  ],
};

