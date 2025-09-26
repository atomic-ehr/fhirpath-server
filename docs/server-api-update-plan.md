# Server API Update Plan

## Context
- Reference spec: <https://github.com/brianpos/fhirpath-lab/blob/develop/server-api.md> (downloaded to `tmp/server-api.md`).
- Goal: align `atomic-ehr/fhirpath-server` HTTP API with the fhirpath-lab expectations, add missing response metadata, context-aware evaluation, tracing, and debug capabilities while keeping versioned evaluation support (R4/R5/R6).

## Gap Analysis (Current vs Spec)
- **Request handling**
  - `resource` parameter currently assumes an embedded JSON resource; spec also allows `json-value` / `xml-value` extensions that we ignore.
  - `terminologyserver` input (`tmp/server-api.md` table) is unused; no strategy to pass terminology services to the evaluator.
  - Context evaluation (`src/fhirpath-service.ts:33-110`) executes the main expression once, using only the first context result instead of iterating per context item and setting `%context`, `%resource`, `%rootResource`.
- **Response structure**
  - Output parameters are flattened into a single `result` part with child parts named `item0`, `item1` (`src/fhirpath-service.ts` buildResponseParameters) instead of one `result` parameter per context with `valueString` context descriptor and typed sub-parts per spec.
  - No propagation of the incoming `variables` parameter (and other inputs) back into the `parameters` part; missing optional fields like `expectedReturnType`, `parseDebug`, etc.
  - `evaluator` metadata lacks engine version detection and consistent formatting (currently hard-coded string).
  - `setParameterValue` injects a `resource-path` extension when available, but does not emit datatype-specific part names or handle empty-string signaling required by the spec.
- **Tracing and debugging**
  - Trace output from `trace()` is not captured; evaluator result metadata from `@atomic-ehr/fhirpath` is not inspected for traces.
  - No implementation of the detailed `debug-trace` structure (position/length/function, focus/this paths, index) expected by the lab UI; `analysisResult.diagnostics` are simply stringified.
  - AST export is partially implemented via `transformAstToJsonNode`, but needs alignment with the lab’s AST schema (position/length/type info) and should emit JSON via `parseDebugTree` as defined in the spec.
- **CORS and headers**
  - `createCorsHeaders` (`src/utils.ts`) currently allows `*`; spec lists explicit origins to support.
- **Versioning & metadata**
  - No facility to detect / emit engine version (library version, package versions) dynamically. FHIR package versions from `FHIRVersionManager` are not surfaced in responses.
- **Testing & tooling**
  - No automated tests validating the new response contract, context iteration, or trace/debug outputs.

## Implementation Plan

1. **Specification Parsing & Validation Helpers**
   - Build utilities to detect and deserialize resources supplied via `json-value` / `xml-value` extensions, while preserving original resource in the echo response.
   - Extend request extraction logic to surface optional inputs (terminology server, validate flag, etc.) and decide how to persist them for downstream use.

2. **Context-Aware Evaluation Pipeline**
   - Refactor `FHIRPathService` to evaluate the context expression into a list, iterate per context item, and run the main expression per item.
   - For each evaluation, prepare a merged variable map that injects `%context`, `%this`, `%resource`, `%rootResource`, and maintain user-supplied variables.
   - Introduce a shared evaluation pathway usable by both explicit-version and auto-version routes to avoid duplicate parsing.

3. **Trace & Debug Instrumentation**
   - Investigate `@atomic-ehr/fhirpath` capabilities (e.g., custom `Interpreter`, `inspect` API, or hooks into the trace function) to capture `trace()` output, runtime focus/this/index information, and node positions.
   - Implement middleware or patching around the interpreter to collect the data required for `debug-trace` (position, length, function, focus/resource paths, focus/this values, index).
   - Normalize trace payloads into the spec-compliant `trace` parts within each result.

4. **Response Assembly Rework**
   - Redesign `buildResponseParameters` to:
     - Emit a `parameters` part mirroring inputs plus evaluator metadata, AST (`parseDebugTree` as JSON string), optional `parseDebug`, and captured variables.
     - Generate one `result` parameter per context (or single result when no context), set `valueString` appropriately (context expression or resolved resource path), and populate typed value parts using improved data-type detection (including `empty-string` and JSON extension fallback).
     - Attach captured trace parts and `debug-trace` parameters with the detailed structure defined in the spec.
   - Ensure AST export includes position/length/type info when available from analysis.

5. **Metadata & Headers**
   - Derive evaluator strings from runtime data (library version via `package.json`, FHIR package versions from `FHIRVersionManager`).
   - Update CORS handling to the explicit allow-list while still supporting local development needs.

6. **Terminology Support Stub**
   - Decide how to store or forward the `terminologyserver` parameter; if the evaluator cannot use it yet, document and surface it for future integration without breaking clients.

7. **Testing & Tooling**
   - Add Bun tests covering context iteration, result structure, trace emission, debug trace schema, AST formatting, and CORS headers.
   - Include sample payload fixtures built from the spec’s example request/response for regression coverage.

8. **Documentation & Operational Updates**
   - Update `README.md` (and any developer docs) to describe the new API contract, configuration, and limitations (e.g., partial debug support if any gaps remain).
   - Provide guidance on enabling terminology services or additional engines once supported.

## Risks & Open Questions
- Capturing `debug-trace` data may require enhancements to `@atomic-ehr/fhirpath`; need to confirm whether existing hooks expose evaluation positions and context or if upstream changes are necessary.
- Handling `xml-value` inputs depends on reliable XML parsing and conversion to JSON; scope / library selection must be clarified.
- Performance impact of per-context evaluation and detailed tracing should be measured; may need batching or configurable limits.
- Clarify expectations for validation-related parameters (e.g., `validate` in spec example) and whether OperationOutcome details must be embedded for non-critical issues.
