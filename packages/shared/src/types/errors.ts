/**
 * Base error class for all Agentsy errors.
 *
 * Provides consistent error structure and metadata across the system.
 */
export class AgentsyError extends Error {
  public readonly code: string;
  public details: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AgentsyError';
    this.code = code;
    this.details = details ?? {};

    // Maintains proper stack trace - error is intentional for custom error classes
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serializes the error to a plain JSON object for structured logging
   * and wire transfer.
   *
   * @returns A JSON-serializable object with `name`, `message`, `code`, and `details`.
   */
  toJSON(): {
    name: string;
    message: string;
    code: string;
    details: Record<string, unknown>;
  } {
    return {
      code: this.code,
      details: this.details,
      message: this.message,
      name: this.name
    };
  }
}
