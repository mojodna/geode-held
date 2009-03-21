/*
 * Copyright 2008 Netflix, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Here's some JavaScript software that's useful for implementing OAuth.

// The HMAC-SHA1 signature method calls b64_hmac_sha1, defined by
// http://pajhome.org.uk/crypt/md5/sha1.js

/* An OAuth message is represented as an object like this:
   {method: "GET", action: "http://server.com/path", parameters: ...}

   The parameters may be either a map {name: value, name2: value2}
   or an Array of name-value pairs [[name, value], [name2, value2]].
   The latter representation is more powerful: it supports parameters
   in a specific sequence, or several parameters with the same name;
   for example [["a", 1], ["b", 2], ["a", 3]].

   Parameter names and values are NOT percent-encoded in an object.
   They must be encoded before transmission and decoded after reception.
   For example, this message object:
   {method: "GET", action: "http://server/path", parameters: {p: "x y"}}
   ... can be transmitted as an HTTP request that begins:
   GET /path?p=x%20y HTTP/1.0
   (This isn't a valid OAuth request, since it lacks a signature etc.)
   Note that the object "x y" is transmitted as x%20y.  To encode
   parameters, you can call OAuth.addToURL or OAuth.formEncode.

   This message object model harmonizes with the browser object model for
   input elements of an form, whose value property isn't percent encoded.
   The browser encodes each value before transmitting it. For example,
   see consumer.setInputs in example/consumer.js.
 */
var OAuth; 
if (OAuth === undefined) {
	OAuth = {};
}

var Sha1;
if (Sha1 === undefined) {
	Sha1 = {};
}

OAuth.setProperties = function setProperties(into, from) {
	if (into !== undefined && from !== undefined) {
		for (var key in from) {
			if (from.hasOwnProperty(key)) {
				into[key] = from[key];
			}
		}
	}
	return into;
};

OAuth.setProperties(OAuth, { // utility functions
	percentEncode: function percentEncode(s) {
		if (s === undefined) {
			return "";
		}
		if (s instanceof Array) {
			var e = "";
			var l = s.length;
			for (var i = 0; i < l; i += 1) {
				if (e !== "") { 
					e += '&';
				}
				e += percentEncode(s[i]);
			}
			return e;
		}
		s = encodeURIComponent(s);
		// Now replace the values which encodeURIComponent doesn't do
		// encodeURIComponent ignores: - _ . ! ~ * ' ( )
		// OAuth dictates the only ones you can ignore are: - _ . ~
		// Source: http://developer.mozilla.org/en/docs/Core_JavaScript_1.5_Reference:Global_Functions:encodeURIComponent
		s = s.replace("!", "%21", "g");
		s = s.replace("*", "%2A", "g");
		s = s.replace("'", "%27", "g");
		s = s.replace("(", "%28", "g");
		s = s.replace(")", "%29", "g");
		return s;
	},

	decodePercent: decodeURIComponent,

	getParameterList: function getParameterList(parameters) {
		if (parameters === undefined) {
			return [];
		}
		if (typeof parameters !== "object") {
			return OAuth.decodeForm(parameters + "");
		}
		if (parameters instanceof Array) {
			return parameters;
		}
		var list = [];
		for (var p in parameters) {
			if (parameters.hasOwnProperty(p)) {
				list.push([p, parameters[p]]);
			}
		}
		return list;
	},
	
	getParameterMap: function getParameterMap(parameters) {
		if (parameters === undefined) {
			return {};
		}
		if (typeof parameters !== "object") {
			return getParameterMap(OAuth.decodeForm(parameters + ""));
		}
		if (parameters instanceof Array) {
			var map = {};
			var l = parameters.length;
			for (var p = 0; p < l; p += 1) {
				var key = parameters[p][0];
				if (map[key] === undefined) { // first value wins
					map[key] = parameters[p][1];
				}
			}
			return map;
		}
		return parameters;
	},
	
	formEncode: function formEncode(parameters) {
		var form = "";
		var list = OAuth.getParameterList(parameters);
		for (var p = 0; p < list.length; p += 1) {
			var value = list[p][1];
			if (value === undefined) {
				value = "";
			}
			if (form !== "") {
				form += '&';
			}
			form += OAuth.percentEncode(list[p][0]) + '=' + OAuth.percentEncode(value);
		}
		return form;
	},
	
	decodeForm: function decodeForm(form) {
		var list = [];
		var nvps = form.split('&');
		for (var n = 0; n < nvps.length; n += 1) {
			var nvp = nvps[n];
			var equals = nvp.indexOf('=');
			var name;
			var value;
			if (equals < 0) {
				name = OAuth.decodePercent(nvp);
				value = null;
			} else {
				name = OAuth.decodePercent(nvp.substring(0, equals));
				value = OAuth.decodePercent(nvp.substring(equals + 1));
			}
			list.push([name, value]);
		}
		return list;
	},
	
	setParameter: function setParameter(message, name, value) {
		var parameters = message.parameters;
		if (parameters instanceof Array) {
			for (var p = 0; p < parameters.length; p += 1) {
				if (parameters[p][0] === name) {
					if (value === undefined) {
						parameters.splice(p, 1);
					} else {
						parameters[p][1] = value;
						value = undefined;
					}
				}
			}
			if (value !== undefined) {
				parameters.push([name, value]);
			}
		} else {
			parameters = OAuth.getParameterMap(parameters);
			parameters[name] = value;
			message.parameters = parameters;
		}
	},
	
	setParameters: function setParameters(message, parameters) {
		var list = OAuth.getParameterList(parameters);
		for (var i = 0; i < list.length; i += 1) {
			OAuth.setParameter(message, list[i][0], list[i][1]);
		}
	},
	
	setTimestampAndNonce: function setTimestampAndNonce(message) {
		OAuth.setParameter(message, "oauth_timestamp", OAuth.timestamp());
		OAuth.setParameter(message, "oauth_nonce", OAuth.nonce(6));
	},
	
	addToURL : function addToURL(url, parameters) {
		var newURL = url;
		if (parameters !== undefined) {
			var toAdd = OAuth.formEncode(parameters);
			if (toAdd.length > 0) {
				var q = url.indexOf('?');
				if (q < 0) {
					newURL += '?';
				} else {
					newURL += '&';
				}
				newURL += toAdd;
			}
		}
		return newURL;
	},
	
	timestamp : function timestamp() {
		var d = new Date();
		return Math.floor(d.getTime() / 1000);
	},
	
	nonce : function nonce(length) {
		var chars = OAuth.nonce.CHARS;
		var result = "";
		for (var i = 0; i < length; i += 1) {
			var rnum = Math.floor(Math.random() * chars.length);
			result += chars.substring(rnum, rnum + 1);
		}
		return result;
	}
});

