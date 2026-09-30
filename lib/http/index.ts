/**
 * `lib/http/` — the response envelope and the error → status mapping.
 *
 * The skill and the architecture rules both assume this directory exists, so it
 * is created here with the shape api-route-scaffolder documents rather than each
 * handler inventing its own. See `envelope.ts` for why the mapping is defined
 * once and `logger.ts` for the correlation id.
 */

export {
  badRequest,
  businessRule,
  conflict,
  created,
  forbidden,
  notFound,
  ok,
  rateLimited,
  serverError,
  unauthenticated,
  type ApiErrorBody,
  type ApiErrorCode,
  type ApiSuccessBody,
} from './envelope';

export { correlationId, logServerError } from './logger';
