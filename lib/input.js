
const {
  Attr, uniqueId, Logger, sysEnv, nullValue, Events
} = require("@drumee/server-essentials");

const HOMEPAGE_SVC = 'index.home';
const { tmp_dir, endpoint_name, instance, main_domain,
  private_domain, public_domain
} = sysEnv();
const { isObject, values, isEmpty, isString } = require("lodash");
const parseUrl = require("url").parse;

const { extname, join, normalize, basename } = require("path");
const Language = require("accept-language");
const {
  INPUT_READY,
  END,
  DATA,
} = Events;

const {
  writeFileSync,
  existsSync,
  rmSync,
} = require("fs");

const SVC_TAG = new RegExp(`^/[\_\-]/.*(service|svc|vdo)/`);
const IS_VDO = new RegExp(`^/[\_\-]/.*(vdo)/`);
const HTTP_PROTO = new RegExp(/^http.+:\/\//i);
const BAD_VALUES = [null, undefined, "null", "undefined"];

const Cookie = require("cookie");
/**
 * 
 * @returns 
 */

/**
 *
 * @param {*} request
 */
class Input extends Logger {
  /**
    * 
    * @param {*} opt 
    */
  initialize(opt) {
    const { request, sourceName } = opt;
    this.sourceName = sourceName;
    let { url } = request;
    let headers = {};
    let query = {};
    let location = {};

    if (request.httpRequest) {
      headers = request.httpRequest.headers || {};
    } else if (request.headers) {
      headers = request.headers
    }

    let { cookie, host } = headers;
    if (cookie) {
      try {
        cookie = Cookie.parse(cookie);
      } catch (e) {
        cookie = {};
      }
    } else {
      cookie = {};
    }
    try {
      location = parseUrl(url, true);
    } catch (error) { }

    this.set({ location, cookie, host });
    this._parseHeader(headers);
    this._parseService();

    if (this.get(Attr.upload) || this.get(Attr.service) == 'media.upload') {
      this._isUploading = true;
      this.setTimeout(request, 12 * 60 * 60);
    }
    this._chunks = [];
    this._parseBody(request, headers);

    if (request.resourceURL) {
      query = request.resourceURL.query;
    }

    let origin;
    if (request.headers) {
      origin = request.headers.origin;
    }

    if (origin && isEmpty(this.get(Attr.location))) {
      let location = new URL(origin);
      this.set({ location });
    }
    this.set({ url, query, headers, cookie, host, origin });
  }

  /**
   * 
   * @param {*} key 
   */
  cookie(key) {
    let cookie = this.get(Attr.cookie) || {};
    return cookie[key];
  }

  /**
   * 
   */
  stop() {
    let uploaded_file = this.get(Attr.uploaded_file);
    /** In some situations, file may be left */
    if (uploaded_file && existsSync(uploaded_file)) {
      rmSync(uploaded_file);
    }
  }

  /**
   *
   * @param {*} key
   * @returns
   */
  _parseHeader(headers) {
    const pattern = new RegExp(/^x-param-/i);
    const input = {};
    for (let k in headers) {
      if (pattern.test(k)) {
        let key = k.replace(pattern, "");
        input[key] = decodeURI(headers[k]);
      } else {
        input[k] = decodeURI(headers[k]);
      }
    }
    const data = input["xia-data"] || input["drumee-data"];
    let x_param_data = {};
    if (isString(data)) {
      try {
        x_param_data = JSON.parse(data);
      } catch (e) {
        x_param_data = {};
      }
    }
    delete input["xia-data"];
    delete input["drumee-data"];
    this.set(input);
    this.set(x_param_data);
  }


  /**
   *
   */
  _emptyFile() {
    let ext = extname(this.get(Attr.filename));
    const id = `${uniqueId()}${ext}`;
    const filepath = join(tmp_dir, id);

    writeFileSync(filepath, "");
    this.set(Attr.uploaded_file, filepath);
    this.set(Attr.uploaded_id, id);
  }

  /**
   * 
   * @param {*} path 
   */
  _parseVdoOptions(path) {
    let str = path.replace(IS_VDO, "");
    if (/^.+\.(ts|m3u8)[\?\&]*.*$/.test(str)) {
      str = str.replace(/\?.*$/, '');
      let head = str.replace(/(stream|master|segment).+$/, '');
      let re = new RegExp('^' + head)
      let tail = str.replace(re, '');
      let [nid, hub_id] = head.split(/\/+/).filter((e) => { return e.length });
      this.set({ nid });
      if (hub_id) {
        this.set({ hub_id });
      }
      let service, serial, segment;
      if (/^master/.test(tail)) {
        service = 'video.master'
      } else if (/^(stream)/.test(tail)) {
        serial = tail.replace(/^(.+)-(\d+)\/(.+)/, '$2');
        service = "video.stream";
        this.set({ serial })
        if (/(segment)/.test(tail)) {
          segment = tail.replace(/^(.+)\/(.+)-(\d+).(.+)/, '$3');
          service = "video.segment";
          this.set({ segment });
        }
      }
      this.set({ service });
    }
  }

  /**
  * 
  */
  _parseService(args) {
    let service;
    let { path } = this.get(Attr.location);
    if (!args && path) {
      service = path.replace(SVC_TAG, ""); // Clean heading
    }
    if (nullValue(service)) {
      service = HOMEPAGE_SVC;
      this.set({ service })
      return service;
    }
    service = service.replace(/[\?\&].*$/, ""); // Clean tailing
    if (IS_VDO.test(path)) {
      return this._parseVdoOptions(path)
    }
    if (service == `${endpoint_name}/`) {
      service = HOMEPAGE_SVC;
    }
    this.set({ service });
  }

  /**
 * 
 */
  _parseBody(request, headers) {
    if (/(^multipart)/i.test(headers["content-type"])) {
      let form = new Form({
        autoFiles: true,
        uploadDir: tmp_dir,
      });

      form.parse(request, (err, fields, files) => {
        this._storeFromMutipart(files);
      });
    } else {
      request.on(DATA, this._storeStream.bind(this));
      request.once(END, this._storeInput.bind(this));
    }
  }


  /**
 *
 * @param {*} chunk
 * @returns
 */
  _storeStream(chunk) {
    if (chunk == null) {
      return;
    }
    if (!this._md5Hash) {
      let { createHash } = require("crypto");
      this._md5Hash = createHash("md5");
    }
    this._md5Hash.update(chunk);
    if (this._isUploading) {
      const { createWriteStream } = require("fs");
      let ext = extname(this.get(Attr.filename));

      const id = `${this.randomString()}${ext}`;
      const filepath = join(tmp_dir, id);
      if (!this._stream) {
        this.set(Attr.uploaded_file, filepath);
        this.set(Attr.uploaded_id, id);

        this._stream = createWriteStream(filepath);
        this._stream.on("error", (e) => {
          this.debug(`STREAM_ERROR: RECEIVING FILE ${filepath}`, e);
          throw { error: "500", message: "UPLOAD_FAILED" };
        });
        this._stream.on("finish", (e) => {
          this.trigger(END);
          this._stream.end();
        });
      }
      this._stream.write(chunk);
      return;
    }
    this._chunks.push(chunk);
  }

  /**
 *
 * @param {*} files
 * @returns
 */
  _storeFromMutipart(files) {
    try {
      let file = values(files)[0][0];
      this.set({
        uploaded_file: file.path,
        filename: file.originalFilename,
        uploaded_id: basename(file.path),
      });
    } catch (e) {
      return;
    }
    this._storeInput();
  }

  /**
   *
   */
  _storeInput() {
    if (this._isUploading) {
      if (!this._md5Hash) {
        let { createHash } = require("crypto");
        this._md5Hash = createHash("md5");
      }
      let md5Hash = this._md5Hash.digest("hex");
      this.set({ md5Hash });
      if (!this._stream) {
        this._emptyFile();
      }
      this.unset('request');
      this.trigger(INPUT_READY);
      return;
    }
    if (this._chunks == null) {
      return null;
    }

    let data = {};
    this._body = {};
    let input = {};
    let json = null;
    let { query } = this.get(Attr.location);
    if (query) {
      for (var k in query) {
        try {
          json = JSON.parse(k);
        } catch (e) {
          input[k] = query[k];
        }
      }
      if (isObject(json)) {
        input = { ...json, ...input };
      }
      this.set(input);
    }

    if (this._chunks.length > 0) {
      data = Buffer.concat(this._chunks);
      try {
        this._body = JSON.parse(data.toString());
      } catch (e) {
        this.set({ parse_error: 1 });
      }
    } else {
      this._body = input;
    }

    let src = this._body.src || this._body.resource;
    this.set(this._body);

    if (HTTP_PROTO.test(src)) {
      try {
        let { host, pathname } = new URL(src);
        let nid = this._body.nid || normalize(pathname);
        let vhost = this._body.vhost || host;
        this.set({ nid, vhost });
      } catch (e) { }
    }

    /** Last chache to define service */
    if (!this.get(Attr.service) && input.service) {
      this._parseService(input.service);
    }

    this.trigger(INPUT_READY);
  }

  /**
   * change default timeout
   */
  setTimeout(request, val) {
    val = val * 1000;
    request.setTimeout(val, (e) => {
      this.warn("Timeout chenaged to", e);
    });
  }

  /**
   *
   */
  get_stream() {
    return this._stream;
  }

  /**
 *
 */
  headers() {
    return this.get("headers");
  }

  /**
 *
 */
  body() {
    return this._body;
  }

  /**
   * Values are initialized by this.authorization, 
   * so it has to be called at last once
   *
   * @param {*} data
   */
  sid(keysel) {
    let id = this.get("activeSessionId");
    if (keysel) {
      return this.cookie(keysel) || id;
    }
    return id;
  }

  /**
   * 
   * @param {*} sid 
   */
  validCookie(sid) {
    if (!isString(sid)) {
      return uniqueId(20);
    }
    if (BAD_VALUES.includes(sid)) {
      return uniqueId(20);
    }
    if (sid.length < 16) {
      return uniqueId(20);
    }
    return sid;
  }

  /**
   * 
   */
  _authorization() {
    let cookie = this.get(Attr.cookie) || {};
    let host = this.get(Attr.host);
    let query = this.get(Attr.query) || {};
    let location = this.get(Attr.location) || {};
    if (isEmpty(query)) {
      query = location.query;
    }
    let { otak, accessToken, keysel } = query || {};
    if (!keysel) keysel = "";
    keysel = keysel.replace(/[\/\?\&\=]+/, '');

    let res = {
      accessToken,
      otak,
      host,
      device_id: this.get(Attr.device_id)
    };
    let currentSid = this.get('activeSessionId');
    let activeSessionId;
    switch (this.sourceName) {
      case Attr.service:
        keysel = keysel || this.get("keysel");
        if (keysel) {
          if (cookie[keysel]) {
            activeSessionId = cookie[keysel];
          } else {
            activeSessionId = this.get(keysel) || this.validCookie();
          }
          res.keysel = keysel;
          return { ...res, activeSessionId };
        };
        res.keysel = Attr.regsid;
        activeSessionId = cookie.regsid || this.get(res.keysel) || this.validCookie();
        return { ...res, activeSessionId };

      case Attr.page:
        if (!keysel) {
          res.keysel = "";
          if (cookie.regsid) {
            res.keysel = Attr.regsid;
            activeSessionId = cookie.regsid;
          } else {
            activeSessionId = currentSid || this.validCookie();
          }
          return { ...res, activeSessionId };
        }
        res.keysel = keysel;
        if (cookie[keysel]) {
          activeSessionId = cookie[keysel];
        } else {
          activeSessionId = currentSid || this.validCookie();
        }
        return { ...res, activeSessionId };

      case Attr.websocket:
        activeSessionId = currentSid || this.validCookie();
        return { ...res, activeSessionId };
      default:
        this.warn(`Unsupported suource name ${this.sourceName}`)
    }
  }

  /**
   * 
   * @returns 
   */
  authorization(reset = 0) {
    let auth = this._authorization();
    const { activeSessionId, host } = auth;
    this.set({ activeSessionId, host });
    let res = { ...auth, sid: activeSessionId, id: activeSessionId };
    return res;

  }


  /**
  *
  * @param {*} locale
  */
  language(locale = false) {
    if (this.get("Xlang") != null) {
      return this.get("Xlang");
    }

    if (this.get(Attr.lang) != null) {
      return this.get(Attr.lang);
    }

    const l = Language.get(this.get("accept-language"));
    if (locale) {
      return l;
    }
    let _lang = "fr";
    if (l !== null) {
      _lang = l.split(/[-._]/)[0] || "fr";
    }
    return _lang;
  }

  /**
   * Ensure to always have a valid device
   * @returns
   */
  device() {
    let dev = this.get(Attr.device);

    switch (dev) {
      case Attr.mobile:
      case Attr.desktop:
        return dev;
      default:
        return Attr.desktop;
    }
  }

  /**
   *
   * @param {*} dev
   * @returns
   */
  alt_device(dev) {
    if (dev === Attr.mobile) {
      return Attr.desktop;
    }
    return Attr.mobile;
  }

  /**
   * 
   * @returns 
   */
  host() {
    return this.get(Attr.host);
  }

  /**
   *
   * @param {*} key
   * @returns
   */
  need(key) {
    const val = this.get(key);
    if (val == null) {
      this._errorMessage = `VARIABLE **${key}** IS MANDATORY`;
      this.warn(this._errorMessage, "\n---======--\n");
      this.trigger("precondition_failed");
      this._failed = true;
      throw this._errorMessage;
    }
    return val;
  }

  /**
   *
   * @param {*} key
   * @param {*} def
   * @returns
   */
  use(key, def = null) {
    const val = this.get(key);
    if (val != null) {
      return val;
    }
    return def;
  }

  /**
   *
   * @returns
   */
  getError() {
    return this._errorMessage;
  }

  /**
   *
   * @returns
   */
  ua() {
    return this.get("user-agent");
  }

  /**
   *
   */
  raw() {
    return this._chunks;
  }

  /**
   *
   */
  data() {
    return { ...this._body };
  }

  /**
   *
   */
  app_language(locale = false) {
    return this.supportedLanguage(this.language());
  }

  /**
   *
   */
  defaultLanguage() {
    return "fr";
  }


  /**
   *
   */
  ua_language() {
    const l =
      Language.get(this.get("accept-language")) || this.defaultLanguage();
    const _lang = l.split(/[-._]/)[0] || this.defaultLanguage();
    return _lang;
  }

  /**
   *
   */
  page_language() {
    let l = this.get("pagelang") || this.get("page-language");
    if (l != null) {
      return l;
    }

    l = Language.get(this.get("accept-language"));
    if (!l) return this.defaultLanguage();
    const _lang = l.split(/[-._]/)[0] || this.defaultLanguage();
    return _lang;
  }
  /**
   *
   */
  safe_string(name, max = 126) {
    let str = this.get(name) || "";
    if (str.length > max) {
      str = str.slice(0, max);
    }
    return str;
  }

  /**
   *
   * @returns
   */
  ip() {
    try {
      let [ip] = this.get("x-forwarded-for").split(/[, ]+/);
      return ip;
    } catch (e) {
      return this.get("x-real-ip");
    }
  }

  /**
   *
   */
  basepath(trailing) {
    if (trailing) return join(endpoint_name, trailing);
    return endpoint_name;
  }

  /**
   *
   */
  pathname() {
    return this.get(Attr.location).pathname;
  }

  /**
   *
   */
  servicepath(args) {
    let opt = { hostname: main_domain, ...args };
    let pathname = "";
    if (/^main$/.test(instance)) {
      pathname = "/-/svc/";
    } else {
      pathname = `/-/${instance}/avc/`;
    }

    let query = "";
    if (args.service) {
      query = `${args.service}&`;
      for (var k in args) {
        if (/^(host|hostname)$/.test(k)) continue;
        query = `${k}=${args[k]}&`;
      }
      query = query.replace(/\&$/, "");
    }
    return `https://${opt.hostname}${pathname}?${query}`;
  }

  /**
   * 
   */
  domain() {
    let { host } = this.get(Attr.location);
    let priv = new RegExp('.*\.{0,1}' + private_domain + '$');
    let pub = new RegExp('.*\.{0,1}' + public_domain + '$')
    if(priv.test(host)){
      return private_domain
    }
    if(pub.test(host)){
      return public_domain
    }
    return main_domain;
  }

  /**
   *
   */
  homepath(args) {
    let pathname = this.get(Attr.location).pathname.replace(
      /(svc|service).*$/,
      ""
    );
    let opt = { hostname: main_domain, ...args };
    let hostname = opt.hostname || opt.host || main_domain;
    if (isString(args)) hostname = args;
    return `https://${hostname}${pathname}`;
  }

}

module.exports = Input;

