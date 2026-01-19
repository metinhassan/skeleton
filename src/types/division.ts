/**
 * Division-related type definitions for tournament management
 */

import type { CompetitionFormat } from './competition.js';

export type DrawStatus = 'not_generated' | 'generated' | 'in_progress' | 'completed';

export interface Division {
  id: string;
  competitionId: string;
  name: string;
  format: CompetitionFormat | null;
  scoringRule: string | null;
  sortOrder: number;
  entryCount: number;
  drawStatus: DrawStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDivisionData {
  name: string;
  format?: CompetitionFormat;
  scoringRule?: string;
}

export interface UpdateDivisionData extends Partial<CreateDivisionData> {
  sortOrder?: number;
}

export interface DivisionListResponse {
  divisions: Division[];
}

export interface DivisionResponse {
  division: Division;
}