OAuth.nonce.CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";

/** Define a constructor function,
    without causing trouble to anyone who was using it as a namespace.
    That is, if parent[name] already existed and had properties,
    copy those properties into the new constructor.
 */
OAuth.declareClass = function declareClass(parent, name, newConstructor) {
	var previous = parent[name];
	parent[name] = newConstructor;
	if (newConstructor !== undefined && previous !== undefined) {
		for (var key in previous) {
			if (key !== "prototype") {
				newConstructor[key] = previous[key];
			}
		}
	}
	return newConstructor;
};

/** An abstract algorithm for signing messages. */
OAuth.declareClass(OAuth, "SignatureMethod", function OAuthSignatureMethod() {});

OAuth.setProperties(OAuth.SignatureMethod.prototype, { // instance members
	/** Add a signature to the message. */
	sign: function sign(message) {
		var baseString = OAuth.SignatureMethod.getBaseString(message);
		var signature = this.getSignature(baseString);
		OAuth.setParameter(message, "oauth_signature", signature);
		return signature; // just in case someone's interested
	},
	
	/** Set the key string for signing. */
	initialize: function initialize(name, accessor) {
		var consumerSecret;
		if (accessor.accessorSecret !== undefined && name.length > 9 && name.substring(name.length - 9) === "-Accessor") {
			consumerSecret = accessor.accessorSecret;
		} else {
			consumerSecret = accessor.consumerSecret;
		}
		this.key = OAuth.percentEncode(consumerSecret) + "&" + OAuth.percentEncode(accessor.tokenSecret);
	}
});

/* SignatureMethod expects an accessor object to be like this:
   {tokenSecret: "lakjsdflkj...", consumerSecret: "QOUEWRI..", accessorSecret: "xcmvzc..."}
   The accessorSecret property is optional.
 */
