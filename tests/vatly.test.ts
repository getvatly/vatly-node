import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Vatly, {
  VatlyError,
  AuthenticationError,
  ValidationError,
  RateLimitError,
  UpstreamError,
  isBatchSuccess,
} from '../src/index.js';
import type { BatchResult } from '../src/index.js';

const MOCK_API_KEY = 'vtly_live_test123';

function mockResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {
      'content-type': 'application/json',
      'x-ratelimit-limit': '100',
      'x-ratelimit-remaining': '99',
      'x-ratelimit-reset': '2026-04-01T00:00:00Z',
      ...headers,
    },
  });
}

const VALID_RESPONSE = {
  data: {
    valid: true,
    vat_number: 'NL123456789B01',
    country_code: 'NL',
    company: { name: 'Test BV', address: 'Amsterdam, Netherlands' },
    consultation_number: null,
    requested_at: '2026-03-18T12:00:00Z',
  },
  meta: {
    request_id: 'req_abc123',
    cached: null,
    cached_at: null,
    stale: null,
    mode: null,
    request_duration_ms: 150,
    source_status: null,
  },
};

// ─── Constructor ──────────────────────────────────────────────

describe('Vatly constructor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('accepts a string API key', () => {
    const client = new Vatly('vtly_live_mykey');
    expect(client.vat).toBeDefined();
    expect(client.rates).toBeDefined();
  });

  it('accepts a config object', () => {
    const client = new Vatly({
      apiKey: MOCK_API_KEY,
      baseUrl: 'https://custom.api.vatly.dev',
      timeout: 5000,
    });
    expect(client.vat).toBeDefined();
  });

  it('falls back to VATLY_API_KEY env var', () => {
    vi.stubEnv('VATLY_API_KEY', 'vtly_live_envkey');
    const client = new Vatly({});
    expect(client.vat).toBeDefined();
  });

  it('falls back to VATLY_API_KEY env var when config has no apiKey', () => {
    vi.stubEnv('VATLY_API_KEY', 'vtly_live_envkey');
    const client = new Vatly({ timeout: 5000 });
    expect(client.vat).toBeDefined();
  });

  it('throws when no API key is available', () => {
    vi.stubEnv('VATLY_API_KEY', '');
    expect(() => new Vatly('')).toThrow(VatlyError);
    expect(() => new Vatly('')).toThrow('No API key provided');
  });

  it('exposes error classes as static properties', () => {
    expect(Vatly.VatlyError).toBe(VatlyError);
    expect(Vatly.AuthenticationError).toBe(AuthenticationError);
    expect(Vatly.ValidationError).toBe(ValidationError);
    expect(Vatly.RateLimitError).toBe(RateLimitError);
    expect(Vatly.UpstreamError).toBe(UpstreamError);
  });
});

// ─── vatly.vat.validate() ─────────────────────────────────────

