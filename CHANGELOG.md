# Changelog

## 0.2.0

Complete rewrite of the SDK. This is a breaking release with a new package name.

### Breaking Changes

- **Package name** is `vatly`
- **Resource-based API**: methods are now namespaced under `vatly.vat.*` and `vatly.rates.*` instead of flat `vatly.validate()` / `vatly.validateBatch()`
- **`{ data, error }` return pattern**: all methods return a result tuple instead of throwing. Only the constructor still throws (missing API key is a programmer error).
- **Removed `validate()` / `validateRaw()`**: use `vatly.vat.validate(params)` which returns the full response including meta and rate limits
- **Removed `validateBatch()` / `validateBatchRaw()`**: use `vatly.vat.validateBatch(params)` which returns the full response
- **Params are now objects**: `validate({ vatNumber: '...' })` instead of `validate('...', options?)`
- **Batch item structure changed**: each item is now `{ data, meta }` (success) or `{ error, meta }` (error), not flat objects. `isBatchSuccess` checks for `'data'` key instead of `'valid'`.
- **`RateLimitInfo` changed**: removed `burstLimit` and `burstRemaining`, added `retryAfter`
- **`ResponseMeta` changed**: nullable fields use `| null` instead of `?:`, `mode` is `'test' | null` instead of `'test' | 'live'`
- **`VatlyError` changed**: `requestId` is `string | null` (was `string | undefined`), `docsUrl` is `string` with empty default (was `string | undefined`)

### Type Renames

- `VatlyConfig` -> `VatlyOptions`
- `ValidateOptions` -> `ValidateParams`
- `ValidationResult` -> `VatValidationData`
- `VatlyResponse` -> `ValidateResponse`
- `BatchValidateOptions` -> `ValidateBatchParams`
- `VatlyBatchResponse` -> `ValidateBatchResponse`
- `BatchResultItem` -> `BatchResult`

### Added

- `vatly.rates.list()`: list VAT rates for all countries
- `vatly.rates.get(countryCode)`: get VAT rate for a specific country
- `VatlyResult<T>` generic result type
- `ErrorCode` union type with all 11 API error codes
- `BatchItemMeta` type for per-item cache metadata
- `OtherRate`, `VatRate`, `ListRatesResponse`, `GetRateResponse` types

## 0.1.0

Initial release.

- `validate()` and `validateRaw()` for single VAT number validation
- `validateBatch()` and `validateBatchRaw()` for batch validation (up to 50)
- Typed error hierarchy: `AuthenticationError`, `ValidationError`, `RateLimitError`, `UpstreamError`
- `isBatchSuccess()` type guard for batch result discrimination
- Local validation for empty/whitespace inputs (no network call)
- Snake-to-camel response transformation
- Rate limit header parsing with nullable fields
- Configurable timeout and base URL
- Environment variable fallback (`VATLY_API_KEY`)
- Dual CJS/ESM build with full type declarations
- Zero runtime dependencies (native `fetch`)
