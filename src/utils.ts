import type { EvaluationResult as AtomicEvaluationResult } from "@atomic-ehr/fhirpath";
import type {
	EvaluationParameterExtraction,
	FhirResource,
	OperationOutcome,
	Parameters,
	ParametersParameter,
	ResourceDescriptor,
	ResourceInputSource,
} from "./types.js";

export const RESOURCE_PATH_EXTENSION_URL =
	"http://fhir.forms-lab.com/StructureDefinition/resource-path";
export const JSON_VALUE_EXTENSION_URL =
	"http://fhir.forms-lab.com/StructureDefinition/json-value";
export const XML_VALUE_EXTENSION_URL =
	"http://fhir.forms-lab.com/StructureDefinition/xml-value";

const PARAMETER_VALUE_KEYS: Array<keyof ParametersParameter> = [
	"valueString",
	"valueBoolean",
	"valueInteger",
	"valueDecimal",
	"valueDate",
	"valueTime",
	"valueDateTime",
	"valueInstant",
	"valueCode",
	"valueBase64Binary",
	"valueCanonical",
	"valueId",
	"valueMarkdown",
	"valueOid",
	"valuePositiveInt",
	"valueUnsignedInt",
	"valueUri",
	"valueUrl",
	"valueUuid",
	"valueQuantity",
	"valueHumanName",
	"valueContactPoint",
	"valueAddress",
	"valueIdentifier",
	"valueCodeableConcept",
	"valueCoding",
	"valuePeriod",
	"valueRange",
	"valueRatio",
	"valueReference",
	"valueAttachment",
	"valueAge",
	"valueCount",
	"valueDistance",
	"valueDuration",
	"valueMoney",
	"valueAnnotation",
	"valueSampledData",
	"valueSignature",
	"valueTiming",
	"valueContactDetail",
	"valueContributor",
	"valueDataRequirement",
	"valueExpression",
	"valueParameterDefinition",
	"valueRelatedArtifact",
	"valueTriggerDefinition",
	"valueUsageContext",
	"valueDosage",
	"valueMeta",
	"resource",
	"part",
	"extension",
];

function getParameterPrimaryValue(param: ParametersParameter): any {
	for (const key of PARAMETER_VALUE_KEYS) {
		const value = param[key];
		if (value !== undefined && value !== null) {
			return value;
		}
	}
	return undefined;
}

function pushAdditionalInput(
	additional: Record<string, ParametersParameter[]>,
	name: string,
	parameter: ParametersParameter,
): void {
	if (!additional[name]) {
		additional[name] = [];
	}
	additional[name].push(parameter);
}

function parseResourceParameter(parameter: ParametersParameter): {
	resource?: FhirResource;
	descriptor: ResourceDescriptor;
} {
	const descriptor: ResourceDescriptor = {
		source: "missing",
		parameter,
	};

	if (parameter.resource) {
		descriptor.source = "inline-resource";
		return { resource: parameter.resource, descriptor };
	}

	const extensions = parameter.extension ?? [];
	const jsonExt = extensions.find(
		(ext) => ext.url === JSON_VALUE_EXTENSION_URL,
	);
	const jsonValue =
		typeof jsonExt?.valueString === "string" ? jsonExt.valueString : undefined;
	if (jsonValue) {
		descriptor.source = "json-extension";
		descriptor.contentType = "json";
		descriptor.serializedContent = jsonValue;

		try {
			const parsed = JSON.parse(jsonValue);
			return { resource: parsed, descriptor };
		} catch (error) {
			descriptor.parseError =
				error instanceof Error ? error.message : "Invalid JSON payload";
			return { descriptor };
		}
	}

	const xmlExt = extensions.find((ext) => ext.url === XML_VALUE_EXTENSION_URL);
	const xmlValue =
		typeof xmlExt?.valueString === "string" ? xmlExt.valueString : undefined;
	if (xmlValue) {
		descriptor.source = "xml-extension";
		descriptor.contentType = "xml";
		descriptor.serializedContent = xmlValue;
		descriptor.parseError = "XML resource inputs are not supported yet";
		return { descriptor };
	}

	return { descriptor };
}