describe('vatly.vat.validate()', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns { data, error: null } on success', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(VALID_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.error).toBeNull();
    expect(result.data!.data.valid).toBe(true);
    expect(result.data!.data.vatNumber).toBe('NL123456789B01');
    expect(result.data!.data.countryCode).toBe('NL');
    expect(result.data!.data.company).toEqual({ name: 'Test BV', address: 'Amsterdam, Netherlands' });
    expect(result.data!.data.requestedAt).toBe('2026-03-18T12:00:00Z');
  });

  it('includes consultationNumber when requesterVatNumber is provided', async () => {
    const responseWithConsultation = {
      ...VALID_RESPONSE,
      data: { ...VALID_RESPONSE.data, consultation_number: 'WAPIAAAAA1BBBBB' },
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(responseWithConsultation));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({
      vatNumber: 'NL123456789B01',
      requesterVatNumber: 'DE987654321',
    });

    expect(result.data!.data.consultationNumber).toBe('WAPIAAAAA1BBBBB');
    const url = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(url.searchParams.get('requester_vat_number')).toBe('DE987654321');
  });

  it('sends cache=false query param when cache is false', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(VALID_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    await client.vat.validate({ vatNumber: 'NL123456789B01', cache: false });

    const url = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(url.searchParams.get('cache')).toBe('false');
  });

  it('does not add cache query param when cache option is omitted', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(VALID_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    await client.vat.validate({ vatNumber: 'NL123456789B01' });

    const url = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(url.searchParams.has('cache')).toBe(false);
  });

  it('sends Authorization header correctly', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(VALID_RESPONSE));
    const client = new Vatly('vtly_live_mykey');
    await client.vat.validate({ vatNumber: 'NL123456789B01' });

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer vtly_live_mykey');
  });

  it('uses env var for auth when config has no apiKey', async () => {
    vi.stubEnv('VATLY_API_KEY', 'vtly_live_envkey');
    fetchSpy.mockResolvedValueOnce(mockResponse(VALID_RESPONSE));
    const client = new Vatly({});
    await client.vat.validate({ vatNumber: 'NL123456789B01' });

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer vtly_live_envkey');
  });

  it('uses custom baseUrl', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(VALID_RESPONSE));
    const client = new Vatly({ apiKey: MOCK_API_KEY, baseUrl: 'https://custom.api.vatly.dev' });
    await client.vat.validate({ vatNumber: 'NL123456789B01' });

    const url = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(url.origin).toBe('https://custom.api.vatly.dev');
  });

  it('sets User-Agent header correctly', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(VALID_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    await client.vat.validate({ vatNumber: 'NL123456789B01' });

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/^vatly-node\//);
  });

  it('transforms snake_case fields to camelCase', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(VALID_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    const data = result.data!.data;
    expect(data).toHaveProperty('vatNumber');
    expect(data).toHaveProperty('countryCode');
    expect(data).toHaveProperty('consultationNumber');
    expect(data).toHaveProperty('requestedAt');
    expect(data).not.toHaveProperty('vat_number');
    expect(data).not.toHaveProperty('country_code');
  });

  it('consultationNumber is null when not present', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(VALID_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.data!.data.consultationNumber).toBeNull();
    expect('consultationNumber' in result.data!.data).toBe(true);
  });

  it('handles null company field', async () => {
    const responseWithNullCompany = {
      ...VALID_RESPONSE,
      data: { ...VALID_RESPONSE.data, company: null },
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(responseWithNullCompany));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.data!.data.company).toBeNull();
    expect(result.data!.data.valid).toBe(true);
  });

  it('handles null company.address', async () => {
    const responseWithNullAddress = {
      ...VALID_RESPONSE,
      data: { ...VALID_RESPONSE.data, company: { name: 'Test BV', address: null } },
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(responseWithNullAddress));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.data!.data.company!.address).toBeNull();
  });

  it('sends X-Request-Id header when requestId option is provided', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(VALID_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    await client.vat.validate({ vatNumber: 'NL123456789B01', requestId: 'my-trace-id-123' });

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-Request-Id']).toBe('my-trace-id-123');
  });

  it('trims whitespace from vatNumber before sending', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(VALID_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    await client.vat.validate({ vatNumber: '  NL123456789B01  ' });

    const url = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(url.searchParams.get('vat_number')).toBe('NL123456789B01');
  });

  // --- Response meta ---

  it('returns response meta with requestId and rateLimit', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(VALID_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.data!.meta.requestId).toBe('req_abc123');
    expect(result.data!.meta.requestDurationMs).toBe(150);
    expect(result.data!.rateLimit.limit).toBe(100);
    expect(result.data!.rateLimit.remaining).toBe(99);
    expect(result.data!.rateLimit.reset).toBe('2026-04-01T00:00:00Z');
    expect(result.data!.rateLimit.retryAfter).toBeNull();
  });

  it('transforms cached metadata fields', async () => {
    const cachedResponse = {
      data: VALID_RESPONSE.data,
      meta: {
        request_id: 'req_cached',
        cached: true,
        cached_at: '2026-03-18T11:00:00Z',
        stale: false,
        mode: null,
        request_duration_ms: 5,
        source_status: null,
      },
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(cachedResponse));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.data!.meta.cached).toBe(true);
    expect(result.data!.meta.cachedAt).toBe('2026-03-18T11:00:00Z');
    expect(result.data!.meta.stale).toBe(false);
    expect(result.data!.meta.requestDurationMs).toBe(5);
  });

  it('surfaces test mode in meta', async () => {
    const testResponse = {
      data: VALID_RESPONSE.data,
      meta: {
        request_id: 'req_test',
        mode: 'test',
        cached: null,
        cached_at: null,
        stale: null,
        request_duration_ms: 10,
        source_status: null,
      },
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(testResponse));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.data!.meta.mode).toBe('test');
    expect(result.data!.meta.requestId).toBe('req_test');
  });

  it('surfaces stale response meta', async () => {
    const staleResponse = {
      data: VALID_RESPONSE.data,
      meta: {
        request_id: 'req_stale',
        cached: true,
        cached_at: '2026-03-17T11:00:00Z',
        stale: true,
        mode: null,
        request_duration_ms: 2,
        source_status: null,
      },
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(staleResponse));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.data!.meta.stale).toBe(true);
    expect(result.data!.meta.cached).toBe(true);
  });

  // --- Rate limit headers ---

  it('returns null for absent rate limit headers', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(VALID_RESPONSE), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.data!.rateLimit.limit).toBeNull();
    expect(result.data!.rateLimit.remaining).toBeNull();
    expect(result.data!.rateLimit.reset).toBeNull();
    expect(result.data!.rateLimit.retryAfter).toBeNull();
  });

  it('parses rate limit headers correctly', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(VALID_RESPONSE, 200, {
        'x-ratelimit-limit': '500',
        'x-ratelimit-remaining': '42',
        'x-ratelimit-reset': '2026-05-01T00:00:00Z',
        'retry-after': '10',
      }),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.data!.rateLimit).toEqual({
      limit: 500,
      remaining: 42,
      reset: '2026-05-01T00:00:00Z',
      retryAfter: 10,
      burstLimit: null,
      burstRemaining: null,
    });
  });

  it('returns null for malformed rate limit header values', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(VALID_RESPONSE, 200, {
        'x-ratelimit-limit': 'not-a-number',
        'x-ratelimit-remaining': 'abc',
        'x-ratelimit-reset': '2026-05-01T00:00:00Z',
      }),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.data!.rateLimit.limit).toBeNull();
    expect(result.data!.rateLimit.remaining).toBeNull();
    expect(result.data!.rateLimit.reset).toBe('2026-05-01T00:00:00Z');
  });

  // --- Error responses (all return { data: null, error }) ---

  it('returns ValidationError for empty vatNumber (no network request)', async () => {
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: '' });

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error!.code).toBe('missing_parameter');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns ValidationError for whitespace-only vatNumber', async () => {
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: '   ' });

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns AuthenticationError on 401', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Invalid API key', code: 'unauthorized' }, meta: { request_id: 'req_err1' } },
        401,
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(AuthenticationError);
    expect(result.error!.code).toBe('unauthorized');
    expect(result.error!.statusCode).toBe(401);
    expect(result.error!.requestId).toBe('req_err1');
  });

  it('returns AuthenticationError on 403 tier_insufficient', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Upgrade your plan', code: 'tier_insufficient' }, meta: { request_id: 'req_tier' } },
        403,
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.error).toBeInstanceOf(AuthenticationError);
    expect(result.error!.code).toBe('tier_insufficient');
    expect(result.error!.statusCode).toBe(403);
  });

  it('returns ValidationError on 422 invalid_vat_format', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Invalid VAT format', code: 'invalid_vat_format' }, meta: { request_id: 'req_err2' } },
        422,
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'INVALID' });

    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error!.code).toBe('invalid_vat_format');
  });

  it('returns RateLimitError on 429 with retryAfter', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Rate limit exceeded', code: 'rate_limit_exceeded' }, meta: { request_id: 'req_err3' } },
        429,
        { 'retry-after': '30' },
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.error).toBeInstanceOf(RateLimitError);
    expect((result.error as RateLimitError).retryAfter).toBe(30);
    expect(result.error!.statusCode).toBe(429);
  });

  it('returns RateLimitError on 429 burst_limit_exceeded', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Burst limit exceeded', code: 'burst_limit_exceeded' }, meta: { request_id: 'req_burst' } },
        429,
        { 'retry-after': '5' },
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.error).toBeInstanceOf(RateLimitError);
    expect(result.error!.code).toBe('burst_limit_exceeded');
    expect((result.error as RateLimitError).retryAfter).toBe(5);
  });

  it('returns UpstreamError on 503 upstream_unavailable with retryAfter', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'VIES is unavailable', code: 'upstream_unavailable' }, meta: { request_id: 'req_err4' } },
        503,
        { 'retry-after': '60' },
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.error).toBeInstanceOf(UpstreamError);
    expect((result.error as UpstreamError).retryAfter).toBe(60);
  });

  it('returns UpstreamError on 503 upstream_member_state_unavailable', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Member state service unavailable', code: 'upstream_member_state_unavailable' }, meta: { request_id: 'req_err4b' } },
        503,
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'GB123456789' });

    expect(result.error).toBeInstanceOf(UpstreamError);
    expect(result.error!.code).toBe('upstream_member_state_unavailable');
    expect(result.error!.requestId).toBe('req_err4b');
  });

  it('error includes docsUrl from API response', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        {
          error: { message: 'Invalid VAT format', code: 'invalid_vat_format', docs_url: 'https://docs.vatly.dev/errors/invalid_vat_format' },
          meta: { request_id: 'req_err5' },
        },
        422,
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'INVALID' });

    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error!.docsUrl).toBe('https://docs.vatly.dev/errors/invalid_vat_format');
  });

  it('returns VatlyError on timeout', async () => {
    fetchSpy.mockImplementationOnce(() =>
      new Promise((_, reject) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      }),
    );
    const client = new Vatly({ apiKey: MOCK_API_KEY, timeout: 100 });
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(VatlyError);
    expect(result.error!.message).toContain('timed out');
    expect(result.error!.code).toBe('timeout');
  });

  it('returns VatlyError with network_error code on fetch failure', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND api.vatly.dev'));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.error).toBeInstanceOf(VatlyError);
    expect(result.error!.code).toBe('network_error');
    expect(result.error!.message).toBe('getaddrinfo ENOTFOUND api.vatly.dev');
  });

  it('returns VatlyError on non-JSON error response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.error).toBeInstanceOf(VatlyError);
    expect(result.error!.message).toContain('HTTP 500');
  });

  it('returns VatlyError with parse_error on non-JSON 200 response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('<html>Gateway OK</html>', {
        status: 200,
        statusText: 'OK',
        headers: { 'x-request-id': 'req_proxy' },
      }),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.error).toBeInstanceOf(VatlyError);
    expect(result.error!.code).toBe('parse_error');
    expect(result.error!.statusCode).toBe(200);
    expect(result.error!.requestId).toBe('req_proxy');
  });

  it('returns VatlyError on non-JSON 502 page', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('<html><body>Bad Gateway</body></html>', { status: 502, statusText: 'Bad Gateway' }),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.error).toBeInstanceOf(VatlyError);
    expect(result.error!.code).toBe('unknown_error');
    expect(result.error!.statusCode).toBe(502);
  });

  it('extracts requestId from x-request-id response header when meta is missing', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Some error', code: 'unknown_error' } },
        500,
        { 'x-request-id': 'req_from_header' },
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.error!.requestId).toBe('req_from_header');
  });

  it('returns AuthenticationError on 403 forbidden', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Access forbidden', code: 'forbidden' }, meta: { request_id: 'req_forbidden' } },
        403,
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.error).toBeInstanceOf(AuthenticationError);
    expect(result.error!.code).toBe('forbidden');
    expect(result.error!.statusCode).toBe(403);
  });

  it('returns AuthenticationError on 401 key_revoked', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'API key has been revoked', code: 'key_revoked' }, meta: { request_id: 'req_revoked' } },
        401,
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.error).toBeInstanceOf(AuthenticationError);
    expect(result.error!.code).toBe('key_revoked');
    expect(result.error!.statusCode).toBe(401);
  });

  it('returns ValidationError on 422 validation_error with details', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        {
          error: {
            message: 'Validation failed',
            code: 'validation_error',
            details: [{ field: 'vat_number', message: 'must be a string' }],
          },
          meta: { request_id: 'req_val_details' },
        },
        422,
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error!.code).toBe('validation_error');
    expect(result.error!.details).toEqual([{ field: 'vat_number', message: 'must be a string' }]);
  });

  it('returns ValidationError on 400 invalid_json', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Invalid JSON body', code: 'invalid_json' }, meta: { request_id: 'req_json' } },
        400,
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error!.code).toBe('invalid_json');
    expect(result.error!.statusCode).toBe(400);
  });

  it('returns UpstreamError on 503 upstream_member_state_unavailable', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Member state service is unavailable', code: 'upstream_member_state_unavailable' }, meta: { request_id: 'req_ms' } },
        503,
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.error).toBeInstanceOf(UpstreamError);
    expect(result.error!.code).toBe('upstream_member_state_unavailable');
  });

  it('returns generic VatlyError on 500 internal_error', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Internal server error', code: 'internal_error' }, meta: { request_id: 'req_internal' } },
        500,
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.error).toBeInstanceOf(VatlyError);
    expect(result.error).not.toBeInstanceOf(AuthenticationError);
    expect(result.error).not.toBeInstanceOf(ValidationError);
    expect(result.error!.code).toBe('internal_error');
    expect(result.error!.statusCode).toBe(500);
  });

  it('returns generic VatlyError on 403 key_limit_reached', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Monthly key limit reached', code: 'key_limit_reached' }, meta: { request_id: 'req_limit' } },
        403,
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.error).toBeInstanceOf(VatlyError);
    expect(result.error).not.toBeInstanceOf(AuthenticationError);
    expect(result.error!.code).toBe('key_limit_reached');
  });

  // --- sourceStatus ---

  it('surfaces sourceStatus "live" from response meta', async () => {
    const response = {
      data: VALID_RESPONSE.data,
      meta: { ...VALID_RESPONSE.meta, source_status: 'live' },
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(response));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.data!.meta.sourceStatus).toBe('live');
  });

  it('surfaces sourceStatus "unavailable" from response meta', async () => {
    const response = {
      data: VALID_RESPONSE.data,
      meta: { ...VALID_RESPONSE.meta, source_status: 'unavailable' },
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(response));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.data!.meta.sourceStatus).toBe('unavailable');
  });

  it('surfaces sourceStatus "degraded" from response meta', async () => {
    const response = {
      data: VALID_RESPONSE.data,
      meta: { ...VALID_RESPONSE.meta, source_status: 'degraded' },
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(response));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.data!.meta.sourceStatus).toBe('degraded');
  });

  // --- Burst limit headers ---

  it('parses X-Burst-Limit and X-Burst-Remaining headers', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(VALID_RESPONSE, 200, {
        'x-ratelimit-limit': '100',
        'x-ratelimit-remaining': '99',
        'x-ratelimit-reset': '2026-04-01T00:00:00Z',
        'x-burst-limit': '20',
        'x-burst-remaining': '15',
      }),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.data!.rateLimit.burstLimit).toBe(20);
    expect(result.data!.rateLimit.burstRemaining).toBe(15);
  });

  it('returns null for absent burst limit headers', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(VALID_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.data!.rateLimit.burstLimit).toBeNull();
    expect(result.data!.rateLimit.burstRemaining).toBeNull();
  });

  // --- Error details ---

  it('errors without details have null', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Invalid API key', code: 'unauthorized' }, meta: { request_id: 'req_nodet' } },
        401,
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validate({ vatNumber: 'NL123456789B01' });

    expect(result.error!.details).toBeNull();
  });
});

