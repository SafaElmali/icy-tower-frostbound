import test from 'node:test';
import assert from 'node:assert/strict';
import { RacePeer, RaceMesh, validPeerPose } from '../lib/race-peer.ts';
import { RaceRival } from '../lib/race-rival.ts';
import {
  DEFAULT_RACE_SETTINGS,
  RACE_SLOTS,
  RACE_RULES_VERSION,
  type RaceSlot,
  racePose,
  createRaceEngine,
  type RaceView,
  type RaceSignal,
  type RacePose,
} from '../lib/race-protocol.ts';

const roomId = 'c'.repeat(32);
const pose = (time = 0): RacePose => ({
  ...racePose(createRaceEngine(17)),
  time,
  frame: Math.round(time * 120),
  checkpointFloor: 0,
});
const view = (
  you: 'host' | 'guest',
  signals: RaceView['signals'] = {},
  round = 1,
): RaceView => ({
  id: roomId,
  you,
  signals,
  round,
  seed: 17,
  revision: 1,
  rulesVersion: RACE_RULES_VERSION,
  settings: DEFAULT_RACE_SETTINGS,
  bumps: [],
  startAt: null,
  deadline: null,
  phase: 'waiting',
  expiresAt: 99999,
  serverNow: 1000,
  winner: null,
  reason: null,
  players: ['host', 'guest'].map((slot) => ({
    slot: slot as 'host' | 'guest',
    ready: false,
    lastSeen: 1000,
    pose: null,
    result: null,
    rematch: false,
  })),
});
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
class Channel {
  label = 'tower-poses';
  readyState = 'connecting';
  bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: string[] = [];
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 'closed';
    this.onclose?.();
  }
  open() {
    this.readyState = 'open';
    this.onopen?.();
  }
}
class Peer extends EventTarget {
  iceGatheringState = 'complete';
  connectionState = 'new';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  ondatachannel: ((e: { channel: RTCDataChannel }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  channel = new Channel();
  channelOptions: RTCDataChannelInit | undefined;
  createDataChannel(_label: string, options: RTCDataChannelInit) {
    this.channelOptions = options;
    return this.channel;
  }
  async createOffer() {
    return { type: 'offer', sdp: 'host-offer' } as RTCSessionDescriptionInit;
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'guest-answer' } as RTCSessionDescriptionInit;
  }
  async setLocalDescription(value: RTCSessionDescriptionInit) {
    this.localDescription = value;
  }
  async setRemoteDescription(value: RTCSessionDescriptionInit) {
    this.remoteDescription = value;
  }
  close() {
    this.connectionState = 'closed';
  }
}

void test('direct peers exchange offers, send20Hz disposable poses and reject stale/foreign packets', async () => {
  let now = 1000,
    roomUpdates = 0;
  const pc = new Peer(),
    signals: RaceSignal[] = [],
    seen: RacePose[] = [];
  const states: string[] = [];
  const peer = new RacePeer({
    roomId,
    slot: 'host',
    clock: () => now,
    createPeer: () => pc as unknown as RTCPeerConnection,
    onSignal: (s) => {
      signals.push(s);
    },
    onPose: (p) => seen.push(p),
    onState: (s) => states.push(s),
    onRoomUpdate: () => {
      roomUpdates++;
    },
  });
  peer.sync(view('host'));
  await settle();
  assert.equal(signals[0].type, 'offer');
  assert.deepEqual(pc.channelOptions, { ordered: false, maxRetransmits: 0 });
  peer.sync({
    ...view('host', {
      guest: { ...signals[0], type: 'answer', sdp: 'guest-answer' },
    }),
    revision: 2,
  });
  await settle();
  assert.equal(pc.remoteDescription?.type, 'answer');
  pc.channel.open();
  peer.sendPose(1, pose());
  peer.sendPose(1, pose());
  assert.equal(pc.channel.sent.length, 1);
  now += 50;
  peer.sendPose(1, pose(0.05));
  assert.equal(pc.channel.sent.length, 2);
  const packet = (seq: number, extra = {}) =>
    pc.channel.onmessage?.({
      data: JSON.stringify({
        room: roomId,
        round: 1,
        seq,
        pose: pose(0.1),
        ...extra,
      }),
    });
  packet(2);
  packet(1);
  packet(3, { room: 'other' });
  packet(4, { round: 0 });
  packet(5, { pose: { ...pose(0.2), x: NaN } });
  assert.equal(seen.length, 1);
  now += 3000;
  assert.equal(peer.connected, false);
  // An open channel keeps sending through a temporary inbound gap and can recover.
  peer.sendPose(1, pose(0.2));
  assert.equal(pc.channel.sent.length, 3);
  packet(6, { pose: pose(0.2) });
  assert.equal(peer.connected, true);
  peer.sync({ ...view('host', {}, 2), revision: 3 });
  packet(7);
  assert.equal(seen.length, 2, 'previous round ignored');
  packet(0, { round: 2, pose: pose() });
  assert.equal(seen.length, 3);
  const notice = JSON.stringify({
    kind: 'room-update',
    room: roomId,
    round: 2,
    bump: '2-1',
  });
  pc.channel.onmessage?.({ data: notice });
  pc.channel.onmessage?.({ data: notice });
  assert.equal(
    roomUpdates,
    1,
    'duplicate notices only wake one authoritative room fetch',
  );
  const bump = {
    id: '2-1',
    from: 'host' as const,
    to: 'guest' as const,
    at: now,
    direction: 1 as const,
    targetFrame: 0,
  };
  const priorSent = pc.channel.sent.length;
  peer.notifyBumps([bump]);
  peer.notifyBumps([bump]);
  assert.equal(pc.channel.sent.length, priorSent + 1);
  assert.equal(JSON.parse(pc.channel.sent.at(-1)!).kind, 'room-update');
  peer.close();
  packet(1, { round: 2 });
  assert.equal(seen.length, 3);
  assert.equal(pc.connectionState, 'closed');
  assert.ok(states.includes('live'));
});

void test('guest answers one generation and safely falls back when WebRTC is unavailable', async () => {
  const pc = new Peer(),
    signals: RaceSignal[] = [];
  const guest = new RacePeer({
    roomId,
    slot: 'guest',
    createPeer: () => pc as unknown as RTCPeerConnection,
    onSignal: (s) => {
      signals.push(s);
    },
    onPose: () => {},
    onState: () => {},
  });
  const offer: RaceSignal = {
    type: 'offer',
    sdp: 'host-offer',
    generation: 'one',
  };
  guest.sync(view('guest', { host: offer }));
  await settle();
  guest.sync({ ...view('guest', { host: offer }), revision: 2 });
  await settle();
  assert.equal(signals.length, 1);
  assert.equal(signals[0].type, 'answer');
  guest.close();
  const states: string[] = [];
  const unavailable = new RacePeer({
    roomId,
    slot: 'host',
    createPeer: () => {
      throw new Error('unsupported');
    },
    onSignal: () => {
      throw new Error('must not signal');
    },
    onPose: () => {},
    onState: (s) => states.push(s),
  });
  unavailable.sync(view('host'));
  await settle();
  assert.deepEqual(states, ['fallback']);
  assert.equal(unavailable.connected, false);
  unavailable.close();
});

void test('opponent stays visible and moves across buffered frames instead of flashing with polls', () => {
  const rival = new RaceRival();
  rival.receive({ ...pose(), x: 0, vx: 2 }, 100, false);
  rival.receive({ ...pose(1), x: 2, vx: 2 }, 1100, false);
  const positions: number[] = [];
  for (let now = 1100; now < 1800; now += 16) {
    rival.advance(now, 0.016);
    positions.push(rival.engine.x);
  }
  assert.ok(positions.at(-1)! > positions[0] + 0.5);
  assert.ok(
    positions.every((x, i) => !i || Math.abs(x - positions[i - 1]) < 0.2),
  );
  rival.receive(null, 1800, true);
  assert.equal(
    rival.finished,
    false,
    'missing heartbeat does not hide an existing rival',
  );
  rival.receive({ ...pose(0.5), x: -6 }, 1800, false);
  rival.advance(1850, 0.05);
  assert.ok(rival.engine.x > 0, 'stale pose cannot rewind');
  for (let now = 2000; now < 10_000; now += 16) rival.advance(now, 0.016);
  assert.ok(
    rival.engine.x <= 2.41,
    'extrapolation is bounded when the connection stalls',
  );
  assert.equal(validPeerPose({ ...pose(), floor: 101 }), false);
});

void test('lobby waits and suspended clocks do not skip the interpolation buffer', () => {
  const rival = new RaceRival();
  rival.receive(pose(), 0, false, 'peer');
  for (let now = 50; now <= 30_000; now += 50) {
    rival.receive(pose(), now, false, 'peer');
    rival.advance(now, 0.05);
  }
  for (let frame = 1; frame <= 20; frame++) {
    const time = frame * 0.05;
    rival.receive(
      { ...pose(time), x: time * 2, vx: 2 },
      30_000 + frame * 50,
      false,
      'peer',
    );
    rival.advance(30_000 + frame * 50, 0.05);
  }
  assert.ok(
    rival.engine.time >= 0.85 && rival.engine.time <= 0.91,
    'plays buffered samples, never predicts ahead after lobby',
  );
  assert.ok(rival.engine.x < 1.9 && rival.engine.x > 1.5);
  rival.receive({ ...pose(1.05), x: 2.1, vx: 2 }, 60_000, false, 'peer');
  rival.advance(60_000, 0.05);
  rival.receive({ ...pose(1.1), x: 2.2, vx: 2 }, 60_050, false, 'peer');
  rival.advance(60_050, 0.05);
  assert.ok(
    rival.engine.time < 1.1,
    'a background gap cannot advance beyond the newest simulation',
  );
});

void test('a four-player mesh streams to every opponent and closes departed peers', async () => {
  const pcs: Peer[] = [],
    targets: RaceSlot[] = [],
    received: RaceSlot[] = [];
  const mesh = new RaceMesh({
    roomId,
    slot: 'host',
    clock: () => 1000,
    createPeer: () => {
      const pc = new Peer();
      pcs.push(pc);
      return pc as unknown as RTCPeerConnection;
    },
    onState() {},
    onSignal(_signal, target) {
      targets.push(target);
    },
    onPose(_pose, _round, slot) {
      received.push(slot);
    },
  });
  const room = view('host');
  room.players = RACE_SLOTS.map((slot) => ({ ...room.players[0], slot }));
  mesh.sync(room);
  await settle();
  assert.deepEqual(targets, ['guest', 'guest2', 'guest3']);
  pcs.forEach((pc) => pc.channel.open());
  assert.equal(mesh.connected, true);
  mesh.sendPose(1, pose(1));
  for (const pc of pcs) {
    assert.equal(pc.channel.sent.length, 1);
    pc.channel.onmessage?.({
      data: JSON.stringify({ room: roomId, round: 1, seq: 1, pose: pose(1) }),
    });
  }
  assert.deepEqual(received, ['guest', 'guest2', 'guest3']);
  mesh.sync({ ...room, revision: 2, players: room.players.slice(0, 3) });
  assert.equal(pcs[2].connectionState, 'closed');
  pcs[0].channel.close();
  assert.equal(mesh.connected, false);
  mesh.sync({
    ...room,
    revision: 3,
    players: room.players
      .slice(0, 3)
      .map((p) =>
        p.slot === 'guest'
          ? { ...p, result: { kind: 'forfeit', floor: 0, duration: 0 } }
          : p,
      ),
  });
  assert.equal(pcs[0].connectionState, 'closed');
  assert.equal(
    mesh.connected,
    true,
    'forfeited peers do not force live opponents to HTTP fallback',
  );
  mesh.close();
  assert.ok(pcs.every((pc) => pc.connectionState === 'closed'));
});
