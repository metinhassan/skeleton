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
  registration_open: boolean;
  registration_deadline: string | null;
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
    const slug = this.generateSlug(input.name);

    try {
      const result = await pool.query<DbCompetition>(
        `INSERT INTO competitions (
          id, club_id, name, type, format, status, score_entry_mode,
          default_scoring_rule_id, public_slug, start_date, end_date, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
          slug,
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
    const result = await pool.query<DbCompetition & { division_count: string; entry_count: string }>(
      `SELECT c.*,
              COALESCE(d.division_count, 0) as division_count,
              COALESCE(e.entry_count, 0) as entry_count
       FROM competitions c
       LEFT JOIN (
         SELECT competition_id, COUNT(*) as division_count
         FROM divisions
         GROUP BY competition_id
       ) d ON d.competition_id = c.id
       LEFT JOIN (
         SELECT d.competition_id, COUNT(e.id) as entry_count
         FROM divisions d
         JOIN entries e ON e.division_id = d.id
         GROUP BY d.competition_id
       ) e ON e.competition_id = c.id
       WHERE c.id = $1`,
      [competitionId]
    );
    return result.rows.length > 0 ? this.mapRowToCompetition(result.rows[0]) : null;
  }

  async getClubCompetitions(clubId: string, includeDrafts: boolean): Promise<Competition[]> {
    await this.ensureInitialized();
    const pool = getPool();
    let query = `
      SELECT c.*,
             COALESCE(d.division_count, 0) as division_count,
             COALESCE(e.entry_count, 0) as entry_count
      FROM competitions c
      LEFT JOIN (
        SELECT competition_id, COUNT(*) as division_count
        FROM divisions
        GROUP BY competition_id
      ) d ON d.competition_id = c.id
      LEFT JOIN (
        SELECT d.competition_id, COUNT(e.id) as entry_count
        FROM divisions d
        JOIN entries e ON e.division_id = d.id
        GROUP BY d.competition_id
      ) e ON e.competition_id = c.id
      WHERE c.club_id = $1
    `;

    if (!includeDrafts) {
      query += " AND c.status != 'draft'";
    }

    query += ' ORDER BY c.created_at DESC';

    const result = await pool.query<DbCompetition & { division_count: string; entry_count: string }>(query, [clubId]);
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
    if (input.registrationOpen !== undefined) {
      updates.push(`registration_open = $${paramIndex++}`);
      values.push(input.registrationOpen as any);
    }
    if (input.registrationDeadline !== undefined) {
      updates.push(`registration_deadline = $${paramIndex++}`);
      values.push(input.registrationDeadline);
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

    try {
      // Slug is already set at creation time, just update status
      const result = await pool.query<DbCompetition>(
        `UPDATE competitions SET status = 'published' WHERE id = $1 RETURNING *`,
        [competitionId]
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
    const result = await pool.query<DbCompetition & { division_count: string; entry_count: string }>(
      `SELECT c.*,
              COALESCE(d.division_count, 0) as division_count,
              COALESCE(e.entry_count, 0) as entry_count
       FROM competitions c
       LEFT JOIN (
         SELECT competition_id, COUNT(*) as division_count
         FROM divisions
         GROUP BY competition_id
       ) d ON d.competition_id = c.id
       LEFT JOIN (
         SELECT d.competition_id, COUNT(e.id) as entry_count
         FROM divisions d
         JOIN entries e ON e.division_id = d.id
         GROUP BY d.competition_id
       ) e ON e.competition_id = c.id
       WHERE c.public_slug = $1 AND c.status != 'draft'`,
      [slug]
    );
    return result.rows.length > 0 ? this.mapRowToCompetition(result.rows[0]) : null;
  }

  /**
   * Get competition by slug (for internal use - includes drafts)
   */
  async getCompetitionBySlug(slug: string, clubId: string): Promise<Competition | null> {
    await this.ensureInitialized();
    const pool = getPool();
    const result = await pool.query<DbCompetition & { division_count: string; entry_count: string }>(
      `SELECT c.*,
              COALESCE(d.division_count, 0) as division_count,
              COALESCE(e.entry_count, 0) as entry_count
       FROM competitions c
       LEFT JOIN (
         SELECT competition_id, COUNT(*) as division_count
         FROM divisions
         GROUP BY competition_id
       ) d ON d.competition_id = c.id
       LEFT JOIN (
         SELECT d.competition_id, COUNT(e.id) as entry_count
         FROM divisions d
         JOIN entries e ON e.division_id = d.id
         GROUP BY d.competition_id
       ) e ON e.competition_id = c.id
       WHERE c.public_slug = $1 AND c.club_id = $2`,
      [slug, clubId]
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
    const result = await pool.query<DbDivision & { entry_count: string; draw_status: string | null }>(
      `SELECT d.*,
              COALESCE(e.entry_count, 0) as entry_count,
              dr.status as draw_status
       FROM divisions d
       LEFT JOIN (
         SELECT division_id, COUNT(*) as entry_count
         FROM entries
         GROUP BY division_id
       ) e ON e.division_id = d.id
       LEFT JOIN LATERAL (
         SELECT status FROM draws WHERE division_id = d.id ORDER BY created_at DESC LIMIT 1
       ) dr ON true
       WHERE d.competition_id = $1
       ORDER BY d.sort_order, d.name`,
      [competitionId]
    );
    return result.rows.map((row) => this.mapRowToDivision(row));
  }

  async getDivision(divisionId: string): Promise<Division | null> {
    await this.ensureInitialized();
    const pool = getPool();
    const result = await pool.query<DbDivision & { entry_count: string; draw_status: string | null }>(
      `SELECT d.*,
              COALESCE(e.entry_count, 0) as entry_count,
              dr.status as draw_status
       FROM divisions d
       LEFT JOIN (
         SELECT division_id, COUNT(*) as entry_count
         FROM entries
         GROUP BY division_id
       ) e ON e.division_id = d.id
       LEFT JOIN LATERAL (
         SELECT status FROM draws WHERE division_id = d.id ORDER BY created_at DESC LIMIT 1
       ) dr ON true
       WHERE d.id = $1`,
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

  private mapRowToCompetition(row: DbCompetition & { division_count?: string; entry_count?: string }): Competition & { registrationMode: string; requiresApproval: boolean; slug: string | null } {
    // Map registration_open boolean to registrationMode string (default to organizer_only if not set)
    const registrationMode = row.registration_open === true ? 'self_registration' : 'organizer_only';

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
      slug: row.public_slug,
      startDate: row.start_date,
      endDate: row.end_date,
      createdBy: row.created_by,
      divisionCount: parseInt(row.division_count || '0', 10),
      entryCount: parseInt(row.entry_count || '0', 10),
      registrationMode,
      requiresApproval: false,
      registrationDeadline: row.registration_deadline || null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapRowToDivision(row: DbDivision & { entry_count?: string; draw_status?: string | null }): Division {
    // Map draw status from 'draft'/'active'/'completed' to frontend DrawStatus
    let drawStatus: 'not_generated' | 'generated' | 'in_progress' | 'completed' = 'not_generated';
    if (row.draw_status === 'draft') {
      drawStatus = 'generated';
    } else if (row.draw_status === 'active') {
      drawStatus = 'in_progress';
    } else if (row.draw_status === 'completed') {
      drawStatus = 'completed';
    }

    return {
      id: row.id,
      competitionId: row.competition_id,
      name: row.name,
      format: row.format,
      scoringRuleId: row.scoring_rule_id,
      sortOrder: row.sort_order,
      entryCount: parseInt(row.entry_count || '0', 10),
      drawStatus,
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
