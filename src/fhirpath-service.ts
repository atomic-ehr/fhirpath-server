import { evaluate, analyze, type EvaluateOptions, type EvaluationResult as AtomicEvaluationResult } from '@atomic-ehr/fhirpath';
import type { FHIRVersionManager } from './version-manager.js';
import type {
  Parameters,
  ParametersParameter,
  FhirResource,
  FHIRVersion,
  RouteContext,
  JsonNode
} from './types.js';
import {
  parseJsonBody,
  validateParametersResource,
  extractParameters,
  createFhirResponse,
  createErrorResponse,
  setParameterValue,
  stringifySafe,
  extractFhirVersion
} from './utils.js';

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
      // Wait for the specific version to be initialized
      await this.versionManager.waitForVersion(targetVersion);

      // Parse and validate request
      const body = await parseJsonBody(ctx.request);

      const inputParameters = validateParametersResource(body);

      // Extract parameters
      const params = extractParameters(inputParameters);

      // Validate required parameters
      if (!params.expression) {
        return createErrorResponse('error', 'required', 'Missing required parameter: expression');
      }

      if (!params.resource) {
        return createErrorResponse('error', 'required', 'Missing required parameter: resource');
      }
      // Get the model provider for this version
      const modelProvider = this.versionManager.getModelProvider(targetVersion);
      if (!modelProvider) {
        return createErrorResponse(
          'error',
          'not-supported',
          `FHIR version ${targetVersion} is not available`
        );
      }

      // Handle context parameter - if provided, use it as input; otherwise use the full resource
      let evaluationInput = params.resource;
      if (params.context) {
        // Pre-evaluate the context against the resource to get the starting point for evaluation
        const contextResult = await evaluate(params.context as string, {
          input: params.resource,
          variables: this.extractVariables(params.variables),
          modelProvider
        });
        // Use the context evaluation result as input, or fall back to resource if context is empty
        evaluationInput = contextResult && contextResult.length > 0 ? contextResult[0] : params.resource;
      }

      // Prepare evaluation options
      const evaluationOptions: EvaluateOptions = {
        input: evaluationInput,
        variables: this.extractVariables(params.variables),
        modelProvider,
        includeMetadata: true,
      };

      // Evaluate the FHIRPath expression
      const result = await evaluate(params.expression as string, evaluationOptions);

      // Analyze the expression for AST
      const analysisResult = await analyze(params.expression as string, {
        variables: evaluationOptions.variables,
        modelProvider
      });

      // Build response parameters
      const responseParameters = this.buildResponseParameters(
        inputParameters,
        params.expression as string,
        params.resource as FhirResource,
        result,
        analysisResult,
        targetVersion
      );

      return createFhirResponse(responseParameters);

    } catch (error) {
      console.error(`FHIRPath evaluation error (${targetVersion}):`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return createErrorResponse('error', 'exception', `Evaluation failed: ${errorMessage}`);
    }
  }

  /**
   * Process FHIRPath request with auto-version detection
   */
  async processAutoVersionRequest(ctx: RouteContext): Promise<Response> {
    try {
      // Parse request to detect version
      const body = await parseJsonBody(ctx.request);
      const inputParameters = validateParametersResource(body);
      const params = extractParameters(inputParameters);

      // Try to detect FHIR version
      const detectedVersion = extractFhirVersion(ctx.url.pathname, params.resource) ||
        this.versionManager.detectVersionFromResource(params.resource) ||
        'r4'; // Default to R4

      console.log(`Auto-detected FHIR version: ${detectedVersion}`);

      // Process with detected version using already parsed data
      return this.processWithParsedData(inputParameters, params, detectedVersion);

    } catch (error) {
      console.error('Auto-version detection error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return createErrorResponse('error', 'exception', `Auto-detection failed: ${errorMessage}`);
    }
  }

  /**
   * Process FHIRPath evaluation with already parsed data
   */
  private async processWithParsedData(
    inputParameters: Parameters,
    params: Record<string, any>,
    targetVersion: FHIRVersion
  ): Promise<Response> {
    try {
      // Wait for the specific version to be initialized
      await this.versionManager.waitForVersion(targetVersion);

      // Validate required parameters
      if (!params.expression) {
        return createErrorResponse('error', 'required', 'Missing required parameter: expression');
      }

      if (!params.resource) {
        return createErrorResponse('error', 'required', 'Missing required parameter: resource');
      }

      // Get the model provider for this version
      const modelProvider = this.versionManager.getModelProvider(targetVersion);
      if (!modelProvider) {
        return createErrorResponse(
          'error',
          'not-supported',
          `FHIR version ${targetVersion} is not available`
        );
      }

      // Handle context parameter - if provided, use it as input; otherwise use the full resource
      let evaluationInput = params.resource;
      if (params.context) {
        // Pre-evaluate the context against the resource to get the starting point for evaluation
        const contextResult = await evaluate(params.context as string, {
          input: params.resource,
          variables: this.extractVariables(params.variables),
          modelProvider
        });
        // Use the context evaluation result as input, or fall back to resource if context is empty
        evaluationInput = contextResult && contextResult.length > 0 ? contextResult[0] : params.resource;
      }

      // Prepare evaluation options
      const evaluationOptions: EvaluateOptions = {
        input: evaluationInput,
        variables: this.extractVariables(params.variables),
        modelProvider
      };

      // Evaluate the FHIRPath expression
      const result = await evaluate(params.expression as string, evaluationOptions);
      // Analyze the expression for AST
      const analysisResult = await analyze(params.expression as string, {
        variables: evaluationOptions.variables,
        modelProvider
      });

      // Build response parameters
      const responseParameters = this.buildResponseParameters(
        inputParameters,
        params.expression as string,
        params.resource as FhirResource,
        result,
        analysisResult,
        targetVersion
      );

      return createFhirResponse(responseParameters);

    } catch (error) {
      console.error(`FHIRPath evaluation error (${targetVersion}):`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return createErrorResponse('error', 'exception', `Evaluation failed: ${errorMessage}`);
    }
  }

  /**
   * Extract variables from parameters
   */
  private extractVariables(variablesParam: any): Record<string, any> {
    if (!variablesParam || !Array.isArray(variablesParam)) {
      return {};
    }

    const variables: Record<string, any> = {};

    for (const varParam of variablesParam as ParametersParameter[]) {
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
    inputParameters: Parameters,
    expression: string,
    resource: FhirResource,
    evaluationResult: AtomicEvaluationResult['value'],
    analysisResult: any,
    version: FHIRVersion
  ): Parameters {
    const versionConfig = this.versionManager.getVersionConfig(version);
    const packageName = versionConfig?.packages[0]?.name || `fhir-${version}`;

    const result: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'parameters',
          part: [
            {
              name: 'evaluator',
              valueString: `@atomic-ehr/fhirpath (${version.toUpperCase()}) using ${packageName}`
            },
            {
              name: 'expression',
              valueString: expression
            },
            {
              name: 'resource',
              resource: resource
            }
          ]
        },
        {
          name: 'result',
          part: []
        }
      ]
    };

    // Add AST information if available
    if (analysisResult?.ast && result.parameter?.[0]?.part) {
      // Transform the AST to UI-compatible format
      const transformedAst = this.transformAstToJsonNode(analysisResult.ast);
      if (transformedAst) {
        result.parameter[0].part.push({
          name: 'parseDebugTree',
          valueString: stringifySafe(transformedAst, 2)
        });
      }
    }

    // Add evaluation results
    if (evaluationResult && evaluationResult.length > 0) {
      for (const [index, item] of evaluationResult.entries()) {
        const resultParam: ParametersParameter = {
          name: `item${index}`
        };

        setParameterValue(resultParam, item, true);
        if (result.parameter?.[1]?.part) {
          result.parameter[1].part.push(resultParam);
        }
      }
    }

    // Add trace information if available
    if (analysisResult?.diagnostics) {
      const debugTrace: ParametersParameter = {
        name: 'debug-trace',
        part: []
      };

      for (const diagnostic of analysisResult.diagnostics) {
        debugTrace.part!.push({
          name: 'diagnostic',
          valueString: stringifySafe(diagnostic, 2)
        });
      }

      result.parameter!.push(debugTrace);
    }

    return result;
  }
}