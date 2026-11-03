// Throw this from any route/middleware to send a specific status + message.
// The central error handler turns it into `{ error: message }`.
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
