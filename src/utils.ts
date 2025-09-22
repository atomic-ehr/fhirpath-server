import type { EvaluationResult as AtomicEvaluationResult } from '@atomic-ehr/fhirpath';
import type {
  OperationOutcome,
  Parameters,
  ParametersParameter,
} from './types.js';

/**
 * Create a FHIR OperationOutcome for error responses
 */
export function createOperationOutcome(
  severity: 'fatal' | 'error' | 'warning' | 'information',
  code: string,
  message: string,
  location?: string[]
): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity,
        code,
        diagnostics: message,
        ...(location && { location })
      }
    ]
  };
}

/**
 * Extract parameters from FHIR Parameters resource
 */
export function extractParameters(parameters: Parameters): Record<string, any> {
  const extracted: Record<string, any> = {};

  if (!parameters.parameter) return extracted;

  for (const param of parameters.parameter) {
    const value =
      // Primitive types
      param.valueString ||
      param.valueBoolean ||
      param.valueInteger ||
      param.valueDecimal ||
      param.valueDate ||
      param.valueTime ||
      param.valueDateTime ||
      param.valueInstant ||
      param.valueCode ||
      param.valueBase64Binary ||
      param.valueCanonical ||
      param.valueId ||
      param.valueMarkdown ||
      param.valueOid ||
      param.valuePositiveInt ||
      param.valueUnsignedInt ||
      param.valueUri ||
      param.valueUrl ||
      param.valueUuid ||
      // Complex types
      param.valueQuantity ||
      param.valueHumanName ||
      param.valueContactPoint ||
      param.valueAddress ||
      param.valueIdentifier ||
      param.valueCodeableConcept ||
      param.valueCoding ||
      param.valuePeriod ||
      param.valueRange ||
      param.valueRatio ||
      param.valueReference ||
      param.valueAttachment ||
      param.valueAge ||
      param.valueCount ||
      param.valueDistance ||
      param.valueDuration ||
      param.valueMoney ||
      param.valueAnnotation ||
      param.valueSampledData ||
      param.valueSignature ||
      param.valueTiming ||
      // Metadata types
      param.valueContactDetail ||
      param.valueContributor ||
      param.valueDataRequirement ||
      param.valueExpression ||
      param.valueParameterDefinition ||
      param.valueRelatedArtifact ||
      param.valueTriggerDefinition ||
      param.valueUsageContext ||
      // Additional types
      param.valueDosage ||
      param.valueMeta ||
      // Structural elements
      param.resource ||
      param.part ||
      param.extension;

    extracted[param.name] = value;
  }

  return extracted;
}

/**
 * Create CORS headers for responses
 */
export function createCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

/**
 * Create standard headers for FHIR responses
 */
export function createFhirHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/fhir+json; charset=utf-8',
    ...createCorsHeaders()
  };
}

/**
 * Create a JSON response with proper headers
 */
export function createJsonResponse(
  data: any,
  status: number = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...createCorsHeaders(),
      ...headers
    }
  });
}

/**
 * Create a FHIR response with proper headers
 */
export function createFhirResponse(
  data: any,
  status: number = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...createFhirHeaders(),
      ...headers
    }
  });
}

/**
 * Create an error response with OperationOutcome
 */
export function createErrorResponse(
  severity: 'fatal' | 'error' | 'warning' | 'information',
  code: string,
  message: string,
  status: number = 400,
  location?: string[]
): Response {
  const operationOutcome = createOperationOutcome(severity, code, message, location);
  return createFhirResponse(operationOutcome, status);
}

/**
 * Parse JSON body from request with error handling
 */
