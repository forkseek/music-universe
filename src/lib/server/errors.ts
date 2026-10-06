export class RequestError extends Error {
  constructor(public status: number, message: string, public code = "INVALID_REQUEST") { super(message); }
}
