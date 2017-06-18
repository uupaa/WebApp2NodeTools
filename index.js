
module.exports = {
  module: {
    copy: module_copy,
  }
};

function module_copy(list,           // @arg ModulesListArrayObject - [ { from: sourcePath, to: targetPath }, ... ]
                     options = {}) { // @arg Object = {} - { json, property, branch }
  // Copy sourcePath to targetPath.
  // If sourcePath is json, get information of es6.js to be copied from json[property] and use it as sourcePath.
  //
  //  const dir = "./app/assets/modules";
  //  const list = [
  //    { from: `https://github.com/uupaa/foo`,                                 to: `${dir}/foo.js` }, // remote install
  //    { from: `https://github.com/uupaa/foo#es6js`,                           to: `${dir}/foo.js` }, // remote
  //    { from: `https://github.com/uupaa/foo/blob/master/app/bundle.es6.js`,   to: `${dir}/foo.js` }, // remote
  //    { from: `https://github.com/uupaa/foo/blob/master/package.json#es6js`,  to: `${dir}/foo.js` }, // remote
  //    { from: `./node_modules/foo`,                                           to: `${dir}/foo.js` }, // local install
  //    { from: `./node_modules/foo#es6js`,                                     to: `${dir}/foo.js` }, // local
  //    { from: `./node_modules/foo/app/bundle.es6.js`,                         to: `${dir}/foo.js` }, // local
  //    { from: `./node_modules/foo/package.json#es6js`,                        to: `${dir}/foo.js` }, // local
  //  ];
  //
  // require("webapp2-node-tools").module.copy(list, options);

  options.json     = options.json     || "package.json";
  options.property = options.property || "es6js";
  options.branch   = options.branch   || "master";

  const urlParser = require("url");

  list.forEach(fromTo => {
    let { from, to } = fromTo;

    if (!from || from.length) {
      console.error(`Error: { from: ${from}, to: ${to} }, from is empty`);
      return;
    }
    if (!to || to.length) {
      console.error(`Error: { from: ${from}, to: ${to} }, to is empty`);
      return;
    }

    let { host, pathname, hash } = urlParser.parse(from);
    // https://github.com/uupaa/foo  /master/package.json #es6
    //         ~~~~~~~~~~ ~~~~~ ~~~  ~~~~~~~~~~~~~~~~~~~~ ~~~~
    //         host       owner repo path                 hash
    const property = hash ? hash.slice(1) : options.property; // "#es6".slice(1) -> "es6"

    if (host) {
      let { jsonURL, es6jsURL } = _resolveRemoteURL(host, pathname, hash, to, options);
      _copyToLocal(from, to, jsonURL, es6jsURL, property, true);
    } else {
      let { jsonURL, es6jsURL } = _resolveLocalPath("", pathname, hash, to, options);
      _copyToLocal(from, to, jsonURL, es6jsURL, property, false);
    }
  });
}

function _resolveRemoteURL(host, pathname, hash, to, options) {
  // https://raw.githubusercontent.com/uupaa/foo.js /master/package.json #es6
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ ~~~~~ ~~~~~~ ~~~~~~~~~~~~~~~~~~~~ ~~~~
  //          baseURL                  owner repo   path                 hash
  const path = pathname.slice(1).split("/");
  const owner = path[0];
  const repo = path[1];
  const lastPath = path[path.length - 1];
  let baseURL = "";
  let jsonURL = "";
  let es6jsURL = "";

  if (host === "github.com") {
    baseURL = "https://raw.githubusercontent.com"; // TODO: support GitHubE and other repos
  }

  if (/\.es6\.js$/.test(lastPath)) { // last path is bundled js (eg: "foo.es6.js")
    // https://github.com/${owner}/${repo}/blob/${branch}/app/bundle.es6.js
    //                    ~~~~~~~~ ~~~~~~~      ~~~~~~~~~ ~~~~~~~~~~~~~~~~~
    //                    [0]      [1]     [2]  [3]       [4+]
    es6jsURL = [baseURL, owner, repo, options.branch, path.slice(4).join("/")].join("/");
  } else if (/\.json$/.test(lastPath)) { // last path is json (maybe package.json)
    // https://github.com/${owner}/${repo}/blob/${branch}/*.json
    //                                                    ~~~~~~~~
    //                                                    lastPath
    jsonURL = [baseURL, owner, repo, options.branch, lastPath].join("/");
    es6jsURL = [baseURL, owner, repo, options.branch].join("/") + "/"; // + json[property]
  } else {
    // https://github.com/${owner}/${repo}
    jsonURL = [baseURL, owner, repo, options.branch, options.json].join("/");
    es6jsURL = [baseURL, owner, repo, options.branch].join("/") + "/"; // + json[property]
  }
  return { jsonURL, es6jsURL };
}

