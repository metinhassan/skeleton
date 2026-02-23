/**
 * Local development server with HTTPS and cookie-based authentication
 * Uses authlib mock provider for local auth flow
 */

import express, { Request, Response, NextFunction } from 'express';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cookieParser from 'cookie-parser';

import { createMockProvider, type MockAuthConfig } from '../src/authlib/packages/auth-mock/dist/provider.js';
import { generateMockAccessToken } from '../src/authlib/packages/auth-mock/dist/tokens.js';
import { serializeCookie, getCookieValue, COOKIE_NAMES, createSessionCookie } from '../src/authlib/packages/auth-core/dist/cookies.js';
import { getUserService, getClubService, getCompetitionService, getPlayerService, getDrawService, getLiveScoreService, getLiveEventsService } from './services/index.js';
import type { ClubRole } from './services/club-service.js';
import type { CompetitionFormat, CompetitionType, ScoreEntryMode } from './services/competition-service.js';
import type { EntryType, SelfRegisterInput, CreatePartnerRequestInput } from './services/player-service.js';
import type { DrawType, RecordResultInput, UpdateMatchInput } from './services/draw-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// Configuration
const HTTPS_PORT = 3000;
const VITE_PORT = 5173;
const USE_HTTPS = process.env.USE_HTTPS !== 'false';

// Mock users for development (with passwords for form login)
const MOCK_USERS = [
  {
    sub: 'user-001',
    email: 'admin@example.com',
    password: 'admin123',
    email_verified: true,
    name: 'Admin User',
    groups: ['admins', 'users'],
  },
  {
    sub: 'user-002',
    email: 'demo@example.com',
    password: 'demo1234',
    email_verified: true,
    name: 'Demo User',
    groups: ['users'],
  },
];

// Users without passwords for authlib mock provider
const MOCK_USERS_FOR_PROVIDER = MOCK_USERS.map(({ password, ...user }) => user);

// Auth configuration for mock provider
const authConfig: MockAuthConfig = {
  clientId: 'local-dev-client',
  authDomain: 'localhost',
  apiDomain: `localhost:${HTTPS_PORT}`,
  appDomain: `localhost:${HTTPS_PORT}`,
  userPoolId: 'local-dev-pool',
  region: 'us-east-1',
  scopes: ['openid', 'email', 'profile'],
  sessionTtl: 3600,
  environment: 'development',
  mockUsers: MOCK_USERS_FOR_PROVIDER,
  defaultMockUser: MOCK_USERS_FOR_PROVIDER[0],
};

// Mock issuer for token generation
const MOCK_ISSUER = 'http://localhost:3000/mock-auth';

// Set required environment variables for mock provider
process.env.NODE_ENV = 'development';
process.env.AUTH_MODE = 'mock';

const authProvider = createMockProvider(authConfig);

const app = express();
app.use(cookieParser());
app.use(express.json());

// Extend Express Request to include authenticated user
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    roles: string[];
  };
}

// Extend to include club context
interface ClubRequest extends AuthenticatedRequest {
  clubId?: string;
  membership?: {
    role: ClubRole;
  };
}

/**
 * Transform backend Match to frontend Match format
 */
function transformMatchForFrontend(match: any): any {
  // Calculate scores from SetScore array
  let entry1Score: number | null = null;
  let entry2Score: number | null = null;

  if (match.score && Array.isArray(match.score)) {
    entry1Score = 0;
    entry2Score = 0;
    for (const set of match.score) {
      // SetScore is [entry1Games, entry2Games] or [entry1Games, entry2Games, [tb1, tb2]]
      entry1Score += set[0];
      entry2Score += set[1];
    }
  }

  // Map backend statuses to frontend equivalents
  let status = match.status;
  if (status === 'pending' || status === 'scheduled') {
    status = 'not_started';
  } else if (status === 'retired') {
    status = 'walkover';
  }

  return {
    id: match.id,
    drawId: match.drawId,
    roundNumber: match.roundNumber,
    matchNumber: match.matchNumber,
    bracket: match.bracket || 'winners',
    entry1Id: match.entry1Id,
    entry2Id: match.entry2Id,
    winnerId: match.winnerEntryId || null,
    entry1Score,
    entry2Score,
    score: match.score || null,
    status,
    scheduledTime: match.scheduledTime,
    court: match.court,
    nextMatchId: null, // Not directly mapped
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
    // Populated fields
    entry1Name: match.entry1Name,
    entry2Name: match.entry2Name,
    winnerName: match.winnerName,
  };
}

/**
 * Transform backend Standing to frontend Standing format
 */
function transformStandingForFrontend(standing: any): any {
  return {
    entryId: standing.entryId,
    entryName: standing.entryName || 'Unknown',
    position: standing.position || 0,
    played: standing.wins + standing.losses,
    won: standing.wins,
    lost: standing.losses,
    pointsFor: standing.gamesWon,
    pointsAgainst: standing.gamesLost,
    pointsDiff: standing.gamesWon - standing.gamesLost,
  };
}

/**
 * Transform backend Draw to frontend Draw format
 */
function transformDrawForFrontend(draw: any): any {
  return {
    id: draw.id,
    divisionId: draw.divisionId,
    drawType: draw.drawType,
    status: draw.status,
    bracketSize: draw.config?.bracketSize || null,
    totalRounds: draw.config?.bracketSize ? Math.log2(draw.config.bracketSize) : null,
    byeCount: null,
    createdAt: draw.createdAt,
    updatedAt: draw.updatedAt,
    matches: draw.matches ? draw.matches.map(transformMatchForFrontend) : [],
  };
}

/**
 * Middleware: Require authentication
 * Adds user info to req.user if authenticated
 */
async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionCookie = getCookieValue(req.cookies, COOKIE_NAMES.SESSION, authConfig.environment);

    if (!sessionCookie) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const context = await authProvider.verify(sessionCookie);
    req.user = {
      id: context.sub,
      email: context.email || '',
      name: (context.claims.name as string) || '',
      roles: context.roles || [],
    };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

/**
 * Middleware: Require club membership
 * Must be used after requireAuth
 * Expects :clubId in route params
 */
