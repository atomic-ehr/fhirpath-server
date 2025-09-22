// Bun server entry point with multi-version FHIRPath support

import { FHIRVersionManager, defaultServerConfig } from './version-manager.js';
import { FHIRPathService } from './fhirpath-service.js';
import { createDefaultRouter } from './router.js';
import { createErrorResponse } from './utils.js';

// Initialize version manager and service
const versionManager = new FHIRVersionManager(defaultServerConfig);
const fhirpathService = new FHIRPathService(versionManager);
const router = createDefaultRouter();

// Add FHIRPath evaluation routes
router.post('/r4', async (ctx) => {
  return fhirpathService.processVersionedRequest(ctx, 'r4');
});

router.post('/r5', async (ctx) => {
  return fhirpathService.processVersionedRequest(ctx, 'r5');
});

router.post('/r6', async (ctx) => {
  return fhirpathService.processVersionedRequest(ctx, 'r6');
});

router.post('/', async (ctx) => {
  return fhirpathService.processAutoVersionRequest(ctx);
});

// Initialize server
async function startServer() {
  try {
    console.log('🚀 Starting FHIRPath Server...');
    console.log('📚 Initializing FHIR model providers...');

    // Initialize all FHIR versions
    await versionManager.initialize();

    console.log('✅ Server initialization complete');
    console.log(`🌐 Server will start on port ${defaultServerConfig.port}`);
    console.log('📋 Supported FHIR versions:', versionManager.getSupportedVersions().map(v => v.toUpperCase()).join(', '));

  } catch (error) {
    console.error('❌ Failed to initialize server:', error);
    process.exit(1);
  }
}

// Start initialization
startServer();

// Bun server configuration
export default {
  port: defaultServerConfig.port,

  async fetch(request: Request): Promise<Response> {
    try {
      // Check if server is ready
      if (!versionManager.isInitialized()) {
        return createErrorResponse(
          'error',
          'not-ready',
          'Server is still initializing FHIR model providers. Please try again in a moment.',
          503
        );
      }

      // Route the request
      return await router.handle(request);

    } catch (error) {
      console.error('Server error:', error);
      return createErrorResponse(
        'error',
        'exception',
        `Server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  },

  // Server lifecycle hooks
  error(error: Error) {
    console.error('Bun server error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};