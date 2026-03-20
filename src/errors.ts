export class VatlyError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly requestId: string | null;
  readonly docsUrl: string;
  readonly details: Array<{ field: string; message: string }> | null;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    requestId: string | null,
    docsUrl: string,
    details: Array<{ field: string; message: string }> | null = null,
  ) {
    super(message);
    this.name = 'VatlyError';
    this.code = code;
    this.statusCode = statusCode;
    this.requestId = requestId;
    this.docsUrl = docsUrl;
    this.details = details;
  }
}

export class AuthenticationError extends VatlyError {
  constructor(
    message: string,
    code: string,
    statusCode: number,
    requestId: string | null,
    docsUrl: string,
  ) {
    super(message, code, statusCode, requestId, docsUrl, null);
    this.name = 'AuthenticationError';
  }
}

export class ValidationError extends VatlyError {
  constructor(
    message: string,
    code: string,
    statusCode: number,
    requestId: string | null,
    docsUrl: string,
    details: Array<{ field: string; message: string }> | null = null,
  ) {
    super(message, code, statusCode, requestId, docsUrl, details);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends VatlyError {
  readonly retryAfter: number | null;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    requestId: string | null,
    docsUrl: string,
    retryAfter: number | null,
  ) {
    super(message, code, statusCode, requestId, docsUrl, null);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class UpstreamError extends VatlyError {
  readonly retryAfter: number | null;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    requestId: string | null,
    docsUrl: string,
    retryAfter: number | null,
  ) {
    super(message, code, statusCode, requestId, docsUrl, null);
    this.name = 'UpstreamError';
    this.retryAfter = retryAfter;
  }
}