async function requireClubMember(req: ClubRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const clubId = req.params.clubId;
    if (!clubId) {
      res.status(400).json({ error: 'Club ID required' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const clubService = getClubService();
    const membership = await clubService.getMembership(clubId, req.user.id);

    if (!membership || membership.status !== 'active') {
      res.status(403).json({ error: 'Not a member of this club' });
      return;
    }

    req.clubId = clubId;
    req.membership = { role: membership.role };
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify club membership' });
  }
}

/**
 * Middleware: Require club admin
 * Must be used after requireAuth
 * Expects :clubId in route params
 */
async function requireClubAdmin(req: ClubRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const clubId = req.params.clubId;
    if (!clubId) {
      res.status(400).json({ error: 'Club ID required' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const clubService = getClubService();
    const isAdmin = await clubService.isClubAdmin(clubId, req.user.id);

    if (!isAdmin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    req.clubId = clubId;
    req.membership = { role: 'admin' };
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify admin access' });
  }
}

/**
 * Middleware: Require club organiser (or admin)
 * Must be used after requireAuth
 * Expects :clubId in route params
 */
async function requireClubOrganiser(req: ClubRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const clubId = req.params.clubId;
    if (!clubId) {
      res.status(400).json({ error: 'Club ID required' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const clubService = getClubService();
    const membership = await clubService.getMembership(clubId, req.user.id);

    if (!membership || membership.status !== 'active') {
      res.status(403).json({ error: 'Not a member of this club' });
      return;
    }

    // Allow admin or organiser
    if (membership.role !== 'admin' && membership.role !== 'organiser') {
      res.status(403).json({ error: 'Organiser access required' });
      return;
    }

    req.clubId = clubId;
    req.membership = { role: membership.role };
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify organiser access' });
  }
}

// Extend to include competition context
interface CompetitionRequest extends ClubRequest {
  competitionId?: string;
}

/**
 * Middleware: Check competition access (member of club that owns the competition)
 * Must be used after requireAuth
 * Expects :competitionId in route params
 */
async function requireCompetitionAccess(req: CompetitionRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const competitionId = req.params.competitionId;
    if (!competitionId) {
      res.status(400).json({ error: 'Competition ID required' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const competitionService = getCompetitionService();
    const competition = await competitionService.getCompetition(competitionId);

    if (!competition) {
      res.status(404).json({ error: 'Competition not found' });
      return;
    }

    const clubService = getClubService();
    const membership = await clubService.getMembership(competition.clubId, req.user.id);

    // For published competitions, allow public access (handled separately)
    // For draft competitions, require club membership
    if (competition.status === 'draft' && (!membership || membership.status !== 'active')) {
      res.status(403).json({ error: 'Not authorized to view this competition' });
      return;
    }

    req.competitionId = competitionId;
    req.clubId = competition.clubId;
    if (membership) {
      req.membership = { role: membership.role };
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify competition access' });
  }
}

/**
 * Middleware: Require competition organiser access
 * Must be used after requireAuth
 * Expects :competitionId in route params
 */
async function requireCompetitionOrganiser(req: CompetitionRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const competitionId = req.params.competitionId;
    if (!competitionId) {
      res.status(400).json({ error: 'Competition ID required' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const competitionService = getCompetitionService();
    const competition = await competitionService.getCompetition(competitionId);

    if (!competition) {
      res.status(404).json({ error: 'Competition not found' });
      return;
    }

    const clubService = getClubService();
    const membership = await clubService.getMembership(competition.clubId, req.user.id);

    if (!membership || membership.status !== 'active') {
      res.status(403).json({ error: 'Not a member of this club' });
      return;
    }

    if (membership.role !== 'admin' && membership.role !== 'organiser') {
      res.status(403).json({ error: 'Organiser access required' });
      return;
    }

    req.competitionId = competitionId;
    req.clubId = competition.clubId;
    req.membership = { role: membership.role };
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify organiser access' });
  }
}

/**
 * Helper to set cookies from authlib Cookie objects
 */
function setCookies(res: Response, cookies: Array<{ name: string; value: string; options: any }>) {
  for (const cookie of cookies) {
    res.setHeader('Set-Cookie', serializeCookie(cookie));
  }
}

/**
 * POST /auth/login - Authenticate with username/password
 */
app.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const userService = getUserService();
    const user = await userService.verifyCredentials(email, password);

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Generate access token
    const accessToken = await generateMockAccessToken(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        groups: user.groups,
      },
      {
        issuer: MOCK_ISSUER,
        expiresIn: authConfig.sessionTtl,
      }
    );

    // Create session cookie
    const sessionCookie = createSessionCookie(
      accessToken,
      authConfig.environment,
      authConfig.sessionTtl
    );

    res.append('Set-Cookie', serializeCookie(sessionCookie));

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.groups,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /auth/register - Register a new user
 */
app.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: 'Email, password, and name are required' });
      return;
    }

    const userService = getUserService();
    const result = await userService.register({ email, password, name });

    if (!result.success) {
      const statusCode = result.error === 'email_exists' ? 409 : 400;
      res.status(statusCode).json({ error: result.message, code: result.error });
      return;
    }

    // Auto-login after registration
    const user = result.data;
    const accessToken = await generateMockAccessToken(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        groups: user.groups,
      },
      {
        issuer: MOCK_ISSUER,
        expiresIn: authConfig.sessionTtl,
      }
    );

    const sessionCookie = createSessionCookie(
      accessToken,
      authConfig.environment,
      authConfig.sessionTtl
    );

    res.append('Set-Cookie', serializeCookie(sessionCookie));

    res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.groups,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * GET /auth/profile - Get current user's full profile
 */
app.get('/auth/profile', async (req: Request, res: Response) => {
  try {
    const sessionCookie = getCookieValue(req.cookies, COOKIE_NAMES.SESSION, authConfig.environment);

    if (!sessionCookie) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const context = await authProvider.verify(sessionCookie);
    const userService = getUserService();
    const user = await userService.findById(context.sub);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.groups,
      createdAt: user.createdAt,
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid session' });
  }
});

/**
 * PUT /auth/profile - Update current user's profile
 */
app.put('/auth/profile', async (req: Request, res: Response) => {
  try {
    const sessionCookie = getCookieValue(req.cookies, COOKIE_NAMES.SESSION, authConfig.environment);

    if (!sessionCookie) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const context = await authProvider.verify(sessionCookie);
    const { name, email } = req.body;

    const userService = getUserService();
    const result = await userService.updateProfile(context.sub, { name, email });

    if (!result.success) {
      const statusCode = result.error === 'email_exists' ? 409 : 400;
      res.status(statusCode).json({ error: result.message, code: result.error });
      return;
    }

    res.json({
      success: true,
      user: {
        id: result.data.id,
        email: result.data.email,
        name: result.data.name,
        roles: result.data.groups,
      },
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(401).json({ error: 'Invalid session' });
  }
});

/**
 * POST /auth/change-password - Change user's password
 */
app.post('/auth/change-password', async (req: Request, res: Response) => {
  try {
    const sessionCookie = getCookieValue(req.cookies, COOKIE_NAMES.SESSION, authConfig.environment);

    if (!sessionCookie) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const context = await authProvider.verify(sessionCookie);
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      res.status(400).json({ error: 'Old password and new password are required' });
      return;
    }

    const userService = getUserService();
    const result = await userService.changePassword(context.sub, { oldPassword, newPassword });

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(401).json({ error: 'Invalid session' });
  }
});

/**
 * GET /auth/login - Initiate OAuth login flow (redirect-based)
 */
app.get('/auth/login', async (req: Request, res: Response) => {
  try {
    const returnTo = (req.query.returnTo as string) || '/';
    const result = await authProvider.loginRedirect(returnTo);

    // Set OAuth state cookies
    for (const cookie of result.cookies) {
      res.append('Set-Cookie', serializeCookie(cookie));
    }

    // Redirect to callback (mock mode auto-completes the flow)
    res.redirect(result.url);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * GET /auth/callback - Handle OAuth callback
 */
app.get('/auth/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query as { code: string; state: string };

    if (!code || !state) {
      res.redirect('/auth/error?reason=missing_params');
      return;
    }

    const result = await authProvider.exchangeCode({
      code,
      state,
      cookies: req.cookies,
    });

    if (!result.success) {
      res.redirect(`/auth/error?reason=${result.error}`);
      return;
    }

    // Set session cookie and cleanup OAuth cookies
    for (const cookie of result.cookies) {
      res.append('Set-Cookie', serializeCookie(cookie));
    }

    // Redirect to return URL
    res.redirect(result.returnTo);
  } catch (error) {
    console.error('Callback error:', error);
    res.redirect('/auth/error?reason=exchange_failed');
  }
});

/**
 * POST /auth/logout - Clear session
 */
app.post('/auth/logout', async (_req: Request, res: Response) => {
  try {
    const result = await authProvider.logout();

    for (const cookie of result.cookies) {
      res.append('Set-Cookie', serializeCookie(cookie));
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * GET /auth/me - Get current user info
 */
app.get('/auth/me', async (req: Request, res: Response) => {
  try {
    const sessionCookie = getCookieValue(req.cookies, COOKIE_NAMES.SESSION, authConfig.environment);

    if (!sessionCookie) {
      res.status(401).json({ authenticated: false });
      return;
    }

    const context = await authProvider.verify(sessionCookie);

    // Fetch fresh user data from database (not from token claims)
    const userService = getUserService();
    const user = await userService.findById(context.sub);

    if (!user) {
      res.status(401).json({ authenticated: false });
      return;
    }

    res.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        roles: user.groups,
        name: user.name,
      },
    });
  } catch (error) {
    // Token invalid or expired
    res.status(401).json({ authenticated: false });
  }
});

/**
 * GET /auth/error - Display auth errors
 */
app.get('/auth/error', (req: Request, res: Response) => {
  const reason = req.query.reason || 'unknown';
  res.status(400).send(`
    <!DOCTYPE html>
    <html>
      <head><title>Authentication Error</title></head>
      <body>
        <h1>Authentication Error</h1>
        <p>Error: ${reason}</p>
        <a href="/">Return to home</a>
      </body>
    </html>
  `);
});

// ==================== Club API Endpoints ====================

/**
 * POST /api/clubs - Create a new club
 */
app.post('/api/clubs', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, region, logoUrl, primaryColor } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Club name is required' });
      return;
    }

    const clubService = getClubService();
    const result = await clubService.createClub(
      { name, region, logoUrl, primaryColor },
      req.user!.id
    );

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.status(201).json({ success: true, club: result.data });
  } catch (error) {
    console.error('Create club error:', error);
    res.status(500).json({ error: 'Failed to create club' });
  }
});

/**
 * GET /api/clubs - List user's clubs
 */
app.get('/api/clubs', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clubService = getClubService();
    const memberships = await clubService.getUserClubs(req.user!.id);

    // Fetch club details for each membership
    const clubs = await Promise.all(
      memberships.map(async (m) => {
        const club = await clubService.getClub(m.clubId);
        return {
          ...club,
          role: m.role,
          membershipId: m.id,
        };
      })
    );

    res.json({ clubs });
  } catch (error) {
    console.error('List clubs error:', error);
    res.status(500).json({ error: 'Failed to list clubs' });
  }
});

/**
 * GET /api/clubs/:clubId - Get club details
 */
app.get('/api/clubs/:clubId', requireAuth as any, requireClubMember as any, async (req: ClubRequest, res: Response) => {
  try {
    const clubService = getClubService();
    const club = await clubService.getClub(req.clubId!);

    if (!club) {
      res.status(404).json({ error: 'Club not found' });
      return;
    }

    res.json({ club, role: req.membership!.role });
  } catch (error) {
    console.error('Get club error:', error);
    res.status(500).json({ error: 'Failed to get club' });
  }
});

// ==================== Invite API Endpoints ====================

/**
 * POST /api/clubs/:clubId/invites - Create an invite
 */
app.post('/api/clubs/:clubId/invites', requireAuth as any, requireClubAdmin as any, async (req: ClubRequest, res: Response) => {
  try {
    const { email, role } = req.body;

    if (!email || !role) {
      res.status(400).json({ error: 'Email and role are required' });
      return;
    }

    const validRoles: ClubRole[] = ['admin', 'organiser', 'supervisor', 'player'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    const clubService = getClubService();
    const result = await clubService.createInvite(req.clubId!, { email, role }, req.user!.id);

    if (!result.success) {
      const statusCode = result.error === 'already_member' || result.error === 'already_invited' ? 409 : 400;
      res.status(statusCode).json({ error: result.message, code: result.error });
      return;
    }

    res.status(201).json({ success: true, invite: result.data });
  } catch (error) {
    console.error('Create invite error:', error);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

/**
 * GET /api/invites - Get pending invites for current user
 */
app.get('/api/invites', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clubService = getClubService();
    const invites = await clubService.getInvitesForEmail(req.user!.email);

    res.json({ invites });
  } catch (error) {
    console.error('Get invites error:', error);
    res.status(500).json({ error: 'Failed to get invites' });
  }
});

/**
 * POST /api/invites/:inviteId/accept - Accept an invite
 */
app.post('/api/invites/:inviteId/accept', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { inviteId } = req.params;
    const clubService = getClubService();

    // Verify the invite belongs to this user
    const invite = await clubService.getInviteById(inviteId);
    if (!invite) {
      res.status(404).json({ error: 'Invite not found' });
      return;
    }

    // Look up user's email from database (token email may be empty)
    const userService = getUserService();
    const user = await userService.findById(req.user!.id);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      res.status(403).json({ error: 'This invite is not for you' });
      return;
    }

    const result = await clubService.acceptInvite(inviteId, req.user!.id);

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true, membership: result.data });
  } catch (error) {
    console.error('Accept invite error:', error);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

/**
 * POST /api/invites/:inviteId/decline - Decline an invite
 */
app.post('/api/invites/:inviteId/decline', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { inviteId } = req.params;
    const clubService = getClubService();

    // Verify the invite belongs to this user
    const invite = await clubService.getInviteById(inviteId);
    if (!invite) {
      res.status(404).json({ error: 'Invite not found' });
      return;
    }

    if (invite.email.toLowerCase() !== req.user!.email.toLowerCase()) {
      res.status(403).json({ error: 'This invite is not for you' });
      return;
    }

    const result = await clubService.declineInvite(inviteId);

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Decline invite error:', error);
    res.status(500).json({ error: 'Failed to decline invite' });
  }
});

// ==================== Member Management Endpoints ====================

/**
 * GET /api/clubs/:clubId/members - List club members
 */
app.get('/api/clubs/:clubId/members', requireAuth as any, requireClubMember as any, async (req: ClubRequest, res: Response) => {
  try {
    const clubService = getClubService();
    const members = await clubService.getMembers(req.clubId!);

    res.json({ members });
  } catch (error) {
    console.error('List members error:', error);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

/**
 * PUT /api/clubs/:clubId/members/:userId - Update member role
 */
app.put('/api/clubs/:clubId/members/:userId', requireAuth as any, requireClubAdmin as any, async (req: ClubRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role) {
      res.status(400).json({ error: 'Role is required' });
      return;
    }

    const validRoles: ClubRole[] = ['admin', 'organiser', 'supervisor', 'player'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    const clubService = getClubService();
    const result = await clubService.updateMemberRole(req.clubId!, userId, role, req.user!.id);

    if (!result.success) {
      const statusCode = result.error === 'cannot_remove_last_admin' ? 409 : 400;
      res.status(statusCode).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true, member: result.data });
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

/**
 * DELETE /api/clubs/:clubId/members/:userId - Deactivate member
 */
app.delete('/api/clubs/:clubId/members/:userId', requireAuth as any, requireClubAdmin as any, async (req: ClubRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const clubService = getClubService();
    const result = await clubService.deactivateMember(req.clubId!, userId, req.user!.id);

    if (!result.success) {
      const statusCode = result.error === 'cannot_remove_last_admin' ? 409 : 400;
      res.status(statusCode).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Deactivate member error:', error);
    res.status(500).json({ error: 'Failed to deactivate member' });
  }
});

/**
 * GET /api/clubs/:clubId/audit-log - Get club audit log (admin only)
 */
app.get('/api/clubs/:clubId/audit-log', requireAuth as any, requireClubAdmin as any, async (req: ClubRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const clubService = getClubService();
    const entries = await clubService.getAuditLog(req.clubId!, limit);

    res.json({ entries });
  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

// ==================== Competition API Endpoints ====================

/**
 * POST /api/clubs/:clubId/competitions - Create competition
 */
app.post('/api/clubs/:clubId/competitions', requireAuth as any, requireClubOrganiser as any, async (req: ClubRequest, res: Response) => {
  try {
    const { name, type, format, scoreEntryMode, defaultScoringRuleId, startDate, endDate } = req.body;

    if (!name || !type || !format) {
      res.status(400).json({ error: 'Name, type, and format are required' });
      return;
    }

    const validTypes: CompetitionType[] = ['tournament', 'league'];
    if (!validTypes.includes(type)) {
      res.status(400).json({ error: 'Invalid competition type' });
      return;
    }

    const validFormats: CompetitionFormat[] = ['knockout', 'round_robin', 'swiss', 'ladder'];
    if (!validFormats.includes(format)) {
      res.status(400).json({ error: 'Invalid competition format' });
      return;
    }

    const competitionService = getCompetitionService();
    const result = await competitionService.createCompetition(
      req.clubId!,
      { name, type, format, scoreEntryMode, defaultScoringRuleId, startDate, endDate },
      req.user!.id
    );

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.status(201).json({ success: true, competition: result.data });
  } catch (error) {
    console.error('Create competition error:', error);
    res.status(500).json({ error: 'Failed to create competition' });
  }
});

/**
 * GET /api/clubs/:clubId/competitions - List club competitions
 */
app.get('/api/clubs/:clubId/competitions', requireAuth as any, requireClubMember as any, async (req: ClubRequest, res: Response) => {
  try {
    const competitionService = getCompetitionService();
    // Members can see drafts, public cannot
    const competitions = await competitionService.getClubCompetitions(req.clubId!, true);

    res.json({ competitions });
  } catch (error) {
    console.error('List competitions error:', error);
    res.status(500).json({ error: 'Failed to list competitions' });
  }
});

/**
 * GET /api/competitions/:competitionId - Get competition details by ID
 */
app.get('/api/competitions/:competitionId', requireAuth as any, requireCompetitionAccess as any, async (req: CompetitionRequest, res: Response) => {
  try {
    const competitionService = getCompetitionService();
    const competition = await competitionService.getCompetition(req.competitionId!);

    if (!competition) {
      res.status(404).json({ error: 'Competition not found' });
      return;
    }

    res.json({ competition, role: req.membership?.role });
  } catch (error) {
    console.error('Get competition error:', error);
    res.status(500).json({ error: 'Failed to get competition' });
  }
});

/**
 * GET /api/clubs/:clubId/competitions/by-slug/:slug - Get competition details by slug
 */
app.get('/api/clubs/:clubId/competitions/by-slug/:slug', requireAuth as any, requireClubMember as any, async (req: ClubRequest, res: Response) => {
  try {
    const { clubId, slug } = req.params;
    const competitionService = getCompetitionService();
    const competition = await competitionService.getCompetitionBySlug(slug, clubId);

    if (!competition) {
      res.status(404).json({ error: 'Competition not found' });
      return;
    }

    res.json({ competition, role: req.membership?.role });
  } catch (error) {
    console.error('Get competition by slug error:', error);
    res.status(500).json({ error: 'Failed to get competition' });
  }
});

/**
 * PUT /api/competitions/:competitionId - Update competition
 */
app.put('/api/competitions/:competitionId', requireAuth as any, requireCompetitionOrganiser as any, async (req: CompetitionRequest, res: Response) => {
  try {
    const { name, type, format, scoreEntryMode, defaultScoringRuleId, startDate, endDate, registrationMode, registrationDeadline } = req.body;

    // Map frontend registrationMode to DB registration_open boolean
    let registrationOpen: boolean | undefined;
    if (registrationMode !== undefined) {
      registrationOpen = registrationMode !== 'organizer_only';
    }

    const competitionService = getCompetitionService();
    const result = await competitionService.updateCompetition(
      req.competitionId!,
      { name, type, format, scoreEntryMode, defaultScoringRuleId, startDate, endDate, registrationOpen, registrationDeadline: registrationDeadline || null },
      req.user!.id
    );

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true, competition: result.data });
  } catch (error) {
    console.error('Update competition error:', error);
    res.status(500).json({ error: 'Failed to update competition' });
  }
});

/**
 * POST /api/competitions/:competitionId/publish - Publish competition
 */
app.post('/api/competitions/:competitionId/publish', requireAuth as any, requireCompetitionOrganiser as any, async (req: CompetitionRequest, res: Response) => {
  try {
    const competitionService = getCompetitionService();
    const result = await competitionService.publishCompetition(req.competitionId!, req.user!.id);

    if (!result.success) {
      const statusCode = result.error === 'already_published' ? 409 : 400;
      res.status(statusCode).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true, competition: result.data });
  } catch (error) {
    console.error('Publish competition error:', error);
    res.status(500).json({ error: 'Failed to publish competition' });
  }
});

// ==================== Division API Endpoints ====================

/**
 * POST /api/competitions/:competitionId/divisions - Create division
 */
app.post('/api/competitions/:competitionId/divisions', requireAuth as any, requireCompetitionOrganiser as any, async (req: CompetitionRequest, res: Response) => {
  try {
    const { name, format, scoringRuleId, sortOrder } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Division name is required' });
      return;
    }

    const competitionService = getCompetitionService();
    const result = await competitionService.createDivision(req.competitionId!, { name, format, scoringRuleId, sortOrder });

    if (!result.success) {
      const statusCode = result.error === 'duplicate_division_name' ? 409 : 400;
      res.status(statusCode).json({ error: result.message, code: result.error });
      return;
    }

    res.status(201).json({ success: true, division: result.data });
  } catch (error) {
    console.error('Create division error:', error);
    res.status(500).json({ error: 'Failed to create division' });
  }
});

/**
 * GET /api/competitions/:competitionId/divisions - List divisions
 */
app.get('/api/competitions/:competitionId/divisions', requireAuth as any, requireCompetitionAccess as any, async (req: CompetitionRequest, res: Response) => {
  try {
    const competitionService = getCompetitionService();
    const divisions = await competitionService.getDivisions(req.competitionId!);

    res.json({ divisions });
  } catch (error) {
    console.error('List divisions error:', error);
    res.status(500).json({ error: 'Failed to list divisions' });
  }
});

/**
 * PUT /api/competitions/:competitionId/divisions/:divisionId - Update division
 */
app.put('/api/competitions/:competitionId/divisions/:divisionId', requireAuth as any, requireCompetitionOrganiser as any, async (req: CompetitionRequest, res: Response) => {
  try {
    const { divisionId } = req.params;
    const { name, format, scoringRuleId, sortOrder } = req.body;

    const competitionService = getCompetitionService();
    const result = await competitionService.updateDivision(divisionId, { name, format, scoringRuleId, sortOrder });

    if (!result.success) {
      const statusCode = result.error === 'duplicate_division_name' ? 409 : 400;
      res.status(statusCode).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true, division: result.data });
  } catch (error) {
    console.error('Update division error:', error);
    res.status(500).json({ error: 'Failed to update division' });
  }
});

/**
 * DELETE /api/competitions/:competitionId/divisions/:divisionId - Delete division
 */
app.delete('/api/competitions/:competitionId/divisions/:divisionId', requireAuth as any, requireCompetitionOrganiser as any, async (req: CompetitionRequest, res: Response) => {
  try {
    const { divisionId } = req.params;

    const competitionService = getCompetitionService();
    const result = await competitionService.deleteDivision(divisionId);

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete division error:', error);
    res.status(500).json({ error: 'Failed to delete division' });
  }
});

// ==================== Scoring Rules API Endpoints ====================

/**
 * GET /api/clubs/:clubId/scoring-rules - List scoring rules (presets + club custom)
 */
app.get('/api/clubs/:clubId/scoring-rules', requireAuth as any, requireClubMember as any, async (req: ClubRequest, res: Response) => {
  try {
    const competitionService = getCompetitionService();
    const rules = await competitionService.getScoringRules(req.clubId!);

    res.json({ rules });
  } catch (error) {
    console.error('List scoring rules error:', error);
    res.status(500).json({ error: 'Failed to list scoring rules' });
  }
});

/**
 * POST /api/clubs/:clubId/scoring-rules - Create custom scoring rule
 */
app.post('/api/clubs/:clubId/scoring-rules', requireAuth as any, requireClubOrganiser as any, async (req: ClubRequest, res: Response) => {
  try {
    const { name, config } = req.body;

    if (!name || !config) {
      res.status(400).json({ error: 'Name and config are required' });
      return;
    }

    const competitionService = getCompetitionService();
    const result = await competitionService.createScoringRule(req.clubId!, { name, config });

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.status(201).json({ success: true, rule: result.data });
  } catch (error) {
    console.error('Create scoring rule error:', error);
    res.status(500).json({ error: 'Failed to create scoring rule' });
  }
});

// ==================== Player API Endpoints ====================

// Extend to include division context
interface DivisionRequest extends ClubRequest {
  divisionId?: string;
}

/**
 * Middleware: Require division organiser access
 * Must be used after requireAuth
 * Expects :divisionId in route params
 */
async function requireDivisionOrganiser(req: DivisionRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const divisionId = req.params.divisionId;
    if (!divisionId) {
      res.status(400).json({ error: 'Division ID required' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Get division to find competition
    const competitionService = getCompetitionService();
    const division = await competitionService.getDivision(divisionId);

    if (!division) {
      res.status(404).json({ error: 'Division not found' });
      return;
    }

    // Get competition to find club
    const competition = await competitionService.getCompetition(division.competitionId);
    if (!competition) {
      res.status(404).json({ error: 'Competition not found' });
      return;
    }

    // Check club organiser access
    const clubService = getClubService();
    const membership = await clubService.getMembership(competition.clubId, req.user.id);

    if (!membership || membership.status !== 'active') {
      res.status(403).json({ error: 'Not a member of this club' });
      return;
    }

    if (membership.role !== 'admin' && membership.role !== 'organiser') {
      res.status(403).json({ error: 'Organiser access required' });
      return;
    }

    req.divisionId = divisionId;
    req.clubId = competition.clubId;
    req.membership = { role: membership.role };
    next();
  } catch (error) {
    console.error('Division access check error:', error);
    res.status(500).json({ error: 'Failed to verify division access' });
  }
}

/**
 * Middleware: Require division member access
 * Must be used after requireAuth
 * Expects :divisionId in route params
 */
async function requireDivisionAccess(req: DivisionRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const divisionId = req.params.divisionId;
    if (!divisionId) {
      res.status(400).json({ error: 'Division ID required' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Get division to find competition
    const competitionService = getCompetitionService();
    const division = await competitionService.getDivision(divisionId);

    if (!division) {
      res.status(404).json({ error: 'Division not found' });
      return;
    }

    // Get competition to find club
    const competition = await competitionService.getCompetition(division.competitionId);
    if (!competition) {
      res.status(404).json({ error: 'Competition not found' });
      return;
    }

    // Check club member access
    const clubService = getClubService();
    const membership = await clubService.getMembership(competition.clubId, req.user.id);

    if (!membership || membership.status !== 'active') {
      res.status(403).json({ error: 'Not a member of this club' });
      return;
    }

    req.divisionId = divisionId;
    req.clubId = competition.clubId;
    req.membership = { role: membership.role };
    next();
  } catch (error) {
    console.error('Division access check error:', error);
    res.status(500).json({ error: 'Failed to verify division access' });
  }
}

/**
 * POST /api/clubs/:clubId/players - Create player
 */
app.post('/api/clubs/:clubId/players', requireAuth as any, requireClubOrganiser as any, async (req: ClubRequest, res: Response) => {
  try {
    const { name, email, phone } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const playerService = getPlayerService();
    const result = await playerService.createPlayer(req.clubId!, { name, email, phone });

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.status(201).json({ success: true, player: result.data });
  } catch (error) {
    console.error('Create player error:', error);
    res.status(500).json({ error: 'Failed to create player' });
  }
});

/**
 * GET /api/clubs/:clubId/players - List players
 */
app.get('/api/clubs/:clubId/players', requireAuth as any, requireClubMember as any, async (req: ClubRequest, res: Response) => {
  try {
    const search = req.query.search as string | undefined;

    const playerService = getPlayerService();
    const players = await playerService.getClubPlayers(req.clubId!, search);

    res.json({ players });
  } catch (error) {
    console.error('List players error:', error);
    res.status(500).json({ error: 'Failed to list players' });
  }
});

/**
 * GET /api/clubs/:clubId/players/duplicates - Find duplicate players
 */
app.get('/api/clubs/:clubId/players/duplicates', requireAuth as any, requireClubOrganiser as any, async (req: ClubRequest, res: Response) => {
  try {
    const { name, email } = req.query;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const playerService = getPlayerService();
    const duplicates = await playerService.findDuplicates(req.clubId!, name as string, email as string | undefined);

    res.json({ duplicates });
  } catch (error) {
    console.error('Find duplicates error:', error);
    res.status(500).json({ error: 'Failed to find duplicates' });
  }
});

/**
 * GET /api/clubs/:clubId/players/:playerId - Get player
 */
app.get('/api/clubs/:clubId/players/:playerId', requireAuth as any, requireClubMember as any, async (req: ClubRequest, res: Response) => {
  try {
    const { playerId } = req.params;

    const playerService = getPlayerService();
    const player = await playerService.getPlayer(playerId);

    if (!player || player.clubId !== req.clubId) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    res.json({ player });
  } catch (error) {
    console.error('Get player error:', error);
    res.status(500).json({ error: 'Failed to get player' });
  }
});

/**
 * PUT /api/clubs/:clubId/players/:playerId - Update player
 */
app.put('/api/clubs/:clubId/players/:playerId', requireAuth as any, requireClubOrganiser as any, async (req: ClubRequest, res: Response) => {
  try {
    const { playerId } = req.params;
    const { name, email, phone } = req.body;

    const playerService = getPlayerService();

    // Verify player belongs to club
    const existing = await playerService.getPlayer(playerId);
    if (!existing || existing.clubId !== req.clubId) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const result = await playerService.updatePlayer(playerId, { name, email, phone });

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true, player: result.data });
  } catch (error) {
    console.error('Update player error:', error);
    res.status(500).json({ error: 'Failed to update player' });
  }
});

/**
 * DELETE /api/clubs/:clubId/players/:playerId - Delete player
 */
app.delete('/api/clubs/:clubId/players/:playerId', requireAuth as any, requireClubOrganiser as any, async (req: ClubRequest, res: Response) => {
  try {
    const { playerId } = req.params;

    const playerService = getPlayerService();

    // Verify player belongs to club
    const existing = await playerService.getPlayer(playerId);
    if (!existing || existing.clubId !== req.clubId) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const result = await playerService.deletePlayer(playerId);

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete player error:', error);
    res.status(500).json({ error: 'Failed to delete player' });
  }
});

// ==================== Team API Endpoints ====================

/**
 * POST /api/clubs/:clubId/teams - Create team
 */
app.post('/api/clubs/:clubId/teams', requireAuth as any, requireClubOrganiser as any, async (req: ClubRequest, res: Response) => {
  try {
    const { name, player1Id, player2Id, seed, rating } = req.body;

    if (!player1Id || !player2Id) {
      res.status(400).json({ error: 'Player1Id and player2Id are required' });
      return;
    }

    const playerService = getPlayerService();
    const result = await playerService.createTeam(req.clubId!, { name, player1Id, player2Id, seed, rating });

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.status(201).json({ success: true, team: result.data });
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

/**
 * GET /api/clubs/:clubId/teams - List teams
 */
app.get('/api/clubs/:clubId/teams', requireAuth as any, requireClubMember as any, async (req: ClubRequest, res: Response) => {
  try {
    const playerService = getPlayerService();
    const teams = await playerService.getClubTeams(req.clubId!);

    res.json({ teams });
  } catch (error) {
    console.error('List teams error:', error);
    res.status(500).json({ error: 'Failed to list teams' });
  }
});

/**
 * GET /api/clubs/:clubId/teams/:teamId - Get team
 */
app.get('/api/clubs/:clubId/teams/:teamId', requireAuth as any, requireClubMember as any, async (req: ClubRequest, res: Response) => {
  try {
    const { teamId } = req.params;

    const playerService = getPlayerService();
    const team = await playerService.getTeam(teamId);

    if (!team || team.clubId !== req.clubId) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    res.json({ team });
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: 'Failed to get team' });
  }
});

/**
 * PUT /api/clubs/:clubId/teams/:teamId - Update team
 */
app.put('/api/clubs/:clubId/teams/:teamId', requireAuth as any, requireClubOrganiser as any, async (req: ClubRequest, res: Response) => {
  try {
    const { teamId } = req.params;
    const { name, seed, rating } = req.body;

    const playerService = getPlayerService();

    // Verify team belongs to club
    const existing = await playerService.getTeam(teamId);
    if (!existing || existing.clubId !== req.clubId) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const result = await playerService.updateTeam(teamId, { name, seed, rating });

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true, team: result.data });
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ error: 'Failed to update team' });
  }
});

/**
 * DELETE /api/clubs/:clubId/teams/:teamId - Delete team
 */
app.delete('/api/clubs/:clubId/teams/:teamId', requireAuth as any, requireClubOrganiser as any, async (req: ClubRequest, res: Response) => {
  try {
    const { teamId } = req.params;

    const playerService = getPlayerService();

    // Verify team belongs to club
    const existing = await playerService.getTeam(teamId);
    if (!existing || existing.clubId !== req.clubId) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const result = await playerService.deleteTeam(teamId);

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// ==================== Entry API Endpoints ====================

/**
 * POST /api/divisions/:divisionId/entries - Add entry
 */
app.post('/api/divisions/:divisionId/entries', requireAuth as any, requireDivisionOrganiser as any, async (req: DivisionRequest, res: Response) => {
  try {
    const { entryType, playerId, teamId, seed } = req.body;

    if (!entryType) {
      res.status(400).json({ error: 'Entry type is required' });
      return;
    }

    const playerService = getPlayerService();
    const result = await playerService.createEntry(req.divisionId!, {
      entryType: entryType as EntryType,
      playerId,
      teamId,
      seed
    });

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.status(201).json({ success: true, entry: result.data });
  } catch (error) {
    console.error('Create entry error:', error);
    res.status(500).json({ error: 'Failed to create entry' });
  }
});

/**
 * POST /api/divisions/:divisionId/entries/bulk - Bulk add singles entries
 */
app.post('/api/divisions/:divisionId/entries/bulk', requireAuth as any, requireDivisionOrganiser as any, async (req: DivisionRequest, res: Response) => {
  try {
    const { playerIds } = req.body;

    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      res.status(400).json({ error: 'playerIds array is required' });
      return;
    }

    const playerService = getPlayerService();
    const result = await playerService.bulkCreateEntries(req.divisionId!, playerIds);

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.status(201).json({ created: result.data.created, failed: result.data.failed });
  } catch (error) {
    console.error('Bulk create entries error:', error);
    res.status(500).json({ error: 'Failed to bulk create entries' });
  }
});

/**
 * GET /api/divisions/:divisionId/entries - List entries
 */
app.get('/api/divisions/:divisionId/entries', requireAuth as any, requireDivisionAccess as any, async (req: DivisionRequest, res: Response) => {
  try {
    const playerService = getPlayerService();
    const entries = await playerService.getDivisionEntries(req.divisionId!);

    res.json({ entries });
  } catch (error) {
    console.error('List entries error:', error);
    res.status(500).json({ error: 'Failed to list entries' });
  }
});

/**
 * GET /api/divisions/:divisionId/entries/:entryId - Get entry
 */
app.get('/api/divisions/:divisionId/entries/:entryId', requireAuth as any, requireDivisionAccess as any, async (req: DivisionRequest, res: Response) => {
  try {
    const { entryId } = req.params;

    const playerService = getPlayerService();
    const entry = await playerService.getEntry(entryId);

    if (!entry || entry.divisionId !== req.divisionId) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    res.json({ entry });
  } catch (error) {
    console.error('Get entry error:', error);
    res.status(500).json({ error: 'Failed to get entry' });
  }
});

/**
 * PUT /api/divisions/:divisionId/entries/:entryId - Update entry
 */
app.put('/api/divisions/:divisionId/entries/:entryId', requireAuth as any, requireDivisionOrganiser as any, async (req: DivisionRequest, res: Response) => {
  try {
    const { entryId } = req.params;
    const { seed } = req.body;

    const playerService = getPlayerService();

    // Verify entry belongs to division
    const existing = await playerService.getEntry(entryId);
    if (!existing || existing.divisionId !== req.divisionId) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    const result = await playerService.updateEntry(entryId, { seed });

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true, entry: result.data });
  } catch (error) {
    console.error('Update entry error:', error);
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

/**
 * DELETE /api/divisions/:divisionId/entries/:entryId - Delete entry
 */
app.delete('/api/divisions/:divisionId/entries/:entryId', requireAuth as any, requireDivisionOrganiser as any, async (req: DivisionRequest, res: Response) => {
  try {
    const { entryId } = req.params;

    const playerService = getPlayerService();

    // Verify entry belongs to division
    const existing = await playerService.getEntry(entryId);
    if (!existing || existing.divisionId !== req.divisionId) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    const result = await playerService.deleteEntry(entryId);

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete entry error:', error);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

// ==================== Profile Claiming API Endpoints (Epic 4) ====================

/**
 * POST /api/clubs/:clubId/players/:playerId/claim-token - Generate claim token
 */
app.post('/api/clubs/:clubId/players/:playerId/claim-token', requireAuth as any, requireClubOrganiser as any, async (req: ClubRequest, res: Response) => {
  try {
    const { playerId } = req.params;

    const playerService = getPlayerService();

    // Verify player belongs to club
    const player = await playerService.getPlayer(playerId);
    if (!player || player.clubId !== req.clubId) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const result = await playerService.generateClaimToken(playerId);

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true, ...result.data });
  } catch (error) {
    console.error('Generate claim token error:', error);
    res.status(500).json({ error: 'Failed to generate claim token' });
  }
});

/**
 * POST /api/players/claim - Claim a player profile with token
 */
app.post('/api/players/claim', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ error: 'Claim token is required' });
      return;
    }

    const playerService = getPlayerService();
    const result = await playerService.claimProfile(token, req.user!.id, req.user!.email);

    if (!result.success) {
      const statusCode = result.error === 'invalid_claim_token' ? 404 : 400;
      res.status(statusCode).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true, player: result.data });
  } catch (error) {
    console.error('Claim profile error:', error);
    res.status(500).json({ error: 'Failed to claim profile' });
  }
});

