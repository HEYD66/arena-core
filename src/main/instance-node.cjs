'use strict';
const crypto=require('node:crypto');
// Identify a saved instance copy without sending its server or credentials to the UI.
function nodeDiagnosticKey(id,node){return 'instance:'+id+':'+crypto.createHash('sha256').update(JSON.stringify(node)).digest('hex');}
function resolveInstanceNode(store,id,name){store.get(id);if(typeof name!=='string'||!name)throw Error('请选择实例节点；不会回退直连');const node=store.nodes(id).find(n=>n.name===name);if(!node)throw Error('实例节点不存在，请刷新配置；不会回退直连');return {instanceId:id,name:node.name,sourceId:nodeDiagnosticKey(id,node),node:structuredClone(node)};}
module.exports={nodeDiagnosticKey,resolveInstanceNode};
