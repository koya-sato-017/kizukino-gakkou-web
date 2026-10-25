export interface Episode {
  id: string;
  title: string;
  published: string;
  published_at?: string;
  description: string;
  duration_ms: number;
  link: string;
  audio_url: string | null;
  is_supporter_only?: boolean;
}