export async function parseJsonBody(request: Request): Promise<any> {
  try {
    const text = await request.text();
    if (!text.trim()) {
      throw new Error('Request body is empty');
    }
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate FHIR Parameters resource
 */
export function validateParametersResource(data: any): Parameters {
  if (!data || typeof data !== 'object') {
    throw new Error('Request body must be a JSON object');
  }

  if (data.resourceType !== 'Parameters') {
    throw new Error('Expected FHIR Parameters resource');
  }

  return data as Parameters;
}

/**
 * Set parameter value with proper typing
 */
export function setParameterValue(
  param: ParametersParameter,
  item: AtomicEvaluationResult['value'][number],
  fullData: boolean = true
): void {
  if (!item) return;

  const dataType = item.typeInfo?.name || item.typeInfo?.type || 'Any'
  let resourcePath: string | undefined = undefined

  // Add resource path extension if available

  if ((item.typeInfo?.modelContext as any)?.path) {
    resourcePath = (item.typeInfo?.modelContext as any)?.path as string;
    param.extension = [
      {
        url: "http://fhir.forms-lab.com/StructureDefinition/resource-path",
        valueString: resourcePath
      }
    ]
  }

  switch (dataType.toLowerCase()) {
    // Complex types
    case 'humanname':
      param.valueHumanName = item.value;
      break;
    case 'contactpoint':
      param.valueContactPoint = item.value;
      break;
    case 'address':
      param.valueAddress = item.value;
      break;
    case 'quantity':
      param.valueQuantity = item.value;
      break;
    case 'age':
      param.valueAge = item.value;
      break;
    case 'count':
      param.valueCount = item.value;
      break;
    case 'distance':
      param.valueDistance = item.value;
      break;
    case 'duration':
      param.valueDuration = item.value;
      break;
    case 'money':
      param.valueMoney = item.value;
      break;
    case 'codeableconcept':
      param.valueCodeableConcept = item.value;
      break;
    case 'coding':
      param.valueCoding = item.value;
      break;
    case 'identifier':
      param.valueIdentifier = item.value;
      break;
    case 'period':
      param.valuePeriod = item.value;
      break;
    case 'range':
      param.valueRange = item.value;
      break;
    case 'ratio':
      param.valueRatio = item.value;
      break;
    case 'reference':
      param.valueReference = item.value;
      break;
    case 'attachment':
      param.valueAttachment = item.value;
      break;
    case 'annotation':
      param.valueAnnotation = item.value;
      break;
    case 'sampleddata':
      param.valueSampledData = item.value;
      break;
    case 'signature':
      param.valueSignature = item.value;
      break;
    case 'timing':
      param.valueTiming = item.value;
      break;
    case 'contactdetail':
      param.valueContactDetail = item.value;
      break;
    case 'contributor':
      param.valueContributor = item.value;
      break;
    case 'datarequirement':
      param.valueDataRequirement = item.value;
      break;
    case 'expression':
      param.valueExpression = item.value;
      break;
    case 'parameterdefinition':
      param.valueParameterDefinition = item.value;
      break;
    case 'relatedartifact':
      param.valueRelatedArtifact = item.value;
      break;
    case 'triggerdefinition':
      param.valueTriggerDefinition = item.value;
      break;
    case 'usagecontext':
      param.valueUsageContext = item.value;
      break;
    case 'dosage':
      param.valueDosage = item.value;
      break;
    case 'meta':
      param.valueMeta = item.value;
      break;
    // Primitive types
    case 'string':
    case 'system.string':
      param.valueString = item.value || item;
      break;
    case 'boolean':
      param.valueBoolean = Boolean(item.value || item);
      break;
    case 'integer':
      param.valueInteger = parseInt(item.value || item);
      break;
    case 'decimal':
      param.valueDecimal = parseFloat(item.value || item);
      break;
    case 'date':
      param.valueDate = item.value || item;
      break;
    case 'datetime':
      param.valueDateTime = item.value || item;
      break;
    case 'time':
      param.valueTime = item.value || item;
      break;
    case 'instant':
      param.valueInstant = item.value || item;
      break;
    case 'code':
      param.valueCode = item.value || item;
      break;
    case 'base64binary':
      param.valueBase64Binary = item.value || item;
      break;
    case 'canonical':
      param.valueCanonical = item.value || item;
      break;
    case 'id':
      param.valueId = item.value || item;
      break;
    case 'markdown':
      param.valueMarkdown = item.value || item;
      break;
    case 'oid':
      param.valueOid = item.value || item;
      break;
    case 'positiveint':
      param.valuePositiveInt = parseInt(item.value || item);
      break;
    case 'unsignedint':
      param.valueUnsignedInt = parseInt(item.value || item);
      break;
    case 'uri':
      param.valueUri = item.value || item;
      break;
    case 'url':
      param.valueUrl = item.value || item;
      break;
    case 'uuid':
      param.valueUuid = item.value || item;
      break;

    default:
      if (fullData) {
        // Store complex data as JSON extension
        param.extension = param.extension || [];
        param.extension.push({
          url: 'http://fhir.forms-lab.com/StructureDefinition/json-value',
          valueString: JSON.stringify(item.value || item, null, 2)
        });
      } else if (resourcePath) {
        param.name = 'resource-path';
        param.valueString = resourcePath;
        delete param.extension;
      }
      break;
  }
}

/**
 * Safe JSON stringify with error handling
 */
export function stringifySafe(obj: any, indent: number = 0): string {
  try {
    return JSON.stringify(obj, null, indent);
  } catch (error) {
    return `[Circular or non-serializable object: ${error instanceof Error ? error.message : 'Unknown error'}]`;
  }
}

/**
 * Log request for debugging
 */
export function logRequest(request: Request, url: URL): void {
  console.log(`${new Date().toISOString()} ${request.method} ${url.pathname}`);
  // console.log('Headers:', Object.fromEntries(request.headers.entries()));
}

/**
 * Get FHIR version from various sources
 */
export function extractFhirVersion(
  pathname: string,
  resource?: any
): 'r4' | 'r5' | 'r6' | null {
  const pathMatch = pathname.match(/(r[456])/);
  if (pathMatch) {
    return pathMatch[1] as 'r4' | 'r5' | 'r6';
  }

  // Try to detect from resource
  if (resource?.meta?.profile) {
    for (const profile of resource.meta.profile) {
      if (profile.includes('/r4/')) return 'r4';
      if (profile.includes('/r5/')) return 'r5';
      if (profile.includes('/r6/')) return 'r6';
    }
  }

  return null;
}