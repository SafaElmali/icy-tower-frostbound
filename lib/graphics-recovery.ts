type GraphicsCallbacks = {
  lost: () => void;
  restored: () => void;
  failed: (error: unknown) => void;
};

/** Stop simulation as well as drawing while the canvas cannot display a frame. */
export class GraphicsRecovery {
  blocked = false;
  private failed = false;
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
    this.callbacks.lost();
  };

  private onRestored = () => {
    if (!this.blocked || this.failed) return;
    try {
      this.callbacks.restored();
      this.blocked = false;
    } catch (error) {
      this.fail(error);
    }
  };

  private fail(error: unknown) {
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
    this.blocked = true;
    this.failed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
  }
}
