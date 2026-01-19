/**
 * Club-related type definitions for the tournament management system
 */

export type ClubRole = 'admin' | 'organiser' | 'supervisor' | 'player';

export interface Club {
  id: string;
  name: string;
  region: string;
  logoUrl?: string;
  role: ClubRole;
  membershipId: string;
}

export interface ClubContext {
  currentClub: Club | null;
  clubs: Club[];
  isLoading: boolean;
}

export interface ClubContextListener {
  (context: ClubContext): void;
}
