import {
  otherSlot,
  type RaceBumpEvent,
  type RacePose,
  type RaceSignal,
  type RaceSlot,
  type RaceView,
} from './race-protocol.ts';

export type RacePeerState = 'connecting' | 'live' | 'fallback';
type PeerOptions = {
  roomId: string;
  slot: RaceSlot;
  onPose: (pose: RacePose, round: number) => void;
  onState: (state: RacePeerState) => void;
  onSignal: (signal: RaceSignal) => Promise<unknown> | void;
  onRoomUpdate?: () => void;
  /** Injected only by transport tests. No camera or microphone is requested. */
  createPeer?: () => RTCPeerConnection;
  clock?: () => number;
};
const ICE_WAIT_MS = 4_000;
const RETRY_MS = 15_000;
const POSE_INTERVAL_MS = 50;

export function validPeerPose(value: unknown): value is RacePose {
  if (!value || typeof value !== 'object') return false;
  const p = value as RacePose;
  return (
    [p.x, p.y, p.vx, p.vy, p.time, p.floor].every(Number.isFinite) &&
    Math.abs(p.x) <= 7 &&
    p.y >= -100 &&
    p.y <= 400 &&
    Math.abs(p.vx) <= 30 &&
    Math.abs(p.vy) <= 100 &&
    p.time >= 0 &&
    p.time <= 301 &&
    Number.isInteger(p.frame) &&
    p.frame >= 0 &&
    p.frame <= 36_000 &&
    Number.isInteger(p.checkpointFloor) &&
    p.checkpointFloor >= 0 &&
    p.checkpointFloor <= 100 &&
    Number.isInteger(p.floor) &&
    p.floor >= 0 &&
    p.floor <= 100 &&
    (p.facing === 1 || p.facing === -1) &&
    typeof p.grounded === 'boolean' &&
    typeof p.respawning === 'boolean' &&
    typeof p.protected === 'boolean'
  );
}

/** Direct, disposable position packets; the room server still owns rules and results. */
export class RacePeer {
  private readonly options: PeerOptions;
  private readonly clock: () => number;
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private view: RaceView | null = null;
  private generation = '';
  private answered = '';
  private negotiating = false;
  private closed = false;
  private attemptedAt = -Infinity;
  private receivedAt = 0;
  private openedAt = 0;
  private sentAt = -Infinity;
  private sentSeq = 0;
  private receivedSeq = -1;
  private receivedTime = -1;
  private sentBump = '';
  private receivedBump = '';
  private notifiedAt = -Infinity;
  private state: RacePeerState = 'connecting';
  private cancelGather: (() => void) | null = null;

  constructor(options: PeerOptions) {
    this.options = options;
    this.clock = options.clock ?? Date.now;
  }

  get connected() {
    return (
      !this.closed &&
      this.channel?.readyState === 'open' &&
      this.clock() - (this.receivedAt || this.openedAt) < 2_500
    );
  }

  sync(view: RaceView) {
    if (
      this.closed ||
      view.id !== this.options.roomId ||
      view.you !== this.options.slot
    )
      return;
    if (this.view && view.revision < this.view.revision) return;
    if (view.round !== this.view?.round) {
      this.receivedSeq = -1;
      this.receivedTime = -1;
      this.sentSeq = 0;
      this.sentBump = this.receivedBump = '';
    }
    this.view = view;
    if (this.channel?.readyState === 'open')
      this.setState(this.connected ? 'live' : 'fallback');
    void this.negotiate();
  }

  sendPose(round: number, pose: RacePose) {
    const now = this.clock();
    if (
      this.closed ||
      this.channel?.readyState !== 'open' ||
      this.view?.round !== round ||
      now - this.sentAt < POSE_INTERVAL_MS ||
      !this.channel ||
      this.channel.bufferedAmount > 65_536 ||
      !validPeerPose(pose)
    )
      return;
    this.sentAt = now;
    try {
      this.channel.send(
        JSON.stringify({
          room: this.options.roomId,
          round,
          seq: this.sentSeq++,
          pose,
        }),
      );
    } catch {
      this.setState('fallback');
    }
  }

  /** Wake the rival's room poll after a confirmed shove; peers cannot apply an unverified hit. */
  notifyBumps(events: readonly RaceBumpEvent[]) {
    const bump = events.findLast((event) => event.from === this.options.slot);
    if (
      !bump ||
      bump.id === this.sentBump ||
      !this.connected ||
      !this.channel ||
      !this.view
    )
      return;
    try {
      this.channel.send(
        JSON.stringify({
          kind: 'room-update',
          room: this.options.roomId,
          round: this.view.round,
          bump: bump.id,
        }),
      );
      this.sentBump = bump.id;
    } catch {
      // The ordinary heartbeat still delivers the event if this disposable notice is lost.
    }
  }

  private setState(state: RacePeerState) {
    if (this.closed || state === this.state) return;
    this.state = state;
    this.options.onState(state);
  }