/**
 * Create a FHIR OperationOutcome for error responses
 */
export function createOperationOutcome(
	severity: "fatal" | "error" | "warning" | "information",
	code: string,
	message: string,
	location?: string[],
): OperationOutcome {
	return {
		resourceType: "OperationOutcome",
		issue: [
			{
				severity,
				code,
				diagnostics: message,
				...(location && { location }),
			},
		],
	};
}

/**
 * Extract parameters from FHIR Parameters resource
 */
export function extractParameters(parameters: Parameters): Record<string, any> {
	const extracted: Record<string, any> = {};

	if (!parameters.parameter) return extracted;

	for (const param of parameters.parameter) {
		const value = getParameterPrimaryValue(param);
		if (value !== undefined) {
			extracted[param.name] = value;
		}
	}

	return extracted;
}

export function extractEvaluationParameters(
	parameters: Parameters,
): EvaluationParameterExtraction {
	const extracted: EvaluationParameterExtraction = {
		additionalInputs: {},
	};

	if (!parameters.parameter) {
		return extracted;
	}

	for (const parameter of parameters.parameter) {
		switch (parameter.name) {
			case "expression": {
				extracted.expressionParameter = parameter;
				if (typeof parameter.valueString === "string") {
					extracted.expression = parameter.valueString;
				} else {
					const value = getParameterPrimaryValue(parameter);
					if (typeof value === "string") {
						extracted.expression = value;
					}
				}
				break;
			}
			case "context": {
				extracted.contextParameter = parameter;
				if (typeof parameter.valueString === "string") {
					extracted.contextExpression = parameter.valueString;
				} else {
					const value = getParameterPrimaryValue(parameter);
					if (typeof value === "string") {
						extracted.contextExpression = value;
					}
				}
				break;
			}
			case "resource": {
				const { resource, descriptor } = parseResourceParameter(parameter);
				extracted.resourceDescriptor = descriptor;
				if (resource) {
					extracted.resource = resource;
				}
				break;
			}
			case "variables": {
				extracted.variablesParameter = parameter;
				if (Array.isArray(parameter.part)) {
					extracted.variableParts = parameter.part;
				} else {
					extracted.variableParts = [];
				}
				break;
			}
			case "terminologyserver": {
				const value = getParameterPrimaryValue(parameter);
				if (typeof value === "string") {
					extracted.terminologyServer = value;
				}
				pushAdditionalInput(
					extracted.additionalInputs,
					parameter.name,
					parameter,
				);
				break;
			}
			case "expectedReturnType": {
				const value = getParameterPrimaryValue(parameter);
				if (typeof value === "string") {
					extracted.expectedReturnType = value;
				}
				pushAdditionalInput(
					extracted.additionalInputs,
					parameter.name,
					parameter,
				);
				break;
			}
			case "validate": {
				if (typeof parameter.valueBoolean === "boolean") {
					extracted.validate = parameter.valueBoolean;
				} else {
					const value = getParameterPrimaryValue(parameter);
					if (typeof value === "string") {
						extracted.validate = value.toLowerCase() === "true";
					}
				}
				pushAdditionalInput(
					extracted.additionalInputs,
					parameter.name,
					parameter,
				);
				break;
			}
			default: {
				pushAdditionalInput(
					extracted.additionalInputs,
					parameter.name,
					parameter,
				);
				break;
			}
		}
	}

	return extracted;
}

/**
 * Create CORS headers for responses
 */
const DEFAULT_CORS_ORIGIN = "https://fhirpath-lab.com";
const ALLOWED_CORS_ORIGINS = [
	DEFAULT_CORS_ORIGIN,
	"https://dev.fhirpath-lab.com",
	"https://hackweek.fhirpath-lab.com",
	"http://localhost:3000",
];

function resolveAllowedOrigin(origin?: string | null): string {
	if (origin && ALLOWED_CORS_ORIGINS.includes(origin)) {
		return origin;
	}

	if (origin && origin.startsWith("http://localhost")) {
		return origin;
	}

	return DEFAULT_CORS_ORIGIN;
}

