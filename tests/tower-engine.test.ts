import test from 'node:test';
import assert from 'node:assert/strict';
import { TowerEngine, freshControls, FLOOR_HEIGHT, WALL, STAGE_WIDTH } from '../lib/tower-engine.ts';
const step = (e: TowerEngine, count: number, input = freshControls()) => { for (let i = 0; i < count; i++) e.tick(1 / 120, input); };

void test('a standing jump clears a floor and lands on real platform geometry', () => {
  const e = new TowerEngine(17); e.start('practice');
  const target = e.platforms[1]; e.x = target.x;
  e.tick(1/120, { left:false, right:false, jump:true });
  let apex = e.y;
  for (let i=0;i<240;i++) { e.tick(1/120,freshControls()); apex=Math.max(apex,e.y); if (e.grounded) break; }
  assert.ok(apex > FLOOR_HEIGHT + .7);
  assert.equal(e.standingId, 1); assert.equal(e.y, FLOOR_HEIGHT); assert.equal(e.score, 100);
});

void test('running builds speed and increases jump height enough to skip a floor', () => {
  const standing = new TowerEngine(), running = new TowerEngine(); standing.start('practice'); running.start('practice');
  standing.platforms = standing.platforms.slice(0,1); running.platforms = running.platforms.slice(0,1);
  step(running, 40, { left:false, right:true, jump:false });
  assert.ok(running.vx > 7);
  let maxStand=0,maxRun=0;
  for(let i=0;i<130;i++) {
    standing.tick(1/120, {left:false,right:false,jump:i===0}); running.tick(1/120,{left:false,right:false,jump:i===0});
    maxStand=Math.max(maxStand,standing.y); maxRun=Math.max(maxRun,running.y);
  }
  assert.ok(maxRun > maxStand + 1.9); assert.ok(maxRun > FLOOR_HEIGHT*2);
});

void test('one-way ledges allow ascending through them and prevent falling through', () => {
  const e=new TowerEngine();e.start('practice');e.x=e.platforms[1].x;
  step(e,60,{left:false,right:false,jump:true}); assert.ok(e.y > FLOOR_HEIGHT); assert.equal(e.grounded,false);
  step(e,120);assert.equal(e.y,FLOOR_HEIGHT);assert.equal(e.grounded,true);
});

void test('holding jump does not create unrequested repeat jumps', () => {
  const e=new TowerEngine();e.start('practice');e.x=e.platforms[1].x;
  step(e,300,{left:false,right:false,jump:true});assert.equal(e.standingId,1);assert.equal(e.grounded,true);
});

void test('fast wall impacts rebound inward and never leave tower bounds', () => {
  const e=new TowerEngine();e.start('practice');e.x=WALL-.29;e.vx=8;
  e.tick(1/120,{left:false,right:true,jump:false});assert.ok(e.vx<0);assert.ok(e.x<=WALL-.28);
  assert.ok(e.drainEvents().some(x=>x.type==='wall'));
});

void test('jump buffering accepts a press just before landing', () => {
  const e=new TowerEngine();e.start('practice');e.y=.05;e.vy=-3;e.grounded=false;e.standingId=-1;
  step(e,8,{left:false,right:false,jump:true});assert.ok(e.vy>0);assert.ok(e.y>.1);
});

void test('walking off a ledge allows the short coyote-time jump', () => {
  const e=new TowerEngine();e.start('practice');const p=e.platforms[1];e.x=p.x+p.width/2+.14;e.y=p.y;e.standingId=1;e.vx=4;
  step(e,2,{left:false,right:true,jump:false});assert.equal(e.grounded,false);
  e.tick(1/120,{left:false,right:true,jump:true});assert.ok(e.vy>12);
});

