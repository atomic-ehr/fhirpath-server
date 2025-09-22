// Multi-version FHIR support manager

import { FHIRModelProvider, type FHIRModelProviderConfig } from '@atomic-ehr/fhirpath';
import type { FHIRVersion, FHIRVersionConfig, ServerConfig } from './types.js';

export class FHIRVersionManager {
  private modelProviders = new Map<FHIRVersion, FHIRModelProvider>();
  private initializationPromises = new Map<FHIRVersion, Promise<void>>();
  private initialized = false;

  constructor(private config: ServerConfig) { }

  /**
   * Initialize all FHIR version model providers in parallel
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🚀 Initializing FHIR version support...');

    // Create initialization promises for all versions
    const initPromises = Object.entries(this.config.fhirVersions).map(
      async ([version, config]) => {
        const fhirVersion = version as FHIRVersion;
        console.log(`📚 Setting up FHIR ${fhirVersion.toUpperCase()} model provider...`);

        try {
          const modelProvider = new FHIRModelProvider(config as FHIRModelProviderConfig);
          this.modelProviders.set(fhirVersion, modelProvider);

          // Store initialization promise
          const initPromise = modelProvider.initialize();
          this.initializationPromises.set(fhirVersion, initPromise);

          await initPromise;
          console.log(`✅ FHIR ${fhirVersion.toUpperCase()} model provider ready`);
        } catch (error) {
          console.error(`❌ Failed to initialize FHIR ${fhirVersion.toUpperCase()}:`, error);
          throw error;
        }
      }
    );

    // Wait for all versions to initialize
    await Promise.all(initPromises);
    this.initialized = true;
    console.log('🎉 All FHIR versions initialized successfully');
  }

  /**
   * Get model provider for a specific FHIR version
   */
  getModelProvider(version: FHIRVersion): FHIRModelProvider | undefined {
    return this.modelProviders.get(version);
  }

  /**
   * Check if a specific FHIR version is supported
   */
  isVersionSupported(version: string): version is FHIRVersion {
    return ['r4', 'r5', 'r6'].includes(version);
  }

  /**
   * Extract FHIR version from URL path
   */
  extractVersionFromPath(pathname: string): FHIRVersion | null {
    const versionMatch = pathname.match(/(r[456])/);
    if (versionMatch?.[1] && this.isVersionSupported(versionMatch[1])) {
      return versionMatch[1] as FHIRVersion;
    }
    return null;
  }

  /**
   * Auto-detect FHIR version from resource metadata
   */
  detectVersionFromResource(resource: any): FHIRVersion | null {
    // Check meta.profile for version hints
    if (resource.meta?.profile) {
      for (const profile of resource.meta.profile) {
        if (profile.includes('/r4/')) return 'r4';
        if (profile.includes('/r5/')) return 'r5';
        if (profile.includes('/r6/')) return 'r6';
      }
    }

    return 'r4';
  }

  /**
   * Get all supported FHIR versions
   */
  getSupportedVersions(): FHIRVersion[] {
    return Array.from(this.modelProviders.keys());
  }

  /**
   * Get version configuration
   */
  getVersionConfig(version: FHIRVersion): FHIRVersionConfig | undefined {
    return this.config.fhirVersions[version];
  }

  /**
   * Check if manager is fully initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Wait for a specific version to be initialized
   */
  async waitForVersion(version: FHIRVersion): Promise<void> {
    const initPromise = this.initializationPromises.get(version);
    if (initPromise) {
      await initPromise;
    } else if (!this.modelProviders.has(version)) {
      throw new Error(`FHIR version ${version} is not configured`);
    }
  }
}

// Default configuration for all supported FHIR versions
export const defaultServerConfig: ServerConfig = {
  port: parseInt(process.env.PORT || '4000'),
  fhirVersions: {
    r4: {
      packages: [{ name: 'hl7.fhir.r4.core', version: '4.0.1' }],
      cacheDir: './tmp/.fhir-cache-r4'
    },
    r5: {
      packages: [{ name: 'hl7.fhir.r5.core', version: '5.0.0' }],
      cacheDir: './tmp/.fhir-cache-r5'
    },
    r6: {
      packages: [{ name: 'hl7.fhir.r6.core', version: '6.0.0-ballot3' }],
      cacheDir: './tmp/.fhir-cache-r6'
    }
  }
};