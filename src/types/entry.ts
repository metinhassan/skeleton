/**
 * Entry type definitions for tournament division entries
 */

import type { Player, Team } from './player.js';

export type EntryType = 'singles' | 'doubles';
export type EntryStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface Entry {
  id: string;
  divisionId: string;
  entryType: EntryType;
  playerId: string | null;
  teamId: string | null;
  seed: number | null;
  status: EntryStatus;
  registeredByUserId: string | null;
  registeredAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Populated fields
  player?: Player;
  team?: Team;
}

export interface CreateEntryData {
  entryType: EntryType;
  playerId?: string;
  teamId?: string;
  seed?: number;
}

export interface UpdateEntryData {
  seed?: number | null;
}

export interface EntryListResponse {
  entries: Entry[];
}

export interface EntryResponse {
  success: boolean;
  entry: Entry;
}
