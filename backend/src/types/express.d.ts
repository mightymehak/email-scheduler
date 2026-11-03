// Adds the authenticated user's id to Express' Request type (set by requireAuth).
// Read it through getAuthUserId(req) so routes get a plain `string`.
declare namespace Express {
  interface Request {
    userId?: string;
  }
}
