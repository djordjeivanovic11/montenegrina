export interface ParsedSection {
  ordinal: number;
  heading?: string;
  level: number;
  pageStart?: number;
  pageEnd?: number;
  articleNumber?: string;
  content: string;
  parentOrdinal?: number;
  isTable?: boolean;
  metadata?: Record<string, unknown>;
}

export interface StructureChunk {
  ordinal: number;
  sectionOrdinal?: number;
  page?: number;
  section?: string;
  articleNumber?: string;
  headingPath?: string;
  content: string;
  tokenCount: number;
  searchText: string;
}

export type DocumentVisibility = 'ORG' | 'ROLE_RESTRICTED' | 'GROUP_RESTRICTED';
export type MembershipRole = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';

export interface AccessContext {
  actorType: 'USER' | 'API_KEY' | 'SERVICE';
  membershipRole?: MembershipRole;
  accessGroupIds: ReadonlySet<string>;
}

export interface DocumentAccess {
  visibility: DocumentVisibility;
  minimumRole?: MembershipRole | null;
  accessGroupIds: readonly string[];
}

export interface RetrievalCandidate {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  sectionId?: string | null;
  title: string;
  documentType: string;
  language: string;
  version: number;
  page?: number | null;
  section?: string | null;
  articleNumber?: string | null;
  headingPath?: string | null;
  sourceUrl?: string | null;
  content: string;
  vectorScore: number;
  lexicalScore: number;
  rrfScore: number;
  rerankScore?: number;
  finalScore: number;
}
