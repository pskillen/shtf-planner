/** One read the worker could not do (a bad frame, a session error). The reader itself is still there: try the next frame. */
export class ReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReadError';
  }
}

/**
 * The reader was shut down on purpose (the page went hidden, the screen that used it left, a retry):
 * not a fault. A read that was waiting ends with this, and the date step treats it as stopped.
 */
export class ReaderStopped extends Error {
  constructor(message = 'The date reader was stopped') {
    super(message);
    this.name = 'ReaderStopped';
  }
}
