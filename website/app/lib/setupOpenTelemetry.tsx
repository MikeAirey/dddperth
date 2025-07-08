import {
    AzureMonitorLogExporter,
    AzureMonitorMetricExporter,
    AzureMonitorTraceExporter,
} from '@azure/monitor-opentelemetry-exporter'
import { createAzureSdkInstrumentation } from '@azure/opentelemetry-instrumentation-azure-sdk'
import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api'
import { logs } from '@opentelemetry/api-logs'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'
import { Resource } from '@opentelemetry/resources'
import { BatchLogRecordProcessor, ConsoleLogRecordExporter, LoggerProvider } from '@opentelemetry/sdk-logs'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node'
import {
    ATTR_HTTP_ROUTE,
    SEMRESATTRS_SERVICE_NAME,
    SEMRESATTRS_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'
import fs, { existsSync } from 'node:fs'
import { IncomingMessage } from 'node:http'
import { RemixInstrumentation } from 'opentelemetry-instrumentation-remix'
import {
    APPLICATIONINSIGHTS_CONNECTION_STRING,
    OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
    OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
} from '../lib/config.server'

export function configureOpenTelemetry() {
    const enableTracingConsoleFallback = false

    const traceExporter = APPLICATIONINSIGHTS_CONNECTION_STRING
        ? new AzureMonitorTraceExporter({
              connectionString: APPLICATIONINSIGHTS_CONNECTION_STRING,
          })
        : (OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? OTEL_EXPORTER_OTLP_ENDPOINT)
          ? new OTLPTraceExporter()
          : enableTracingConsoleFallback
            ? new ConsoleSpanExporter()
            : undefined

    const metricExporter = APPLICATIONINSIGHTS_CONNECTION_STRING
        ? new AzureMonitorMetricExporter({
              connectionString: APPLICATIONINSIGHTS_CONNECTION_STRING,
          })
        : (OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ?? OTEL_EXPORTER_OTLP_ENDPOINT)
          ? new OTLPMetricExporter()
          : undefined

    const logsExporter = APPLICATIONINSIGHTS_CONNECTION_STRING
        ? new AzureMonitorLogExporter({
              connectionString: APPLICATIONINSIGHTS_CONNECTION_STRING,
          })
        : (OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ?? OTEL_EXPORTER_OTLP_ENDPOINT)
          ? new OTLPLogExporter()
          : enableTracingConsoleFallback
            ? new ConsoleLogRecordExporter()
            : undefined

    const metricReader = metricExporter
        ? new PeriodicExportingMetricReader({
              exporter: metricExporter,
          })
        : undefined

    const loggerProvider = new LoggerProvider()
    const logRecordProcessor = logsExporter ? new BatchLogRecordProcessor(logsExporter) : undefined
    if (logRecordProcessor) {
        loggerProvider.addLogRecordProcessor(logRecordProcessor)
    }

    if (traceExporter || metricReader || logRecordProcessor) {
        console.log('Configuring open telemetry')

        logs.setGlobalLoggerProvider(loggerProvider)
        diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR)
        const sdk = new NodeSDK({
            traceExporter: traceExporter,

            metricReader: metricReader as any,
            logRecordProcessor,
            instrumentations: [
                // Express instrumentation expects HTTP layer to be instrumented
                new HttpInstrumentation({
                    // Use full URL path in span names
                    applyCustomAttributesOnSpan: (span, request) => {
                        // Remix has a default route of * which handles pretty much everything.
                        // Override that route attribute with the request url which is the relative path of the route
                        if (request instanceof IncomingMessage && request.url) {
                            span.setAttribute(ATTR_HTTP_ROUTE, request.url)
                            span.updateName(`${request.method} ${request.url}`)
                        }
                    },
                    // Ignore specific endpoints
                    ignoreIncomingRequestHook: (request) => {
                        const ignorePaths = [
                            '/healthcheck',
                            '/favicon.svg',
                            '/static',
                            '/@fs',
                            '/@id',
                            '/@vite',
                            '/app/',
                            '.vite',
                            '__manifest',
                        ]
                        const shouldIgnore = ignorePaths.some((path) => request.url?.includes(path))

                        return shouldIgnore
                    },
                }),
                new UndiciInstrumentation(),
                new ExpressInstrumentation({}),
                new RemixInstrumentation(),
                createAzureSdkInstrumentation(),
            ],
            resource: new Resource({
                [SEMRESATTRS_SERVICE_NAME]: 'DDD-Website',

                [SEMRESATTRS_SERVICE_VERSION]: JSON.parse(
                    existsSync('./server/package.json')
                        ? fs.readFileSync('./server/package.json', 'utf-8')
                        : fs.readFileSync('./package.json', 'utf-8'),
                ),
            }),
        })

        sdk.start()
    }
}
