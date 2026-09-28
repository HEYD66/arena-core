'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('app is branded 千面 Facet with its own icon while keeping the ArenaCore data folder',()=>{const main=read('src/main/main.cjs'),html=read('src/renderer/index.html');
 assert.match(main,/app\.setName\('千面 Facet'\)/);assert.match(main,/'appData'\),'ArenaCore'\)/,'data folder must not move, or existing instances would disappear');assert.match(main,/persist:arena-core-controls/);assert.match(main,/icon:appIcon/);
 assert.match(html,/<title>千面 Facet<\/title>/);assert.match(html,/class="mark"><svg /);assert.doesNotMatch(html,/Arena Core|ARENA CORE/);
 const ico=fs.readFileSync(path.join(root,'resources/facet.ico'));assert.deepEqual([...ico.subarray(0,4)],[0,0,1,0]);assert(ico.readUInt16LE(4)>=5,'multi-size ico');
 const png=fs.readFileSync(path.join(root,'resources/facet.png'));assert.equal(png.subarray(1,4).toString(),'PNG');});
