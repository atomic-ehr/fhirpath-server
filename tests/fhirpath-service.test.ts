import { describe, it, expect } from 'bun:test';
import { FHIRPathService } from '../src/fhirpath-service';
import type { FHIRVersionManager } from '../src/version-manager.js';
import type { EvaluationParameterExtraction, Parameters, ParametersParameter, FHIRVersion } from '../src/types';
import type { AnalysisResult } from '@atomic-ehr/fhirpath';
import type { TraceEntry } from '../src/trace-collector';

class StubVersionManager {
  getVersionConfig(_version: FHIRVersion) {
    return {
      packages: [{ name: 'hl7.fhir.r4.core', version: '4.0.1' }]
    };
  }
}

describe('FHIRPathService response assembly', () => {
  const versionManager = new StubVersionManager() as unknown as FHIRVersionManager;
  const service = new FHIRPathService(versionManager);

  const resource = {
    resourceType: 'Patient',
    id: 'example',
    name: [{ given: ['Peter'] }]
  };

  const expressionParam: ParametersParameter = { name: 'expression', valueString: 'name.given' };
  const contextParam: ParametersParameter = { name: 'context', valueString: 'name' };
  const resourceParam: ParametersParameter = { name: 'resource', resource };

  const extraction: EvaluationParameterExtraction = {
    expression: 'name.given',
    expressionParameter: expressionParam,
    contextExpression: 'name',
    contextParameter: contextParam,
    resource,
    resourceDescriptor: {
      source: 'inline-resource',
      parameter: resourceParam
    },
    variablesParameter: undefined,
    variableParts: undefined,
    terminologyServer: undefined,
    expectedReturnType: undefined,
    validate: undefined,
    additionalInputs: {}
  };

  const boxedString = (value: string) => ({
    value,
    typeInfo: { name: 'string', singleton: true }
  }) as any;

  const traces: TraceEntry[] = [
    {
      label: 'trace-label',
      values: [boxedString('Peter')],
      timestamp: Date.now()
    }
  ];

  const execution = {
    contexts: [
      {
        index: 0,
        contextValue: resource.name[0],
        contextLabel: 'Patient.name[0]',
        expressionResult: [boxedString('Peter')],
        traces
      }
    ],
    analysis: {
      ast: { type: 'Identifier', name: 'Patient' }
    } as AnalysisResult,
    variables: {}
  };

  const inputParameters: Parameters = {
    resourceType: 'Parameters',
    parameter: [expressionParam, contextParam, resourceParam]
  };

  it('emits result parameter per context with traces and evaluator metadata', () => {
    const response = (service as any).buildResponseParameters(
      inputParameters,
      extraction,
      execution,
      'r4'
    ) as Parameters;

    const parametersPart = response.parameter?.find(param => param.name === 'parameters');
    expect(parametersPart).toBeDefined();
    const evaluatorPart = parametersPart?.part?.find(part => part.name === 'evaluator');
    expect(evaluatorPart?.valueString).toContain('@atomic-ehr/fhirpath');

    const resultPart = response.parameter?.find(param => param.name === 'result');
    expect(resultPart?.valueString).toBe('Patient.name[0]');
    const resultValue = resultPart?.part?.find(part => part.name === 'string');
    expect(resultValue?.valueString).toBe('Peter');

    const tracePart = resultPart?.part?.find(part => part.name === 'trace');
    expect(tracePart?.valueString).toBe('trace-label');
    expect(tracePart?.part?.[0]?.name).toBe('string');
    expect(tracePart?.part?.[0]?.valueString).toBe('Peter');
  });
});
