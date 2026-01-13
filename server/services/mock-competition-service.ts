/**
 * Mock competition service implementation using SQLite
 * For local development only
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase, seedScoringPresets } from '../db/database.js';
import type {
  CompetitionService,
  Competition,
  Division,
  ScoringRule,
  ScoringRuleConfig,
  CreateCompetitionInput,
  UpdateCompetitionInput,
  CreateDivisionInput,
  UpdateDivisionInput,
  CreateScoringRuleInput,
  CompetitionResult,
  CompetitionFormat,
  CompetitionType,
  CompetitionStatus,
  ScoreEntryMode,
} from './competition-service.js';

interface DbCompetition {
  id: string;
  club_id: string;
  name: string;
  type: CompetitionType;
  format: CompetitionFormat;
  status: CompetitionStatus;
  score_entry_mode: ScoreEntryMode;
  default_scoring_rule_id: string | null;
  public_slug: string | null;
  start_date: string | null;
  end_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface DbDivision {
  id: string;
  competition_id: string;
  name: string;
  format: CompetitionFormat | null;
  scoring_rule_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface DbScoringRule {
  id: string;
  club_id: string | null;
  name: string;
  config: string;
  is_preset: number;
  created_at: string;
  updated_at: string;
}

export class MockCompetitionService implements CompetitionService {
  constructor() {
    // Ensure scoring presets are seeded
    seedScoringPresets();
  }

  // ==================== Competitions ====================

  async createCompetition(
    clubId: string,
    input: CreateCompetitionInput,
    createdBy: string
  ): Promise<CompetitionResult<Competition>> {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date();

    try {
      const stmt = db.prepare(`
        INSERT INTO competitions (
          id, club_id, name, type, format, status, score_entry_mode,
          default_scoring_rule_id, start_date, end_date, created_by, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        clubId,
        input.name,
        input.type,
        input.format,
        'draft',
        input.scoreEntryMode || 'organisers_only',
        input.defaultScoringRuleId || null,
        input.startDate || null,
        input.endDate || null,
        createdBy,
        now.toISOString(),
        now.toISOString()
      );

      const competition = await this.getCompetition(id);
      return { success: true, data: competition! };
    } catch (error) {
      console.error('Failed to create competition:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to create competition' };
    }
  }

  async getCompetition(competitionId: string): Promise<Competition | null> {
    const db = getDatabase();
    const row = db
      .prepare('SELECT * FROM competitions WHERE id = ?')
      .get(competitionId) as DbCompetition | undefined;

    return row ? this.mapRowToCompetition(row) : null;
  }

  async getClubCompetitions(clubId: string, includeDrafts: boolean): Promise<Competition[]> {
    const db = getDatabase();
    let query = 'SELECT * FROM competitions WHERE club_id = ?';

    if (!includeDrafts) {
      query += " AND status != 'draft'";
    }

    query += ' ORDER BY created_at DESC';

    const rows = db.prepare(query).all(clubId) as DbCompetition[];
    return rows.map((row) => this.mapRowToCompetition(row));
  }

  async updateCompetition(
    competitionId: string,
    input: UpdateCompetitionInput,
    _updatedBy: string
  ): Promise<CompetitionResult<Competition>> {
    const existing = await this.getCompetition(competitionId);
    if (!existing) {
      return { success: false, error: 'competition_not_found', message: 'Competition not found' };
    }

    const db = getDatabase();
    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    if (input.type !== undefined) {
      updates.push('type = ?');
      values.push(input.type);
    }
    if (input.format !== undefined) {
      updates.push('format = ?');
      values.push(input.format);
    }
    if (input.scoreEntryMode !== undefined) {
      updates.push('score_entry_mode = ?');
      values.push(input.scoreEntryMode);
    }
    if (input.defaultScoringRuleId !== undefined) {
      updates.push('default_scoring_rule_id = ?');
      values.push(input.defaultScoringRuleId);
    }
    if (input.startDate !== undefined) {
      updates.push('start_date = ?');
      values.push(input.startDate);
    }
    if (input.endDate !== undefined) {
      updates.push('end_date = ?');
      values.push(input.endDate);
    }

    if (updates.length === 0) {
      return { success: true, data: existing };
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(competitionId);

    try {
      db.prepare(`UPDATE competitions SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      const updated = await this.getCompetition(competitionId);
      return { success: true, data: updated! };
    } catch (error) {
      console.error('Failed to update competition:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to update competition' };
    }
  }

  async publishCompetition(
    competitionId: string,
    _publishedBy: string
  ): Promise<CompetitionResult<Competition>> {
    const existing = await this.getCompetition(competitionId);
    if (!existing) {
      return { success: false, error: 'competition_not_found', message: 'Competition not found' };
    }

    if (existing.status !== 'draft') {
      return { success: false, error: 'already_published', message: 'Competition is already published' };
    }

    const db = getDatabase();
    const slug = this.generateSlug(existing.name);
    const now = new Date();

    try {
      db.prepare(`
        UPDATE competitions
        SET status = 'published', public_slug = ?, updated_at = ?
        WHERE id = ?
      `).run(slug, now.toISOString(), competitionId);

      const updated = await this.getCompetition(competitionId);
      return { success: true, data: updated! };
    } catch (error) {
      console.error('Failed to publish competition:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to publish competition' };
    }
  }

  async getPublicCompetition(slug: string): Promise<Competition | null> {
    const db = getDatabase();
    const row = db
      .prepare("SELECT * FROM competitions WHERE public_slug = ? AND status != 'draft'")
      .get(slug) as DbCompetition | undefined;

    return row ? this.mapRowToCompetition(row) : null;
  }

  // ==================== Divisions ====================

  async createDivision(
    competitionId: string,
    input: CreateDivisionInput
  ): Promise<CompetitionResult<Division>> {
    const competition = await this.getCompetition(competitionId);
    if (!competition) {
      return { success: false, error: 'competition_not_found', message: 'Competition not found' };
    }

    const db = getDatabase();
    const id = uuidv4();
    const now = new Date();

    try {
      const stmt = db.prepare(`
        INSERT INTO divisions (
          id, competition_id, name, format, scoring_rule_id, sort_order, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        competitionId,
        input.name,
        input.format || null,
        input.scoringRuleId || null,
        input.sortOrder || 0,
        now.toISOString(),
        now.toISOString()
      );

      const division = await this.getDivision(id);
      return { success: true, data: division! };
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return { success: false, error: 'duplicate_division_name', message: 'Division name already exists in this competition' };
      }
      console.error('Failed to create division:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to create division' };
    }
  }

  async getDivisions(competitionId: string): Promise<Division[]> {
    const db = getDatabase();
    const rows = db
      .prepare('SELECT * FROM divisions WHERE competition_id = ? ORDER BY sort_order, name')
      .all(competitionId) as DbDivision[];

    return rows.map((row) => this.mapRowToDivision(row));
  }

  async getDivision(divisionId: string): Promise<Division | null> {
    const db = getDatabase();
    const row = db
      .prepare('SELECT * FROM divisions WHERE id = ?')
      .get(divisionId) as DbDivision | undefined;

    return row ? this.mapRowToDivision(row) : null;
  }

  async updateDivision(
    divisionId: string,
    input: UpdateDivisionInput
  ): Promise<CompetitionResult<Division>> {
    const existing = await this.getDivision(divisionId);
    if (!existing) {
      return { success: false, error: 'division_not_found', message: 'Division not found' };
    }

    const db = getDatabase();
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    if (input.format !== undefined) {
      updates.push('format = ?');
      values.push(input.format);
    }
    if (input.scoringRuleId !== undefined) {
      updates.push('scoring_rule_id = ?');
      values.push(input.scoringRuleId);
    }
    if (input.sortOrder !== undefined) {
      updates.push('sort_order = ?');
      values.push(input.sortOrder);
    }

    if (updates.length === 0) {
      return { success: true, data: existing };
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(divisionId);

    try {
      db.prepare(`UPDATE divisions SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      const updated = await this.getDivision(divisionId);
      return { success: true, data: updated! };
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return { success: false, error: 'duplicate_division_name', message: 'Division name already exists in this competition' };
      }
      console.error('Failed to update division:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to update division' };
    }
  }

  async deleteDivision(divisionId: string): Promise<CompetitionResult<void>> {
    const existing = await this.getDivision(divisionId);
    if (!existing) {
      return { success: false, error: 'division_not_found', message: 'Division not found' };
    }

    const db = getDatabase();

    try {
      db.prepare('DELETE FROM divisions WHERE id = ?').run(divisionId);
      return { success: true, data: undefined };
    } catch (error) {
      console.error('Failed to delete division:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to delete division' };
    }
  }

  // ==================== Scoring Rules ====================

  async getScoringRules(clubId: string): Promise<ScoringRule[]> {
    const db = getDatabase();
    // Get presets (club_id IS NULL) and club-specific rules
    const rows = db
      .prepare('SELECT * FROM scoring_rules WHERE club_id IS NULL OR club_id = ? ORDER BY is_preset DESC, name')
      .all(clubId) as DbScoringRule[];

    return rows.map((row) => this.mapRowToScoringRule(row));
  }

  async getScoringRule(ruleId: string): Promise<ScoringRule | null> {
    const db = getDatabase();
    const row = db
      .prepare('SELECT * FROM scoring_rules WHERE id = ?')
      .get(ruleId) as DbScoringRule | undefined;

    return row ? this.mapRowToScoringRule(row) : null;
  }

  async createScoringRule(
    clubId: string,
    input: CreateScoringRuleInput
  ): Promise<CompetitionResult<ScoringRule>> {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date();

    try {
      const stmt = db.prepare(`
        INSERT INTO scoring_rules (id, club_id, name, config, is_preset, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `);

      stmt.run(
        id,
        clubId,
        input.name,
        JSON.stringify(input.config),
        now.toISOString(),
        now.toISOString()
      );

      const rule = await this.getScoringRule(id);
      return { success: true, data: rule! };
    } catch (error) {
      console.error('Failed to create scoring rule:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to create scoring rule' };
    }
  }

  // ==================== Private Helpers ====================

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const suffix = uuidv4().slice(0, 8);
    return `${base}-${suffix}`;
  }

  private mapRowToCompetition(row: DbCompetition): Competition {
    return {
      id: row.id,
      clubId: row.club_id,
      name: row.name,
      type: row.type,
      format: row.format,
      status: row.status,
      scoreEntryMode: row.score_entry_mode,
      defaultScoringRuleId: row.default_scoring_rule_id,
      publicSlug: row.public_slug,
      startDate: row.start_date,
      endDate: row.end_date,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapRowToDivision(row: DbDivision): Division {
    return {
      id: row.id,
      competitionId: row.competition_id,
      name: row.name,
      format: row.format,
      scoringRuleId: row.scoring_rule_id,
      sortOrder: row.sort_order,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapRowToScoringRule(row: DbScoringRule): ScoringRule {
    return {
      id: row.id,
      clubId: row.club_id,
      name: row.name,
      config: JSON.parse(row.config) as ScoringRuleConfig,
      isPreset: row.is_preset === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