void test('pausing freezes simulation and resuming does not accumulate elapsed time', () => {
  const e=new TowerEngine();e.start();step(e,120);e.togglePause();const before=e.snapshot();
  step(e,600,{left:false,right:true,jump:true});assert.deepEqual(e.snapshot(),before);
  e.togglePause();step(e,1);assert.ok(e.time<1.02);
});

void test('crystals are collected once; restart resets all run state', () => {
  const e=new TowerEngine();e.start('practice');const p=e.platforms.find(p=>p.gem)!;
  e.x=p.x;e.y=p.y;e.grounded=true;e.standingId=p.id;step(e,1);assert.equal(e.gems,1);assert.ok(p.collected);
  step(e,60);assert.equal(e.gems,1);
  e.start('arcade',44);assert.equal(e.gems,0);assert.equal(e.score,0);assert.equal(e.time,0);assert.equal(e.standingId,0);assert.equal(e.mode,'arcade');assert.ok(e.platforms.every(p=>!p.collected));
});

void test('fixed-step simulation stays equivalent across display refresh rates', () => {
  const a=new TowerEngine(7),b=new TowerEngine(7);a.start('practice');b.start('practice');const input={left:false,right:true,jump:false};
  for(let i=0;i<60;i++)a.tick(1/60,input);for(let i=0;i<120;i++)b.tick(1/120,input);
  assert.ok(Math.abs(a.x-b.x)<.001);assert.ok(Math.abs(a.vx-b.vx)<.001);
});

void test('procedurally generated routes can be climbed using ordinary inputs', () => {
  for (const seed of [3,17,42,99,723]) {
    const e=new TowerEngine(seed);e.start('practice');
    let target=e.platforms[1], wasJump=false;
    for(let i=0;i<24000 && e.floor<105 && e.status==='playing';i++) {
      if(e.grounded) target=e.platforms.find(p=>p.id===e.standingId+1)!;
      const dx=target.x-e.x;
      const steering=dx*3.8-e.vx*1.1;
      const jump: boolean=e.grounded&&!wasJump;
      e.tick(1/120,{left:steering<-.35,right:steering>.35,jump});wasJump=jump;
      e.drainEvents();
    }
    assert.ok(e.floor>=105, `seed ${seed}: reached ${e.floor}, status ${e.status}, x ${e.x}, y ${e.y}`);
    assert.ok(e.bestCombo>=10); assert.ok(e.score>=3500);
    assert.ok(e.platforms.length<28,'world keeps a bounded set of nearby platforms');
  }
});

void test('every 50th floor spans the tower and stays stationary, including moving-floor multiples', () => {
  for (const id of [50, 100, 150, 350]) {
    const e = new TowerEngine(17); e.start('practice');
    e.y = id * FLOOR_HEIGHT + .6; e.cameraY = e.y + 2.2; e.grounded = false; e.standingId = -1;
    step(e, 1);
    const stage = e.platforms.find(p => p.id === id)!;
    assert.equal(stage.width, STAGE_WIDTH); assert.equal(stage.x, 0); assert.equal(stage.moving, false);
    assert.ok(e.platforms.find(p => p.id === id + 1)!.width < 5);
    step(e, 120); assert.equal(stage.x, 0);
  }
});

void test('stage collision catches falls at both walls and allows jumping through from below', () => {
  for (const x of [-WALL + .3, 0, WALL - .3]) {
    const e = new TowerEngine(17); e.start('practice');
    e.x = x; e.y = 50 * FLOOR_HEIGHT + .6; e.cameraY = e.y + 2.2; e.vy = -2; e.grounded = false; e.standingId = -1;
    step(e, 60);
    assert.equal(e.standingId, 50); assert.equal(e.y, 50 * FLOOR_HEIGHT);
    e.y -= .3; e.vy = 8; e.grounded = false; e.standingId = -1;
    step(e, 12); assert.ok(e.y > 50 * FLOOR_HEIGHT); assert.equal(e.grounded, false);
    step(e, 120); assert.equal(e.standingId, 50);
  }
});
