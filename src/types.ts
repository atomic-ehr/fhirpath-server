// Type definitions for the FHIRPath server

export type FHIRVersion = 'r4' | 'r5' | 'r6';

export interface FHIRVersionConfig {
  packages: Array<{ name: string; version: string }>;
  cacheDir?: string;
  registryUrl?: string;
}

export interface ServerConfig {
  port: number;
  fhirVersions: Record<FHIRVersion, FHIRVersionConfig>;
}

// FHIR resource types
export interface FhirResource {
  resourceType: string;
  id?: string;
  meta?: {
    versionId?: string;
    lastUpdated?: string;
    profile?: string[];
  };
  [key: string]: any;
}

export interface Parameters extends FhirResource {
  resourceType: 'Parameters';
  parameter?: ParametersParameter[];
}

export interface ParametersParameter {
  name: string;
  // Primitive types
  valueBase64Binary?: string;
  valueBoolean?: boolean;
  valueCanonical?: string;
  valueCode?: string;
  valueDate?: string;
  valueDateTime?: string;
  valueDecimal?: number;
  valueId?: string;
  valueInstant?: string;
  valueInteger?: number;
  valueMarkdown?: string;
  valueOid?: string;
  valuePositiveInt?: number;
  valueString?: string;
  valueTime?: string;
  valueUnsignedInt?: number;
  valueUri?: string;
  valueUrl?: string;
  valueUuid?: string;
  // Complex types
  valueAddress?: Address;
  valueAge?: Age;
  valueAnnotation?: Annotation;
  valueAttachment?: Attachment;
  valueCodeableConcept?: CodeableConcept;
  valueCoding?: Coding;
  valueContactPoint?: ContactPoint;
  valueCount?: Count;
  valueDistance?: Distance;
  valueDuration?: Duration;
  valueHumanName?: HumanName;
  valueIdentifier?: Identifier;
  valueMoney?: Money;
  valuePeriod?: Period;
  valueQuantity?: Quantity;
  valueRange?: Range;
  valueRatio?: Ratio;
  valueReference?: Reference;
  valueSampledData?: SampledData;
  valueSignature?: Signature;
  valueTiming?: Timing;
  // Metadata types
  valueContactDetail?: ContactDetail;
  valueContributor?: Contributor;
  valueDataRequirement?: DataRequirement;
  valueExpression?: Expression;
  valueParameterDefinition?: ParameterDefinition;
  valueRelatedArtifact?: RelatedArtifact;
  valueTriggerDefinition?: TriggerDefinition;
  valueUsageContext?: UsageContext;
  // Additional types
  valueDosage?: Dosage;
  valueMeta?: Meta;
  // Resource and structural elements
  resource?: FhirResource;
  part?: ParametersParameter[];
  extension?: Extension[];
}

export interface Extension {
  url: string;
  valueString?: string;
  valueBoolean?: boolean;
  valueInteger?: number;
  valueDecimal?: number;
  valueDate?: string;
  valueTime?: string;
  valueDateTime?: string;
  valueCode?: string;
  valueUri?: string;
  valueCanonical?: string;
  extension?: Extension[];
}

export interface Quantity {
  value?: number;
  unit?: string;
  system?: string;
  code?: string;
  comparator?: string;
}

export interface HumanName {
  use?: string;
  family?: string;
  given?: string[];
  prefix?: string[];
  suffix?: string[];
  period?: Period;
}

export interface Period {
  start?: string;
  end?: string;
}

export interface ContactPoint {
  system?: 'phone' | 'fax' | 'email' | 'pager' | 'url' | 'sms' | 'other';
  value?: string;
  use?: 'home' | 'work' | 'temp' | 'old' | 'mobile';
  rank?: number;
  period?: Period;
}

export interface Address {
  use?: 'home' | 'work' | 'temp' | 'old' | 'billing';
  type?: 'postal' | 'physical' | 'both';
  text?: string;
  line?: string[];
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  period?: Period;
}

export interface Identifier {
  use?: 'usual' | 'official' | 'temp' | 'secondary' | 'old';
  type?: CodeableConcept;
  system?: string;
  value?: string;
  period?: Period;
  assigner?: Reference;
}

export interface Reference {
  reference?: string;
  type?: string;
  identifier?: Identifier;
  display?: string;
}

export interface Range {
  low?: Quantity;
  high?: Quantity;
}

export interface Ratio {
  numerator?: Quantity;
  denominator?: Quantity;
}

export interface Attachment {
  contentType?: string;
  language?: string;
  data?: string;
  url?: string;
  size?: number;
  hash?: string;
  title?: string;
  creation?: string;
}

export interface Age extends Quantity {}

export interface Count extends Quantity {}

export interface Distance extends Quantity {}

export interface Duration extends Quantity {}

export interface Money extends Quantity {
  currency?: string;
}

export interface Annotation {
  authorReference?: Reference;
  authorString?: string;
  time?: string;
  text: string;
}

export interface SampledData {
  origin: Quantity;
  period: number;
  factor?: number;
  lowerLimit?: number;
  upperLimit?: number;
  dimensions: number;
  data?: string;
}

export interface Signature {
  type: Coding[];
  when: string;
  who: Reference;
  onBehalfOf?: Reference;
  targetFormat?: string;
  sigFormat?: string;
  data?: string;
}

