const Backbone = require('backbone');
const Jsonfile = require('jsonfile');
const Path = require('path');
const Https = require('https');
const { Attr } = require("@drumee/server-essentials");

class __api_smsfactor extends Backbone.Model {

  initialize(o) {
    let dir = process.env.credential_dir || '/etc/drumee/credential';
    let file = Path.resolve(dir, 'smsfactor', 'sms.json')
    const credential = Jsonfile.readFileSync(file);
    this.options = {
      hostname: 'api.smsfactor.com',
      port: 443,
      path: '/send',
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${credential.token}`
      },
      rejectUnauthorized: false,
      ...o
    }
  }

  send() {
    let gsm = [];
    for (var value of this.get(Attr.receivers)) {
      gsm.push({ value });
    }
    let opt = {
      sms: {
        message: {
          text: this.get(Attr.message),
          sender: this.get(Attr.sender) || "Drumee",
        },
        recipients: { gsm }
      }
    };
    const data = JSON.stringify(opt);
    const a = new Promise((resolve, reject) => {
      let _chunks = [];
      const req = Https.request(this.options, (res) => {
        if (res.statusCode != 200) {
          reject(res);
          return;
        }
        res.on('data', (chunk) => {
          _chunks.push(chunk.toString());
        })
        res.on('end', () => {
          try {
            let response = JSON.parse(_chunks.join());
            if (response.status != 1) {
              reject(response.details);
              return;
            }
            resolve(response);
          } catch (e) {
            this.warn('FAILED TO READ RESPONSE', e);
            reject(e);
          }
        });
        req.on('error', (error) => {
          console.error("GOT ERROR", error);
          reject(error);
        })
      })
      req.write(data);
      req.end();

    });
    return a;
  }
}
module.exports = __api_smsfactor;