/**
 * GET /api/players/mine - Get player profiles owned by current user
 */
app.get('/api/players/mine', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const playerService = getPlayerService();
    const players = await playerService.getPlayersByUser(req.user!.id);

    res.json({ players });
  } catch (error) {
    console.error('Get my players error:', error);
    res.status(500).json({ error: 'Failed to get players' });
  }
});

// ==================== Self-Registration API Endpoints (Epic 4) ====================

/**
 * POST /api/divisions/:divisionId/register - Self-register for a competition division
 */
app.post('/api/divisions/:divisionId/register', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { divisionId } = req.params;
    const { entryType, partnerId, seekingPartner } = req.body;

    if (!entryType) {
      res.status(400).json({ error: 'Entry type is required' });
      return;
    }

    const input: SelfRegisterInput = {
      entryType,
      divisionId,
      partnerId,
      seekingPartner,
    };

    const playerService = getPlayerService();
    const result = await playerService.registerForCompetition(divisionId, req.user!.id, input);

    if (!result.success) {
      const statusCode =
        result.error === 'division_not_found' || result.error === 'competition_not_found' || result.error === 'player_not_found'
          ? 404
          : 400;
      res.status(statusCode).json({ error: result.message, code: result.error });
      return;
    }

    res.status(201).json({ success: true, entry: result.data });
  } catch (error) {
    console.error('Self-register error:', error);
    res.status(500).json({ error: 'Failed to register' });
  }
});