// ─── vatly.vat.validateBatch() ────────────────────────────────

describe('vatly.vat.validateBatch()', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const BATCH_RESPONSE = {
    data: {
      results: [
        {
          data: {
            valid: true,
            vat_number: 'NL123456789B01',
            country_code: 'NL',
            company: { name: 'Test BV', address: 'Amsterdam' },
            consultation_number: null,
            requested_at: '2026-03-18T12:00:00Z',
          },
          meta: { cached: null, cached_at: null, stale: null, source_status: null },
        },
        {
          data: {
            valid: true,
            vat_number: 'DE987654321',
            country_code: 'DE',
            company: { name: 'Test GmbH', address: 'Berlin' },
            consultation_number: null,
            requested_at: '2026-03-18T12:00:01Z',
          },
          meta: { cached: null, cached_at: null, stale: null, source_status: null },
        },
      ],
      summary: { total: 2, succeeded: 2, failed: 0 },
    },
    meta: {
      request_id: 'req_batch1',
      mode: null,
      request_duration_ms: 300,
    },
  };

  it('validates a batch of VAT numbers', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(BATCH_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validateBatch({ vatNumbers: ['NL123456789B01', 'DE987654321'] });

    expect(result.error).toBeNull();
    expect(result.data!.data.results).toHaveLength(2);
    expect(result.data!.data.summary.total).toBe(2);
    expect(result.data!.data.summary.succeeded).toBe(2);

    const [callUrl, callInit] = fetchSpy.mock.calls[0];
    expect(callUrl).toContain('/v1/validate/batch');
    expect(callInit.method).toBe('POST');
    const body = JSON.parse(callInit.body);
    expect(body.vat_numbers).toEqual(['NL123456789B01', 'DE987654321']);
  });

  it('handles mixed batch results', async () => {
    const mixedResponse = {
      data: {
        results: [
          {
            data: {
              valid: true,
              vat_number: 'NL123456789B01',
              country_code: 'NL',
              company: { name: 'Test BV', address: 'Amsterdam' },
              consultation_number: null,
              requested_at: '2026-03-18T12:00:00Z',
            },
            meta: { cached: null, cached_at: null, stale: null, source_status: null },
          },
          {
            error: { code: 'invalid_vat_format', message: 'Invalid VAT format' },
            meta: { vat_number: 'XX000000000' },
          },
        ],
        summary: { total: 2, succeeded: 1, failed: 1 },
      },
      meta: {
        request_id: 'req_batch_mixed',
        mode: null,
        request_duration_ms: 200,
      },
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(mixedResponse));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validateBatch({ vatNumbers: ['NL123456789B01', 'XX000000000'] });

    expect(result.data!.data.results).toHaveLength(2);
    expect(result.data!.data.summary.succeeded).toBe(1);
    expect(result.data!.data.summary.failed).toBe(1);

    expect(isBatchSuccess(result.data!.data.results[0])).toBe(true);
    expect(isBatchSuccess(result.data!.data.results[1])).toBe(false);
  });

  it('handles all-fail batch', async () => {
    const allFailResponse = {
      data: {
        results: [
          { error: { code: 'invalid_vat_format', message: 'Invalid' }, meta: { vat_number: 'XX1' } },
          { error: { code: 'invalid_vat_format', message: 'Invalid' }, meta: { vat_number: 'XX2' } },
        ],
        summary: { total: 2, succeeded: 0, failed: 2 },
      },
      meta: { request_id: 'req_all_fail', mode: null, request_duration_ms: 50 },
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(allFailResponse));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validateBatch({ vatNumbers: ['XX1', 'XX2'] });

    expect(result.data!.data.summary.failed).toBe(2);
    expect(result.data!.data.results.every((r) => !isBatchSuccess(r))).toBe(true);
  });

  it('sends requester_vat_number in request body', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(BATCH_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    await client.vat.validateBatch({ vatNumbers: ['NL123456789B01'], requesterVatNumber: 'DE987654321' });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.requester_vat_number).toBe('DE987654321');
  });

  it('sends cache: false in request body', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(BATCH_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    await client.vat.validateBatch({ vatNumbers: ['NL123456789B01'], cache: false });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.cache).toBe(false);
  });

  it('sends X-Request-Id header', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(BATCH_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    await client.vat.validateBatch({ vatNumbers: ['NL123456789B01'], requestId: 'batch-trace-123' });

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-Request-Id']).toBe('batch-trace-123');
  });

  it('trims whitespace from each vatNumber', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(BATCH_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    await client.vat.validateBatch({ vatNumbers: ['  NL123456789B01  ', ' DE987654321 '] });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.vat_numbers).toEqual(['NL123456789B01', 'DE987654321']);
  });

  it('parses rate limit headers on batch response', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(BATCH_RESPONSE, 200, {
        'x-ratelimit-limit': '50',
        'x-ratelimit-remaining': '48',
        'x-ratelimit-reset': '2026-05-01T00:00:00Z',
      }),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validateBatch({ vatNumbers: ['NL123456789B01'] });

    expect(result.data!.rateLimit).toEqual({
      limit: 50,
      remaining: 48,
      reset: '2026-05-01T00:00:00Z',
      retryAfter: null,
      burstLimit: null,
      burstRemaining: null,
    });
  });

  it('handles 50-item boundary (max batch size)', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(BATCH_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    const vatNumbers = Array.from({ length: 50 }, (_, i) => `NL${String(i).padStart(9, '0')}B01`);
    const result = await client.vat.validateBatch({ vatNumbers });

    expect(result.error).toBeNull();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  // --- Error responses ---

  it('returns ValidationError for empty vatNumbers array', async () => {
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validateBatch({ vatNumbers: [] });

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error!.code).toBe('missing_parameter');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns ValidationError when batch exceeds 50', async () => {
    const client = new Vatly(MOCK_API_KEY);
    const vatNumbers = Array.from({ length: 51 }, (_, i) => `NL${String(i).padStart(9, '0')}B01`);
    const result = await client.vat.validateBatch({ vatNumbers });

    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error!.code).toBe('batch_too_large');
    expect(result.error!.message).toContain('50');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns AuthenticationError on 403 tier_insufficient', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Upgrade your plan', code: 'tier_insufficient' }, meta: { request_id: 'req_batch_tier' } },
        403,
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validateBatch({ vatNumbers: ['NL123456789B01'] });

    expect(result.error).toBeInstanceOf(AuthenticationError);
    expect(result.error!.code).toBe('tier_insufficient');
  });

  it('returns RateLimitError on 429', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Rate limit exceeded', code: 'rate_limit_exceeded' }, meta: { request_id: 'req_batch_rl' } },
        429,
        { 'retry-after': '15' },
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validateBatch({ vatNumbers: ['NL123456789B01'] });

    expect(result.error).toBeInstanceOf(RateLimitError);
    expect((result.error as RateLimitError).retryAfter).toBe(15);
  });

  it('surfaces per-item sourceStatus in batch results', async () => {
    const batchWithSourceStatus = {
      data: {
        results: [
          {
            data: {
              valid: true,
              vat_number: 'NL123456789B01',
              country_code: 'NL',
              company: { name: 'Test BV', address: 'Amsterdam' },
              consultation_number: null,
              requested_at: '2026-03-18T12:00:00Z',
            },
            meta: { cached: null, cached_at: null, stale: null, source_status: 'live' },
          },
        ],
        summary: { total: 1, succeeded: 1, failed: 0 },
      },
      meta: { request_id: 'req_batch_ss', mode: null, request_duration_ms: 100 },
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(batchWithSourceStatus));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.vat.validateBatch({ vatNumbers: ['NL123456789B01'] });

    const item = result.data!.data.results[0];
    expect(isBatchSuccess(item)).toBe(true);
    if (isBatchSuccess(item)) {
      expect(item.meta.sourceStatus).toBe('live');
    }
  });
});

