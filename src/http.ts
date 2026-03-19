declare const __VERSION__: string;

import {
  VatlyError,
  AuthenticationError,
  ValidationError,
  RateLimitError,
  UpstreamError,
} from './errors.js';

import type { VatlyResult, RateLimitInfo } from './types.js';

const AUTHENTICATION_CODES = new Set(['unauthorized', 'tier_insufficient']);
const VALIDATION_CODES = new Set(['invalid_vat_format', 'missing_parameter']);
const RATE_LIMIT_CODES = new Set(['rate_limit_exceeded', 'burst_limit_exceeded']);
const UPSTREAM_CODES = new Set(['upstream_unavailable', 'upstream_error']);

export function snakeToCamel(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(snakeToCamel);
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      result[camelKey] = snakeToCamel(val);
    }
    return result;
  }
  return value;
}

function parseRateLimitHeader(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (value === null) return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

export function parseRateLimitHeaders(headers: Headers): RateLimitInfo {
  const retryAfterRaw = headers.get('retry-after');
  let retryAfter: number | null = null;
  if (retryAfterRaw !== null) {
    const num = Number(retryAfterRaw);
    retryAfter = Number.isNaN(num) ? null : num;
  }

  return {
    limit: parseRateLimitHeader(headers, 'x-ratelimit-limit'),
    remaining: parseRateLimitHeader(headers, 'x-ratelimit-remaining'),
    reset: headers.get('x-ratelimit-reset'),
    retryAfter,
  };
}

function buildError(
  message: string,
  code: string,
  statusCode: number,
  requestId: string | null,
  docsUrl: string,
  retryAfter: number | null,
): VatlyError {
  if (AUTHENTICATION_CODES.has(code)) {
    return new AuthenticationError(message, code, statusCode, requestId, docsUrl);
  }
  if (VALIDATION_CODES.has(code)) {
    return new ValidationError(message, code, statusCode, requestId, docsUrl);
  }
  if (RATE_LIMIT_CODES.has(code)) {
    return new RateLimitError(message, code, statusCode, requestId, docsUrl, retryAfter);
  }
  if (UPSTREAM_CODES.has(code)) {
    return new UpstreamError(message, code, statusCode, requestId, docsUrl, retryAfter);
  }
  return new VatlyError(message, code, statusCode, requestId, docsUrl);
}

export interface HttpRequestOptions {
  query?: Record<string, string>;
  body?: unknown;
  requestId?: string;
}

export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(apiKey: string, baseUrl: string, timeout: number) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  async request(
    method: string,
    path: string,
    options?: HttpRequestOptions,
  ): Promise<VatlyResult<{ json: unknown; headers: Headers }>> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options?.query) {
      for (const [key, value] of Object.entries(options.query)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
      'User-Agent': `vatly-node/${__VERSION__}`,
    };
    if (options?.requestId) {
      headers['X-Request-Id'] = options.requestId;
    }

    const init: RequestInit = { method, headers };
    if (options?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    init.signal = controller.signal;

    let response: Response;
    try {
      response = await fetch(url.toString(), init);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          data: null,
          error: new VatlyError(
            `Request timed out after ${this.timeout}ms`,
            'timeout',
            0,
            null,
            '',
          ),
        };
      }
      return {
        data: null,
        error: new VatlyError(
          error instanceof Error ? error.message : 'Network request failed',
          'network_error',
          0,
          null,
          '',
        ),
      };
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return this.handleErrorResponse(response);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return {
        data: null,
        error: new VatlyError(
          `Expected JSON response but received unparseable body (HTTP ${response.status})`,
          'parse_error',
          response.status,
          response.headers.get('x-request-id'),
          '',
        ),
      };
    }

    return { data: { json, headers: response.headers }, error: null };
  }

  private async handleErrorResponse(
    response: Response,
  ): Promise<VatlyResult<never>> {
    let body: Record<string, unknown> | undefined;
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      return {
        data: null,
        error: new VatlyError(
          `HTTP ${response.status}: ${response.statusText}`,
          'unknown_error',
          response.status,
          null,
          '',
        ),
      };
    }

    const errorObj =
      typeof body === 'object' && body !== null && !Array.isArray(body)
        ? (body.error ?? body)
        : {};
    const error = errorObj as Record<string, unknown>;
    const meta = (body?.meta ?? {}) as Record<string, unknown>;
    const message = (error?.message as string) ?? `HTTP ${response.status}`;
    const code = (error?.code as string) ?? 'unknown_error';
    const requestId =
      (meta?.request_id as string) ??
      response.headers.get('x-request-id') ??
      null;
    const docsUrl = (error?.docs_url as string) ?? '';

    const retryAfterRaw = response.headers.get('retry-after');
    const retryAfter = retryAfterRaw ? Number(retryAfterRaw) : null;

    return {
      data: null,
      error: buildError(message, code, response.status, requestId, docsUrl, retryAfter),
    };
  }
}
