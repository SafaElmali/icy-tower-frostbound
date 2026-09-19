export const GRAPHICS_RECOVERY_TIMEOUT_MS = 12_000;

export class GraphicsRecoveryTimeoutError extends Error {
  constructor() {
    super('Graphics context did not recover in time.');
    this.name = 'GraphicsRecoveryTimeoutError';
  }
}

type GraphicsCallbacks = {
  lost: () => void;
  restored: () => void;
  failed: (error: unknown) => void;
};

/** Stop simulation as well as drawing while the canvas cannot display a frame. */
export class GraphicsRecovery {
  blocked = false;
  private failed = false;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private canvas: EventTarget;
  private callbacks: GraphicsCallbacks;

  constructor(canvas: EventTarget, callbacks: GraphicsCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
  }

  private onLost = (event: Event) => {
    event.preventDefault();
    if (this.blocked) return;
    this.blocked = true;
    this.timeout = setTimeout(() => {
      this.timeout = undefined;
      this.fail(new GraphicsRecoveryTimeoutError());
    }, GRAPHICS_RECOVERY_TIMEOUT_MS);
    this.callbacks.lost();
  };

  private onRestored = () => {
    if (!this.blocked || this.failed) return;
    this.clearTimeout();
    try {
      this.blocked = false;
      this.callbacks.restored();
    } catch (error) {
      this.fail(error);
    }
  };

  private clearTimeout() {
    if (this.timeout !== undefined) clearTimeout(this.timeout);
    this.timeout = undefined;
  }

  private fail(error: unknown) {
    if (this.failed) return;
    this.clearTimeout();
    this.failed = true;
    this.blocked = true;
    this.callbacks.failed(error);
  }

  frame(draw: () => void) {
    if (this.blocked) return;
    try {
      draw();
    } catch (error) {
      this.fail(error);
    }
  }

  dispose() {
    this.clearTimeout();
    this.blocked = true;
    this.failed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
  }
}
