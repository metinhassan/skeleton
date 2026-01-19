/**
 * PostgreSQL competition service implementation
 * For local development with Docker PostgreSQL
 */

import { v4 as uuidv4 } from 'uuid';
import { getPool, seedPostgresScoringPresets } from '../db/postgres.js';
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
  created_at: Date;
  updated_at: Date;
}

interface DbDivision {
  id: string;
  competition_id: string;
  name: string;
  format: CompetitionFormat | null;
  scoring_rule_id: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

interface DbScoringRule {
  id: string;
  club_id: string | null;
  name: string;
  config: ScoringRuleConfig;
  is_preset: boolean;
  created_at: Date;
  updated_at: Date;
}

export class PostgresCompetitionService implements CompetitionService {
  private initialized = false;

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await seedPostgresScoringPresets();
      this.initialized = true;
    }
  }

  // ==================== Competitions ====================

  async createCompetition(
    clubId: string,
    input: CreateCompetitionInput,
    createdBy: string
  ): Promise<CompetitionResult<Competition>> {
    await this.ensureInitialized();
    const pool = getPool();
    const id = uuidv4();

    try {
      const result = await pool.query<DbCompetition>(
        `INSERT INTO competitions (
          id, club_id, name, type, format, status, score_entry_mode,
          default_scoring_rule_id, start_date, end_date, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
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
        ]
      );

      return { success: true, data: this.mapRowToCompetition(result.rows[0]) };
    } catch (error) {
      console.error('Failed to create competition:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to create competition' };
    }
  }

  async getCompetition(competitionId: string): Promise<Competition | null> {
    await this.ensureInitialized();
    const pool = getPool();
    const result = await pool.query<DbCompetition>(
      'SELECT * FROM competitions WHERE id = $1',
      [competitionId]
    );
    return result.rows.length > 0 ? this.mapRowToCompetition(result.rows[0]) : null;
  }

  async getClubCompetitions(clubId: string, includeDrafts: boolean): Promise<Competition[]> {
    await this.ensureInitialized();
    const pool = getPool();
    let query = 'SELECT * FROM competitions WHERE club_id = $1';

    if (!includeDrafts) {
      query += " AND status != 'draft'";
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query<DbCompetition>(query, [clubId]);
    return result.rows.map((row) => this.mapRowToCompetition(row));
  }

  async updateCompetition(
    competitionId: string,
    input: UpdateCompetitionInput,
    _updatedBy: string
  ): Promise<CompetitionResult<Competition>> {
    await this.ensureInitialized();
    const existing = await this.getCompetition(competitionId);
    if (!existing) {
      return { success: false, error: 'competition_not_found', message: 'Competition not found' };
    }

    const pool = getPool();
    const updates: string[] = [];
    const values: (string | null)[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      values.push(input.type);
    }
    if (input.format !== undefined) {
      updates.push(`format = $${paramIndex++}`);
      values.push(input.format);
    }
    if (input.scoreEntryMode !== undefined) {
      updates.push(`score_entry_mode = $${paramIndex++}`);
      values.push(input.scoreEntryMode);
    }
    if (input.defaultScoringRuleId !== undefined) {
      updates.push(`default_scoring_rule_id = $${paramIndex++}`);
      values.push(input.defaultScoringRuleId);
    }
    if (input.startDate !== undefined) {
      updates.push(`start_date = $${paramIndex++}`);
      values.push(input.startDate);
    }
    if (input.endDate !== undefined) {
      updates.push(`end_date = $${paramIndex++}`);
      values.push(input.endDate);
    }

    if (updates.length === 0) {
      return { success: true, data: existing };
    }

    values.push(competitionId);

    try {
      const result = await pool.query<DbCompetition>(
        `UPDATE competitions SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );
      return { success: true, data: this.mapRowToCompetition(result.rows[0]) };
    } catch (error) {
      console.error('Failed to update competition:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to update competition' };
    }
  }

  async publishCompetition(
    competitionId: string,
    _publishedBy: string
  ): Promise<CompetitionResult<Competition>> {
    await this.ensureInitialized();
    const existing = await this.getCompetition(competitionId);
    if (!existing) {
      return { success: false, error: 'competition_not_found', message: 'Competition not found' };
    }

    if (existing.status !== 'draft') {
      return { success: false, error: 'already_published', message: 'Competition is already published' };
    }

    const pool = getPool();
    const slug = this.generateSlug(existing.name);

    try {
      const result = await pool.query<DbCompetition>(
        `UPDATE competitions SET status = 'published', public_slug = $1 WHERE id = $2 RETURNING *`,
        [slug, competitionId]
      );
      return { success: true, data: this.mapRowToCompetition(result.rows[0]) };
    } catch (error) {
      console.error('Failed to publish competition:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to publish competition' };
    }
  }

  async getPublicCompetition(slug: string): Promise<Competition | null> {
    await this.ensureInitialized();
    const pool = getPool();
    const result = await pool.query<DbCompetition>(
      "SELECT * FROM competitions WHERE public_slug = $1 AND status != 'draft'",
      [slug]
    );
    return result.rows.length > 0 ? this.mapRowToCompetition(result.rows[0]) : null;
  }

  // ==================== Divisions ====================

  async createDivision(
    competitionId: string,
    input: CreateDivisionInput
  ): Promise<CompetitionResult<Division>> {
    await this.ensureInitialized();
    const competition = await this.getCompetition(competitionId);
    if (!competition) {
      return { success: false, error: 'competition_not_found', message: 'Competition not found' };
    }

    const pool = getPool();
    const id = uuidv4();

    try {
      const result = await pool.query<DbDivision>(
        `INSERT INTO divisions (id, competition_id, name, format, scoring_rule_id, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          id,
          competitionId,
          input.name,
          input.format || null,
          input.scoringRuleId || null,
          input.sortOrder || 0,
        ]
      );
      return { success: true, data: this.mapRowToDivision(result.rows[0]) };
    } catch (error: any) {
      if (error.code === '23505') { // PostgreSQL unique violation
        return { success: false, error: 'duplicate_division_name', message: 'Division name already exists in this competition' };
      }
      console.error('Failed to create division:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to create division' };
    }
  }

  async getDivisions(competitionId: string): Promise<Division[]> {
    await this.ensureInitialized();
    const pool = getPool();
    const result = await pool.query<DbDivision>(
      'SELECT * FROM divisions WHERE competition_id = $1 ORDER BY sort_order, name',
      [competitionId]
    );
    return result.rows.map((row) => this.mapRowToDivision(row));
  }

  async getDivision(divisionId: string): Promise<Division | null> {
    await this.ensureInitialized();
    const pool = getPool();
    const result = await pool.query<DbDivision>(
      'SELECT * FROM divisions WHERE id = $1',
      [divisionId]
    );
    return result.rows.length > 0 ? this.mapRowToDivision(result.rows[0]) : null;
  }

  async updateDivision(
    divisionId: string,
    input: UpdateDivisionInput
  ): Promise<CompetitionResult<Division>> {
    await this.ensureInitialized();
    const existing = await this.getDivision(divisionId);
    if (!existing) {
      return { success: false, error: 'division_not_found', message: 'Division not found' };
    }

    const pool = getPool();
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.format !== undefined) {
      updates.push(`format = $${paramIndex++}`);
      values.push(input.format);
    }
    if (input.scoringRuleId !== undefined) {
      updates.push(`scoring_rule_id = $${paramIndex++}`);
      values.push(input.scoringRuleId);
    }
    if (input.sortOrder !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      values.push(input.sortOrder);
    }

    if (updates.length === 0) {
      return { success: true, data: existing };
    }

    values.push(divisionId);

    try {
      const result = await pool.query<DbDivision>(
        `UPDATE divisions SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );
      return { success: true, data: this.mapRowToDivision(result.rows[0]) };
    } catch (error: any) {
      if (error.code === '23505') { // PostgreSQL unique violation
        return { success: false, error: 'duplicate_division_name', message: 'Division name already exists in this competition' };
      }
      console.error('Failed to update division:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to update division' };
    }
  }

  async deleteDivision(divisionId: string): Promise<CompetitionResult<void>> {
    await this.ensureInitialized();
    const existing = await this.getDivision(divisionId);
    if (!existing) {
      return { success: false, error: 'division_not_found', message: 'Division not found' };
    }

    const pool = getPool();

    try {
      await pool.query('DELETE FROM divisions WHERE id = $1', [divisionId]);
      return { success: true, data: undefined };
    } catch (error) {
      console.error('Failed to delete division:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to delete division' };
    }
  }

  // ==================== Scoring Rules ====================

  async getScoringRules(clubId: string): Promise<ScoringRule[]> {
    await this.ensureInitialized();
    const pool = getPool();
    // Get presets (club_id IS NULL) and club-specific rules
    const result = await pool.query<DbScoringRule>(
      'SELECT * FROM scoring_rules WHERE club_id IS NULL OR club_id = $1 ORDER BY is_preset DESC, name',
      [clubId]
    );
    return result.rows.map((row) => this.mapRowToScoringRule(row));
  }

  async getScoringRule(ruleId: string): Promise<ScoringRule | null> {
    await this.ensureInitialized();
    const pool = getPool();
    const result = await pool.query<DbScoringRule>(
      'SELECT * FROM scoring_rules WHERE id = $1',
      [ruleId]
    );
    return result.rows.length > 0 ? this.mapRowToScoringRule(result.rows[0]) : null;
  }

  async createScoringRule(
    clubId: string,
    input: CreateScoringRuleInput
  ): Promise<CompetitionResult<ScoringRule>> {
    await this.ensureInitialized();
    const pool = getPool();
    const id = uuidv4();

    try {
      const result = await pool.query<DbScoringRule>(
        `INSERT INTO scoring_rules (id, club_id, name, config, is_preset)
         VALUES ($1, $2, $3, $4, false)
         RETURNING *`,
        [id, clubId, input.name, JSON.stringify(input.config)]
      );
      return { success: true, data: this.mapRowToScoringRule(result.rows[0]) };
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
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      isPreset: row.is_preset,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
