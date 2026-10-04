'use strict';
// Isolated, local-only diagnosis. No production profiles, credentials or public STUN servers.
const {app, BrowserWindow, WebContentsView, session} = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const http = require('node:http'), dgram = require('node:dgram');
const mode = process.argv[2] || 'guarded';
const output = process.argv[3];
const assert = require('node:assert/strict');
if (!output) throw Error('Run through tests/webrtc-runner.cjs');
if (!['control', 'guarded'].includes(mode)) throw Error('bad mode');
const profile = path.join(path.dirname(output), 'profile-'+mode);
fs.mkdirSync(profile,{recursive:true});
app.setPath('userData', profile);
if (mode === 'control') app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
app.commandLine.appendSwitch('disable-quic');
const report = {mode, profile, electron: process.versions.electron, localOnly: true, globalFlag: mode === 'control', results: []};
if (mode === 'guarded') require('../src/main/webrtc-policy.cjs').installWebRTCPolicy(app);
app.commandLine.appendSwitch('site-per-process');
const pages = [], wins = [];
let proxy, stun, udpRequests = 0, httpRequests = 0;
const sockets = new Set();
const mapped = '203.0.113.77'; // RFC 5737 documentation address, NOT an Internet peer.
const timer = setTimeout(() => { console.error('probe watchdog expired'); app.exit(2); }, 45000);

