'use strict';
function applicationVersion(app){return app.isPackaged?app.getVersion():require('../../package.json').version;}
module.exports={applicationVersion};
