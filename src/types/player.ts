/**
 * Player and Team type definitions for club roster management
 */

export interface Player {
  id: string;
  clubId: string;
  name: string;
  email: string | null;
  phone: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlayerData {
  name: string;
  email?: string;
  phone?: string;
}

export interface UpdatePlayerData extends Partial<CreatePlayerData> {}

export interface Team {
  id: string;
  clubId: string;
  name: string;
  player1Id: string;
  player2Id: string;
  player1?: Player;
  player2?: Player;
  seed?: number;
  rating?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTeamData {
  name?: string;
  player1Id: string;
  player2Id: string;
  seed?: number;
  rating?: number;
}

export interface UpdateTeamData {
  name?: string;
  seed?: number;
  rating?: number;
}

export interface PlayerListResponse {
  players: Player[];
}

export interface PlayerResponse {
  player: Player;
}

export interface TeamListResponse {
  teams: Team[];
}

export interface TeamResponse {
  team: Team;
}
