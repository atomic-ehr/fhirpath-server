import {
  evaluate,
  analyze,
  type EvaluationResult as AtomicEvaluationResult,
  type AnalysisResult,
  getVersion as getFhirpathVersion
} from '@atomic-ehr/fhirpath';
import type { FHIRVersionManager } from './version-manager.js';
import type {
  Parameters,
  ParametersParameter,
  FhirResource,
  FHIRVersion,
  RouteContext,
  JsonNode,
  EvaluationParameterExtraction
} from './types.js';
import {
  parseJsonBody,
  validateParametersResource,
  extractEvaluationParameters,
  createFhirResponse,
  createErrorResponse,
  setParameterValue,
  stringifySafe,
  extractFhirVersion
} from './utils.js';
import './trace-hook.js';
import {
  beginTraceCollection,
  endTraceCollection,
  type TraceEntry
} from './trace-collector.js';
import serverPackageJson from '../package.json' assert { type: 'json' };

export class FHIRPathService {
  constructor(private versionManager: FHIRVersionManager) { }

  /**
   * Process FHIRPath evaluation request for a specific version
   */
  async processVersionedRequest(
    ctx: RouteContext,
    targetVersion: FHIRVersion
  ): Promise<Response> {
    try {
      const parsed = await this.parseRequest(ctx.request);
      const validationError = this.validateExtraction(parsed.extraction);
      if (validationError) {
        return validationError;
      }

      await this.versionManager.waitForVersion(targetVersion);
      const modelProvider = this.versionManager.getModelProvider(targetVersion);
      if (!modelProvider) {
        return createErrorResponse(
          'error',
          'not-supported',
          `FHIR version ${targetVersion} is not available`
        );
      }
      const execution = await this.runEvaluation(parsed.extraction, modelProvider);
      const responseParameters = this.buildResponseParameters(
        parsed.inputParameters,
        parsed.extraction,
        execution,
        targetVersion
      );

      return createFhirResponse(responseParameters);

    } catch (error) {
      console.error(`FHIRPath evaluation error (${targetVersion}):`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return createErrorResponse('error', 'exception', `Evaluation failed: ${errorMessage}`);
    }
  }


  async processAutoVersionRequest(ctx: RouteContext): Promise<Response> {
    try {
      const parsed = await this.parseRequest(ctx.request);
      const validationError = this.validateExtraction(parsed.extraction);
      if (validationError) {
        return validationError;
      }

      const detectedVersion =
        extractFhirVersion(ctx.url.pathname, parsed.extraction.resource) ||
        this.versionManager.detectVersionFromResource(parsed.extraction.resource) ||
        'r4';

      await this.versionManager.waitForVersion(detectedVersion);
      const modelProvider = this.versionManager.getModelProvider(detectedVersion);
      if (!modelProvider) {
        return createErrorResponse(
          'error',
          'not-supported',
          `FHIR version ${detectedVersion} is not available`
        );
      }

      const execution = await this.runEvaluation(parsed.extraction, modelProvider);
      const responseParameters = this.buildResponseParameters(
        parsed.inputParameters,
        parsed.extraction,
        execution,
        detectedVersion
      );

      return createFhirResponse(responseParameters);

    } catch (error) {
      console.error('Auto-version detection error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return createErrorResponse('error', 'exception', `Auto-detection failed: ${errorMessage}`);
    }
  }

  private async parseRequest(request: Request): Promise<{
    inputParameters: Parameters;
    extraction: EvaluationParameterExtraction;
  }> {
    const body = await parseJsonBody(request);
    const inputParameters = validateParametersResource(body);
    const extraction = extractEvaluationParameters(inputParameters);
    return { inputParameters, extraction };
  }

  private validateExtraction(extraction: EvaluationParameterExtraction): Response | null {
    if (!extraction.expression) {
      return createErrorResponse('error', 'required', 'Missing required parameter: expression');
    }

    if (!extraction.resourceDescriptor || extraction.resourceDescriptor.source === 'missing') {
      return createErrorResponse('error', 'required', 'Missing required parameter: resource');
    }

    if (!extraction.resource) {
      const reason = extraction.resourceDescriptor.parseError || 'Resource parameter could not be parsed';
      return createErrorResponse('error', 'invalid', reason);
    }

    return null;
  }

  private async runEvaluation(
    extraction: EvaluationParameterExtraction,
    modelProvider: any
  ): Promise<{
    contexts: Array<{
      index: number;
      contextValue: unknown;
      contextLabel?: string;
      expressionResult: AtomicEvaluationResult['value'];
      traces: TraceEntry[];
    }>;
    analysis: AnalysisResult;
    variables: Record<string, any>;
  }> {
    const userVariables = this.extractVariables(extraction.variableParts);
    const resource = extraction.resource!;

    const baseVariableSet: Record<string, any> = {
      ...userVariables,
      resource,
      rootResource: resource
    };

    const analysis = await analyze(extraction.expression ?? '', {
      variables: userVariables,
      modelProvider
    });

    const contexts: Array<{
      index: number;
      contextValue: unknown;
      contextLabel?: string;
      expressionResult: AtomicEvaluationResult['value'];
      traces: TraceEntry[];
    }> = [];


    if (extraction.contextExpression) {
      const contextItems = await evaluate(extraction.contextExpression, {
        input: resource,
        variables: {
          ...baseVariableSet,
          context: resource
        },
        modelProvider,
        includeMetadata: true
      });

      for (const [index, contextItem] of contextItems.entries()) {
        const contextValue = this.unwrapBoxedValue(contextItem);
        beginTraceCollection();
        try {
          const expressionResult = await evaluate(extraction.expression!, {
            input: contextValue,
            variables: {
              ...baseVariableSet,
              context: contextValue
            },
            modelProvider,
            includeMetadata: true
          });
          const traces = endTraceCollection();
          contexts.push({
            index,
            contextValue,
            contextLabel: this.deriveContextLabel(resource, extraction.contextExpression, index, contextItem),
            expressionResult,
            traces
          });
        } catch (error) {
          endTraceCollection();
          throw error;
        }
      }
    } else {
      beginTraceCollection();
      try {
        const expressionResult = await evaluate(extraction.expression ?? '', {
          input: resource,
          variables: {
            ...baseVariableSet,
            context: resource
          },
          modelProvider,
          includeMetadata: true
        });

        contexts.push({
          index: 0,
          contextValue: resource,
          contextLabel: undefined,
          expressionResult,
          traces: endTraceCollection()
        });
      } catch (error) {
        endTraceCollection();
        throw error;
      }
    }

    return {
      contexts,
      analysis,
      variables: userVariables
    };
  }

  /**
   * Extract variables from parameters
   */
  private extractVariables(variablesParam?: ParametersParameter[]): Record<string, any> {
    if (!variablesParam || !Array.isArray(variablesParam)) {
      return {};
    }

    const variables: Record<string, any> = {};

    for (const varParam of variablesParam) {
      let name = varParam.name;

      // Handle escaped variable names (from reference implementation)
      if (name.startsWith('`') && name.endsWith('`')) {
        name = name.slice(1, -1).replace(/\\(u\d{4}|.)/g, (match, submatch) => {
          switch (match) {
            case '\\r': return '\r';
            case '\\n': return '\n';
            case '\\t': return '\t';
            case '\\f': return '\f';
            default:
              if (submatch.length > 1) {
                return String.fromCharCode(Number('0x' + submatch.slice(1)));
              }
              return submatch;
          }
        });
      }

      if (name.startsWith("'") && name.endsWith("'")) {
        name = name.slice(1, -1).replace(/\\(u\d{4}|.)/g, (match, submatch) => {
          switch (match) {
            case '\\r': return '\r';
            case '\\n': return '\n';
            case '\\t': return '\t';
            case '\\f': return '\f';
            default:
              if (submatch.length > 1) {
                return String.fromCharCode(Number('0x' + submatch.slice(1)));
              }
              return submatch;
          }
        });
      }

      variables[name] = varParam.valueString ||
        varParam.valueBoolean ||
        varParam.valueInteger ||
        varParam.valueDecimal ||
        varParam.valueDate ||
        varParam.valueTime ||
        varParam.valueDateTime ||
        varParam.resource;
    }

    return variables;
  }

  private unwrapBoxedValue(item: AtomicEvaluationResult['value'][number] | unknown): unknown {
    if (item && typeof item === 'object' && item !== null) {
      const candidate = item as { value?: unknown };
      if (Object.prototype.hasOwnProperty.call(candidate, 'value')) {
        return candidate.value;
      }
    }
    return item;
  }

  private deriveContextLabel(
    resource: FhirResource,
    contextExpression: string | undefined,
    index: number,
    contextItem?: AtomicEvaluationResult['value'][number]
  ): string | undefined {
    if (!contextExpression) {
      return undefined;
    }

    const boxed = contextItem as unknown as {
      typeInfo?: {
        modelContext?: { path?: string };
      };
    } | undefined;

    const modelPath = boxed?.typeInfo?.modelContext?.path;

    if (modelPath && modelPath.length > 0) {
      return modelPath.includes('[') ? modelPath : `${modelPath}[${index}]`;
    }

    const resourceType = resource.resourceType ?? 'Resource';
    const normalized = contextExpression.trim();
    if (!normalized) {
      return `${resourceType}[${index}]`;
    }
    return `${resourceType}.${normalized}[${index}]`;
  }

  private cloneParameter(parameter: ParametersParameter): ParametersParameter {
    return JSON.parse(JSON.stringify(parameter));
  }

  private getResultPartName(item: AtomicEvaluationResult['value'][number]): string {
    const boxed = item as unknown as {
      typeInfo?: {
        name?: string;
        type?: string;
      };
      value?: unknown;
    } | undefined;
    const typeInfo = boxed?.typeInfo;
    if (typeInfo) {
      if (typeof typeInfo.name === 'string' && typeInfo.name.length > 0) {
        return typeInfo.name.toString().toLowerCase();
      }
      if (typeof typeInfo.type === 'string' && typeInfo.type.length > 0) {
        return typeInfo.type.toString().toLowerCase();
      }
    }

    const value = boxed?.value;
    if (Array.isArray(value)) {
      return 'collection';
    }
    if (value === null || value === undefined) {
      return 'null';
    }
    return typeof value;
  }

  private createResultValuePart(item: AtomicEvaluationResult['value'][number]): ParametersParameter {
    const part: ParametersParameter = {
      name: this.getResultPartName(item)
    };

    setParameterValue(part, item, true);

    if (!part.name) {
      part.name = this.getResultPartName(item);
    }

    return part;
  }

  private createTracePart(trace: TraceEntry): ParametersParameter {
    const traceParameter: ParametersParameter = {
      name: 'trace',
      valueString: trace.label,
      part: []
    };

    for (const value of trace.values) {
      if (traceParameter.part) {
        traceParameter.part.push(this.createResultValuePart(value));
      }
    }

    return traceParameter;
  }

  private buildEvaluatorMetadata(version: FHIRVersion): string {
    const fhirpathVersion = getFhirpathVersion();
    const serverVersion = typeof serverPackageJson.version === 'string'
      ? serverPackageJson.version
      : 'unknown';
    const versionConfig = this.versionManager.getVersionConfig(version);
    const packageDescriptor = versionConfig?.packages?.length
      ? versionConfig.packages.map((pkg) => `${pkg.name}@${pkg.version}`).join(', ')
      : `fhir-${version}`;

    return `@atomic-ehr/fhirpath v${fhirpathVersion} (server v${serverVersion}) using ${packageDescriptor}`;
  }

  /**
   * Transform AST from @atomic-ehr/fhirpath to UI-compatible JsonNode format
   */
  private transformAstToJsonNode(ast: any): JsonNode | null {
    if (!ast || typeof ast !== 'object') {
      return null;
    }

    // The AST is structured as a tree where the top level is typically a Binary operation
    // For Patient.name.given.join(' | '), we need to restructure this to match the expected format
    return this.buildJsonNodeTree(ast);
  }

  /**
   * Build the UI-compatible tree structure recursively
   */
  private buildJsonNodeTree(ast: any): JsonNode | null {
    if (!ast) return null;

    if (ast.type === 'Binary' && ast.operator === '.') {
      // This is a member access operation
      if (ast.right?.type === 'Function') {
        // This is a function call on the left expression
        // e.g., Patient.name.given.join(' | ')
        return this.createFunctionCallNode(ast.left, ast.right);
      } else {
        // This is a simple property access
        // e.g., Patient.name or name.given
        return this.createChildExpressionNode(ast.left, ast.right);
      }
    } else if (ast.type === 'Identifier') {
      return this.createAxisExpressionNode(ast);
    } else if (ast.type === 'Literal') {
      return this.createConstantExpressionNode(ast);
    } else if (ast.type === 'Function') {
      // Standalone function call (shouldn't happen in our case)
      return this.createFunctionCallNode(null, ast);
    }

    return null;
  }

  /**
   * Create a function call node
   */
  private createFunctionCallNode(focus: any, func: any): JsonNode {
    const args: JsonNode[] = [];

    // Add the focus (what the function is called on) as the first argument
    if (focus) {
      const focusNode = this.buildJsonNodeTree(focus);
      if (focusNode) args.push(focusNode);
    }

    // Add function arguments
    if (func.arguments && Array.isArray(func.arguments)) {
      for (const arg of func.arguments) {
        const argNode = this.buildJsonNodeTree(arg);
        if (argNode) args.push(argNode);
      }
    }

    return {
      ExpressionType: 'FunctionCallExpression',
      Name: func.name?.name || func.name || '',
      Arguments: args,
      ReturnType: this.extractReturnType(func)
    };
  }

  /**
   * Create a child expression node (property access)
   */
  private createChildExpressionNode(left: any, right: any): JsonNode {
    const args: JsonNode[] = [];

    const leftNode = this.buildJsonNodeTree(left);
    if (leftNode) args.push(leftNode);

    return {
      ExpressionType: 'ChildExpression',
      Name: right?.name || '',
      Arguments: args,
      ReturnType: this.extractReturnType(right)
    };
  }

  /**
   * Create an axis expression node (typically for root identifiers)
   */
  private createAxisExpressionNode(ast: any): JsonNode {
    const name = ast.name === 'Patient' ? 'builtin.that' : ast.name;

    return {
      ExpressionType: 'AxisExpression',
      Name: name,
      ReturnType: this.extractReturnType(ast)
    };
  }

  /**
   * Create a constant expression node
   */
  private createConstantExpressionNode(ast: any): JsonNode {
    return {
      ExpressionType: 'ConstantExpression',
      Name: `"${ast.value}"`,
      ReturnType: ast.valueType || 'string'
    };
  }


  /**
   * Extract return type from AST node
   */
  private extractReturnType(ast: any): string {
    if (ast.typeInfo) {
      const typeInfo = ast.typeInfo;
      if (typeInfo.name && typeInfo.singleton === false) {
        return `${typeInfo.name}[]`;
      }
      return typeInfo.name || typeInfo.type || '';
    }

    // Default return types based on node type
    switch (ast.type?.toLowerCase()) {
      case 'literal':
        return ast.valueType || 'string';
      case 'identifier':
        return 'Any';
      default:
        return '';
    }
  }

  /**
   * Build response Parameters resource
   */
  private buildResponseParameters(
    _inputParameters: Parameters,
    extraction: EvaluationParameterExtraction,
    execution: {
      contexts: Array<{
        index: number;
        contextValue: unknown;
        contextLabel?: string;
        expressionResult: AtomicEvaluationResult['value'];
        traces: TraceEntry[];
      }>;
      analysis: AnalysisResult;
      variables: Record<string, any>;
    },
    version: FHIRVersion
  ): Parameters {
    const parametersPart: ParametersParameter = {
      name: 'parameters',
      part: [
        {
          name: 'evaluator',
          valueString: this.buildEvaluatorMetadata(version)
        }
      ]
    };

    const parameterParts = parametersPart.part!;

    if (extraction.expressionParameter) {
      parameterParts.push(this.cloneParameter(extraction.expressionParameter));
    }

    if (extraction.contextParameter) {
      parameterParts.push(this.cloneParameter(extraction.contextParameter));
    }

    if (extraction.resourceDescriptor?.parameter) {
      parameterParts.push(this.cloneParameter(extraction.resourceDescriptor.parameter));
    } else if (extraction.resource) {
      parameterParts.push({ name: 'resource', resource: extraction.resource });
    }

    if (extraction.variablesParameter) {
      parameterParts.push(this.cloneParameter(extraction.variablesParameter));
    }

    for (const params of Object.values(extraction.additionalInputs)) {
      for (const param of params) {
        parameterParts.push(this.cloneParameter(param));
      }
    }

    if (extraction.terminologyServer) {
      parameterParts.push({
        name: 'terminologyServerStatus',
        valueString: 'terminologyServer parameter captured for future use'
      });
    }

    // Attach AST visualization if available
    if (execution.analysis?.ast) {
      const transformedAst = this.transformAstToJsonNode(execution.analysis.ast);
      if (transformedAst) {
        parameterParts.push({
          name: 'parseDebugTree',
          valueString: stringifySafe(transformedAst, 2)
        });
      }
    }

    const hasExpectedReturnType = parameterParts.some(part => part.name === 'expectedReturnType');
    if (!hasExpectedReturnType && execution.analysis?.type) {
      const analysisType = execution.analysis.type as unknown as {
        name?: string;
        type?: string;
      };
      const returnType = analysisType.name ?? analysisType.type;
      if (returnType) {
        parameterParts.push({
          name: 'expectedReturnType',
          valueString: String(returnType)
        });
      }
    }

    if (execution.analysis?.diagnostics?.length) {
      for (const diagnostic of execution.analysis.diagnostics) {
        parameterParts.push({
          name: 'analysis-diagnostic',
          valueString: stringifySafe(diagnostic)
        });
      }
    }

    const responseParameters: Parameters = {
      resourceType: 'Parameters',
      parameter: [parametersPart]
    };

    // Add result parameters per context
    if (execution.contexts.length > 0) {
      for (const context of execution.contexts) {
        const resultParameter: ParametersParameter = {
          name: 'result',
          part: []
        };

        if (context.contextLabel) {
          resultParameter.valueString = context.contextLabel;
        }

        const valueParts = resultParameter.part!;
        for (const item of context.expressionResult) {
          valueParts.push(this.createResultValuePart(item));
        }

        if (context.traces.length > 0) {
          for (const trace of context.traces) {
            valueParts.push(this.createTracePart(trace));
          }
        }

        if (responseParameters.parameter) {
          responseParameters.parameter.push(resultParameter);
        }
      }
    } else {
      // No contexts - add empty result
      if (responseParameters.parameter) {
        responseParameters.parameter.push({
          name: 'result',
          part: []
        });
      }
    }

    // Debug trace placeholder to surface analyzer diagnostics until full tracing is implemented
    if (execution.analysis?.diagnostics?.length) {
      const debugTrace: ParametersParameter = {
        name: 'debug-trace',
        part: execution.analysis.diagnostics.map((diagnostic: any) => ({
          name: 'diagnostic',
          valueString: stringifySafe(diagnostic)
        }))
      };

      if (responseParameters.parameter) {
        responseParameters.parameter.push(debugTrace);
      }
    }

    return responseParameters;
  }
}
