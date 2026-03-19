import { HttpClient, snakeToCamel, parseRateLimitHeaders } from '../http.js';
import type {
  VatlyResult,
  ListRatesResponse,
  GetRateResponse,
  VatRate,
} from '../types.js';

export class Rates {
  constructor(private readonly http: HttpClient) {}

  async list(): Promise<VatlyResult<ListRatesResponse>> {
    const result = await this.http.request('GET', '/v1/rates');
    if (result.error) return result;

    const transformed = snakeToCamel(result.data.json) as {
      data: VatRate[];
      meta: { requestId: string; count: number };
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

  async get(countryCode: string): Promise<VatlyResult<GetRateResponse>> {
    const result = await this.http.request('GET', `/v1/rates/${encodeURIComponent(countryCode)}`);
    if (result.error) return result;

    const transformed = snakeToCamel(result.data.json) as {
      data: VatRate;
      meta: { requestId: string };
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