/**
 * GET /api/competitions/:competitionId/pending-registrations - Get pending registrations
 */
app.get('/api/competitions/:competitionId/pending-registrations', requireAuth as any, requireCompetitionOrganiser as any, async (req: CompetitionRequest, res: Response) => {
  try {
    const playerService = getPlayerService();
    const entries = await playerService.getPendingRegistrations(req.competitionId!);

    res.json({ entries });
  } catch (error) {
    console.error('Get pending registrations error:', error);
    res.status(500).json({ error: 'Failed to get pending registrations' });
  }
});

/**
 * POST /api/entries/:entryId/approve - Approve a pending registration
 */
app.post('/api/entries/:entryId/approve', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entryId } = req.params;

    const playerService = getPlayerService();
    const competitionService = getCompetitionService();
    const clubService = getClubService();

    // Get entry and verify organiser access
    const entry = await playerService.getEntry(entryId);
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    // Get division -> competition -> club to verify access
    const division = await competitionService.getDivision(entry.divisionId);
    if (!division) {
      res.status(404).json({ error: 'Division not found' });
      return;
    }

    const competition = await competitionService.getCompetition(division.competitionId);
    if (!competition) {
      res.status(404).json({ error: 'Competition not found' });
      return;
    }

    const membership = await clubService.getMembership(competition.clubId, req.user!.id);
    if (!membership || (membership.role !== 'admin' && membership.role !== 'organiser')) {
      res.status(403).json({ error: 'Organiser access required' });
      return;
    }

    const result = await playerService.approveRegistration(entryId);

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    // Queue notification for registration approval
    try {
      const notificationService = getNotificationService();
      await notificationService.queueRegistrationApproved(entryId);
    } catch (notifError) {
      console.error('Failed to queue registration approved notification:', notifError);
    }

    res.json({ success: true, entry: result.data });
  } catch (error) {
    console.error('Approve registration error:', error);
    res.status(500).json({ error: 'Failed to approve registration' });
  }
});

/**
 * POST /api/entries/:entryId/reject - Reject a pending registration
 */
app.post('/api/entries/:entryId/reject', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entryId } = req.params;
    const { reason } = req.body;

    const playerService = getPlayerService();
    const competitionService = getCompetitionService();
    const clubService = getClubService();

    // Get entry and verify organiser access
    const entry = await playerService.getEntry(entryId);
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    // Get division -> competition -> club to verify access
    const division = await competitionService.getDivision(entry.divisionId);
    if (!division) {
      res.status(404).json({ error: 'Division not found' });
      return;
    }

    const competition = await competitionService.getCompetition(division.competitionId);
    if (!competition) {
      res.status(404).json({ error: 'Competition not found' });
      return;
    }

    const membership = await clubService.getMembership(competition.clubId, req.user!.id);
    if (!membership || (membership.role !== 'admin' && membership.role !== 'organiser')) {
      res.status(403).json({ error: 'Organiser access required' });
      return;
    }

    const result = await playerService.rejectRegistration(entryId, reason);

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    // Queue notification for registration rejection
    try {
      const notificationService = getNotificationService();
      await notificationService.queueRegistrationRejected(entryId, reason);
    } catch (notifError) {
      console.error('Failed to queue registration rejected notification:', notifError);
    }

    res.json({ success: true, entry: result.data });
  } catch (error) {
    console.error('Reject registration error:', error);
    res.status(500).json({ error: 'Failed to reject registration' });
  }
});

/**
 * POST /api/entries/:entryId/withdraw - Withdraw own registration
 */
app.post('/api/entries/:entryId/withdraw', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entryId } = req.params;

    const playerService = getPlayerService();
    const result = await playerService.withdrawRegistration(entryId, req.user!.id);

    if (!result.success) {
      const statusCode = result.error === 'entry_not_found' ? 404 : 400;
      res.status(statusCode).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Withdraw registration error:', error);
    res.status(500).json({ error: 'Failed to withdraw registration' });
  }
});

// ==================== Partner Request API Endpoints (Epic 4) ====================

/**
 * POST /api/partner-requests - Create partner request
 */
app.post('/api/partner-requests', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { divisionId, inviteePlayerId, message } = req.body;

    if (!divisionId || !inviteePlayerId) {
      res.status(400).json({ error: 'Division ID and invitee player ID are required' });
      return;
    }

    // Get requester's player for this club
    const playerService = getPlayerService();
    const competitionService = getCompetitionService();

    // Get division to find competition and club
    const division = await competitionService.getDivision(divisionId);
    if (!division) {
      res.status(404).json({ error: 'Division not found' });
      return;
    }

    const competition = await competitionService.getCompetition(division.competitionId);
    if (!competition) {
      res.status(404).json({ error: 'Competition not found' });
      return;
    }

    // Get requester's player profile for this club
    const myPlayers = await playerService.getPlayersByUser(req.user!.id);
    const requesterPlayer = myPlayers.find(p => p.clubId === competition.clubId);

    if (!requesterPlayer) {
      res.status(400).json({ error: 'No player profile found for this club' });
      return;
    }

    const input: CreatePartnerRequestInput = {
      divisionId,
      requesterPlayerId: requesterPlayer.id,
      inviteePlayerId,
      message,
    };

    const result = await playerService.createPartnerRequest(input);

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    // Queue notification for partner request received
    try {
      const notificationService = getNotificationService();
      await notificationService.queuePartnerRequestReceived(result.data.id);
    } catch (notifError) {
      console.error('Failed to queue partner request notification:', notifError);
    }

    res.status(201).json({ success: true, request: result.data });
  } catch (error) {
    console.error('Create partner request error:', error);
    res.status(500).json({ error: 'Failed to create partner request' });
  }
});

/**
 * GET /api/partner-requests - Get my partner requests
 */
app.get('/api/partner-requests', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const playerService = getPlayerService();
    const requests = await playerService.getPartnerRequestsForUser(req.user!.id);

    res.json({ requests });
  } catch (error) {
    console.error('Get partner requests error:', error);
    res.status(500).json({ error: 'Failed to get partner requests' });
  }
});

/**
 * POST /api/partner-requests/:requestId/accept - Accept partner request
 */
app.post('/api/partner-requests/:requestId/accept', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { requestId } = req.params;

    const playerService = getPlayerService();
    const result = await playerService.acceptPartnerRequest(requestId, req.user!.id);

    if (!result.success) {
      const statusCode = result.error === 'partner_request_not_found' ? 404 : 400;
      res.status(statusCode).json({ error: result.message, code: result.error });
      return;
    }

    // Queue notification for partner request accepted
    try {
      const notificationService = getNotificationService();
      await notificationService.queuePartnerRequestResponse(requestId, true);
    } catch (notifError) {
      console.error('Failed to queue partner request accepted notification:', notifError);
    }

    res.json({ success: true, entry: result.data });
  } catch (error) {
    console.error('Accept partner request error:', error);
    res.status(500).json({ error: 'Failed to accept partner request' });
  }
});

/**
 * POST /api/partner-requests/:requestId/decline - Decline partner request
 */
