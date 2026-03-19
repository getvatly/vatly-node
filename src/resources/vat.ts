import { ValidationError } from '../errors.js';
import { HttpClient, snakeToCamel, parseRateLimitHeaders } from '../http.js';
import type {
  VatlyResult,
  ValidateParams,
  ValidateResponse,
  VatValidationData,
  ResponseMeta,
  ValidateBatchParams,
  ValidateBatchResponse,
  BatchResult,
  BatchSummary,
} from '../types.js';

export class Vat {
  constructor(private readonly http: HttpClient) {}

  async validate(params: ValidateParams): Promise<VatlyResult<ValidateResponse>> {
    if (!params.vatNumber || !params.vatNumber.trim()) {
      return {
        data: null,
        error: new ValidationError('vat_number is required', 'missing_parameter', 400, null, ''),
      };
    }

    const query: Record<string, string> = {
      vat_number: params.vatNumber.trim(),
    };
    if (params.requesterVatNumber) {
      query.requester_vat_number = params.requesterVatNumber;
    }
    if (params.cache === false) {
      query.cache = 'false';
    }

    const result = await this.http.request('GET', '/v1/validate', {
      query,
      requestId: params.requestId,
    });

    if (result.error) return result;

    const transformed = snakeToCamel(result.data.json) as {
      data: VatValidationData;
      meta: ResponseMeta;
    };

    return {
      data: {
        data: transformed.data,
        meta: transformed.meta,
        rateLimit: parseRateLimitHeaders(result.data.headers),
      },
      error: null,
    };
  }

  async validateBatch(params: ValidateBatchParams): Promise<VatlyResult<ValidateBatchResponse>> {
    if (!params.vatNumbers.length) {
      return {
        data: null,
        error: new ValidationError(
          'At least one VAT number is required',
          'missing_parameter',
          400,
          null,
          '',
        ),
      };
    }
    if (params.vatNumbers.length > 50) {
      return {
        data: null,
        error: new ValidationError(
          `Batch size ${params.vatNumbers.length} exceeds maximum of 50`,
          'batch_too_large',
          400,
          null,
          '',
        ),
      };
    }

    const body: Record<string, unknown> = {
      vat_numbers: params.vatNumbers.map((v) => v.trim()),
    };
    if (params.requesterVatNumber) {
      body.requester_vat_number = params.requesterVatNumber;
    }
    if (params.cache === false) {
      body.cache = false;
    }

    const result = await this.http.request('POST', '/v1/validate/batch', {
      body,
      requestId: params.requestId,
    });

    if (result.error) return result;

    const transformed = snakeToCamel(result.data.json) as {
      data: { results: BatchResult[]; summary: BatchSummary };
      meta: ResponseMeta;
    };

    return {
      data: {
        data: transformed.data,
        meta: transformed.meta,
        rateLimit: parseRateLimitHeaders(result.data.headers),
      },
      error: null,
    };
  }
}
