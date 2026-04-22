// Vitest global setup — loaded before every test file.
// Ensures deterministic auth and quiet logs during tests.
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'test-jwt-secret-do-not-use-in-prod';
process.env['LOG_LEVEL'] = process.env['LOG_LEVEL'] ?? 'silent';