app.post('/api/partner-requests/:requestId/decline', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { requestId } = req.params;

    const playerService = getPlayerService();
    const result = await playerService.declinePartnerRequest(requestId, req.user!.id);

    if (!result.success) {
      const statusCode = result.error === 'partner_request_not_found' ? 404 : 400;
      res.status(statusCode).json({ error: result.message, code: result.error });
      return;
    }

    // Queue notification for partner request declined
    try {
      const notificationService = getNotificationService();
      await notificationService.queuePartnerRequestResponse(requestId, false);
    } catch (notifError) {
      console.error('Failed to queue partner request declined notification:', notifError);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Decline partner request error:', error);
    res.status(500).json({ error: 'Failed to decline partner request' });
  }
});

// ==================== Player Dashboard API Endpoints (Epic 4) ====================

/**
 * GET /api/dashboard - Get player dashboard
 */
app.get('/api/dashboard', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const playerService = getPlayerService();
    const dashboard = await playerService.getPlayerDashboard(req.user!.id);

    res.json(dashboard);
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard' });
  }
});

// ==================== Public API Endpoints ====================

/**
 * GET /api/public/competitions/:slug - Public competition view (no auth)
 */
app.get('/api/public/competitions/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const competitionService = getCompetitionService();
    const competition = await competitionService.getPublicCompetition(slug);

    if (!competition) {
      res.status(404).json({ error: 'Competition not found' });
      return;
    }

    // Get divisions for public view
    const divisions = await competitionService.getDivisions(competition.id);

    res.json({ competition, divisions });
  } catch (error) {
    console.error('Get public competition error:', error);
    res.status(500).json({ error: 'Failed to get competition' });
  }
});

// ============================================
// Draw & Match API Endpoints
// ============================================

/**
 * Middleware: Require draw access (checks division -> competition -> club membership)
 */
interface DrawRequest extends ClubRequest {
  drawId?: string;
  divisionId?: string;
}

interface MatchRequest extends ClubRequest {
  matchId?: string;
}

async function requireDrawAccess(req: DrawRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { drawId } = req.params;
    const drawService = getDrawService();
    const competitionService = getCompetitionService();
    const clubService = getClubService();

    const draw = await drawService.getDraw(drawId);
    if (!draw) {
      res.status(404).json({ error: 'Draw not found' });
      return;
    }

    // Get division -> competition -> club
    const divisionResult = await competitionService.getDivision(draw.divisionId);
    if (!divisionResult) {
      res.status(404).json({ error: 'Division not found' });
      return;
    }

    const competition = await competitionService.getCompetition(divisionResult.competitionId);
    if (!competition) {
      res.status(404).json({ error: 'Competition not found' });
      return;
    }

    // Check membership
    const membership = await clubService.getMembership(competition.clubId, req.user!.id);
    if (!membership || membership.status !== 'active') {
      res.status(403).json({ error: 'Not a member of this club' });
      return;
    }

    req.clubId = competition.clubId;
    req.membership = { role: membership.role };
    req.drawId = drawId;
    req.divisionId = draw.divisionId;
    next();
  } catch (error) {
    console.error('Draw access check error:', error);
    res.status(500).json({ error: 'Failed to check draw access' });
  }
}

async function requireDrawOrganiser(req: DrawRequest, res: Response, next: NextFunction): Promise<void> {
  await requireDrawAccess(req, res, () => {
    if (req.membership && (req.membership.role === 'organiser' || req.membership.role === 'admin')) {
      next();
    } else {
      res.status(403).json({ error: 'Organiser access required' });
    }
  });
}

async function requireMatchAccess(req: MatchRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { matchId } = req.params;
    const drawService = getDrawService();
    const competitionService = getCompetitionService();
    const clubService = getClubService();

    const match = await drawService.getMatch(matchId);
    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const draw = await drawService.getDraw(match.drawId);
    if (!draw) {
      res.status(404).json({ error: 'Draw not found' });
      return;
    }

    const division = await competitionService.getDivision(draw.divisionId);
    if (!division) {
      res.status(404).json({ error: 'Division not found' });
      return;
    }

    const competition = await competitionService.getCompetition(division.competitionId);
    if (!competition) {
      res.status(404).json({ error: 'Competition not found' });
      return;
    }

    const membership = await clubService.getMembership(competition.clubId, req.user!.id);
    if (!membership || membership.status !== 'active') {
      res.status(403).json({ error: 'Not a member of this club' });
      return;
    }

    req.clubId = competition.clubId;
    req.membership = { role: membership.role };
    req.matchId = matchId;
    next();
  } catch (error) {
    console.error('Match access check error:', error);
    res.status(500).json({ error: 'Failed to check match access' });
  }
}

async function requireMatchOrganiser(req: MatchRequest, res: Response, next: NextFunction): Promise<void> {
  await requireMatchAccess(req, res, () => {
    if (req.membership && (req.membership.role === 'organiser' || req.membership.role === 'admin')) {
      next();
    } else {
      res.status(403).json({ error: 'Organiser access required' });
    }
  });
}

/**
 * POST /api/divisions/:divisionId/draws - Create a draw
 */
app.post('/api/divisions/:divisionId/draws', requireAuth as any, requireDivisionOrganiser as any, async (req: DivisionRequest, res: Response) => {
  try {
    const { divisionId } = req.params;
    const { drawType, config } = req.body;

    if (!drawType) {
      res.status(400).json({ error: 'Draw type is required' });
      return;
    }

    const validDrawTypes: DrawType[] = ['single_elimination', 'double_elimination', 'round_robin'];
    if (!validDrawTypes.includes(drawType)) {
      res.status(400).json({ error: 'Invalid draw type' });
      return;
    }

    const drawService = getDrawService();
    const result = await drawService.createDraw(divisionId!, { drawType, config });

    if (!result.success) {
      const statusCode = result.error === 'insufficient_entries' ? 400 : 400;
      res.status(statusCode).json({ error: result.message, code: result.error });
      return;
    }

    // Get the full draw with matches for the response
    const drawWithMatches = await drawService.getDrawWithMatches(result.data.id);
    res.status(201).json({ success: true, draw: drawWithMatches ? transformDrawForFrontend(drawWithMatches) : result.data });
  } catch (error) {
    console.error('Create draw error:', error);
    res.status(500).json({ error: 'Failed to create draw' });
  }
});

/**
 * GET /api/divisions/:divisionId/draws - List draws for a division
 */
app.get('/api/divisions/:divisionId/draws', requireAuth as any, requireDivisionAccess as any, async (req: DivisionRequest, res: Response) => {
  try {
    const { divisionId } = req.params;
    const drawService = getDrawService();
    const draws = await drawService.getDivisionDraws(divisionId!);
    res.json({ draws });
  } catch (error) {
    console.error('List draws error:', error);
    res.status(500).json({ error: 'Failed to list draws' });
  }
});

/**
 * GET /api/draws/:drawId - Get draw with matches
 */
app.get('/api/draws/:drawId', requireAuth as any, requireDrawAccess as any, async (req: DrawRequest, res: Response) => {
  try {
    const drawService = getDrawService();
    const draw = await drawService.getDrawWithMatches(req.drawId!);

    if (!draw) {
      res.status(404).json({ error: 'Draw not found' });
      return;
    }

    res.json({ draw: transformDrawForFrontend(draw) });
  } catch (error) {
    console.error('Get draw error:', error);
    res.status(500).json({ error: 'Failed to get draw' });
  }
});

/**
 * PUT /api/draws/:drawId/activate - Activate a draw
 */
app.put('/api/draws/:drawId/activate', requireAuth as any, requireDrawOrganiser as any, async (req: DrawRequest, res: Response) => {
  try {
    const drawService = getDrawService();
    const result = await drawService.activateDraw(req.drawId!);

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    // Queue notifications for draw published
    try {
      const notificationService = getNotificationService();
      await notificationService.queueDrawPublished(req.drawId!);
    } catch (notifError) {
      console.error('Failed to queue draw published notification:', notifError);
    }

    // Get the full draw with matches for the response
    const drawWithMatches = await drawService.getDrawWithMatches(req.drawId!);
    res.json({ success: true, draw: drawWithMatches ? transformDrawForFrontend(drawWithMatches) : result.data });
  } catch (error) {
    console.error('Activate draw error:', error);
    res.status(500).json({ error: 'Failed to activate draw' });
  }
});

/**
 * DELETE /api/draws/:drawId - Delete a draft draw
 */
app.delete('/api/draws/:drawId', requireAuth as any, requireDrawOrganiser as any, async (req: DrawRequest, res: Response) => {
  try {
    const drawService = getDrawService();
    const result = await drawService.deleteDraw(req.drawId!);

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete draw error:', error);
    res.status(500).json({ error: 'Failed to delete draw' });
  }
});

/**
 * GET /api/draws/:drawId/matches - List matches in a draw
 */
app.get('/api/draws/:drawId/matches', requireAuth as any, requireDrawAccess as any, async (req: DrawRequest, res: Response) => {
  try {
    const drawService = getDrawService();
    const matches = await drawService.getDrawMatches(req.drawId!);
    res.json({ matches });
  } catch (error) {
    console.error('List matches error:', error);
    res.status(500).json({ error: 'Failed to list matches' });
  }
});

/**
 * GET /api/matches/:matchId - Get a single match
 */
app.get('/api/matches/:matchId', requireAuth as any, requireMatchAccess as any, async (req: MatchRequest, res: Response) => {
  try {
    const drawService = getDrawService();
    const match = await drawService.getMatch(req.matchId!);

    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    res.json({ match });
  } catch (error) {
    console.error('Get match error:', error);
    res.status(500).json({ error: 'Failed to get match' });
  }
});

/**
 * PUT /api/matches/:matchId - Update match scheduling
 */
app.put('/api/matches/:matchId', requireAuth as any, requireMatchOrganiser as any, async (req: MatchRequest, res: Response) => {
  try {
    const { scheduledTime, court, status } = req.body;

    const input: UpdateMatchInput = {};
    if (scheduledTime !== undefined) {
      input.scheduledTime = scheduledTime ? new Date(scheduledTime) : null;
    }
    if (court !== undefined) {
      input.court = court;
    }
    if (status !== undefined) {
      if (!['scheduled', 'in_progress'].includes(status)) {
        res.status(400).json({ error: 'Invalid status. Use /result endpoint to complete matches.' });
        return;
      }
      input.status = status;
    }

    const drawService = getDrawService();
    const result = await drawService.updateMatch(req.matchId!, input);

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    // If match was scheduled with a time, queue notifications
    if (scheduledTime && result.data) {
      try {
        const notificationService = getNotificationService();
        // Send immediate notification about scheduling
        await notificationService.queueMatchScheduled(req.matchId!);
        // Schedule reminders for 24h and 1h before match
        await notificationService.queueMatchReminder(req.matchId!, 24);
        await notificationService.queueMatchReminder(req.matchId!, 1);
      } catch (notifError) {
        console.error('Failed to queue match notifications:', notifError);
      }
    }

    res.json({ success: true, match: result.data });
  } catch (error) {
    console.error('Update match error:', error);
    res.status(500).json({ error: 'Failed to update match' });
  }
});

/**
 * POST /api/matches/:matchId/result - Record match result
 */
app.post('/api/matches/:matchId/result', requireAuth as any, requireMatchOrganiser as any, async (req: MatchRequest, res: Response) => {
  try {
    const { winnerId, score, status } = req.body;

    if (!winnerId) {
      res.status(400).json({ error: 'Winner ID is required' });
      return;
    }

    if (!status || !['completed', 'walkover', 'retired'].includes(status)) {
      res.status(400).json({ error: 'Valid status is required (completed, walkover, retired)' });
      return;
    }

    const input: RecordResultInput = {
      winnerId,
      status,
    };

    if (score) {
      input.score = score;
    }

    const drawService = getDrawService();
    const result = await drawService.recordResult(req.matchId!, input);

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true, match: result.data });
  } catch (error) {
    console.error('Record result error:', error);
    res.status(500).json({ error: 'Failed to record result' });
  }
});

/**
 * DELETE /api/matches/:matchId/result - Clear match result
 */
app.delete('/api/matches/:matchId/result', requireAuth as any, requireMatchOrganiser as any, async (req: MatchRequest, res: Response) => {
  try {
    const drawService = getDrawService();
    const result = await drawService.clearResult(req.matchId!);

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true, match: result.data });
  } catch (error) {
    console.error('Clear result error:', error);
    res.status(500).json({ error: 'Failed to clear result' });
  }
});

/**
 * GET /api/draws/:drawId/standings - Get round robin standings
 */
app.get('/api/draws/:drawId/standings', requireAuth as any, requireDrawAccess as any, async (req: DrawRequest, res: Response) => {
  try {
    const drawService = getDrawService();
    const standings = await drawService.getStandings(req.drawId!);
    res.json({ standings: standings.map(transformStandingForFrontend) });
  } catch (error) {
    console.error('Get standings error:', error);
    res.status(500).json({ error: 'Failed to get standings' });
  }
});

/**
 * GET /api/public/competitions/:slug/draws - Get draws for a public competition
 */
