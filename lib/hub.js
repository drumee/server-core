// ================================  *
//   Copyright Xialia.com  2013-2019 *
//   FILE : src/drumee/core/ws
//   CLASS :                         *
//   TYPE : application instance
// ================================  *
const {
  Attr, Logger, sysEnv
} = require("@drumee/server-essentials");

const { main_domain } = sysEnv();
class __core_user extends Logger {

  
  keysel() {
    let host = this.get(Attr.vhost);
    const re = new RegExp('.' + main_domain + '$')
    const keysel = host.replace(re, '');
    return keysel;
  }
}

module.exports = __core_user;