// ─── isBatchSuccess type guard ────────────────────────────────

describe('isBatchSuccess', () => {
  it('returns true for success items (has data key)', () => {
    const success: BatchResult = {
      data: {
        valid: true,
        vatNumber: 'NL123456789B01',
        countryCode: 'NL',
        company: null,
        consultationNumber: null,
        requestedAt: '2026-03-18T12:00:00Z',
      },
      meta: { cached: null, cachedAt: null, stale: null, sourceStatus: null },
    };
    expect(isBatchSuccess(success)).toBe(true);
  });

  it('returns false for error items', () => {
    const failure: BatchResult = {
      error: { code: 'invalid_vat_format', message: 'Invalid' },
      meta: { vatNumber: 'XX000' },
    };
    expect(isBatchSuccess(failure)).toBe(false);
  });
});

// ─── vatly.rates.list() ──────────────────────────────────────

describe('vatly.rates.list()', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const LIST_RATES_RESPONSE = {
    data: [
      {
        country_code: 'NL',
        country_name: 'Netherlands',
        currency: 'EUR',
        standard_rate: 21,
        other_rates: [{ rate: 9, type: 'reduced' }, { rate: 0, type: 'zero' }],
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        country_code: 'DE',
        country_name: 'Germany',
        currency: 'EUR',
        standard_rate: 19,
        other_rates: [{ rate: 7, type: 'reduced' }],
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    meta: { request_id: 'req_rates1', count: 2 },
  };

  it('returns list of VAT rates', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(LIST_RATES_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.rates.list();

    expect(result.error).toBeNull();
    expect(result.data!.data).toHaveLength(2);
    expect(result.data!.data[0].countryCode).toBe('NL');
    expect(result.data!.data[0].standardRate).toBe(21);
    expect(result.data!.data[0].otherRates).toEqual([
      { rate: 9, type: 'reduced' },
      { rate: 0, type: 'zero' },
    ]);
    expect(result.data!.meta.count).toBe(2);
    expect(result.data!.meta.requestId).toBe('req_rates1');
  });

  it('includes rate limit info', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(LIST_RATES_RESPONSE, 200, {
        'x-ratelimit-limit': '200',
        'x-ratelimit-remaining': '199',
        'x-ratelimit-reset': '2026-04-01T00:00:00Z',
      }),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.rates.list();

    expect(result.data!.rateLimit.limit).toBe(200);
    expect(result.data!.rateLimit.remaining).toBe(199);
  });

  it('calls GET /v1/rates', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(LIST_RATES_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    await client.rates.list();

    const url = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/v1/rates');
    expect(fetchSpy.mock.calls[0][1].method).toBe('GET');
  });

  it('returns AuthenticationError on 401', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Invalid API key', code: 'unauthorized' }, meta: { request_id: 'req_r401' } },
        401,
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.rates.list();

    expect(result.error).toBeInstanceOf(AuthenticationError);
  });

  it('returns RateLimitError on 429', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Rate limit exceeded', code: 'rate_limit_exceeded' }, meta: { request_id: 'req_r429' } },
        429,
        { 'retry-after': '20' },
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.rates.list();

    expect(result.error).toBeInstanceOf(RateLimitError);
    expect((result.error as RateLimitError).retryAfter).toBe(20);
  });
});

