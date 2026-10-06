'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('app is branded 千面 Facet with stable persisted data and session identifiers',()=>{const main=read('src/main/main.cjs'),html=read('src/renderer/index.html');
 assert.match(main,/app\.setName\('千面 Facet'\)/);assert.match(read('src/main/app-paths.cjs'),/fs\.existsSync\(existing\)\?existing/,'existing data must remain accessible');assert.match(main,/persist:arena-core-controls/);assert.match(main,/icon:appIcon/);
 assert.match(html,/<title>千面 Facet<\/title>/);assert.match(html,/class="mark"><svg /);assert.doesNotMatch(html,/Arena Core|ARENA CORE/);
 const ico=fs.readFileSync(path.join(root,'resources/facet.ico'));assert.deepEqual([...ico.subarray(0,4)],[0,0,1,0]);assert(ico.readUInt16LE(4)>=5,'multi-size ico');
 const png=fs.readFileSync(path.join(root,'resources/facet.png'));assert.equal(png.subarray(1,4).toString(),'PNG');});
test('public product links, updater feed and package metadata use Facet',()=>{
 const pkg=require('../package.json'),config=require('../electron-builder.config.cjs');
 assert.equal(pkg.name,'facet');assert.equal(pkg.homepage,'https://github.com/HEYD66/facet');
 assert.equal(config.publish[0].repo,'facet');
 for(const file of ['README.md','src/renderer/app.js','src/main/ipc.cjs','scripts/publish-release.cjs'])assert(!read(file).includes('HEYD66/arena-core'),file);
 assert.match(read('src/main/preload.cjs'),/exposeInMainWorld\('facet'/);
 assert.match(read('src/renderer/app.js'),/window\.facet/);
});
