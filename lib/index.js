import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { AsideService } from './host-service.js';

/**
 * Host half: owns the ephemeral read-only discussion service. The Client half
 * owns every rendered surface; it reaches this service through `ctx.remote`.
 */
export class DshAsidePlugin extends TypertRemoteService {
  static inject = ['llm', 'sessions', 'sessionQuery'];

  owners = new Set();

  constructor(ctx) {
    super(ctx, 'aside');
    this.service = new AsideService(ctx);
    ctx.effect(() => () => this.service.dispose(), 'dsh-aside.lifecycle');
  }

  create(request, signal) {
    return this.service.create(request, this.owner(), signal);
  }

  stream(request, signal) {
    return this.service.stream(request, this.owner(), signal);
  }

  cancel(request) {
    return this.service.cancel(request, this.owner());
  }

  close(request) {
    return this.service.close(request, this.owner());
  }

  owner() {
    const peer = this.ctx.invocation?.peer;
    if (peer === undefined) return 'local';
    const id = String(peer.id);
    if (!this.owners.has(id)) {
      this.owners.add(id);
      peer.ctx.effect(() => () => {
        this.owners.delete(id);
        this.service.closeOwner(id);
      }, 'dsh-aside.peer');
    }
    return id;
  }
}

export default DshAsidePlugin;