export interface Timing {
  event?: string[];
  repeat?: TimingRepeat;
  code?: CodeableConcept;
}

export interface TimingRepeat {
  boundsDuration?: Duration;
  boundsRange?: Range;
  boundsPeriod?: Period;
  count?: number;
  countMax?: number;
  duration?: number;
  durationMax?: number;
  durationUnit?: 's' | 'min' | 'h' | 'd' | 'wk' | 'mo' | 'a';
  frequency?: number;
  frequencyMax?: number;
  period?: number;
  periodMax?: number;
  periodUnit?: 's' | 'min' | 'h' | 'd' | 'wk' | 'mo' | 'a';
  dayOfWeek?: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
  timeOfDay?: string[];
  when?: string[];
  offset?: number;
}

export interface ContactDetail {
  name?: string;
  telecom?: ContactPoint[];
}

export interface Contributor {
  type: 'author' | 'editor' | 'reviewer' | 'endorser';
  name: string;
  contact?: ContactDetail[];
}

export interface DataRequirement {
  type: string;
  profile?: string[];
  subjectCodeableConcept?: CodeableConcept;
  subjectReference?: Reference;
  mustSupport?: string[];
  codeFilter?: DataRequirementCodeFilter[];
  dateFilter?: DataRequirementDateFilter[];
  limit?: number;
  sort?: DataRequirementSort[];
}

export interface DataRequirementCodeFilter {
  path?: string;
  searchParam?: string;
  valueSet?: string;
  code?: Coding[];
}

export interface DataRequirementDateFilter {
  path?: string;
  searchParam?: string;
  valueDateTime?: string;
  valuePeriod?: Period;
  valueDuration?: Duration;
}

export interface DataRequirementSort {
  path: string;
  direction: 'ascending' | 'descending';
}

export interface Expression {
  description?: string;
  name?: string;
  language: string;
  expression?: string;
  reference?: string;
}

export interface ParameterDefinition {
  name?: string;
  use: 'in' | 'out';
  min?: number;
  max?: string;
  documentation?: string;
  type: string;
  profile?: string;
}

export interface RelatedArtifact {
  type: 'documentation' | 'justification' | 'citation' | 'predecessor' | 'successor' | 'derived-from' | 'depends-on' | 'composed-of';
  label?: string;
  display?: string;
  citation?: string;
  url?: string;
  document?: Attachment;
  resource?: string;
}

export interface TriggerDefinition {
  type: 'named-event' | 'periodic' | 'data-changed' | 'data-added' | 'data-modified' | 'data-removed' | 'data-accessed' | 'data-access-ended';
  name?: string;
  timingTiming?: Timing;
  timingReference?: Reference;
  timingDate?: string;
  timingDateTime?: string;
  data?: DataRequirement[];
  condition?: Expression;
}

export interface UsageContext {
  code: Coding;
  valueCodeableConcept?: CodeableConcept;
  valueQuantity?: Quantity;
  valueRange?: Range;
  valueReference?: Reference;
}

export interface Dosage {
  sequence?: number;
  text?: string;
  additionalInstruction?: CodeableConcept[];
  patientInstruction?: string;
  timing?: Timing;
  asNeededBoolean?: boolean;
  asNeededCodeableConcept?: CodeableConcept;
  site?: CodeableConcept;
  route?: CodeableConcept;
  method?: CodeableConcept;
  doseAndRate?: DosageDoseAndRate[];
  maxDosePerPeriod?: Ratio;
  maxDosePerAdministration?: Quantity;
  maxDosePerLifetime?: Quantity;
}

export interface DosageDoseAndRate {
  type?: CodeableConcept;
  doseRange?: Range;
  doseQuantity?: Quantity;
  rateRatio?: Ratio;
  rateRange?: Range;
  rateQuantity?: Quantity;
}

export interface Meta {
  versionId?: string;
  lastUpdated?: string;
  source?: string;
  profile?: string[];
  security?: Coding[];
  tag?: Coding[];
}

export interface OperationOutcome extends FhirResource {
  resourceType: 'OperationOutcome';
  issue: OperationOutcomeIssue[];
}

export interface OperationOutcomeIssue {
  severity: 'fatal' | 'error' | 'warning' | 'information';
  code: string;
  details?: CodeableConcept;
  diagnostics?: string;
  location?: string[];
  expression?: string[];
}

export interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}

export interface Coding {
  system?: string;
  version?: string;
  code?: string;
  display?: string;
  userSelected?: boolean;
}

// Request/Response types
export interface FHIRPathRequest {
  expression: string;
  resource: FhirResource;
  variables?: Record<string, any>;
  context?: string;
  validate?: boolean;
  terminologyServer?: string;
}

export interface EvaluationResult {
  parameters: Parameters;
  result: any[];
  trace?: any[];
  debugTrace?: any[];
  ast?: any;
}

// Route handler types
export interface RouteContext {
  url: URL;
  request: Request;
  params: Record<string, string>;
}

export type RouteHandler = (ctx: RouteContext) => Response | Promise<Response>;

// AST Node interface for UI compatibility
export interface JsonNode {
  id?: string;
  ExpressionType: string;
  Name: string;
  Arguments?: JsonNode[];
  ReturnType?: string;
  Position?: number;
  Length?: number;
  Line?: number;
  Column?: number;
  /** URL to the Specification for this node - Augmented by the Lab */
  SpecUrl?: string;
}