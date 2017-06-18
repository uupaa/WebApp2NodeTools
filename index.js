
module.exports = {
  installModules: webapp2tools_installModules,
};

const installModulesOptions = {
  branch: "master",
  jsonKeyword: "es6",
  jsonFileName: "package.json",
};

function webapp2tools_installModules(es6ModulesList, // @arg ArrayArray - [ [ sourcePath, targetPath ], [ sourcePath, targetPath ], ... ]
                                     options = {}) { // @arg Object = {} - { type, branch, jsonKeyword, jsonFileName }
  // Copy sourcePath to targetPath.
  // If sourcePath is json, get information of es6.js to be copied from json[jsonKeyword] and use it as sourcePath.
  //
  //  const TARGET_DIR = "./app/assets/modules";
  //  const es6ModulesList = [
  //    // sourcePath                                                  targetPath
  //    [ `https://github.com/uupaa/foo`,                              `${TARGET_DIR}/foo.js` ], // remote
  //    [ `https://github.com/uupaa/foo#es6`,                          `${TARGET_DIR}/foo.js` ], // remote
  //    [ `https://github.com/uupaa/foo/blob/master/app/bundle.es6.js`,`${TARGET_DIR}/foo.js` ], // remote
  //    [ `https://github.com/uupaa/foo/blob/master/package.json#es6`, `${TARGET_DIR}/foo.js` ], // remote
  //    [ `./node_modules/foo`,                                        `${TARGET_DIR}/foo.js` ], // local
  //    [ `./node_modules/foo#es6`,                                    `${TARGET_DIR}/foo.js` ], // local
  //    [ `./node_modules/foo/app/bundle.es6.js`,                      `${TARGET_DIR}/foo.js` ], // local
  //    [ `./node_modules/foo/package.json#es6`,                       `${TARGET_DIR}/foo.js` ], // local
  //  ];
  //
  // let tool = require("webapp2-node-tools");
  // tool.installModules(MODULE_LIST, options);

  options.branch       = options.branch       || installModulesOptions.branch;
  options.jsonKeyword  = options.jsonKeyword  || installModulesOptions.jsonKeyword;
  options.jsonFileName = options.jsonFileName || installModulesOptions.jsonFileName;

  const urlParser = require("url");

  es6ModulesList.forEach(pathPair => {
    let [ sourcePath, targetPath ] = pathPair;

    if (!sourcePath.length) {
      console.error(`Error: [sourcePath = ${sourcePath}, targetPath = ${targetPath}], sourcePath is empty`);
      return;
    }
    if (!targetPath.length) {
      console.error(`Error: [sourcePath = ${sourcePath}, targetPath = ${targetPath}], targetPath is empty`);
      return;
    }

    let { host, pathname, hash } = urlParser.parse(sourcePath);
    // https://github.com/uupaa/foo  /master/package.json #es6
    //         ~~~~~~~~~~ ~~~~~ ~~~  ~~~~~~~~~~~~~~~~~~~~ ~~~~
    //         host       owner repo path                 hash
    const jsonKeyword = hash ? hash.slice(1) : options.jsonKeyword; // "#es6".slice(1) -> "es6"

    if (host) {
      let { configURL, es6jsURL } = _resolveRemoteURL(host, pathname, hash, targetPath, options);
      _copyToLocal(sourcePath, targetPath, configURL, es6jsURL, jsonKeyword, true);
    } else {
      let { configURL, es6jsURL } = _resolveLocalPath("", pathname, hash, targetPath, options);
      _copyToLocal(sourcePath, targetPath, configURL, es6jsURL, jsonKeyword, false);
    }
  });
}

function _resolveRemoteURL(host, pathname, hash, targetPath, options) {
  // https://raw.githubusercontent.com/uupaa/foo.js /master/package.json #es6
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ ~~~~~ ~~~~~~ ~~~~~~~~~~~~~~~~~~~~ ~~~~
  //          baseURL                  owner repo   path                 hash
  const path = pathname.slice(1).split("/");
  const owner = path[0];
  const repo = path[1];
  const lastPath = path[path.length - 1];
  let baseURL = "";
  let configURL = "";
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
    configURL = [baseURL, owner, repo, options.branch, lastPath].join("/");
    es6jsURL = [baseURL, owner, repo, options.branch].join("/");
  } else {
    // https://github.com/${owner}/${repo}
    configURL = [baseURL, owner, repo, options.branch, options.jsonFileName].join("/");
    es6jsURL = [baseURL, owner, repo, options.branch].join("/");
  }
  return { configURL, es6jsURL };
}

function _resolveLocalPath(host, pathname, hash, targetPath, options) {
  // ./node_modules/Spec.js/package.json #es6
  // ~~~~~~~~~~~~~~ ~~~~~~~ ~~~~~~~~~~~~ ~~~~
  // dir            mod     path         hash
  const path = pathname.slice(0).split("/");
  const lastPath = path[path.length - 1];
  let configURL = "";
  let es6jsURL = "";

  if (/\.es6\.js$/.test(lastPath)) { // last path is bundled js (eg: "foo.es6.js")
    es6jsURL = pathname;
  } else if (/\.json$/.test(lastPath)) { // last path is json (maybe package.json)
    configURL = pathname;
  } else {
    configURL = pathname + options.jsonFileName;
  }
  return { configURL, es6jsURL };
}

function _copyToLocal(sourcePath, targetPath, configURL, es6jsURL, jsonKeyword, remote) {
  const fs = require("fs");

  if (configURL) {
    _fetch(configURL, "json", json => {
      if (!(jsonKeyword in json)) {
        _jsonKeywordNotFound();
      } else {
        _fetch(es6jsURL + "/" + json[jsonKeyword], "string", es6js => {
          fs.writeFile(targetPath, es6js, "utf8", () => {});
          _success();
        }, _fetchError, 2000, remote);
      }
    }, _fetchError, 2000, remote);
  } else if (es6jsURL) {
    _fetch(es6jsURL, "string", es6js => {
      fs.writeFile(targetPath, es6js, "utf8", () => {});
      _success();
    }, _fetchError, 2000, remote);
  }

  function _success() {
    console.log(`Copy ${sourcePath} to ${targetPath}`);
  }
  function _jsonKeywordNotFound() {
    console.error(`json keyword ${jsonKeyword} is not found in ${configURL}`);
  }
  function _fetchError(error, url, code) {
    console.error(`Error ${sourcePath} to ${targetPath}, code=${code}`);
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

