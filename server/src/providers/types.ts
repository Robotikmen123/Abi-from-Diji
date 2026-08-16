export type Role = 'user' | 'abi';

export interface ChatTurn {
  role: Role;
  text: string;
}

export type Emotion =
  | 'IDLE'
  | 'AMUSED'
  | 'ANNOYED'
  | 'SERIOUS'
  | 'SUSPICIOUS'
  | 'EXCITED'
  | 'SURPRISED'
  | 'MISSION'
  | 'ALERT';

export const EMOTIONS: Emotion[] = [
  'IDLE',
  'AMUSED',
  'ANNOYED',
  'SERIOUS',
  'SUSPICIOUS',
  'EXCITED',
  'SURPRISED',
  'MISSION',
  'ALERT',
];

export interface LlmRequest {
  system: string;
  history: ChatTurn[];
  message: string;
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface LlmProvider {
  readonly id: string;
  readonly label: string;
  /** Streaming token uretimi. */
  stream(req: LlmRequest): AsyncIterable<string>;
  /** Saglik kontrolu; false ise provider secilmez. */
  available(): Promise<boolean>;
}

export interface MemoryFact {
  id: string;
  text: string;
  createdAt: number;
  hits: number;
}

export interface MemoryProvider {
  readonly id: string;
  list(): Promise<MemoryFact[]>;
  remember(text: string): Promise<MemoryFact | null>;
  forget(id: string): Promise<void>;
  clear(): Promise<void>;
}

export interface TtsChunk {
  audio: ArrayBuffer;
  mime: string;
}

export interface TtsProvider {
  readonly id: string;
  readonly label: string;
  /** 'client' saglayicisi sesi tarayicida uretir; sunucu ses dondurmez. */
  readonly clientSide: boolean;
  available(): Promise<boolean>;
  synthesize?(text: string, opts: { voice?: string; rate?: number }): Promise<TtsChunk>;
}