app.get('/api/public/competitions/:slug/draws', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const competitionService = getCompetitionService();
    const drawService = getDrawService();

    const competition = await competitionService.getPublicCompetition(slug);
    if (!competition) {
      res.status(404).json({ error: 'Competition not found' });
      return;
    }

    // Get all divisions
    const divisions = await competitionService.getDivisions(competition.id);

    // Get draws for each division (only active/completed)
    const allDraws = [];
    for (const division of divisions) {
      const draws = await drawService.getDivisionDraws(division.id);
      const publicDraws = draws.filter(d => d.status !== 'draft');
      allDraws.push(...publicDraws.map(d => ({ ...d, divisionName: division.name })));
    }

    res.json({ draws: allDraws });
  } catch (error) {
    console.error('Get public draws error:', error);
    res.status(500).json({ error: 'Failed to get draws' });
  }
});

/**
 * GET /api/public/draws/:drawId - Get a public draw with results
 */
app.get('/api/public/draws/:drawId', async (req: Request, res: Response) => {
  try {
    const { drawId } = req.params;
    const drawService = getDrawService();
    const competitionService = getCompetitionService();

    const draw = await drawService.getDrawWithMatches(drawId);
    if (!draw) {
      res.status(404).json({ error: 'Draw not found' });
      return;
    }

    // Verify the competition is published
    const division = await competitionService.getDivision(draw.divisionId);
    if (!division) {
      res.status(404).json({ error: 'Division not found' });
      return;
    }

    const competition = await competitionService.getCompetition(division.competitionId);
    if (!competition || competition.status === 'draft') {
      res.status(404).json({ error: 'Draw not found' });
      return;
    }

    // Only show non-draft draws publicly
    if (draw.status === 'draft') {
      res.status(404).json({ error: 'Draw not found' });
      return;
    }

    // Include standings for round robin
    let standings = null;
    if (draw.drawType === 'round_robin') {
      const rawStandings = await drawService.getStandings(drawId);
      standings = rawStandings.map(transformStandingForFrontend);
    }

    res.json({ draw: transformDrawForFrontend(draw), standings });
  } catch (error) {
    console.error('Get public draw error:', error);
    res.status(500).json({ error: 'Failed to get draw' });
  }
});

// ==================== Notification API Endpoints (Epic 5) ====================

import { getNotificationService } from './services/index.js';
import type { UpdatePreferencesInput, NotificationStatus } from './services/notification-service.js';

/**
 * GET /api/me/notification-preferences - Get user's notification preferences
 */
app.get('/api/me/notification-preferences', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const notificationService = getNotificationService();
    const preferences = await notificationService.getPreferences(req.user!.id);

    res.json({ preferences });
  } catch (error) {
    console.error('Get notification preferences error:', error);
    res.status(500).json({ error: 'Failed to get notification preferences' });
  }
});

/**
 * PUT /api/me/notification-preferences - Update user's notification preferences
 */
app.put('/api/me/notification-preferences', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { matchScheduled, matchReminder, registrationStatus, partnerRequests, competitionUpdates } = req.body;

    const input: UpdatePreferencesInput = {};
    if (matchScheduled !== undefined) input.matchScheduled = matchScheduled;
    if (matchReminder !== undefined) input.matchReminder = matchReminder;
    if (registrationStatus !== undefined) input.registrationStatus = registrationStatus;
    if (partnerRequests !== undefined) input.partnerRequests = partnerRequests;
    if (competitionUpdates !== undefined) input.competitionUpdates = competitionUpdates;

    const notificationService = getNotificationService();
    const preferences = await notificationService.updatePreferences(req.user!.id, input);

    res.json({ success: true, preferences });
  } catch (error) {
    console.error('Update notification preferences error:', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

/**
 * POST /api/competitions/:competitionId/announce - Send announcement to registered players
 */
app.post('/api/competitions/:competitionId/announce', requireAuth as any, requireCompetitionOrganiser as any, async (req: CompetitionRequest, res: Response) => {
  try {
    const { subject, message } = req.body;

    if (!subject || !message) {
      res.status(400).json({ error: 'Subject and message are required' });
      return;
    }

    const notificationService = getNotificationService();
    const result = await notificationService.queueAnnouncement(req.competitionId!, subject, message);

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true, count: result.count });
  } catch (error) {
    console.error('Send announcement error:', error);
    res.status(500).json({ error: 'Failed to send announcement' });
  }
});

/**
 * GET /api/admin/notifications - List notification queue (admin only)
 */
