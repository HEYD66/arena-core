'use strict';
// BrowserView bounds are DIP. DPR and the fitted presentation scale are independent.
function deviceMetrics(env,bounds={}){
 const fixed=!!env.width,hardware=!!(env.fingerprint?.enabled&&env.fingerprint.hardware);
 const width=Number(env.width)||0,height=Number(env.height)||0;
 const bw=Math.max(1,Number(bounds.width)||width||1),bh=Math.max(1,Number(bounds.height)||height||1);
 const fit=fixed?Math.min(1,bw/width,bh/height):1;
 return {width,height,deviceScaleFactor:env.scale||0,mobile:false,scale:fit,
 ...(hardware?{screenWidth:env.fingerprint.screenWidth,screenHeight:env.fingerprint.screenHeight}:fixed?{screenWidth:width,screenHeight:height}:{})};
}
async function applyViewport(wc,env,bounds){const needed=env.width||env.scale||env.fingerprint?.enabled&&env.fingerprint.hardware;if(needed)await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride',deviceMetrics(env,bounds));}
// 宫格总览：页面仍按原视口（固定视口或正常浏览区域大小）排版，只把渲染结果等比缩小进格子。
// 不改 DPR；屏幕尺寸保持与正常浏览一致（硬件指纹 > 固定视口 > 真实屏幕），避免进出宫格时指纹变化。
function tileMetrics(env,tile,base,screen={}){const fixed=!!env.width,hardware=!!(env.fingerprint?.enabled&&env.fingerprint.hardware);
 const width=fixed?Number(env.width):Math.max(320,Math.round(Number(base?.width)||1280)),height=fixed?Number(env.height):Math.max(240,Math.round(Number(base?.height)||800));
 const scale=Math.max(0.05,Math.min(1,(Number(tile.width)||1)/width,(Number(tile.height)||1)/height));
 return {width,height,deviceScaleFactor:env.scale||0,mobile:false,scale:Math.round(scale*10000)/10000,...(hardware?{screenWidth:env.fingerprint.screenWidth,screenHeight:env.fingerprint.screenHeight}:fixed?{screenWidth:width,screenHeight:height}:screen.width?{screenWidth:screen.width,screenHeight:screen.height}:{})};}
module.exports={deviceMetrics,applyViewport,tileMetrics};
