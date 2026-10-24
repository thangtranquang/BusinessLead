import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Request, Response } from "express";

/**
 * The request body parser (not Nest) rejects an oversized or malformed body with an http-errors error: a 4xx `status`
 * and `expose: true`. That is the caller's mistake, not a server fault, so it must not become a 500 with a logged stack.
 */
export function clientErrorStatus(exception: unknown): number | null {
  if (typeof exception !== "object" || exception === null) return null;
  const e = exception as { status?: unknown; statusCode?: unknown; expose?: unknown };
  const code = typeof e.status === "number" ? e.status : typeof e.statusCode === "number" ? e.statusCode : null;
  return e.expose === true && code !== null && Number.isInteger(code) && code >= 400 && code < 500 ? code : null;
}

function clientErrorMessage(status: number): string {
  return status === 413 ? "Request body too large" : status === 415 ? "Unsupported content type" : "Bad request";
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const clientError = clientErrorStatus(exception);
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : clientError ?? HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? (exception.getResponse() as { message?: string | string[] }).message ?? exception.message
        : clientError
          ? clientErrorMessage(clientError)
          : "Internal server error";

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} → ${status}`, exception instanceof Error ? exception.stack : String(exception));
    }

    // Machine-readable details the UI relies on (402 UPGRADE_REQUIRED / LIMIT_REACHED / SUBSCRIPTION_INACTIVE). Allowlisted.
    const body = exception instanceof HttpException ? (exception.getResponse() as Record<string, unknown>) : {};
    const detail: Record<string, unknown> = {};
    for (const k of ["code", "feature", "metric", "limit", "used"]) if (typeof body === "object" && body && k in body) detail[k] = body[k];

    response.status(status).json({
      statusCode: status,
      message,
      ...detail,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