app.get('/api/admin/notifications', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin (in admins group)
    if (!req.user!.roles.includes('admins')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const status = req.query.status as NotificationStatus | undefined;
    const limit = parseInt(req.query.limit as string) || 100;

    const notificationService = getNotificationService();
    const notifications = await notificationService.getQueuedNotifications(status, limit);

    res.json({ notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

/**
 * POST /api/admin/notifications/process - Manually trigger queue processing (admin only)
 */
app.post('/api/admin/notifications/process', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin (in admins group)
    if (!req.user!.roles.includes('admins')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const notificationService = getNotificationService();
    const result = await notificationService.processQueue();

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Process notifications error:', error);
    res.status(500).json({ error: 'Failed to process notifications' });
  }
});

/**
 * DELETE /api/admin/notifications/:notificationId - Cancel a pending notification (admin only)
 */
app.delete('/api/admin/notifications/:notificationId', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin (in admins group)
    if (!req.user!.roles.includes('admins')) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { notificationId } = req.params;

    const notificationService = getNotificationService();
    const result = await notificationService.cancelNotification(notificationId);

    if (!result.success) {
      const statusCode = result.error === 'notification_not_found' ? 404 : 400;
      res.status(statusCode).json({ error: result.message, code: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Cancel notification error:', error);
    res.status(500).json({ error: 'Failed to cancel notification' });
  }
});

// ==================== Live Scoring API Endpoints (Epic 6) ====================

import type { StartMatchInput, RecordPointInput, PauseMatchInput, AbandonMatchInput } from './services/live-score-service.js';
import type { LiveEvent, MatchStartedData, ScoreChangeData, MatchPausedData, MatchResumedData, MatchCompletedData, MatchAbandonedData } from './services/live-events-service.js';
import { v4 as uuidv4 } from 'uuid';

// Helper to resolve match metadata (entry names, competition name, court, etc.)
async function getMatchMetadata(matchId: string) {
  const drawService = getDrawService();
  const competitionService = getCompetitionService();
  const match = await drawService.getMatch(matchId);
  if (!match) return null;

  const db = (await import('./db/database.js')).getDatabase();

  // Resolve entry names
  const nameRow = db.prepare(`
    SELECT COALESCE(p1.name, t1.name) as entry1_name,
           COALESCE(p2.name, t2.name) as entry2_name
    FROM matches m
    LEFT JOIN entries e1 ON e1.id = m.entry1_id
    LEFT JOIN players p1 ON p1.id = e1.player_id
    LEFT JOIN teams t1 ON t1.id = e1.team_id
    LEFT JOIN entries e2 ON e2.id = m.entry2_id
    LEFT JOIN players p2 ON p2.id = e2.player_id
    LEFT JOIN teams t2 ON t2.id = e2.team_id
    WHERE m.id = ?
  `).get(matchId) as { entry1_name: string | null; entry2_name: string | null } | undefined;

  // Trace to competition: match → draw → division → competition
  const drawRow = db.prepare('SELECT division_id FROM draws WHERE id = ?').get(match.drawId) as { division_id: string } | undefined;
  let competitionName = 'Match';
  if (drawRow) {
    const divRow = db.prepare('SELECT competition_id FROM divisions WHERE id = ?').get(drawRow.division_id) as { competition_id: string } | undefined;
    if (divRow) {
      const comp = await competitionService.getCompetition(divRow.competition_id);
      if (comp) competitionName = comp.name;
    }
  }

  return {
    id: matchId,
    entry1Name: nameRow?.entry1_name || 'Player 1',
    entry2Name: nameRow?.entry2_name || 'Player 2',
    court: match.court || null,
    scheduledTime: match.scheduledTime || null,
    competitionName,
  };
}

/**
 * GET /api/matches/:matchId/live-score - Get current live score
 */
app.get('/api/matches/:matchId/live-score', requireAuth as any, requireMatchOrganiser as any, async (req: MatchRequest, res: Response) => {
  try {
    const liveScoreService = getLiveScoreService();
    const score = await liveScoreService.getLiveScore(req.matchId!);

    if (!score) {
      res.json({ score: null, status: 'not_started' });
      return;
    }

    const displayScore = await liveScoreService.getDisplayScore(req.matchId!);
    const matchMeta = await getMatchMetadata(req.matchId!);
    res.json({ score, displayScore, match: matchMeta });
  } catch (error) {
    console.error('Get live score error:', error);
    res.status(500).json({ error: 'Failed to get live score' });
  }
});

/**
 * POST /api/matches/:matchId/start - Start a match
 */
app.post('/api/matches/:matchId/start', requireAuth as any, requireMatchOrganiser as any, async (req: MatchRequest, res: Response) => {
  try {
    const { servingEntry } = req.body as StartMatchInput;

    if (servingEntry !== 1 && servingEntry !== 2) {
      res.status(400).json({ error: 'servingEntry must be 1 or 2' });
      return;
    }

    const liveScoreService = getLiveScoreService();
    const result = await liveScoreService.startMatch(req.matchId!, { servingEntry });

    if (!result.success) {
      const statusCode = result.error === 'match_not_found' ? 404 : 400;
      res.status(statusCode).json({ error: result.message, code: result.error });
      return;
    }

    const displayScore = await liveScoreService.getDisplayScore(req.matchId!);
    const liveEventsService = getLiveEventsService();
    const event: LiveEvent = {
      type: 'match_started',
      matchId: req.matchId!,
      timestamp: new Date().toISOString(),
      data: {
        servingEntry,
        displayScore: displayScore!,
      } as MatchStartedData,
    };
    liveEventsService.broadcastToMatch(req.matchId!, event);
    if (req.competitionId) {
      liveEventsService.broadcastToCompetition(req.competitionId, event);
    }

    res.json({ success: true, score: result.data, displayScore });
  } catch (error) {
    console.error('Start match error:', error);
    res.status(500).json({ error: 'Failed to start match' });
  }
});

/**
 * POST /api/matches/:matchId/point - Record a point
 */
app.post('/api/matches/:matchId/point', requireAuth as any, requireMatchOrganiser as any, async (req: MatchRequest, res: Response) => {
  try {
    const { winnerEntry } = req.body as RecordPointInput;

    if (winnerEntry !== 1 && winnerEntry !== 2) {
      res.status(400).json({ error: 'winnerEntry must be 1 or 2' });
      return;
    }

    const liveScoreService = getLiveScoreService();
    const beforeScore = await liveScoreService.getLiveScore(req.matchId!);
    const isBreakPoint = beforeScore ? isBreakPointCheck(beforeScore) : false;
    const isSetPoint = beforeScore ? isSetPointCheck(beforeScore) : false;
    const isMatchPoint = beforeScore ? isMatchPointCheck(beforeScore) : false;

    const result = await liveScoreService.recordPoint(req.matchId!, { winnerEntry });

    if (!result.success) {
      const statusCode = result.error === 'live_score_not_found' ? 404 : 400;
      res.status(statusCode).json({ error: result.message, code: result.error });
      return;
    }

    const displayScore = await liveScoreService.getDisplayScore(req.matchId!);
    const liveEventsService = getLiveEventsService();

    let event: LiveEvent;
    if (result.data.status === 'completed') {
      let entry1Sets = 0;
      let entry2Sets = 0;
      for (let i = 0; i < result.data.entry1Games.length; i++) {
        if (result.data.entry1Games[i] > result.data.entry2Games[i]) entry1Sets++;
        else if (result.data.entry2Games[i] > result.data.entry1Games[i]) entry2Sets++;
      }
      const winner = entry1Sets > entry2Sets ? 1 : 2;

      event = {
        type: 'match_completed',
        matchId: req.matchId!,
        timestamp: new Date().toISOString(),
        data: {
          winner,
          finalScore: displayScore!,
        } as MatchCompletedData,
      };
    } else {
      event = {
        type: 'score_change',
        matchId: req.matchId!,
        timestamp: new Date().toISOString(),
        data: {
          pointWinner: winnerEntry,
          displayScore: displayScore!,
          isBreakPoint,
          isSetPoint,
          isMatchPoint,
        } as ScoreChangeData,
      };
    }

    liveEventsService.broadcastToMatch(req.matchId!, event);
    if (req.competitionId) {
      liveEventsService.broadcastToCompetition(req.competitionId, event);
    }

    res.json({ success: true, score: result.data, displayScore });
  } catch (error) {
    console.error('Record point error:', error);
    res.status(500).json({ error: 'Failed to record point' });
  }
});

function isBreakPointCheck(score: any): boolean {
  if (score.isTiebreak) return false;
  const receiverPoints = score.servingEntry === 1 ? score.entry2Points : score.entry1Points;
  const serverPoints = score.servingEntry === 1 ? score.entry1Points : score.entry2Points;
  if (receiverPoints >= 3 && serverPoints < 3) return true;
  if (receiverPoints > serverPoints && receiverPoints >= 4) return true;
  return false;
}

function isSetPointCheck(score: any): boolean {
  const currentSetIndex = score.currentSet - 1;
  const g1 = score.entry1Games[currentSetIndex] || 0;
  const g2 = score.entry2Games[currentSetIndex] || 0;
  const entry1CouldWin = g1 >= 5 && g1 - g2 >= 1;
  const entry2CouldWin = g2 >= 5 && g2 - g1 >= 1;
  if (!entry1CouldWin && !entry2CouldWin) return false;
  if (score.isTiebreak) {
    const tb1 = score.tiebreakEntry1Points;
    const tb2 = score.tiebreakEntry2Points;
    if (tb1 >= 6 && tb1 - tb2 >= 1) return true;
    if (tb2 >= 6 && tb2 - tb1 >= 1) return true;
  } else {
    const p1 = score.entry1Points;
    const p2 = score.entry2Points;
    if (entry1CouldWin && p1 >= 3 && (p2 < 3 || p1 > p2)) return true;
    if (entry2CouldWin && p2 >= 3 && (p1 < 3 || p2 > p1)) return true;
  }
  return false;
}

function isMatchPointCheck(score: any): boolean {
  let entry1SetsWon = 0;
  let entry2SetsWon = 0;
  for (let i = 0; i < score.entry1Games.length; i++) {
    const g1 = score.entry1Games[i];
    const g2 = score.entry2Games[i];
    if (g1 > g2) entry1SetsWon++;
    else if (g2 > g1) entry2SetsWon++;
  }
  const entry1CouldWinMatch = entry1SetsWon === 1;
  const entry2CouldWinMatch = entry2SetsWon === 1;
  if (!entry1CouldWinMatch && !entry2CouldWinMatch) return false;
  return isSetPointCheck(score);
}

/**
 * POST /api/matches/:matchId/undo - Undo last point
 */
app.post('/api/matches/:matchId/undo', requireAuth as any, requireMatchOrganiser as any, async (req: MatchRequest, res: Response) => {
  try {
    const liveScoreService = getLiveScoreService();
    const result = await liveScoreService.undoLastPoint(req.matchId!);

    if (!result.success) {
      const statusCode = result.error === 'no_points_to_undo' ? 400 : 404;
      res.status(statusCode).json({ error: result.message, code: result.error });
      return;
    }

    const displayScore = await liveScoreService.getDisplayScore(req.matchId!);
    const liveEventsService = getLiveEventsService();
    const event: LiveEvent = {
      type: 'score_change',
      matchId: req.matchId!,
      timestamp: new Date().toISOString(),
      data: {
        pointWinner: 0 as any,
        displayScore: displayScore!,
        isBreakPoint: false,
        isSetPoint: false,
        isMatchPoint: false,
      } as ScoreChangeData,
    };
    liveEventsService.broadcastToMatch(req.matchId!, event);
    if (req.competitionId) {
      liveEventsService.broadcastToCompetition(req.competitionId, event);
    }

    res.json({ success: true, score: result.data, displayScore });
  } catch (error) {
    console.error('Undo point error:', error);
    res.status(500).json({ error: 'Failed to undo point' });
  }
});

/**
 * POST /api/matches/:matchId/pause - Pause match
 */
app.post('/api/matches/:matchId/pause', requireAuth as any, requireMatchOrganiser as any, async (req: MatchRequest, res: Response) => {
  try {
    const { reason } = req.body as PauseMatchInput;

    if (!reason) {
      res.status(400).json({ error: 'Reason is required' });
      return;
    }

    const liveScoreService = getLiveScoreService();
    const result = await liveScoreService.pauseMatch(req.matchId!, { reason });

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    const displayScore = await liveScoreService.getDisplayScore(req.matchId!);
    const liveEventsService = getLiveEventsService();
    const event: LiveEvent = {
      type: 'match_paused',
      matchId: req.matchId!,
      timestamp: new Date().toISOString(),
      data: {
        reason,
        displayScore: displayScore!,
      } as MatchPausedData,
    };
    liveEventsService.broadcastToMatch(req.matchId!, event);
    if (req.competitionId) {
      liveEventsService.broadcastToCompetition(req.competitionId, event);
    }

    res.json({ success: true, score: result.data, displayScore });
  } catch (error) {
    console.error('Pause match error:', error);
    res.status(500).json({ error: 'Failed to pause match' });
  }
});

/**
 * POST /api/matches/:matchId/resume - Resume match
 */
app.post('/api/matches/:matchId/resume', requireAuth as any, requireMatchOrganiser as any, async (req: MatchRequest, res: Response) => {
  try {
    const liveScoreService = getLiveScoreService();
    const result = await liveScoreService.resumeMatch(req.matchId!);

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    const displayScore = await liveScoreService.getDisplayScore(req.matchId!);
    const liveEventsService = getLiveEventsService();
    const event: LiveEvent = {
      type: 'match_resumed',
      matchId: req.matchId!,
      timestamp: new Date().toISOString(),
      data: {
        displayScore: displayScore!,
      } as MatchResumedData,
    };
    liveEventsService.broadcastToMatch(req.matchId!, event);
    if (req.competitionId) {
      liveEventsService.broadcastToCompetition(req.competitionId, event);
    }

    res.json({ success: true, score: result.data, displayScore });
  } catch (error) {
    console.error('Resume match error:', error);
    res.status(500).json({ error: 'Failed to resume match' });
  }
});

/**
 * POST /api/matches/:matchId/abandon - Abandon match
 */
app.post('/api/matches/:matchId/abandon', requireAuth as any, requireMatchOrganiser as any, async (req: MatchRequest, res: Response) => {
  try {
    const { reason } = req.body as AbandonMatchInput;

    if (!reason) {
      res.status(400).json({ error: 'Reason is required' });
      return;
    }

    const liveScoreService = getLiveScoreService();
    const result = await liveScoreService.abandonMatch(req.matchId!, { reason });

    if (!result.success) {
      res.status(400).json({ error: result.message, code: result.error });
      return;
    }

    const displayScore = await liveScoreService.getDisplayScore(req.matchId!);
    const liveEventsService = getLiveEventsService();
    const event: LiveEvent = {
      type: 'match_abandoned',
      matchId: req.matchId!,
      timestamp: new Date().toISOString(),
      data: {
        reason,
        displayScore: displayScore!,
      } as MatchAbandonedData,
    };
    liveEventsService.broadcastToMatch(req.matchId!, event);
    if (req.competitionId) {
      liveEventsService.broadcastToCompetition(req.competitionId, event);
    }

    res.json({ success: true, score: result.data, displayScore });
  } catch (error) {
    console.error('Abandon match error:', error);
    res.status(500).json({ error: 'Failed to abandon match' });
  }
});

/**
 * GET /api/matches/:matchId/history - Get point history
 */
app.get('/api/matches/:matchId/history', requireAuth as any, requireMatchOrganiser as any, async (req: MatchRequest, res: Response) => {
  try {
    const liveScoreService = getLiveScoreService();
    const history = await liveScoreService.getPointHistory(req.matchId!);

    res.json({ history });
  } catch (error) {
    console.error('Get point history error:', error);
    res.status(500).json({ error: 'Failed to get point history' });
  }
});

// ==================== SSE Stream Endpoints (Epic 6) ====================

/**
 * GET /api/live/matches/:matchId/stream - SSE stream for a single match (authenticated)
 */
app.get('/api/live/matches/:matchId/stream', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { matchId } = req.params;

    const drawService = getDrawService();
    const match = await drawService.getMatch(matchId);
    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const liveEventsService = getLiveEventsService();
    liveEventsService.setupSSEResponse(res);

    const clientId = uuidv4();
    liveEventsService.addClient(clientId, res, matchId);

    const liveScoreService = getLiveScoreService();
    const displayScore = await liveScoreService.getDisplayScore(matchId);
    if (displayScore) {
      const event: LiveEvent = {
        type: 'score_change',
        matchId,
        timestamp: new Date().toISOString(),
        data: {
          pointWinner: 0 as any,
          displayScore,
          isBreakPoint: false,
          isSetPoint: false,
          isMatchPoint: false,
        } as ScoreChangeData,
      };
      liveEventsService.sendEvent(res, event);
    }
  } catch (error) {
    console.error('SSE stream error:', error);
    res.status(500).json({ error: 'Failed to establish stream' });
  }
});

/**
 * GET /api/live/competitions/:competitionId/stream - SSE stream for all matches in a competition (authenticated)
 */
app.get('/api/live/competitions/:competitionId/stream', requireAuth as any, requireCompetitionAccess as any, async (req: CompetitionRequest, res: Response) => {
  try {
    const { competitionId } = req.params;

    const liveEventsService = getLiveEventsService();
    liveEventsService.setupSSEResponse(res);

    const clientId = uuidv4();
    liveEventsService.addClient(clientId, res, undefined, competitionId);

    const liveScoreService = getLiveScoreService();
    const liveMatches = await liveScoreService.getLiveMatchesForCompetition(competitionId);

    for (const score of liveMatches) {
      const displayScore = await liveScoreService.getDisplayScore(score.matchId);
      if (displayScore) {
        const event: LiveEvent = {
          type: 'score_change',
          matchId: score.matchId,
          timestamp: new Date().toISOString(),
          data: {
            pointWinner: 0 as any,
            displayScore,
            isBreakPoint: false,
            isSetPoint: false,
            isMatchPoint: false,
          } as ScoreChangeData,
        };
        liveEventsService.sendEvent(res, event);
      }
    }
  } catch (error) {
    console.error('SSE stream error:', error);
    res.status(500).json({ error: 'Failed to establish stream' });
  }
});

// ==================== Public Live Scoring Endpoints (Epic 6) ====================

/**
 * GET /api/public/live/competitions/:slug - Get all live matches for a published competition
 */
app.get('/api/public/live/competitions/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const competitionService = getCompetitionService();
    const competition = await competitionService.getPublicCompetition(slug);

    if (!competition) {
      res.status(404).json({ error: 'Competition not found' });
      return;
    }

    const liveScoreService = getLiveScoreService();
    const liveMatches = await liveScoreService.getLiveMatchesForCompetition(competition.id);

    const matches = await Promise.all(
      liveMatches.map(async (score) => {
        const displayScore = await liveScoreService.getDisplayScore(score.matchId);
        return { ...score, displayScore };
      })
    );

    res.json({ competition: { id: competition.id, name: competition.name }, liveMatches: matches });
  } catch (error) {
    console.error('Get public live matches error:', error);
    res.status(500).json({ error: 'Failed to get live matches' });
  }
});

/**
 * GET /api/public/live/matches/:matchId - Get live score for a single match (public)
 */
app.get('/api/public/live/matches/:matchId', async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;

    const drawService = getDrawService();
    const match = await drawService.getMatch(matchId);

    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const db = (await import('./db/database.js')).getDatabase();
    const drawRow = db.prepare('SELECT division_id FROM draws WHERE id = ?').get(match.drawId) as { division_id: string } | undefined;
    if (!drawRow) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const divisionRow = db.prepare('SELECT competition_id FROM divisions WHERE id = ?').get(drawRow.division_id) as { competition_id: string } | undefined;
    if (!divisionRow) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const competitionService = getCompetitionService();
    const competition = await competitionService.getCompetition(divisionRow.competition_id);
    if (!competition || competition.status === 'draft') {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const liveScoreService = getLiveScoreService();
    const score = await liveScoreService.getLiveScore(matchId);
    const displayScore = await liveScoreService.getDisplayScore(matchId);
    const matchMeta = await getMatchMetadata(matchId);

    res.json({ score, displayScore, match: matchMeta });
  } catch (error) {
    console.error('Get public live score error:', error);
    res.status(500).json({ error: 'Failed to get live score' });
  }
});

/**
 * GET /api/public/live/matches/:matchId/stream - Public SSE stream for a match
 */
app.get('/api/public/live/matches/:matchId/stream', async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;

    const drawService = getDrawService();
    const match = await drawService.getMatch(matchId);

    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const db = (await import('./db/database.js')).getDatabase();
    const drawRow = db.prepare('SELECT division_id FROM draws WHERE id = ?').get(match.drawId) as { division_id: string } | undefined;
    if (!drawRow) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const divisionRow = db.prepare('SELECT competition_id FROM divisions WHERE id = ?').get(drawRow.division_id) as { competition_id: string } | undefined;
    if (!divisionRow) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const competitionService = getCompetitionService();
    const competition = await competitionService.getCompetition(divisionRow.competition_id);
    if (!competition || competition.status === 'draft') {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const liveEventsService = getLiveEventsService();
    liveEventsService.setupSSEResponse(res);

    const clientId = uuidv4();
    liveEventsService.addClient(clientId, res, matchId);

    const liveScoreService = getLiveScoreService();
    const displayScore = await liveScoreService.getDisplayScore(matchId);
    if (displayScore) {
      const event: LiveEvent = {
        type: 'score_change',
        matchId,
        timestamp: new Date().toISOString(),
        data: {
          pointWinner: 0 as any,
          displayScore,
          isBreakPoint: false,
          isSetPoint: false,
          isMatchPoint: false,
        } as ScoreChangeData,
      };
      liveEventsService.sendEvent(res, event);
    }
  } catch (error) {
    console.error('Public SSE stream error:', error);
    res.status(500).json({ error: 'Failed to establish stream' });
  }
});

/**
 * GET /api/public/competitions/:slug/bracket - Get bracket data for a published competition
 */
