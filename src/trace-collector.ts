import type { EvaluationResult as AtomicEvaluationResult } from '@atomic-ehr/fhirpath';

export interface TraceEntry {
  label: string;
  values: AtomicEvaluationResult['value'];
  timestamp: number;
}

const collectors: TraceEntry[][] = [];

export function beginTraceCollection(): void {
  collectors.push([]);
}

export function endTraceCollection(): TraceEntry[] {
  return collectors.pop() ?? [];
}

export function recordTrace(label: string, values: AtomicEvaluationResult['value']): void {
  const collector = collectors[collectors.length - 1];
  if (!collector) {
    return;
  }
  collector.push({
    label,
    values,
    timestamp: Date.now()
  });
}
