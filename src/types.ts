// --- Core result tuple ---

import type { VatlyError } from './errors.js';

export type VatlyResult<T> = { data: T; error: null } | { data: null; error: VatlyError };

// --- Error codes ---

export type ErrorCode =
  | 'missing_parameter'
  | 'invalid_vat_format'
  | 'unauthorized'
  | 'rate_limit_exceeded'
  | 'burst_limit_exceeded'
  | 'upstream_error'
  | 'upstream_unavailable'
  | 'validation_error'
  | 'invalid_json'
  | 'tier_insufficient'
  | 'not_found';

// --- Configuration ---

export interface VatlyOptions {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
}

// --- Validate ---

export interface ValidateParams {
  vatNumber: string;
  requesterVatNumber?: string;
  cache?: boolean;
  requestId?: string;
}

export interface Company {
  name: string;
  address: string | null;
}

export interface VatValidationData {
  valid: boolean;
  vatNumber: string;
  countryCode: string;
  company: Company | null;
  consultationNumber: string | null;
  requestedAt: string;
}

export interface ResponseMeta {
  requestId: string;
  cached: boolean | null;
  cachedAt: string | null;
  stale: boolean | null;
  mode: 'test' | null;
  requestDurationMs: number | null;
}

export interface RateLimitInfo {
  limit: number | null;
  remaining: number | null;
  reset: string | null;
  retryAfter: number | null;
}

export interface ValidateResponse {
  data: VatValidationData;
  meta: ResponseMeta;
  rateLimit: RateLimitInfo;
}

// --- Batch Validate ---

export interface ValidateBatchParams {
  vatNumbers: string[];
  requesterVatNumber?: string;
  cache?: boolean;
  requestId?: string;
}

export interface BatchItemMeta {
  cached: boolean | null;
  cachedAt: string | null;
  stale: boolean | null;
}

export interface BatchResultSuccess {
  data: VatValidationData;
  meta: BatchItemMeta;
}

export interface BatchResultError {
  error: { code: string; message: string };
  meta: { vatNumber: string };
}

export type BatchResult = BatchResultSuccess | BatchResultError;

export function isBatchSuccess(item: BatchResult): item is BatchResultSuccess {
  return 'data' in item;
}

export interface BatchSummary {
  total: number;
  succeeded: number;
  failed: number;
}

export interface ValidateBatchResponse {
  data: { results: BatchResult[]; summary: BatchSummary };
  meta: ResponseMeta;
  rateLimit: RateLimitInfo;
}

// --- Rates ---

export interface OtherRate {
  rate: number;
  type: 'reduced' | 'super_reduced' | 'zero';
}

export interface VatRate {
  countryCode: string;
  countryName: string;
  currency: string;
  standardRate: number;
  otherRates: OtherRate[];
  updatedAt: string;
}

export interface ListRatesResponse {
  data: VatRate[];
  meta: { requestId: string; count: number };
  rateLimit: RateLimitInfo;
}

export interface GetRateResponse {
  data: VatRate;
  meta: { requestId: string };
  rateLimit: RateLimitInfo;
}
