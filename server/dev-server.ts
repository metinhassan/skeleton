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
import { getUserService } from './services/index.js';

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
