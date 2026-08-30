import {
  context as apiContext,
  isSpanContextValid,
  propagation,
  ROOT_CONTEXT,
  trace,
  type Attributes,
  type Context,
  type Span,
} from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export { InMemorySpanExporter };
export type { ReadableSpan, Span };

export interface Telemetry {
  shutdown(): Promise<void>;
}

/**
 * Registra um TracerProvider global com o exporter dado (in-memory nos testes,
 * OTLP/console no futuro). Sem init, os spans são no-op e nenhum traceparent
 * válido é produzido — o código instrumentado não precisa de condicionais.
 */
export function initTelemetry(exporter: SpanExporter): Telemetry {
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register({ propagator: new W3CTraceContextPropagator() });
  return {
    shutdown: () => provider.shutdown(),
  };
}

export function tracer() {
  return trace.getTracer("evolution-os");
}

/** Contexto remoto a partir de um header W3C traceparent (ou ROOT se ausente/ inválido). */
export function contextFromTraceparent(traceparent: string | null | undefined): Context {
  if (!traceparent) return ROOT_CONTEXT;
  return propagation.extract(ROOT_CONTEXT, { traceparent });
}

/** Header W3C traceparent do span dado; undefined para span no-op/inválido. */
export function traceparentOf(span: Span): string | undefined {
  const sc = span.spanContext();
  if (!isSpanContextValid(sc)) return undefined;
  const flags = sc.traceFlags.toString(16).padStart(2, "0");
  return `00-${sc.traceId}-${sc.spanId}-${flags}`;
}

/** Executa fn dentro de um span filho do contexto dado (remoto ou local). */
export async function inSpan<T>(
  name: string,
  parent: Context,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const span = tracer().startSpan(name, { attributes }, parent);
  try {
    return await apiContext.with(trace.setSpan(parent, span), () => fn(span));
  } catch (err) {
    span.recordException(err as Error);
    throw err;
  } finally {
    span.end();
  }
}

/** Contexto que carrega o span dado como pai (para filhos locais). */
export function contextOf(span: Span): Context {
  return trace.setSpan(ROOT_CONTEXT, span);
}