export function createCorsHeaders(
	origin?: string | null,
): Record<string, string> {
	const allowedOrigin = resolveAllowedOrigin(origin);
	return {
		"Access-Control-Allow-Origin": allowedOrigin,
		"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
		"Access-Control-Max-Age": "86400",
		Vary: "Origin",
	};
}

/**
 * Create standard headers for FHIR responses
 */
export function createFhirHeaders(): Record<string, string> {
	return {
		"Content-Type": "application/fhir+json; charset=utf-8",
	};
}

/**
 * Create a JSON response with proper headers
 */
export function createJsonResponse(
	data: any,
	status: number = 200,
	headers: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			...headers,
		},
	});
}

/**
 * Create a FHIR response with proper headers
 */
export function createFhirResponse(
	data: any,
	status: number = 200,
	headers: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: {
			...createFhirHeaders(),
			...headers,
		},
	});
}

/**
 * Create an error response with OperationOutcome
 */
export function createErrorResponse(
	severity: "fatal" | "error" | "warning" | "information",
	code: string,
	message: string,
	status: number = 400,
	location?: string[],
): Response {
	const operationOutcome = createOperationOutcome(
		severity,
		code,
		message,
		location,
	);
	return createFhirResponse(operationOutcome, status);
}

/**
 * Parse JSON body from request with error handling
 */
