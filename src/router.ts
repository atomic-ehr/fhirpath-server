// URL routing logic for Bun server

import type { RouteHandler, RouteContext } from './types.js';
import {
  createJsonResponse,
  createErrorResponse,
  logRequest,
  createCorsHeaders
} from './utils.js';

export class Router {
  private routes = new Map<string, Map<string, RouteHandler>>();

  /**
   * Add a route handler
   */
  add(method: string, path: string, handler: RouteHandler): void {
    if (!this.routes.has(method)) {
      this.routes.set(method, new Map());
    }
    const existed = this.routes.get(method)
    if (existed) {
      this.routes.get(method)?.set(path, handler);
    }
  }

  /**
   * Add GET route
   */
  get(path: string, handler: RouteHandler): void {
    this.add('GET', path, handler);
  }

  /**
   * Add POST route
   */
  post(path: string, handler: RouteHandler): void {
    this.add('POST', path, handler);
  }

  /**
   * Add OPTIONS route (for CORS)
   */
  options(path: string, handler: RouteHandler): void {
    this.add('OPTIONS', path, handler);
  }

  /**
   * Handle incoming request
   */
  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // Log the request
    logRequest(request, url);

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: createCorsHeaders(origin)
      });
    }

    // Find matching route
    const methodRoutes = this.routes.get(request.method);
    if (!methodRoutes) {
      return createErrorResponse('error', 'not-found', `Method ${request.method} not allowed`, 405);
    }

    // Exact path match first
    let handler = methodRoutes.get(url.pathname);

    // Pattern matching for parameterized routes
    if (!handler) {
      for (const [routePath, routeHandler] of methodRoutes) {
        const params = this.matchRoute(routePath, url.pathname);
        if (params !== null) {
          handler = routeHandler;
          // Add params to context (if needed for future use)
          break;
        }
      }
    }

    if (!handler) {
      return createErrorResponse('error', 'not-found', `Route not found: ${url.pathname}`, 404);
    }

    try {
      const context: RouteContext = {
        url,
        request,
        params: {}
      };

      const response = await handler(context);
      const headers = new Headers(response.headers);
      const corsHeaders = createCorsHeaders(origin);
      for (const [key, value] of Object.entries(corsHeaders)) {
        headers.set(key, value);
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (error) {
      console.error('Route handler error:', error);
      const errorResponse = createErrorResponse(
        'error',
        'exception',
        `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
      const headers = new Headers(errorResponse.headers);
      const corsHeaders = createCorsHeaders(origin);
      for (const [key, value] of Object.entries(corsHeaders)) {
        headers.set(key, value);
      }

      return new Response(errorResponse.body, {
        status: errorResponse.status,
        statusText: errorResponse.statusText,
        headers
      });
    }
  }

  /**
   * Simple route pattern matching (for future parameterized routes)
   */
  private matchRoute(pattern: string, path: string): Record<string, string> | null {
    // For now, just exact match - can be extended for :param patterns
    if (pattern === path) {
      return {};
    }
    return null;
  }
}

/**
 * Create default router with common routes
 */
export function createDefaultRouter(): Router {
  const router = new Router();

  // Health check endpoint
  router.get('/health', () => {
    return createJsonResponse({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0'
    });
  });

  // API information endpoint
  router.get('/', () => {
    return createJsonResponse({
      name: 'FHIRPath Server',
      description: 'Multi-version FHIRPath evaluation server using atomic-ehr/fhirpath',
      version: '1.0.0',
      fhirVersions: ['R4', 'R5', 'R6-ballot-03'],
      endpoints: {
        '/health': 'GET - Health check',
        '/r4': 'POST - Evaluate FHIRPath expressions (FHIR R4)',
        '/r5': 'POST - Evaluate FHIRPath expressions (FHIR R5)',
        '/r6': 'POST - Evaluate FHIRPath expressions (FHIR R6 ballot-03)',
        '/': 'POST - Evaluate FHIRPath expressions (auto-detect version)'
      },
      documentation: 'https://github.com/atomic-ehr/fhirpath-server',
      supportedFeatures: [
        'Multi-version FHIR support (R4, R5, R6)',
        'FHIRPath expression evaluation',
        'Debug tracing and AST generation',
        'Variable substitution',
        'Auto-version detection'
      ]
    });
  });

  return router;
}