  private attach(channel: RTCDataChannel, pc: RTCPeerConnection) {
    if (this.closed || this.pc !== pc || channel.label !== 'tower-poses') {
      channel.close();
      return;
    }
    this.channel = channel;
    channel.onopen = () => {
      if (this.pc !== pc || this.closed) return;
      this.openedAt = this.clock();
      this.setState('live');
    };
    channel.onclose = channel.onerror = () => {
      if (this.pc === pc) this.setState('fallback');
    };
    channel.onmessage = (event: MessageEvent) => {
      if (
        this.closed ||
        this.pc !== pc ||
        typeof event.data !== 'string' ||
        event.data.length > 4_096
      )
        return;
      try {
        const packet = JSON.parse(event.data);
        const current = this.view;
        if (!current) return;
        if (
          packet.room !== this.options.roomId ||
          packet.round !== current.round
        )
          return;
        if (packet.kind === 'room-update') {
          if (
            typeof packet.bump === 'string' &&
            /^\d+-\d+$/.test(packet.bump) &&
            packet.bump.length < 32 &&
            packet.bump !== this.receivedBump &&
            this.clock() - this.notifiedAt >= 500
          ) {
            this.receivedBump = packet.bump;
            this.notifiedAt = this.clock();
            this.options.onRoomUpdate?.();
          }
          return;
        }
        if (
          packet.room !== this.options.roomId ||
          packet.round !== current.round ||
          !Number.isSafeInteger(packet.seq) ||
          packet.seq <= this.receivedSeq ||
          !validPeerPose(packet.pose) ||
          packet.pose.time < this.receivedTime ||
          packet.pose.floor > current.settings.targetFloor
        )
          return;
        this.receivedSeq = packet.seq;
        this.receivedTime = packet.pose.time;
        this.receivedAt = this.clock();
        this.setState('live');
        this.options.onPose(packet.pose, packet.round);
      } catch {
        // Malformed rival packets cannot affect the room or local simulation.
      }
    };
  }

  private makePeer() {
    this.disposePeer();
    const pc =
      this.options.createPeer?.() ??
      new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
    this.pc = pc;
    this.receivedAt = this.openedAt = 0;
    this.receivedSeq = -1;
    this.receivedTime = -1;
    pc.ondatachannel = (event) => this.attach(event.channel, pc);
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc || this.closed) return;
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState))
        this.setState('fallback');
    };
    this.setState('connecting');
    return pc;
  }

  private async description(pc: RTCPeerConnection) {
    if (pc.iceGatheringState !== 'complete') {
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          pc.removeEventListener('icegatheringstatechange', change);
          if (this.cancelGather === finish) this.cancelGather = null;
          resolve();
        };
        const change = () => {
          if (pc.iceGatheringState === 'complete') finish();
        };
        const timer = setTimeout(finish, ICE_WAIT_MS);
        this.cancelGather = finish;
        pc.addEventListener('icegatheringstatechange', change);
        change();
      });
    }
    if (this.closed || this.pc !== pc || !pc.localDescription?.sdp) return null;
    return pc.localDescription.sdp;
  }

  private async negotiate() {
    const view = this.view;
    if (this.closed || this.negotiating || !view || view.players.length !== 2)
      return;
    const theirs = view.signals?.[otherSlot(this.options.slot)];
    this.negotiating = true;
    try {
      if (this.options.slot === 'host') {
        if (
          !this.pc ||
          (!this.connected && this.clock() - this.attemptedAt > RETRY_MS)
        ) {
          this.attemptedAt = this.clock();
          this.generation = crypto.randomUUID();
          this.answered = '';
          const pc = this.makePeer();
          this.attach(
            pc.createDataChannel('tower-poses', {
              ordered: false,
              maxRetransmits: 0,
            }),
            pc,
          );
          await pc.setLocalDescription(await pc.createOffer());
          const sdp = await this.description(pc);
          if (sdp)
            await this.options.onSignal({
              type: 'offer',
              sdp,
              generation: this.generation,
            });
        } else if (
          theirs?.type === 'answer' &&
          theirs.generation === this.generation &&
          this.answered !== this.generation
        ) {
          await this.pc.setRemoteDescription({
            type: 'answer',
            sdp: theirs.sdp,
          });
          this.answered = this.generation;
        }
      } else if (
        theirs?.type === 'offer' &&
        theirs.generation !== this.generation
      ) {
        this.generation = theirs.generation;
        this.attemptedAt = this.clock();
        const pc = this.makePeer();
        await pc.setRemoteDescription({ type: 'offer', sdp: theirs.sdp });
        await pc.setLocalDescription(await pc.createAnswer());
        const sdp = await this.description(pc);
        if (sdp)
          await this.options.onSignal({
            type: 'answer',
            sdp,
            generation: this.generation,
          });
      }
    } catch {
      if (this.options.slot === 'guest') this.generation = '';
      this.setState('fallback');
    } finally {
      this.negotiating = false;
    }
  }

  private disposePeer() {
    this.cancelGather?.();
    const old = this.pc;
    this.pc = null;
    this.channel?.close();
    this.channel = null;
    old?.close();
  }

  close() {
    this.closed = true;
    this.disposePeer();
    this.view = null;
  }
}
