# @vatly/node

Official TypeScript SDK for the [Vatly](https://vatly.dev) VAT validation API. Validate EU and UK VAT numbers, look up VAT rates by country. See the full [API reference](https://docs.vatly.dev/api-reference).

## Installation

```bash
npm install @vatly/node
```

## Quick Start

```typescript
import Vatly from '@vatly/node';

const vatly = new Vatly('vtly_live_...');

const { data, error } = await vatly.vat.validate({ vatNumber: 'NL123456789B01' });

if (error) {
  console.error(error.message, error.code);
} else {
  console.log(data.data.valid, data.data.company?.name);
}
```

## Usage

### `vatly.vat.validate(params)`

Validate a single VAT number. Returns `{ data, error }`.

```typescript
const { data, error } = await vatly.vat.validate({
  vatNumber: 'NL123456789B01',
  requesterVatNumber: 'DE987654321', // optional, for consultation number
  cache: false,                       // optional, bypass cache
  requestId: 'my-trace-id',          // optional, for tracing
});

if (data) {
  console.log(data.data.valid);              // true
  console.log(data.data.vatNumber);          // 'NL123456789B01'
  console.log(data.data.company?.name);      // 'Example BV'
  console.log(data.data.consultationNumber); // null or string
  console.log(data.meta.requestId);          // 'req_abc123'
  console.log(data.rateLimit.remaining);     // 99
}
```

### `vatly.vat.validateBatch(params)`

Validate up to 50 VAT numbers in a single request. Returns `{ data, error }`.

```typescript
import Vatly, { isBatchSuccess } from '@vatly/node';

const vatly = new Vatly('vtly_live_...');
const { data, error } = await vatly.vat.validateBatch({
  vatNumbers: ['NL123456789B01', 'DE987654321', 'XX000'],
  requesterVatNumber: 'DE987654321', // optional
  cache: false,                       // optional
  requestId: 'my-trace-id',          // optional
});

if (data) {
  console.log(data.data.summary); // { total: 3, succeeded: 2, failed: 1 }

  for (const item of data.data.results) {
    if (isBatchSuccess(item)) {
      console.log(`${item.data.vatNumber} is ${item.data.valid ? 'valid' : 'invalid'}`);
    } else {
      console.log(`${item.meta.vatNumber} failed: ${item.error.message}`);
    }
  }
}
```

### `vatly.rates.list()`

List VAT rates for all supported countries.

```typescript
const { data, error } = await vatly.rates.list();

if (data) {
  for (const rate of data.data) {
    console.log(`${rate.countryName}: ${rate.standardRate}%`);
  }
}
```

### `vatly.rates.get(countryCode)`

Get VAT rates for a specific country.

```typescript
const { data, error } = await vatly.rates.get('NL');

if (data) {
  console.log(data.data.standardRate);  // 21
  console.log(data.data.otherRates);    // [{ rate: 9, type: 'reduced' }, ...]
}
```

## Error Handling

Every method returns `{ data, error }` instead of throwing. The `error` is always a `VatlyError` (or subclass). Use `instanceof` to narrow:

```typescript
import Vatly, { AuthenticationError, RateLimitError, UpstreamError } from '@vatly/node';

const { data, error } = await vatly.vat.validate({ vatNumber: 'INVALID' });

if (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${error.retryAfter}s`);
  } else if (error instanceof UpstreamError) {
    console.log(`Tax authority unavailable. Retry after ${error.retryAfter}s`);
  } else if (error instanceof AuthenticationError) {
    console.log('Invalid API key or insufficient plan');
  } else {
    console.log(error.message, error.code, error.statusCode);
    console.log(error.requestId, error.docsUrl);
  }
}
```

### Error Classes

| Class | Trigger |
|-------|---------|
| `AuthenticationError` | Invalid/missing API key (`unauthorized`) or insufficient tier (`tier_insufficient`) |
| `ValidationError` | Invalid VAT format (`invalid_vat_format`) or missing params (`missing_parameter`) |
| `RateLimitError` | Rate or burst limit exceeded (`rate_limit_exceeded`, `burst_limit_exceeded`) |
| `UpstreamError` | Tax authority unavailable (`upstream_unavailable`, `upstream_error`) |
| `VatlyError` | Base class for all errors, including `timeout`, `network_error`, `parse_error` |

### Error Properties

```typescript
error.message    // Human-readable message
error.code       // Machine-readable code (e.g. 'unauthorized', 'rate_limit_exceeded')
error.statusCode // HTTP status (0 for network/timeout errors)
error.requestId  // Request ID (string or null)
error.docsUrl    // Link to error documentation (string, empty if not provided)
```

### Retries

The SDK does not retry automatically. `RateLimitError` and `UpstreamError` include a `retryAfter` property (seconds) when the server provides one.

## Test Mode

Use test API keys (`vtly_test_*`) to validate without hitting real tax authorities.

```typescript
const vatly = new Vatly('vtly_test_...');
const { data } = await vatly.vat.validate({ vatNumber: 'NL123456789B01' });
console.log(data?.meta.mode); // 'test'
```

| Magic VAT Number | Result |
|-----------------|--------|
| `NL123456789B01` | Valid, with company info |
| `XX000000000` | Invalid format error |

## Configuration

```typescript
// String API key
const vatly = new Vatly('vtly_live_...');

// Config object
const vatly = new Vatly({
  apiKey: 'vtly_live_...',
  baseUrl: 'https://api.vatly.dev', // default
  timeout: 30_000,                   // ms, default
});

// Environment variable fallback
// Set VATLY_API_KEY=vtly_live_... and pass no key:
const vatly = new Vatly({});
```

## TypeScript

All types are exported:

```typescript
import type {
  VatlyOptions,
  VatlyResult,
  ErrorCode,
  ValidateParams,
  VatValidationData,
  ValidateResponse,
  ValidateBatchParams,
  ValidateBatchResponse,
  BatchResult,
  BatchResultSuccess,
  BatchResultError,
  BatchItemMeta,
  BatchSummary,
  Company,
  ResponseMeta,
  RateLimitInfo,
  OtherRate,
  VatRate,
  ListRatesResponse,
  GetRateResponse,
} from '@vatly/node';
import { isBatchSuccess } from '@vatly/node';
```

## Requirements

- Node.js >= 18 (uses native `fetch`)
- No runtime dependencies

## License

MIT