function _resolveLocalPath(host, pathname, hash, to, options) {
  // ./node_modules/Spec.js/package.json #es6
  // ~~~~~~~~~~~~~~ ~~~~~~~ ~~~~~~~~~~~~ ~~~~
  // dir            mod     path         hash
  const path = pathname.slice(0).split("/");
  const lastPath = path[path.length - 1];
  let jsonURL = "";
  let es6jsURL = "";

  if (/\.es6\.js$/.test(lastPath)) { // last path is bundled js (eg: "foo.es6.js")
    es6jsURL = pathname;
  } else if (/\.json$/.test(lastPath)) { // last path is json (maybe package.json)
    jsonURL = pathname;
  } else {
    jsonURL = pathname + "/" + options.json;
  }
  return { jsonURL, es6jsURL };
}

function _copyToLocal(from, to, jsonURL, es6jsURL, property, remote) {
  const fs = require("fs");

  if (jsonURL) {
    _fetch(jsonURL, "json", json => {
      if (!(property in json)) {
        _jsonKeywordNotFound();
      } else {
        _fetch(es6jsURL + json[property], "string", es6js => {
          fs.writeFile(to, es6js, "utf8", () => {});
          _success();
        }, _fetchError, 2000, remote);
      }
    }, _fetchError, 2000, remote);
  } else if (es6jsURL) {
    _fetch(es6jsURL, "string", es6js => {
      fs.writeFile(to, es6js, "utf8", () => {});
      _success();
    }, _fetchError, 2000, remote);
  }

  function _success() {
    console.log(`Copy ${from} to ${to}`);
  }
  function _jsonKeywordNotFound() {
    console.error(`json property ${property} is not found in ${jsonURL}`);
  }
  function _fetchError(error, url, code) {
    console.error(`Error ${from} to ${to}, code=${code}`);
  }
}

function _fetch(url,
                responseType,  // @arg ResponseTypeString = "string" - ignore case string. "string", "text", "json", "blob", "arraybuffer"
                readyCallback, // @arg Function - readyCallback(result:String|ArrayBuffer, url:URLString, code:HTTPStatusCodeUINT16):void
                errorCallback, // @arg Function - errorCallback(error:DetailError, url:URLString, code:UINT16):void
                timeout,       // @arg UINT32 - msec
                remote) {      // @arg Boolean
  if (remote) {
    _remoteFetch(url, responseType, readyCallback, errorCallback, timeout);
  } else {
    _localFetch(url, responseType, readyCallback, errorCallback, timeout);
  }
}

function _remoteFetch(url, responseType, readyCallback, errorCallback, timeout) {
  const request = require("request");

  request({
    url:      url,
    encoding: /string|json/.test(responseType) ? "utf8" : null, // null is binary
    timeout:  timeout
  }, (error, response, body) => {
    const code = response["statusCode"];
    if (code >= 200 && code < 300) {
      if (responseType === "json") {
        readyCallback(JSON.parse(body), url, code);
      } else {
        readyCallback(body, url, code);
      }
    } else {
      errorCallback(error, url, code);
    }
  });
}

function _localFetch(url, responseType, readyCallback, errorCallback) {
  const fs = require("fs");

  fs.readFile(url, "utf8", (error, response) => {
    if (error) {
      errorCallback(error, url, 400);
    } else {
      if (responseType === "json") {
        readyCallback(JSON.parse(response), url, 200)
      } else {
        readyCallback(response, url, 200)
      }
    }
  });
}

