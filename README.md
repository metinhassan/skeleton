# Skeleton App

A TypeScript starter app with secure cookie-based authentication.

## Quick Start

```bash
# Install dependencies
npm install

# Generate HTTPS certificates (requires mkcert)
brew install mkcert
npm run setup:certs

# Start development server
npm run dev
```

Open https://localhost:3000

> Note: You may need to bypass the browser's certificate warning on first visit.

## Demo Credentials

| Email | Password | Roles |
|-------|----------|-------|
| admin@example.com | admin123 | admins, users |
| demo@example.com | demo123 | users |

## Authentication

This app uses server-side authentication with HttpOnly cookies:

- `POST /auth/login` - Login with email/password
- `POST /auth/logout` - Logout (clears session cookie)
- `GET /auth/me` - Get current user info

Session cookies are:
- **HttpOnly** - not accessible via JavaScript
- **Secure** - only sent over HTTPS (in production)
- **SameSite=Lax** - CSRF protection

## Scripts

- `npm run dev` - Start development server (HTTPS on port 3000)
- `npm run build` - Build for production
- `npm run typecheck` - Run TypeScript type checking
