// ================================  *
//   Copyright Xialia.com  2013-2017 *
//   FILE  : src/service/yp
//   TYPE  : module
// ================================  *
const { resolve, join } = require("path");
const Entity = require("./entity");
const DRUMEE_TITLE = "Ultimate cloud technology";
const { Cache, Constants, Attr, sysEnv } = require("@drumee/server-essentials");
const { ID_NOBODY } = Constants;
let { main_domain, static_dir } = sysEnv();

class RuntimeEnv extends Entity {

  initialize(opt) {
    if (this._failed || this._isStopped) return;
    super.initialize(opt);
  }

  /**
   *
   */
  getSettings() {
    const { isObject, isEmpty, values } = require("lodash");
    const Jsonfile = require("jsonfile");
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
      endpoint_name, domain, ui_location, instance,
      ws_location, public_ui_root, app_routing_mark
    } = sysEnv();
    const app_file = resolve(ui_location, "app", "index.json");
    const app = Jsonfile.readFileSync(app_file);
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
    let endpointPath = endpoint_name;
    if (/^(main|index|)$/.test(endpoint_name)) {
      endpointPath = `${endpoint_path}/`
    }
    app.location = endpointPath;
    app.entry = `main-${app.hash}.js`;
    app.vendor = `vendor-${app.hash}.js`;
    let pdfworker = join(endpointPath, "app", `pdfworker-${app.hash}.js`);
    let pdfworkerLegacy = join(endpointPath, "app", `pdfworkerLegacy-${app.hash}.js`);
    if (app.no_hash) {
      app.entry = `main.js`;
      app.vendor = `vendor.js`;
      pdfworker = join(endpointPath, "app", `pdfworker.js`);
      pdfworkerLegacy = join(endpointPath, "app", `pdfworkerLegacy.js`);
    }
    let websocketPath = join(endpointPath, ws_location);

    const res = {
      access: "web",
      area,
      app,
      appRoot: public_ui_root,
      arch: Cache.getEnv("arch") || "single",
      browsers: "",
      connection: "new",
      description,
      domain,
      endpointName: instance,
      endpointPath,
      ident: "nobody",
      instance_name: instance,
      instance,
      language,
      main_domain,
      meta,
      mfs_base: endpointPath,
      org_name: domain,
      pdfworker,
      pdfworkerLegacy,
      profile,
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
