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
import { getUserService, getClubService, getCompetitionService } from './services/index.js';
import type { ClubRole } from './services/club-service.js';
import type { CompetitionFormat, CompetitionType, ScoreEntryMode } from './services/competition-service.js';

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
    password: 'demo123',
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
    res.json({
      authenticated: true,
      user: {
        id: context.sub,
        email: context.email,
        roles: context.roles,
        name: context.claims.name,
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

    if (invite.email.toLowerCase() !== req.user!.email.toLowerCase()) {
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
 * GET /api/competitions/:competitionId - Get competition details
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
 * PUT /api/competitions/:competitionId - Update competition
 */
app.put('/api/competitions/:competitionId', requireAuth as any, requireCompetitionOrganiser as any, async (req: CompetitionRequest, res: Response) => {
  try {
    const { name, type, format, scoreEntryMode, defaultScoringRuleId, startDate, endDate } = req.body;

    const competitionService = getCompetitionService();
    const result = await competitionService.updateCompetition(
      req.competitionId!,
      { name, type, format, scoreEntryMode, defaultScoringRuleId, startDate, endDate },
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
    { email: 'demo@example.com', password: 'demo123', name: 'Demo User' },
  ];

  for (const user of demoUsers) {
    const existing = await userService.findByEmail(user.email);
    if (!existing) {
      await userService.register(user);
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
      // Seed demo users if they don't exist
      await seedDemoUsers();

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
      console.log(`   - demo@example.com / demo123`);
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
