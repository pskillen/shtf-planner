/** One read the worker could not do (a bad frame, a session error). The reader itself is still there: try the next frame. */
export class ReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReadError';
  }
}