app.get('/api/public/competitions/:slug/bracket', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const competitionService = getCompetitionService();
    const competition = await competitionService.getPublicCompetition(slug);

    if (!competition) {
      res.status(404).json({ error: 'Competition not found' });
      return;
    }

    const divisions = await competitionService.getDivisions(competition.id);
    const drawService = getDrawService();

    // Collect all matches across divisions/draws, grouped by round
    const allMatches: any[] = [];
    let isDoubleElimination = false;
    for (const division of divisions) {
      const draws = await drawService.getDivisionDraws(division.id);
      for (const draw of draws) {
        if (draw.drawType === 'double_elimination') isDoubleElimination = true;
        const matches = await drawService.getDrawMatchesWithNames(draw.id);
        allMatches.push(...matches.map(m => ({ ...m, divisionName: division.name })));
      }
    }

    // Helper to transform a match to bracket format
    const transformBracketMatch = (match: any) => {
      let e1Score: string | null = null;
      let e2Score: string | null = null;
      if (match.score && Array.isArray(match.score)) {
        let s1 = 0, s2 = 0;
        for (const set of match.score) {
          if (Array.isArray(set)) { s1 += set[0] || 0; s2 += set[1] || 0; }
        }
        e1Score = String(s1);
        e2Score = String(s2);
      } else if (match.entry1Score != null || match.entry2Score != null) {
        e1Score = match.entry1Score != null ? String(match.entry1Score) : null;
        e2Score = match.entry2Score != null ? String(match.entry2Score) : null;
      }

      return {
        id: match.id,
        round: match.roundNumber || 1,
        position: match.matchNumber || 1,
        bracket: match.bracket || 'winners',
        entry1Name: match.entry1Name || null,
        entry2Name: match.entry2Name || null,
        entry1Score: e1Score,
        entry2Score: e2Score,
        winnerId: match.winnerEntryId || null,
        status: match.status === 'pending' || match.status === 'scheduled' || match.status === 'not_started'
          ? 'upcoming' : match.status === 'in_progress' ? 'in_progress' : 'completed',
      };
    };

    // Group matches into rounds
    const groupByRound = (matches: any[]) => {
      const roundMap = new Map<number, any[]>();
      for (const match of matches) {
        const round = match.roundNumber || 1;
        if (!roundMap.has(round)) roundMap.set(round, []);
        roundMap.get(round)!.push(transformBracketMatch(match));
      }
      const sortedRounds = [...roundMap.keys()].sort((a, b) => a - b);
      return sortedRounds.map(r => roundMap.get(r)!);
    };

    let bracket: any;
    if (isDoubleElimination) {
      const wbMatches = allMatches.filter(m => m.bracket === 'winners');
      const lbMatches = allMatches.filter(m => m.bracket === 'losers');
      const gfMatches = allMatches.filter(m => m.bracket === 'grand_final');

      bracket = {
        format: 'double_elimination',
        rounds: groupByRound(allMatches),
        winnersBracket: groupByRound(wbMatches),
        losersBracket: groupByRound(lbMatches),
        grandFinal: gfMatches.map(transformBracketMatch),
      };
    } else {
      const rounds = groupByRound(allMatches);
      bracket = rounds.length > 0 ? { format: competition.format || 'knockout', rounds } : undefined;
    }

    res.json({
      competition: { id: competition.id, name: competition.name, format: competition.format },
      bracket,
    });
  } catch (error) {
    console.error('Get public bracket error:', error);
    res.status(500).json({ error: 'Failed to get bracket' });
  }
});

/**
 * GET /api/public/competitions/:slug/standings - Get standings for a published competition (round robin)
 */
app.get('/api/public/competitions/:slug/standings', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const competitionService = getCompetitionService();
    const competition = await competitionService.getPublicCompetition(slug);

    if (!competition) {
      res.status(404).json({ error: 'Competition not found' });
      return;
    }

    const divisions = await competitionService.getDivisions(competition.id);
    const drawService = getDrawService();

    const standingsData = await Promise.all(
      divisions.map(async (division) => {
        const draws = await drawService.getDivisionDraws(division.id);
        const roundRobinDraws = draws.filter(d => d.drawType === 'round_robin');

        // Flatten all standings entries across draws for this division
        const allEntries: any[] = [];
        for (const draw of roundRobinDraws) {
          const standings = await drawService.getStandings(draw.id);
          allEntries.push(...standings);
        }

        // Transform to StandingsEntry format expected by frontend
        const entries = allEntries.map((s, idx) => ({
          position: s.position || idx + 1,
          entryName: s.entryName || 'Unknown',
          entryId: s.entryId,
          wins: s.wins || 0,
          losses: s.losses || 0,
          gamesFor: s.gamesWon || 0,
          gamesAgainst: s.gamesLost || 0,
          gamesDiff: (s.gamesWon || 0) - (s.gamesLost || 0),
          points: s.points || 0,
        }));

        return { division: division.name, standings: entries };
      })
    );

    res.json({
      competition: { id: competition.id, name: competition.name, format: competition.format },
      standings: standingsData,
    });
  } catch (error) {
    console.error('Get public standings error:', error);
    res.status(500).json({ error: 'Failed to get standings' });
  }
});

/**
 * GET /api/public/matches/:matchId/history - Get point history for a match (public)
 */
app.get('/api/public/matches/:matchId/history', async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;

    const drawService = getDrawService();
    const match = await drawService.getMatch(matchId);

    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const db = (await import('./db/database.js')).getDatabase();
    const drawRow = db.prepare('SELECT division_id FROM draws WHERE id = ?').get(match.drawId) as { division_id: string } | undefined;
    if (!drawRow) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const divisionRow = db.prepare('SELECT competition_id FROM divisions WHERE id = ?').get(drawRow.division_id) as { competition_id: string } | undefined;
    if (!divisionRow) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const competitionService = getCompetitionService();
    const competition = await competitionService.getCompetition(divisionRow.competition_id);
    if (!competition || competition.status === 'draft') {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const liveScoreService = getLiveScoreService();
    const history = await liveScoreService.getPointHistory(matchId);

    res.json({ history });
  } catch (error) {
    console.error('Get public point history error:', error);
    res.status(500).json({ error: 'Failed to get point history' });
  }
});

// Proxy all other requests to Vite dev server
const viteProxy = createProxyMiddleware({
  target: `http://localhost:${VITE_PORT}`,
  changeOrigin: true,
  ws: true, // WebSocket support for HMR
});

app.use('/', viteProxy);

/**
 * Seed demo users into SQLite if they don't exist
 */
async function seedDemoUsers() {
  const userService = getUserService();

  const demoUsers = [
    { email: 'admin@example.com', password: 'admin123', name: 'Admin User' },
    { email: 'demo@example.com', password: 'demo1234', name: 'Demo User' },
  ];

  for (const user of demoUsers) {
    const existing = await userService.findByEmail(user.email);
    if (!existing) {
      const result = await userService.register(user);
      if (!result.success) {
        console.error(`Failed to seed user ${user.email}:`, result.message);
      }
    }
  }
}

/**
 * Seed demo players for a club
 */
async function seedDemoPlayers(clubId: string) {
  const playerService = getPlayerService();

  // Check if players already exist
  const existingPlayers = await playerService.getClubPlayers(clubId);
  if (existingPlayers.length > 0) {
    return existingPlayers;
  }

  const playerNames = [
    'John Smith', 'Emma Wilson', 'Michael Chen', 'Sophie Anderson',
    'David Lee', 'Jessica Taylor', 'Ryan Martinez', 'Olivia Brown',
    'James Johnson', 'Ava Williams', 'Ethan Davis', 'Mia Garcia',
    'Noah Miller', 'Isabella Moore', 'Liam Jackson', 'Charlotte White'
  ];

  const players = [];
  for (const name of playerNames) {
    const email = name.toLowerCase().replace(' ', '.') + '@example.com';
    const result = await playerService.createPlayer(clubId, { name, email });
    if (result) {
      players.push(result);
    }
  }

  return players;
}

/**
 * Seed demo competition with divisions and entries
 */
async function seedDemoCompetition(clubId: string, creatorId: string) {
  const competitionService = getCompetitionService();
  const playerService = getPlayerService();

  // Check if competitions already exist
  const existingComps = await competitionService.getClubCompetitions(clubId, true);
  if (existingComps.length > 0) {
    return;
  }

  // Seed players first
  const players = await seedDemoPlayers(clubId);
  if (players.length < 8) {
    console.log('Not enough players seeded, skipping competition seed');
    return;
  }

  // Create a tournament
  const comp = await competitionService.createCompetition(clubId, {
    name: 'Summer Championship 2026',
    type: 'tournament',
    format: 'knockout',
    registrationMode: 'organizer_only',
    requiresApproval: false,
    scoreEntryMode: 'organisers_only',
    startDate: '2026-02-01',
    endDate: '2026-02-15',
  }, creatorId);

  if (!comp) {
    console.error('Failed to create demo competition');
    return;
  }

  // Create divisions
  const singlesDiv = await competitionService.createDivision(comp.id, {
    name: 'Men\'s Singles',
    format: 'knockout',
  });

  const doublesDiv = await competitionService.createDivision(comp.id, {
    name: 'Women\'s Singles',
    format: 'knockout',
  });

  // Add entries to singles division (8 players)
  if (singlesDiv) {
    for (let i = 0; i < 8 && i < players.length; i++) {
      await playerService.createEntry(singlesDiv.id, {
        entryType: 'singles',
        playerId: players[i].id,
        seed: i < 4 ? i + 1 : undefined, // Seed top 4
      });
    }
  }

  // Add entries to women's singles (6 players - to test byes)
  if (doublesDiv) {
    for (let i = 8; i < 14 && i < players.length; i++) {
      await playerService.createEntry(doublesDiv.id, {
        entryType: 'singles',
        playerId: players[i].id,
        seed: i < 10 ? i - 7 : undefined,
      });
    }
  }

  // Publish the competition
  await competitionService.publishCompetition(comp.id);

  console.log(`   - ${comp.name} (with ${singlesDiv ? '8' : '0'} + ${doublesDiv ? '6' : '0'} entries)`);
}

/**
 * Seed demo clubs for demo users if they don't have any
 */
async function seedDemoClubs() {
  const userService = getUserService();
  const clubService = getClubService();

  // Get admin user
  const adminUser = await userService.findByEmail('admin@example.com');
  if (!adminUser) {
    console.error('Admin user not found for club seeding');
    return;
  }

  // Check if admin already has clubs
  const existingClubs = await clubService.getUserClubs(adminUser.id);
  if (existingClubs.length > 0) {
    return; // Already has clubs
  }

  // Create demo clubs
  const demoClubs = [
    { name: 'City Tennis Club', region: 'Metro Area' },
    { name: 'Riverside Squash', region: 'West District' },
  ];

  for (const club of demoClubs) {
    const result = await clubService.createClub(club, adminUser.id);
    if (!result.success) {
      console.error(`Failed to seed club ${club.name}:`, result.message);
    }
  }

  // Also add demo user to the first club
  const demoUser = await userService.findByEmail('demo@example.com');
  if (demoUser) {
    const adminClubs = await clubService.getUserClubs(adminUser.id);
    if (adminClubs.length > 0) {
      // Invite demo user as organiser to first club
      await clubService.createInvite(
        adminClubs[0].clubId,
        { email: demoUser.email, role: 'organiser' },
        adminUser.id
      );
      // Auto-accept the invite (for demo purposes)
      const invites = await clubService.getInvitesForEmail(demoUser.email);
      if (invites.length > 0) {
        await clubService.acceptInvite(invites[0].id, demoUser.id);
      }
    }
  }
}

/**
 * Start the server
 */
async function startServer() {
  let server: https.Server | http.Server;

  if (USE_HTTPS) {
    const certPath = path.join(ROOT_DIR, 'certs', 'localhost.pem');
    const keyPath = path.join(ROOT_DIR, 'certs', 'localhost-key.pem');

    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      console.error('\n❌ HTTPS certificates not found!');
      console.error('\nRun the following commands to generate certificates:');
      console.error('  mkcert -install');
      console.error('  mkdir -p certs');
      console.error('  mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 127.0.0.1\n');
      process.exit(1);
    }

    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };

    server = https.createServer(httpsOptions, app);

    server.listen(HTTPS_PORT, async () => {
      // Seed demo users and clubs if they don't exist
      await seedDemoUsers();
      await seedDemoClubs();

      // Seed demo competition with players and entries
      const userService = getUserService();
      const clubService = getClubService();
      const adminUser = await userService.findByEmail('admin@example.com');
      if (adminUser) {
        const adminClubs = await clubService.getUserClubs(adminUser.id);
        if (adminClubs.length > 0) {
          console.log('\n🎾 Seeding demo data:');
          await seedDemoCompetition(adminClubs[0].clubId, adminUser.id);
        }
      }

      console.log('\n🔐 Dev server running with HTTPS');
      console.log(`   https://localhost:${HTTPS_PORT}\n`);
      console.log('📋 Auth endpoints:');
      console.log(`   POST /auth/register        - Register new user`);
      console.log(`   POST /auth/login           - Login with email/password`);
      console.log(`   POST /auth/logout          - Logout`);
      console.log(`   GET  /auth/me              - Get current user`);
      console.log(`   GET  /auth/profile         - Get full profile`);
      console.log(`   PUT  /auth/profile         - Update profile`);
      console.log(`   POST /auth/change-password - Change password\n`);
      console.log('👤 Demo users:');
      console.log(`   - admin@example.com / admin123`);
      console.log(`   - demo@example.com / demo1234`);
      console.log('\n🏟️  Demo clubs seeded for admin user:');
      console.log('   - City Tennis Club');
      console.log('   - Riverside Squash');
      console.log('\n');
    });
  } else {
    server = http.createServer(app);

    server.listen(HTTPS_PORT, () => {
      console.log(`\n⚠️  Dev server running WITHOUT HTTPS (cookies will not use Secure flag)`);
      console.log(`   http://localhost:${HTTPS_PORT}\n`);
    });
  }
}

startServer();