function gather(port) {
  return `(async()=>{
    const candidates=[]; const pc=new RTCPeerConnection({iceServers:[{urls:'stun:127.0.0.1:${port}'}]});
    const classify=a=>!a?'none':a==='${mapped}'?'fixture-mapped':a.endsWith('.local')?'mdns':a.includes(':')?'ipv6':'other-ipv4';
    let finish;
    const done=new Promise(resolve=>{finish=resolve;});
    pc.onicecandidate=e=>{if(!e.candidate){finish('complete');return;}const c=e.candidate;
      candidates.push({type:c.type,protocol:c.protocol,address:classify(c.address),relatedAddress:classify(c.relatedAddress)});};
    pc.onicegatheringstatechange=()=>{if(pc.iceGatheringState==='complete')finish('complete');};
    pc.createDataChannel('local-test'); await pc.setLocalDescription(await pc.createOffer());
    let timer;const ended=await Promise.race([done,new Promise(resolve=>{timer=setTimeout(()=>resolve('timeout'),7000);})]);
    clearTimeout(timer); const state=pc.iceGatheringState;pc.close();return {ended,state,candidates};
  })()`;
}
async function measure(label, wc, port) {
  const before = wc.getWebRTCIPHandlingPolicy();
  const policy = wc.getWebRTCIPHandlingPolicy();
  const u = udpRequests, h = httpRequests;
  await wc.loadURL('http://facet-webrtc.test/' + label);
  const ice = await wc.executeJavaScript('window.__ice');
  report.results.push({label, before, policy, httpViaProxy: httpRequests-h, udpRequests: udpRequests-u, ...ice});
}
app.whenReady().then(async () => {
  try {
    stun = dgram.createSocket('udp4');
    stun.on('message', (msg, remote) => {
      if (msg.length < 20 || msg.readUInt16BE(0) !== 1 || msg.readUInt32BE(4) !== 0x2112a442) return;
      udpRequests++;
      const res = Buffer.alloc(32);
      res.writeUInt16BE(0x0101,0);res.writeUInt16BE(12,2);res.writeUInt32BE(0x2112a442,4);msg.copy(res,8,8,20);
      res.writeUInt16BE(0x0020,20);res.writeUInt16BE(8,22);res[25]=1;res.writeUInt16BE(remote.port^0x2112,26);
      const octets=[203,0,113,77], magic=[0x21,0x12,0xa4,0x42];for(let i=0;i<4;i++)res[28+i]=octets[i]^magic[i];
      stun.send(res,remote.port,remote.address);
    });
    await new Promise((resolve,reject)=>{stun.once('error',reject);stun.bind(0,'127.0.0.1',resolve);});
    proxy=http.createServer((req,res)=>{
      httpRequests++;
      res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
      const target=new URL(req.url,'http://facet-webrtc.test');
      const iframe=target.pathname==='/instance-view'?'<iframe src="http://other-webrtc.test/frame"></iframe>':'';
      res.end('<!doctype html><title>Local WebRTC isolation probe</title><script>window.__label='+JSON.stringify(target.pathname)+';window.__ice='+gather(stun.address().port)+';</script><body>'+iframe+'</body>');
    });
    proxy.on('connect',(_req,socket)=>socket.destroy());
    proxy.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
    await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
    const s=session.fromPartition('webrtc-diagnosis-'+mode+'-'+Date.now());
    s.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));s.setPermissionCheckHandler(()=>false);
    await s.setProxy({mode:'fixed_servers',proxyRules:'http://127.0.0.1:'+proxy.address().port,proxyBypassRules:'<-loopback>'});
    const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});wins.push(win);
    const view=new WebContentsView({webPreferences:{session:s,sandbox:true,contextIsolation:true,nodeIntegration:false,nodeIntegrationInSubFrames:true}});
    win.contentView.addChildView(view);pages.push(view.webContents);
    await measure('instance-view',view.webContents,stun.address().port);
    const frame=view.webContents.mainFrame.frames.find(f=>f.url==='http://other-webrtc.test/frame');
    assert(frame,'cross-site iframe loaded');
    report.frame=await frame.executeJavaScript('window.__ice');
    assert.equal(report.frame.ended,'complete');
    // Exercise a real window.open child, not just an independently constructed window.
    view.webContents.setWindowOpenHandler(()=>({action:'allow',overrideBrowserWindowOptions:{show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}}}));
    const opened=new Promise(resolve=>view.webContents.once('did-create-window',resolve));
    const beforePopupUdp=udpRequests,beforePopupHTTP=httpRequests;
    await view.webContents.executeJavaScript(`window.open('http://facet-webrtc.test/real-window-open','_blank','width=400,height=300');0`,true);
    const child=await opened;wins.push(child);pages.push(child.webContents);
    report.popupSameSession=child.webContents.session===s;
    // The page's FIRST inline script starts ICE; no late did-create-window policy patch.
    const pwc=child.webContents;
    for(let i=0;i<200;i++){
      if(!pwc.isLoading()&&pwc.getURL()==='http://facet-webrtc.test/real-window-open')break;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.equal(await pwc.executeJavaScript('window.__label'),'/real-window-open');
    const popupIce=await pwc.executeJavaScript('window.__ice');
    report.results.push({label:'real-window-open-first-script',policy:pwc.getWebRTCIPHandlingPolicy(),httpViaProxy:httpRequests-beforePopupHTTP,udpRequests:udpRequests-beforePopupUdp,...popupIce});
    // A separate BrowserWindow in the same session must be secured independently.
    const popup=new BrowserWindow({show:false,webPreferences:{session:s,sandbox:true,contextIsolation:true,nodeIntegration:false}});wins.push(popup);pages.push(popup.webContents);
    await measure('same-session-window',popup.webContents,stun.address().port);
    // Verify same-origin storage isolation across two independent Electron partitions.
    const other=session.fromPartition('webrtc-other-'+Date.now());
    await other.setProxy({mode:'fixed_servers',proxyRules:'http://127.0.0.1:'+proxy.address().port,proxyBypassRules:'<-loopback>'});
    const otherWin=new BrowserWindow({show:false,webPreferences:{session:other,sandbox:true,contextIsolation:true,nodeIntegration:false}});wins.push(otherWin);pages.push(otherWin.webContents);
    await otherWin.loadURL('http://facet-webrtc.test/other');
    const first=await view.webContents.executeJavaScript(`document.cookie='facet_isolation=A; path=/';localStorage.setItem('facet_isolation','A');({cookie:document.cookie.includes('facet_isolation=A'),storage:localStorage.getItem('facet_isolation')})`);
    const second=await otherWin.webContents.executeJavaScript(`({cookie:document.cookie.includes('facet_isolation=A'),storage:localStorage.getItem('facet_isolation')})`);
    const shared=await popup.webContents.executeJavaScript(`({cookie:document.cookie.includes('facet_isolation=A'),storage:localStorage.getItem('facet_isolation')})`);
    report.storage={writtenInA:first,independentPartitionB:second,samePartitionPopup:shared,
      isolated:first.cookie&&first.storage==='A'&&!second.cookie&&second.storage===null&&shared.cookie&&shared.storage==='A'};
    await otherWin.webContents.executeJavaScript('window.__ice');
    report.totalUdp=udpRequests; report.totalHTTP=httpRequests;
    assert(report.storage.isolated,'Cookie and localStorage isolation');
    assert(report.popupSameSession,'popup keeps its instance session');
    for(const r of report.results){assert(r.httpViaProxy>0,r.label+' HTTP proxy');assert.equal(r.ended,'complete');}
    if(mode==='guarded'){
      assert.equal(udpRequests,0,'no STUN datagrams may bypass the HTTP proxy');
      for(const r of [...report.results,report.frame])assert.deepEqual(r.candidates,[],r.label||'iframe');
      for(const r of report.results)assert.equal(r.policy,'disable_non_proxied_udp');
    }else{
      assert(udpRequests>0,'positive control must reach local STUN');
      for(const r of [...report.results,report.frame])assert(r.candidates.some(c=>c.type==='srflx'&&c.address==='fixture-mapped'),'positive control candidate');
    }
  } catch(error) { report.error=error.stack||String(error); }
  finally {
    clearTimeout(timer);
    for(const wc of pages)if(!wc.isDestroyed())wc.close();
    for(const w of wins)if(!w.isDestroyed())w.destroy();
    for(const socket of sockets)socket.destroy();
    if(proxy)await new Promise(resolve=>proxy.close(resolve));
    if(stun)await new Promise(resolve=>stun.close(resolve));
    fs.writeFileSync(output,JSON.stringify(report,null,2));
    console.log('WEBRTC_RESULT '+JSON.stringify(report));
    app.exit(report.error?1:0);
  }
});
