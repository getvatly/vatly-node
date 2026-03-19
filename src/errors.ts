export class VatlyError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly requestId: string | null;
  readonly docsUrl: string;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    requestId: string | null,
    docsUrl: string,
  ) {
    super(message);
    this.name = 'VatlyError';
    this.code = code;
    this.statusCode = statusCode;
    this.requestId = requestId;
    this.docsUrl = docsUrl;
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
    super(message, code, statusCode, requestId, docsUrl);
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
  ) {
    super(message, code, statusCode, requestId, docsUrl);
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
    super(message, code, statusCode, requestId, docsUrl);
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
    super(message, code, statusCode, requestId, docsUrl);
    this.name = 'UpstreamError';
    this.retryAfter = retryAfter;
  }
}