// ─── vatly.rates.get() ───────────────────────────────────────

describe('vatly.rates.get()', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const GET_RATE_RESPONSE = {
    data: {
      country_code: 'NL',
      country_name: 'Netherlands',
      currency: 'EUR',
      standard_rate: 21,
      other_rates: [{ rate: 9, type: 'reduced' }, { rate: 0, type: 'zero' }],
      updated_at: '2026-01-01T00:00:00Z',
    },
    meta: { request_id: 'req_rate_nl' },
  };

  it('returns a single VAT rate by country code', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(GET_RATE_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.rates.get('NL');

    expect(result.error).toBeNull();
    expect(result.data!.data.countryCode).toBe('NL');
    expect(result.data!.data.countryName).toBe('Netherlands');
    expect(result.data!.data.currency).toBe('EUR');
    expect(result.data!.data.standardRate).toBe(21);
    expect(result.data!.meta.requestId).toBe('req_rate_nl');
  });

  it('calls GET /v1/rates/{countryCode}', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(GET_RATE_RESPONSE));
    const client = new Vatly(MOCK_API_KEY);
    await client.rates.get('NL');

    const url = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/v1/rates/NL');
    expect(fetchSpy.mock.calls[0][1].method).toBe('GET');
  });

  it('returns AuthenticationError on 401', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Invalid API key', code: 'unauthorized' }, meta: { request_id: 'req_rg401' } },
        401,
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.rates.get('NL');

    expect(result.error).toBeInstanceOf(AuthenticationError);
  });

  it('returns VatlyError on 404 not_found', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Country not found', code: 'not_found' }, meta: { request_id: 'req_rg404' } },
        404,
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.rates.get('ZZ');

    expect(result.error).toBeInstanceOf(VatlyError);
    expect(result.error!.code).toBe('not_found');
    expect(result.error!.statusCode).toBe(404);
  });

  it('returns RateLimitError on 429', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        { error: { message: 'Rate limit exceeded', code: 'rate_limit_exceeded' }, meta: { request_id: 'req_rg429' } },
        429,
        { 'retry-after': '10' },
      ),
    );
    const client = new Vatly(MOCK_API_KEY);
    const result = await client.rates.get('NL');

    expect(result.error).toBeInstanceOf(RateLimitError);
  });
});

