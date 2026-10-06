'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { extensionWindowOptions, popupContentSize, popupPosition, attachPopupSizing } = require('../src/main/extension-popup.cjs');
const area = { x: 0, y: 0, width: 1200, height: 900 };
const frame = { width: 16, height: 32 };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
class FakeWindow extends EventEmitter {
  constructor() {
    super(); this.content = [360,480]; this.bounds = {x:120,y:80,width:376,height:512}; this.calls=[]; this.destroyed=false;
    this.zoom=1; this.webContents = new EventEmitter(); this.webContents.isDestroyed=()=>this.destroyed;
    this.webContents.getZoomFactor=()=>this.zoom; this.webContents.setZoomFactor=value=>{this.zoom=value;};
  }
  getBounds(){return {...this.bounds};}
  getContentSize(){return [...this.content];}
  setContentSize(width,height){this.calls.push([width,height]);this.content=[width,height];this.bounds.width=width+16;this.bounds.height=height+32;this.emit('resize');}
  setPosition(x,y){this.bounds.x=x;this.bounds.y=y;this.emit('move');}
  isDestroyed(){return this.destroyed;}
  isMaximized(){return this.maximized===true;}
  isMinimized(){return this.minimized===true;}
  isFullScreen(){return this.fullscreen===true;}
  destroy(){this.destroyed=true;this.webContents.emit('destroyed');this.emit('closed');}
}
class FakeHost extends EventEmitter {
  constructor() { super(); this.bounds={x:50,y:40,width:1000,height:800}; this.destroyed=false; }
  getBounds(){return {...this.bounds};}
  isDestroyed(){return this.destroyed;}
  resize(x,y,width,height){this.bounds={x,y,width,height};this.emit('resize');}
  close(){this.destroyed=true;this.emit('closed');}
}
function fixture(t, options={}) {
  const win=new FakeWindow(),screen=new EventEmitter();screen.display={id:1,workArea:{...area},scaleFactor:1.25};screen.getDisplayMatching=()=>screen.display;
  const sizing=attachPopupSizing(win,screen,{initialWait:30,debounceMs:2,...options});t.after(()=>sizing.dispose());
  return {win,screen,sizing};
}
test('popup and options windows have distinct sizing policies',()=>{
  const popup=extensionWindowOptions('popup'),options=extensionWindowOptions('options');
  assert.equal(popup.useContentSize,true);assert(popup.width<760);assert(popup.minWidth<340);
  assert.deepEqual([options.width,options.height,options.minWidth,options.minHeight],[760,640,420,360]);
  assert.equal(options.resizable,true);assert.throws(()=>extensionWindowOptions('other'));
});
test('a narrow fixed panel is fitted instead of receiving a 760-pixel container',()=>{
  assert.deepEqual(popupContentSize({width:340,height:180},frame,area),{width:342,height:182});
});
test('native zoomed dimensions are not multiplied by the display scale factor',()=>{
  assert.deepEqual(popupContentSize({width:424,height:224},frame,{...area,scaleFactor:1.25}),{width:426,height:226});
  assert.deepEqual(popupContentSize({width:424,height:224},frame,{...area,scaleFactor:2}),{width:426,height:226});
});
test('tall panels keep a bounded height while wide panels receive scrollbar room',()=>{
  assert.deepEqual(popupContentSize({width:355,height:900},frame,area),{width:357,height:600});
  assert.deepEqual(popupContentSize({width:1200,height:200},frame,area),{width:800,height:220});
});
test('small screens and native window frames constrain popup content',()=>{
  assert.deepEqual(popupContentSize({width:2000,height:2000},frame,{x:0,y:0,width:600,height:420}),{width:560,height:364});
  const tiny=popupContentSize({width:300,height:400},frame,{x:0,y:0,width:120,height:120});assert(tiny.width>0&&tiny.height>0);
});
test('invalid preferred sizes cannot create unsafe window bounds',()=>{
  for(const size of [null,{}, {width:NaN,height:30},{width:Infinity,height:20},{width:-1,height:10},{width:0,height:10},{width:'340',height:100}])assert.equal(popupContentSize(size,frame,area),null);
  assert.deepEqual(popupContentSize({width:1,height:1},frame,area),{width:160,height:80});
});
test('position clamping supports negative-origin monitors',()=>{
  const display={x:-1920,y:-200,width:1280,height:900};
  assert.deepEqual(popupPosition({x:-2200,y:-400,width:400,height:500},display),{x:-1908,y:-188});
  assert.deepEqual(popupPosition({x:-800,y:600,width:400,height:500},display),{x:-1052,y:188});
});
test('missing display metadata never causes a repeated position drift',()=>{
  const bounds={x:-20,y:40,width:400,height:500};assert.deepEqual(popupPosition(bounds,null),{x:-20,y:40});
});
test('native size notifications resize content and resolve initial readiness',async t=>{
  const {win,sizing}=fixture(t);win.webContents.emit('preferred-size-changed',{}, {width:340,height:180});await sizing.ready;
  assert.deepEqual(win.content,[342,182]);assert.equal(win.calls.length,1);
});
test('dynamic content can grow and shrink; programmatic sizing does not stop auto-fit',async t=>{
  const {win,sizing}=fixture(t);win.webContents.emit('preferred-size-changed',{}, {width:340,height:180});await sizing.ready;
  win.webContents.emit('preferred-size-changed',{}, {width:620,height:210});await pause(12);assert.deepEqual(win.content,[622,212]);
  win.webContents.emit('preferred-size-changed',{}, {width:280,height:140});await pause(12);assert.deepEqual(win.content,[282,142]);
});
test('notification bursts are coalesced to the latest preferred size',async t=>{
  const {win,sizing}=fixture(t);
  for(let width=300;width<=350;width++)win.webContents.emit('preferred-size-changed',{}, {width,height:200});
  await sizing.ready;assert.deepEqual(win.content,[352,202]);assert.equal(win.calls.length,1);
});
test('viewport-sized preferred notifications do not expand the popup by padding repeatedly',async t=>{
  const {win,sizing}=fixture(t);win.webContents.emit('preferred-size-changed',{}, {width:360,height:480});await sizing.ready;
  for(let i=0;i<5;i++){win.webContents.emit('preferred-size-changed',{}, {width:win.content[0],height:win.content[1]});await pause(6);}
  assert.deepEqual(win.content,[360,480]);assert.equal(win.calls.length,0);
});
test('intentional user resizing takes precedence for that window lifetime',async t=>{
  const {win,sizing}=fixture(t);win.webContents.emit('preferred-size-changed',{}, {width:340,height:180});await sizing.ready;
  win.emit('will-resize',{},{});win.setContentSize(500,400);const count=win.calls.length;
  win.webContents.emit('preferred-size-changed',{}, {width:700,height:550});await pause(12);
  assert.deepEqual(win.content,[500,400]);assert.equal(win.calls.length,count);
});
test('maximized windows are not forced back to popup size',async t=>{
  const {win,sizing}=fixture(t);win.maximized=true;win.webContents.emit('preferred-size-changed',{}, {width:340,height:180});await sizing.ready;
  assert.equal(win.calls.length,0);win.maximized=false;win.emit('unmaximize');await pause(12);assert.deepEqual(win.content,[342,182]);
});
test('moving to another display recalculates available space without modifying page zoom',async t=>{
  const {win,screen,sizing}=fixture(t);win.webContents.emit('preferred-size-changed',{}, {width:700,height:550});await sizing.ready;
  screen.display={id:2,workArea:{x:-800,y:0,width:600,height:420},scaleFactor:2};win.bounds.x=-1000;win.emit('move');await pause(12);
  assert.deepEqual(win.content,[560,364]);assert.equal(win.bounds.x,-788);assert(win.bounds.y+win.bounds.height<=420);
});
test('popup follows host resize with bounded proportional zoom and position',async t=>{
  const win=new FakeWindow(),host=new FakeHost(),screen=new EventEmitter();
  screen.display={id:1,workArea:{...area},scaleFactor:1};screen.getDisplayMatching=()=>screen.display;
  const sizing=attachPopupSizing(win,screen,{host,initialWait:30,debounceMs:2});t.after(()=>sizing.dispose());
  win.webContents.emit('preferred-size-changed',{}, {width:340,height:180});await sizing.ready;
  const first=win.getBounds();
  host.resize(80,20,700,560);await pause(8);
  assert.equal(win.webContents.getZoomFactor(),0.7);
  win.webContents.emit('preferred-size-changed',{}, {width:238,height:126});await pause(8);
  assert.deepEqual(win.content,[240,128]);
  const moved=win.getBounds();
  assert.equal(moved.x,Math.round(80+((first.x-50)/1000)*700));
  assert.equal(moved.y,Math.round(20+((first.y-40)/800)*560));
  host.resize(80,20,2200,1600);await pause(8);
  assert.equal(win.webContents.getZoomFactor(),1.5);
  host.close();assert.equal(host.listenerCount('resize'),0);
});
test('closing a window cancels scheduled work and removes native listeners',async t=>{
  const {win,screen,sizing}=fixture(t);win.webContents.emit('preferred-size-changed',{}, {width:620,height:400});win.destroy();await sizing.ready;await pause(12);
  assert.equal(win.calls.length,0);assert.equal(screen.listenerCount('display-metrics-changed'),0);assert.equal(win.webContents.listenerCount('preferred-size-changed'),0);
});
test('missing preferred-size events use a bounded fallback instead of hanging open()',async t=>{
  const {win,sizing}=fixture(t,{initialWait:8});await sizing.ready;assert.deepEqual(win.content,[360,480]);
});
