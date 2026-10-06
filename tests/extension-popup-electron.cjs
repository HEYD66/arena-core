'use strict';
// Runs only in a NEW Electron process with the runner's unique temporary profile.
// No production Controller, existing extensions, real sites or proxy cores are used.
const { app, BrowserWindow, session, screen } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const root = process.env.FACET_POPUP_TEST_ROOT;
if (!root || !path.basename(root).startsWith('facet-popup-acceptance-') ||
    path.dirname(path.resolve(root)).toLowerCase() !== path.resolve(os.tmpdir()).toLowerCase()) {
  console.error('This fixture must run through scripts/test-extension-popup.cjs'); app.exit(2);
} else {
  for (const [key, name] of [['userData','user-data'],['sessionData','session-data'],['logs','logs'],['crashDumps','crashes']]) {
    const folder=path.join(root,name);fs.mkdirSync(folder,{recursive:true});app.setPath(key,folder);
  }
  if (['1','1.25','2'].includes(process.env.FACET_POPUP_TEST_SCALE)) app.commandLine.appendSwitch('force-device-scale-factor',process.env.FACET_POPUP_TEST_SCALE);
  app.commandLine.appendSwitch('disable-background-networking');
  app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
  app.on('window-all-closed',()=>{});
  require('../src/main/webrtc-policy.cjs').installWebRTCPolicy(app);
  const {InstanceExtensions}=require('../src/main/extensions.cjs');
  const created=[],shown=new Set(),focused=new Set(),preferredEvents=new WeakMap(),results=[];
  // Geometry/layout still use real native windows. Suppress only showing/focusing
  // these synthetic fixtures so the user's current work is not covered or focused away.
  app.on('browser-window-created',(_event,win)=>{created.push(win);preferredEvents.set(win,[]);win.webContents.on('preferred-size-changed',(_e,size)=>preferredEvents.get(win).push(size));win.webContents.setBackgroundThrottling(false);win.show=()=>shown.add(win);win.focus=()=>focused.add(win);});
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async(predicate,label)=>{const start=Date.now();while(Date.now()-start<5000){if(await predicate())return;await pause(35);}throw Error('Timeout: '+label);};
  const near=(actual,expected,tolerance=7)=>Math.abs(actual-expected)<=tolerance;
  const ok=label=>{results.push(label);console.log('PASS '+label);};
  const watchdog=setTimeout(()=>{console.error('Popup fixture timeout');app.exit(2);},40000);
  const metrics=win=>win.webContents.executeJavaScript(`({width:innerWidth,height:innerHeight,bodyWidth:document.body.getBoundingClientRect().width,bodyHeight:document.body.getBoundingClientRect().height,clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,dpr:devicePixelRatio,font:getComputedStyle(document.body).fontSize,requireType:typeof require})`);
  app.whenReady().then(async()=>{
    let manager,runtime,fixtureSession,extension;
    try {
      const folder=path.join(root,'fixture-extension');fs.mkdirSync(folder);
      fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify({manifest_version:3,name:'Controlled layout fixture',version:'1.0',action:{default_popup:'popup.html'},options_page:'popup.html',permissions:[],content_security_policy:{extension_pages:"script-src 'self'; object-src 'self'; connect-src 'none'; style-src 'self' 'unsafe-inline'"}}));
      fs.writeFileSync(path.join(folder,'popup.html'),`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Controlled panel</title><style>html{margin:0}body{margin:0;padding:12px;box-sizing:border-box;width:340px;height:180px;background:#171b23;color:#edf1f8;font:14px Arial,sans-serif}main{height:100%;box-sizing:border-box;border:1px solid #3a4458;padding:12px;display:flex;flex-direction:column;gap:8px}button{font:inherit;padding:6px;border:0;background:#4262d9;color:white}</style></head><body><main><strong>Extension panel</strong><span>Isolated layout fixture</span><button>Example action</button></main></body></html>`);
      fixtureSession=session.fromPartition('persist:facet-popup-fixture');
      fixtureSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!['chrome-extension:','file:','data:','about:'].some(prefix=>details.url.startsWith(prefix))}));
      extension=await fixtureSession.extensions.loadExtension(folder,{allowFileAccess:false});
      const parent=new BrowserWindow({width:1100,height:800,show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
      runtime={status:'running',session:fixtureSession,loadedExtensions:new Map([['fixture',extension]])};
      manager=Object.create(InstanceExtensions.prototype);
      manager.windowKinds=new WeakMap();manager.catalog={get:()=>({name:'Controlled layout fixture',entries:{popup:'popup.html',options:'popup.html'}})};
      manager.c={window:parent,runtimes:new Map([['isolated-instance',runtime]]),store:{get:()=>({name:'Isolated instance'})}};
      const beforeListeners=screen.listenerCount('display-metrics-changed');
      await manager.open('isolated-instance','fixture','popup');
      let popup=[...runtime.extensionWindows][0];
      await wait(()=>{const [w,h]=popup.getContentSize();return near(w,342)&&near(h,182);},'narrow popup fit');
      const first=await metrics(popup);assert(first.scrollWidth<=first.clientWidth+1);assert.equal(first.bodyWidth,340);assert.equal(first.font,'14px');assert(shown.has(popup));
      console.log('DISPLAY_SCALE='+screen.getDisplayMatching(popup.getBounds()).scaleFactor);
      console.log('INITIAL_CONTENT='+popup.getContentSize().join('x'));
      ok('narrow popup fits content without widening text');
      const preferences=popup.webContents.getLastWebPreferences();
      for(const field of ['sandbox','contextIsolation','webSecurity'])assert.equal(preferences[field],true,field);
      // Electron does not serialize enablePreferredSizeMode in getLastWebPreferences.
      // Verify the actual native notification and fitted geometry instead.
      assert(preferredEvents.get(popup).length>0);
      assert.equal(preferences.nodeIntegration,false);assert.equal(first.requireType,'undefined');assert.equal(popup.webContents.session,fixtureSession);
      assert.equal(popup.webContents.getWebRTCIPHandlingPolicy(),'disable_non_proxied_udp');
      ok('sandbox, session and WebRTC protections remain unchanged');
      await manager.open('isolated-instance','fixture','popup');assert.equal(runtime.extensionWindows.size,1);assert(focused.has(popup));
      ok('reopening the same popup focuses its existing window');
      await manager.open('isolated-instance','fixture','options');assert.equal(runtime.extensionWindows.size,2);
      const options=[...runtime.extensionWindows].find(win=>win!==popup),optionsBefore=options.getSize();
      assert(near(optionsBefore[0],760)&&near(optionsBefore[1],640));await pause(80);assert.equal(preferredEvents.get(options).length,0);
      options.webContents.emit('preferred-size-changed',{}, {width:100,height:100});await pause(80);assert.deepEqual(options.getSize(),optionsBefore);
      ok('options keeps its larger window even when it uses the same URL');
      await popup.webContents.executeJavaScript("document.body.style.width='620px';document.body.style.height='210px'");
      await wait(()=>near(popup.getContentSize()[0],622)&&near(popup.getContentSize()[1],212),'wide content growth');
      assert((await metrics(popup)).scrollWidth<=(await metrics(popup)).clientWidth+1);
      ok('late content can grow the popup');
      await popup.webContents.executeJavaScript("document.body.style.width='280px';document.body.style.height='140px'");
      await wait(()=>near(popup.getContentSize()[0],282)&&near(popup.getContentSize()[1],142),'content shrink');
      ok('late content can shrink the popup');
      await popup.webContents.executeJavaScript("document.body.style.width='340px';document.body.style.height='900px'");
      await wait(()=>near(popup.getContentSize()[1],600)&&popup.getContentSize()[0]<390,'tall content cap');
      const tall=await metrics(popup);assert(tall.scrollHeight>tall.clientHeight);assert(tall.scrollWidth<=tall.clientWidth+1);
      ok('tall panels scroll vertically without a large empty right side');
      await popup.webContents.executeJavaScript("document.body.style.width='1200px';document.body.style.height='200px'");
      await wait(()=>near(popup.getContentSize()[0],800)&&popup.getContentSize()[1]<260,'oversized width cap');
      const wide=await metrics(popup);assert(wide.scrollWidth>wide.clientWidth);assert(wide.scrollHeight<=wide.clientHeight+2);
      const bounds=popup.getBounds(),area=screen.getDisplayMatching(bounds).workArea;
      assert(bounds.x>=area.x&&bounds.y>=area.y&&bounds.x+bounds.width<=area.x+area.width+2&&bounds.y+bounds.height<=area.y+area.height+2);
      ok('oversized content is bounded by the screen without shrinking the page');
      await popup.webContents.executeJavaScript("document.body.style.width='340px';document.body.style.height='180px'");
      await wait(()=>near(popup.getContentSize()[0],342),'reset narrow width');
      popup.webContents.setZoomFactor(1.25);
      await wait(()=>near(popup.getContentSize()[0],426,9)&&near(popup.getContentSize()[1],226,9),'zoomed native size');
      const zoomed=await metrics(popup);assert.equal(popup.webContents.getZoomFactor(),1.25);assert.equal(zoomed.bodyWidth,340);assert(zoomed.scrollWidth<=zoomed.clientWidth+1);
      ok('native page zoom is respected rather than multiplied by DPI again');
      popup.webContents.setZoomFactor(1);await wait(()=>near(popup.getContentSize()[0],342),'restore fixture zoom');
      await popup.webContents.executeJavaScript("document.body.style.width='100vw';document.body.style.height='100vh'");
      const viewportBefore=popup.getContentSize();await pause(450);const viewportAfter=popup.getContentSize();
      assert(near(viewportAfter[0],viewportBefore[0],8)&&near(viewportAfter[1],viewportBefore[1],8));
      ok('viewport-sized layouts do not trigger a continuous resize loop');
      popup.emit('will-resize',{},popup.getBounds());popup.setContentSize(500,350);const manual=popup.getContentSize();
      await popup.webContents.executeJavaScript("document.body.style.width='700px';document.body.style.height='500px'");await pause(180);assert.deepEqual(popup.getContentSize(),manual);
      ok('manual sizing takes precedence over subsequent layout changes');
      let prevented=false;popup.webContents.emit('will-navigate',{preventDefault(){prevented=true;}},'https://outside.invalid/');assert(prevented);
      ok('external navigation remains blocked');
      popup.destroy();options.destroy();assert.equal(runtime.extensionWindows.size,0);
      await manager.open('isolated-instance','fixture','popup');popup=[...runtime.extensionWindows][0];
      await wait(()=>near(popup.getContentSize()[0],342),'reopen resets auto-fit');
      ok('closing and reopening restores automatic sizing');
      manager.unload(runtime);await pause(80);assert.equal(runtime.extensionWindows.size,0);assert.equal(screen.listenerCount('display-metrics-changed'),beforeListeners);
      ok('closing extension windows releases sizing listeners and timers');
      // Reload only our own fixture and close its new view during asynchronous open.
      extension=await fixtureSession.extensions.loadExtension(folder,{allowFileAccess:false});runtime.loadedExtensions=new Map([['fixture',extension]]);
      const pending=manager.open('isolated-instance','fixture','popup').then(()=>null,error=>error);
      const closing=[...runtime.extensionWindows][0];closing.destroy();await pending;assert.equal(runtime.extensionWindows.size,0);
      ok('closing during load cannot leave a hidden popup or pending open');
      console.log('POPUP_TESTS_PASSED='+results.length);
    } catch(error) { console.error('POPUP_TEST_FAILED '+error.message);process.exitCode=1; }
    finally {
      clearTimeout(watchdog);for(const win of created)if(!win.isDestroyed())win.destroy();
      if(fixtureSession&&extension)try{fixtureSession.extensions.removeExtension(extension.id);}catch{}
      app.exit(process.exitCode||0);
    }
  });
}
