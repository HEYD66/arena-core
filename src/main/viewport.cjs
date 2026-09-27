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
module.exports={deviceMetrics,applyViewport};
