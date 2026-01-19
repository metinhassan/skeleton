/**
 * Simple hash-based router for SPA navigation
 */

export interface Route {
  pattern: RegExp;
  handler: (params: Record<string, string>) => void;
}

export class Router {
  private routes: Route[] = [];
  private defaultHandler: (() => void) | null = null;

  constructor() {
    window.addEventListener('hashchange', () => this.handleRoute());
  }

  /**
   * Register a route with a pattern and handler
   * Pattern uses :param syntax for parameters
   */
  addRoute(path: string, handler: (params: Record<string, string>) => void): void {
    // Convert path pattern to regex
    // e.g., '/clubs/:clubId/matches/:matchId/score' -> /^\/clubs\/([^/]+)\/matches\/([^/]+)\/score$/
    const paramNames: string[] = [];
    const regexPattern = path
      .replace(/:\w+/g, (match) => {
        paramNames.push(match.slice(1));
        return '([^/]+)';
      })
      .replace(/\//g, '\\/');

    const pattern = new RegExp(`^${regexPattern}$`);

    this.routes.push({
      pattern,
      handler: (matches: Record<string, string>) => {
        const params: Record<string, string> = {};
        paramNames.forEach((name, index) => {
          params[name] = matches[`$${index + 1}`] || '';
        });
        handler(params);
      },
    });
  }

  /**
   * Set default handler for when no route matches
   */
  setDefault(handler: () => void): void {
    this.defaultHandler = handler;
  }

  /**
   * Navigate to a path
   */
  navigate(path: string): void {
    window.location.hash = path;
  }

  /**
   * Handle the current route
   */
  handleRoute(): void {
    const hash = window.location.hash.slice(1) || '/';

    for (const route of this.routes) {
      const match = hash.match(route.pattern);
      if (match) {
        const params: Record<string, string> = {};
        match.slice(1).forEach((value, index) => {
          params[`$${index + 1}`] = value;
        });
        route.handler(params);
        return;
      }
    }

    // No route matched, call default handler
    if (this.defaultHandler) {
      this.defaultHandler();
    }
  }

  /**
   * Start the router (handle initial route)
   */
  start(): void {
    this.handleRoute();
  }
}

/**
 * Extract route parameters from a path pattern and actual path
 */
export function extractParams(pattern: string, path: string): Record<string, string> | null {
  const paramNames: string[] = [];
  const regexPattern = pattern
    .replace(/:\w+/g, (match) => {
      paramNames.push(match.slice(1));
      return '([^/]+)';
    })
    .replace(/\//g, '\\/');

  const regex = new RegExp(`^${regexPattern}$`);
  const match = path.match(regex);

  if (!match) return null;

  const params: Record<string, string> = {};
  paramNames.forEach((name, index) => {
    params[name] = match[index + 1];
  });

  return params;
}
