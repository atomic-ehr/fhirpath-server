import { Registry, Errors } from '@atomic-ehr/fhirpath';
import { recordTrace } from './trace-collector.js';

type FunctionEvaluator = (
  input: any,
  context: any,
  args: any[],
  evaluator: (node: any, inputData: any[], ctx: any) => Promise<{ value: any[] }>
) => Promise<{ value: any[]; context: any }>;

const shouldTrace = () => {
  if (process.env.NODE_ENV === 'test') return false;
  if (process.env.FHIRPATH_TRACE === 'false') return false;
  if (typeof Bun !== 'undefined' && process.argv.some(arg => arg.includes('bun:test'))) return false;
  return true;
};

function extractString(boxed: unknown): string | null {
  if (typeof boxed === 'string') {
    return boxed;
  }
  if (boxed && typeof boxed === 'object' && 'value' in (boxed as Record<string, unknown>)) {
    const candidate = (boxed as Record<string, unknown>).value;
    return typeof candidate === 'string' ? candidate : null;
  }
  return null;
}

function setupTraceHook(): void {
  try {
    const registry = new Registry();
    const traceDefinition = registry.getFunction('trace') as { evaluate?: FunctionEvaluator } | undefined;

    if (!traceDefinition || typeof traceDefinition.evaluate !== 'function') {
      console.warn('Trace hook unavailable: trace function definition missing');
      return;
    }

    traceDefinition.evaluate = async (input, context, args, evaluator) => {
      if (args.length === 0) {
        if (shouldTrace()) {
          console.log('[FHIRPath trace] (unnamed):', JSON.stringify(input));
        }
        recordTrace('(unnamed)', input as any);
        return { value: input, context };
      }

      if (args.length > 2) {
        throw Errors.wrongArgumentCountRange('trace', 0, 2, args.length);
      }

      if (!args[0]) {
        throw Errors.argumentRequired('trace', 'name argument');
      }

      const nameResult = await evaluator(args[0], input, context);
      if (nameResult.value.length !== 1) {
        throw Errors.singletonRequired('trace name', nameResult.value.length);
      }

      const boxedName = nameResult.value[0];
      const name = extractString(boxedName);
      if (!name) {
        throw Errors.invalidStringOperation('trace', 'name argument');
      }

      if (args.length === 2 && args[1]) {
        const projectionResult = await evaluator(args[1], input, context);
        if (shouldTrace()) {
          console.log(`[FHIRPath trace] ${name}:`, JSON.stringify(projectionResult.value));
        }
        recordTrace(name, projectionResult.value as any);
      } else {
        if (shouldTrace()) {
          console.log(`[FHIRPath trace] ${name}:`, JSON.stringify(input));
        }
        recordTrace(name, input as any);
      }

      return { value: input, context };
    };
  } catch (error) {
    console.warn('Trace hook unavailable:', error instanceof Error ? error.message : error);
  }
}

setupTraceHook();