// ─── VatlyError properties ───────────────────────────────────

describe('VatlyError', () => {
  it('has correct properties', () => {
    const err = new VatlyError('test message', 'test_code', 400, 'req_123', 'https://docs.vatly.dev');
    expect(err.message).toBe('test message');
    expect(err.code).toBe('test_code');
    expect(err.statusCode).toBe(400);
    expect(err.requestId).toBe('req_123');
    expect(err.docsUrl).toBe('https://docs.vatly.dev');
    expect(err.name).toBe('VatlyError');
    expect(err).toBeInstanceOf(Error);
  });

  it('requestId is null when not provided', () => {
    const err = new VatlyError('msg', 'code', 0, null, '');
    expect(err.requestId).toBeNull();
  });

  it('docsUrl is empty string when not provided', () => {
    const err = new VatlyError('msg', 'code', 0, null, '');
    expect(err.docsUrl).toBe('');
  });

  it('subclasses use instanceof correctly', () => {
    const auth = new AuthenticationError('msg', 'unauthorized', 401, null, '');
    const val = new ValidationError('msg', 'invalid_vat_format', 422, null, '');
    const rate = new RateLimitError('msg', 'rate_limit_exceeded', 429, null, '', 30);
    const upstream = new UpstreamError('msg', 'upstream_unavailable', 503, null, '', 60);

    expect(auth).toBeInstanceOf(VatlyError);
    expect(auth).toBeInstanceOf(AuthenticationError);
    expect(val).toBeInstanceOf(ValidationError);
    expect(rate).toBeInstanceOf(RateLimitError);
    expect(rate.retryAfter).toBe(30);
    expect(upstream).toBeInstanceOf(UpstreamError);
    expect(upstream.retryAfter).toBe(60);
  });

  it('details defaults to null', () => {
    const err = new VatlyError('msg', 'code', 400, null, '');
    expect(err.details).toBeNull();
  });

  it('details carries array when set', () => {
    const details = [{ field: 'vat_number', message: 'is required' }];
    const err = new VatlyError('msg', 'code', 422, null, '', details);
    expect(err.details).toEqual([{ field: 'vat_number', message: 'is required' }]);
  });
});
