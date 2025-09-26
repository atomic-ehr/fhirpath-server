import { describe, it, expect } from 'bun:test';
import {
  extractEvaluationParameters,
  createCorsHeaders
} from '../src/utils';
import type { Parameters } from '../src/types';

describe('extractEvaluationParameters', () => {
  it('parses resource from json-value extension', () => {
    const parameters: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'expression',
          valueString: 'name'
        },
        {
          name: 'resource',
          extension: [
            {
              url: 'http://fhir.forms-lab.com/StructureDefinition/json-value',
              valueString: '{"resourceType":"Patient","id":"example"}'
            }
          ]
        }
      ]
    };

    const extraction = extractEvaluationParameters(parameters);
    expect(extraction.resourceDescriptor?.source).toBe('json-extension');
    expect(extraction.resource?.resourceType).toBe('Patient');
  });
});

describe('createCorsHeaders', () => {
  it('returns allowed origin for known hosts', () => {
    const headers = createCorsHeaders('https://fhirpath-lab.com');
    expect(headers['Access-Control-Allow-Origin']).toBe('https://fhirpath-lab.com');
  });

  it('allows any localhost origin', () => {
    const headers = createCorsHeaders('http://localhost:4100');
    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:4100');
  });

  it('defaults to production origin when none provided', () => {
    const headers = createCorsHeaders();
    expect(headers['Access-Control-Allow-Origin']).toBe('https://fhirpath-lab.com');
  });
});
