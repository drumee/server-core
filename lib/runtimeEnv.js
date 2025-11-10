const { resolve, join } = require("path");
const Entity = require("./entity");

const DRUMEE_TITLE = "Ultimate cloud technology";
const {
  Cache, Constants, Attr, sysEnv, getUiInfo
} = require("@drumee/server-essentials");
const { ID_NOBODY } = Constants;
let { main_domain, static_dir, endpoint_path } = sysEnv();

class RuntimeEnv extends Entity {

  initialize(opt) {
    if (this._failed || this._isStopped) return;
    super.initialize(opt);
  }

  /**
   * 
   */
  getAppInfo() {
    let conf = { ...getUiInfo() };
    conf.location = endpoint_path;
    conf.entry = `main-${conf.hash}.js`;
    conf.vendor = `vendor-${conf.hash}.js`;
    conf.core = `core-${conf.hash}.js`;
    if (conf.no_hash) {
      conf.entry = `main.js`;
      conf.vendor = `vendor.js`;
      conf.core = `core.js`;
    }
    return conf
  }


  /**
   *
   */
  getSettings() {
    const { isObject, isEmpty, values } = require("lodash");
    let settings = {};
    let profile = {};
    let area = Attr.private;
    if (this.hub) {
      settings = this.hub.get("settings") || {};
      profile = this.hub.get("profile") || {};
      area = this.hub.get(Attr.area);
    }
    let title = profile.title || {};
    let meta = profile.meta || [];
    let { description } = settings || {};
    let {
      endpoint_name, domain, instance,
      ws_location, public_ui_root
    } = sysEnv();


    let language = this.input.app_language();
    if (this.user) {
      language = this.user.language() || language;
    }
    if (isEmpty(title)) {
      title = DRUMEE_TITLE;
    } else if (isObject(title)) {
      title = title[language] || title.en || DRUMEE_TITLE;
    }

    if (isObject(description)) {
      description =
        description[language] || values(description)[0] || DRUMEE_TITLE;
    }
    let endpointPath = endpoint_path;
    let websocketPath = join(endpointPath, ws_location);
    const protocol = this.input.get(Attr.protocol);
    let ws_protocol = 'ws';
    if (protocol == 'https') {
      ws_protocol = 'wss';
    }
    const port = this.input.get('server_port');
    let ws_port;
    if (port == 443) {
      ws_port = ''
    } else {
      ws_port = port;
    }

    let localhost = this.input.get(Attr.localhost) || 0;
    if (localhost) {
      main_domain = Attr.localhost;
    }
    const res = {
      access: "web",
      area,
      app: this.getAppInfo(),
      appRoot: public_ui_root,
      arch: Cache.getEnv("arch") || "single",
      browsers: "",
      connection: "new",
      description,
      domain,
      endpointName: endpoint_name,
      endpointPath,
      ident: "nobody",
      instance_name: endpoint_name,
      instance,
      language,
      localhost,
      main_domain,
      meta,
      ws_port: ws_port || '',
      mfs_base: endpointPath,
      org_name: domain,
      profile,
      protocol,
      servicePath: join(endpointPath, "service/"),
      signed_in: 0,
      static_dir,
      svc: join(endpointPath, "svc/"),
      svcPath: join(endpointPath, "svc/"),
      title,
      uid: ID_NOBODY,
      vdo: join(endpointPath, "vdo/"),
      vdoPath: join(endpointPath, "vdo/"),
      websocketPath,
      ws_port,
      ws_protocol,
      ws_location: websocketPath,
    }
    return res;
  }

  /**
   *
   * @returns
   */
  async getRuntimeEnv() {
    let settings = this.getSettings();
    if (!this.session || !this.user || !this.input) {
      return settings;
    }
    const a = {
      ...settings,
      connection: this.user.get("connection"),
      signed_in: this.user.get("signed_in"),
      uid: this.user.get(Attr.id) || ID_NOBODY,
      user_domain: this.user.get(Attr.domain),
    };
    return a;
  }

  /**
  * 
  */
  getRender(template_dir, fname) {
    const { readFileSync, existsSync } = require('fs');
    let filename = resolve(template_dir, fname);
    if (!existsSync(filename)) {
      this.warn("TEMPLATE_NOTFOUND", filename)
      console.trace()
      return null;
    }
    this.set({ template_dir });
    let x = readFileSync(filename);
    let content = String(x).trim().toString();
    const { template } = require('lodash');
    return template(content, { imports: { renderer: this } });
  }

}

module.exports = RuntimeEnv;