// Class members:
OAuth.setProperties(OAuth.SignatureMethod, { // class members
	sign: function sign(message, accessor) {
		var name = OAuth.getParameterMap(message.parameters).oauth_signature_method;
		if (name === undefined || name === "") {
			name = "HMAC-SHA1";
			OAuth.setParameter(message, "oauth_signature_method", name);
		}
		OAuth.SignatureMethod.newMethod(name, accessor).sign(message);
	},
	
	/** Instantiate a SignatureMethod for the given method name. */
	newMethod: function newMethod(name, accessor) {
		var Impl = OAuth.SignatureMethod.REGISTERED[name];
		if (Impl !== undefined) {
			var method = new Impl();
			method.initialize(name, accessor);
			return method;
		}
		var err = new Error("signature_method_rejected");
		var acceptable = "";
		for (var r in OAuth.SignatureMethod.REGISTERED) {
			if (OAuth.SignatureMethod.REGISTERED.hasOwnProperty(r)) {
				if (acceptable !== "") {
					acceptable += '&';
				}
				acceptable += OAuth.percentEncode(r);
			}
		}
		err.oauth_acceptable_signature_methods = acceptable;
		throw err;
	},
	
	/** A map from signature method name to constructor. */
	REGISTERED : {},
	
	/** Subsequently, the given constructor will be used for the named methods.
      The constructor will be called with no parameters.
      The resulting object should usually implement getSignature(baseString).
      You can easily define such a constructor by calling makeSubclass, below.
	*/
	registerMethodClass: function registerMethodClass(names, classConstructor) {
		for (var n = 0; n < names.length; n += 1) {
			OAuth.SignatureMethod.REGISTERED[names[n]] = classConstructor;
		}
	},
	
	/** Create a subclass of OAuth.SignatureMethod, with the given getSignature function. */
	makeSubclass: function makeSubclass(getSignatureFunction) {
		var superClass = OAuth.SignatureMethod;
		var subClass = function () {
			superClass.call(this);
		}; 
		subClass.prototype = new superClass();
		// Delete instance variables from prototype:
		// delete subclass.prototype... There aren't any.
		subClass.prototype.getSignature = getSignatureFunction;
		subClass.prototype.constructor = subClass;
		return subClass;
	},
	
	getBaseString: function getBaseString(message) {
		var URL = message.action;
		var q = URL.indexOf('?');
		var parameters;
		if (q < 0) {
			parameters = message.parameters;
		} else {
			// Combine the URL query string with the other parameters:
			parameters = OAuth.decodeForm(URL.substring(q + 1));
			var toAdd = OAuth.getParameterList(message.parameters);
			for (var a = 0; a < toAdd.length; a += 1) {
				parameters.push(toAdd[a]);
			}
		}
		return OAuth.percentEncode(message.method.toUpperCase()) + '&' + OAuth.percentEncode(OAuth.SignatureMethod.normalizeUrl(URL)) + '&' + OAuth.percentEncode(OAuth.SignatureMethod.normalizeParameters(parameters));
	},
	
	normalizeUrl: function normalizeUrl(url) {
		var uri = OAuth.SignatureMethod.parseUri(url);
		var scheme = uri.protocol.toLowerCase();
		var authority = uri.authority.toLowerCase();
		var dropPort = (scheme === "http" && uri.port === 80) || (scheme === "https" && uri.port === 443);
		if (dropPort) {
			// find the last : in the authority
			var index = authority.lastIndexOf(":");
			if (index >= 0) {
				authority = authority.substring(0, index);
			}
		}
		var path = uri.path;
		if (!path) {
			path = "/"; // conforms to RFC 2616 section 3.2.2
		}
		// we know that there is no query and no fragment here.
		return scheme + "://" + authority + path;
	},
	
	parseUri: function parseUri(str) {
		/* This function was adapted from parseUri 1.2.1
			 http://stevenlevithan.com/demo/parseuri/js/assets/parseuri.js
		*/
		var o = {key : ["source", "protocol", "authority", "userInfo", "user", "password", "host", "port", "relative", "path", "directory", "file", "query", "anchor"], 
						parser : {strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*):?([^:@]*))?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(\.*))?)/ }};
		var m = o.parser.strict.exec(str);
		var uri = {};
		for (var i = 0; i < m.length; i += 1) {
			uri[o.key[i]] = m[i] || "";
		}
		return uri;
	},
	
	normalizeParameters: function normalizeParameters(parameters) {
		if (parameters === undefined) {
			return "";
		}
		var norm = [];
		var list = OAuth.getParameterList(parameters);
		for (var p = 0; p < list.length; p += 1) {
			var nvp = list[p];
			if (nvp[0] !== "oauth_signature") {
				norm.push(nvp);
			}
		}
		norm.sort(function (a, b) {
			if (a[0] < b[0]) { 
				return -1;
			}
			if (a[0] > b[0]) {
				return 1;
			}
			if (a[1] < b[1]) {
				return  -1;
			}
			if (a[1] > b[1]) { 
				return 1;
			}
			return 0;
		});
		return OAuth.formEncode(norm);
	}
});

OAuth.SignatureMethod.registerMethodClass(["PLAINTEXT", "PLAINTEXT-Accessor"], OAuth.SignatureMethod.makeSubclass(
	function getSignature(baseString) {
		return this.key;
	}
));

OAuth.SignatureMethod.registerMethodClass(["HMAC-SHA1", "HMAC-SHA1-Accessor"], OAuth.SignatureMethod.makeSubclass(
	function getSignature(baseString) {
		Sha1.b64pad = '=';
		var signature = Sha1.b64_hmac_sha1(this.key, baseString);
		return signature;
	}
));