export async function parseJsonBody(request: Request): Promise<any> {
	try {
		const text = await request.text();
		if (!text.trim()) {
			throw new Error("Request body is empty");
		}
		return JSON.parse(text);
	} catch (error) {
		throw new Error(
			`Invalid JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Validate FHIR Parameters resource
 */
export function validateParametersResource(data: any): Parameters {
	if (!data || typeof data !== "object") {
		throw new Error("Request body must be a JSON object");
	}

	if (data.resourceType !== "Parameters") {
		throw new Error("Expected FHIR Parameters resource");
	}

	return data as Parameters;
}

/**
 * Set parameter value with proper typing
 */
export function setParameterValue(
	param: ParametersParameter,
	item: AtomicEvaluationResult["value"][number],
	fullData: boolean = true,
): void {
	if (item === null || item === undefined) return;

	const isBoxed = item && typeof item === "object" && "typeInfo" in item;

	const actualValue = isBoxed ? item.value : item;
	const typeInfo = isBoxed ? item.typeInfo : undefined;

	const dataType = typeInfo?.name || typeInfo?.type || "Any";
	let resourcePath: string | undefined = undefined;

	// Add resource path extension if available
	if ((typeInfo?.modelContext as any)?.path) {
		resourcePath = (typeInfo?.modelContext as any)?.path as string;
		param.extension = [
			{
				url: RESOURCE_PATH_EXTENSION_URL,
				valueString: resourcePath,
			},
		];
	}

	if (!typeInfo?.name && !typeInfo?.type) {
		if (typeof actualValue === "boolean") {
			param.valueBoolean = actualValue;
			return;
		}

		if (typeof actualValue === "number" && !Number.isNaN(actualValue)) {
			if (Number.isInteger(actualValue)) {
				param.valueInteger = actualValue;
			} else {
				param.valueDecimal = actualValue;
			}
			return;
		}

		if (typeof actualValue === "string") {
			param.valueString = actualValue;
			return;
		}
	}

	switch (dataType.toLowerCase()) {
		// Complex types
		case "humanname":
			param.valueHumanName = actualValue;
			break;
		case "contactpoint":
			param.valueContactPoint = actualValue;
			break;
		case "address":
			param.valueAddress = actualValue;
			break;
		case "quantity":
			param.valueQuantity = actualValue;
			break;
		case "age":
			param.valueAge = actualValue;
			break;
		case "count":
			param.valueCount = actualValue;
			break;
		case "distance":
			param.valueDistance = actualValue;
			break;
		case "duration":
			param.valueDuration = actualValue;
			break;
		case "money":
			param.valueMoney = actualValue;
			break;
		case "codeableconcept":
			param.valueCodeableConcept = actualValue;
			break;
		case "coding":
			param.valueCoding = actualValue;
			break;
		case "identifier":
			param.valueIdentifier = actualValue;
			break;
		case "period":
			param.valuePeriod = actualValue;
			break;
		case "range":
			param.valueRange = actualValue;
			break;
		case "ratio":
			param.valueRatio = actualValue;
			break;
		case "reference":
			param.valueReference = actualValue;
			break;
		case "attachment":
			param.valueAttachment = actualValue;
			break;
		case "annotation":
			param.valueAnnotation = actualValue;
			break;
		case "sampleddata":
			param.valueSampledData = actualValue;
			break;
		case "signature":
			param.valueSignature = actualValue;
			break;
		case "timing":
			param.valueTiming = actualValue;
			break;
		case "contactdetail":
			param.valueContactDetail = actualValue;
			break;
		case "contributor":
			param.valueContributor = actualValue;
			break;
		case "datarequirement":
			param.valueDataRequirement = actualValue;
			break;
		case "expression":
			param.valueExpression = actualValue;
			break;
		case "parameterdefinition":
			param.valueParameterDefinition = actualValue;
			break;
		case "relatedartifact":
			param.valueRelatedArtifact = actualValue;
			break;
		case "triggerdefinition":
			param.valueTriggerDefinition = actualValue;
			break;
		case "usagecontext":
			param.valueUsageContext = actualValue;
			break;
		case "dosage":
			param.valueDosage = actualValue;
			break;
		case "meta":
			param.valueMeta = actualValue;
			break;
		// Primitive types
		case "string":
		case "system.string":
			param.valueString = actualValue;
			break;
		case "boolean":
			param.valueBoolean = actualValue;
			break;
		case "integer":
			param.valueInteger = parseInt(actualValue);
			break;
		case "decimal":
			param.valueDecimal = parseFloat(actualValue);
			break;
		case "date":
			param.valueDate = actualValue;
			break;
		case "datetime":
			param.valueDateTime = actualValue;
			break;
		case "time":
			param.valueTime = actualValue;
			break;
		case "instant":
			param.valueInstant = actualValue;
			break;
		case "code":
			param.valueCode = actualValue;
			break;
		case "base64binary":
			param.valueBase64Binary = actualValue;
			break;
		case "canonical":
			param.valueCanonical = actualValue;
			break;
		case "id":
			param.valueId = actualValue;
			break;
		case "markdown":
			param.valueMarkdown = actualValue;
			break;
		case "oid":
			param.valueOid = actualValue;
			break;
		case "positiveint":
			param.valuePositiveInt = parseInt(actualValue);
			break;
		case "unsignedint":
			param.valueUnsignedInt = parseInt(actualValue);
			break;
		case "uri":
			param.valueUri = actualValue;
			break;
		case "url":
			param.valueUrl = actualValue;
			break;
		case "uuid":
			param.valueUuid = actualValue;
			break;

		default:
			if (fullData) {
				// Store complex data as JSON extension
				param.extension = param.extension || [];
				param.extension.push({
					url: JSON_VALUE_EXTENSION_URL,
					valueString: JSON.stringify(actualValue, null, 2),
				});
			} else if (resourcePath) {
				param.name = "resource-path";
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
		return `[Circular or non-serializable object: ${error instanceof Error ? error.message : "Unknown error"}]`;
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
	resource?: any,
): "r4" | "r5" | "r6" | null {
	const pathMatch = pathname.match(/(r[456])/);
	if (pathMatch) {
		return pathMatch[1] as "r4" | "r5" | "r6";
	}

	// Try to detect from resource
	if (resource?.meta?.profile) {
		for (const profile of resource.meta.profile) {
			if (profile.includes("/r4/")) return "r4";
			if (profile.includes("/r5/")) return "r5";
			if (profile.includes("/r6/")) return "r6";
		}
	}

	return null;
}
