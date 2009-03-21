const nsISupports = Components.interfaces.nsISupports;
const nsIGeolocationProvider = Components.interfaces.nsIGeolocationProvider;

// You can change these if you like
const CLASS_ID = Components.ID("19156790-1378-11de-8c30-0800200c9a66");
const CLASS_NAME = "Listens for measurements and acquires location using the Gears protocol";
const CONTRACT_ID = "@geopriv.dreamhosters.com/gearslocationprovider;1";

// This is your constructor.
// You can do stuff here.
function GearsLocationProvider() {
	// you can cheat and use this
	// while testing without
	// writing your own interface
	this.wrappedJSObject = this;

	// Set up a re-usable Gears request object
	// Second argument is null to force synchronous calls
	this._gearsReq = this._makeNewGearsRequest();
}

// This is the implementation of your component.
GearsLocationProvider.prototype = {
	// for nsISupports
	QueryInterface: function(aIID)
	{
		// XXX: Being lazy here, since we're only using this in JavaScript
		// add any other interfaces you support here
		if (!aIID.equals(nsISupports) && !aIID.equals(nsIGeolocationProvider))
			throw Components.results.NS_ERROR_NO_INTERFACE;
		return this;
	},

	//-----nsIGeolocationProvider-----
	// startup() : Start the HTTP server with current parameters
	startup : function() {
		// Noop if the server is already running 
		if (this._started()) return;

		// Cache a reference to this for use in closures
		var parent = this;

		// Create an HTTP server instance
		this._httpServer = Components.classes["@mozilla.org/server/jshttp;1"]
					.createInstance(Components.interfaces.nsIHttpServer);

		// Configure root handler for _handleMeasurementRequest()
		this._httpServer.registerPathHandler("/",
			function(request,response) {
				parent._handleMeasurementRequest(request,response,parent);	
			}
		);

		// Start up HTTP server
		this._httpServer.start(this._httpPort);
	},

	// isReady() : Whether the service is started and has location
	isReady : function() {
		return (this._started() && (this._lastLocation != null));
	},

	// watch(callback) : Add a nsIGeolocationUpdate to the watch list
	// -- Assumes that callback implements nsIGeolocationUpdate, namely has this.update()
	// -- Returns an ID that can be used to cancel the wach (see below)
	watch : function(callback) {
		var ID = this._watcherSerial++;	
		this._watchers[ID] = callback;
	},

	// shutdown() : Stop the HTTP server
	shutdown : function() {
		this._httpServer.stop();
	},

	//-----Other public methods-----

	// cancelWatch(ID) : Removes the watch at the specified ID, if it exists
	clearWatch: function(ID) {
		// Fail quietly if the ID doesn't exist
		if (!(ID in this._watchers)) return;
		// Remove the specified watcher from the list
		delete this._watchers[ID];
	},

	//-----Protocol parameter accessors----

	// HTTP Server Port
	get httpPort() { return this._httpPort; },
	set httpPort(port) { 
		this._httpPort = port;
		// If the port changes while we're running, 
		//   then we need to restart the server
		if (this._started()) {
			this._httpServer.stop();
			this._httpServer.start(this._httpPort);
		}
	},

	//-----END PUBLIC API-----

	// Location cache
	_lastLocation : null,	// Last location returned

	// Protocol support parameters
	_httpPort: 8080,	// Port that the HTTP server will run on
	_httpServer: null,	// HTTP server we'll create
	_gearsReq: null,		// Gears request to be used to get measurements
 
	// Watcher management variables
	_watchers: {},		// Function to be called when we get location
	_watcherSerial: 0,	// Where to put the next watcher

	// Boolean that indicates whether we've been started
	_started: function() {
		return (this._httpServer != null);
	},

	// Make a new GearsRequest using the currently-configured parameters
	_makeNewGearsRequest : function() {
		var SLP = this;
		return new GearsLocationRequest(
			function(code, text) {
				SLP._log("Error: code=["+code+"] text=["+text+"]");
			}
		);
	},

	// Request handler for the internal HTTP server
	_handleMeasurementRequest: function(request, response, parent) {
		// Shunt off non-POST requests
		if (request.method != "POST") {
			response.setStatusLine( request.httpVersion, 405, "Bad Method: POST Required");
			return;
		}

		// Grab measurements
		var requestBody = "";
		var sis = Components.classes["@mozilla.org/scriptableinputstream;1"]
				.createInstance(Components.interfaces.nsIScriptableInputStream);
		if (request.bodyInputStream) {
			sis.init(request.bodyInputStream);
			var avail;
			while ((avail = sis.available()) > 0)
				requestBody += sis.read(avail);
		}
 
		// Convert body to measurement object (just a JSON eval() call with a null check)
		var meas = (requestBody)? eval("("+requestBody+")") : null;
		if (!meas) { 
			response.setStatusLine( request.httpVersion, 400, "Bad request: need Gears Protocol" );
			// Do not update watchers or cache
			return;
		}

		// Do a synchronous Gears request
		parent._gearsReq.meas = requestBody;
		var loc = parent._gearsReq.send();
		if (!loc) {
			response.setStatusLine( request.httpVersion, 404, "Unable to determine location" );
			// Do not update watchers or cache
			return;
		}

		// Pass the location up to watchers
 		this._notifyWatchers(loc);
		// Cache the location (why? don't really know)
		this._lastLocation = loc;		

		// Pull out centroid and uncertainty and pass them back to gears
		var clat = loc.geodetic.shape.getCentroid().latitude;
		var clon = loc.geodetic.shape.getCentroid().longitude;
		var ucert = loc.geodetic.shape.getUncertainty();
		var responseBody = '{ "location": { "latitude": '+ clat
					+', "longitude": '+ clon
					+', "accuracy": '+ ucert +' } }';
		response.setStatusLine(request.httpVersion, 200, "OK");
		response.setHeader("Content-type", "application/json", false);
		response.write(responseBody);
	},

	// Notify watchers by calling nsIGeolocationUpdate.update()
	// XXX: Not bothering to convert our native format to nsIGeoPosition, 
	//	  since that format is so crippled
	_notifyWatchers : function(loc) {
		for each (watch in this._watchers) {
			watch.update(loc);
		}
	},

	// Logging shortcut
	_log : function(msg) { Components.utils.reportError("GLP: "+msg); },
}

//=================================================
// Note: You probably don't want to edit anything
// below this unless you know what you're doing.
//
// Factory
var GearsLocationProviderFactory = {
	createInstance: function (aOuter, aIID)
	{
		if (aOuter != null)
			throw Components.results.NS_ERROR_NO_AGGREGATION;
		return (new GearsLocationProvider()).QueryInterface(aIID);
	}
};

// Module
var GearsLocationProviderModule = {
	registerSelf: function(aCompMgr, aFileSpec, aLocation, aType)
	{
		aCompMgr = aCompMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
		aCompMgr.registerFactoryLocation(CLASS_ID, CLASS_NAME, CONTRACT_ID, aFileSpec, aLocation, aType);
	},

	unregisterSelf: function(aCompMgr, aLocation, aType)
	{
		aCompMgr = aCompMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
		aCompMgr.unregisterFactoryLocation(CLASS_ID, aLocation);				
	},
	
	getClassObject: function(aCompMgr, aCID, aIID)
	{
		if (!aIID.equals(Components.interfaces.nsIFactory))
			throw Components.results.NS_ERROR_NOT_IMPLEMENTED;

		if (aCID.equals(CLASS_ID))
			return GearsLocationProviderFactory;

		throw Components.results.NS_ERROR_NO_INTERFACE;
	},

	canUnload: function(aCompMgr) { return true; }
};

//module initialization
function NSGetModule(aCompMgr, aFileSpec) { return GearsLocationProviderModule; }

//----------<gears.js>-----------
// #include "basic.js"

/*

GearsLocationRequest

This class is conceptually similar to HELDRequest, but differs in a few important ways
1. It only supports synchronous queries, because...
2. ... It uses an XPCOM channel to do the dirty work 
3. There's no success callback because it's always synchronous
4. A URI doesn't need to be specified, because it's always the same
5. The geodetic location returned is always a Circle 

The API is still essentially the same:
req = new GearsLocationRequest(errorCallback)
loc = req.send();
loc.geodetic.getCentroid() // etc.

NB: send() returns null if an error occurs (but it does call errorCallback first)

 */


function GearsLocationRequest(_errorCallback)
{
	this.errorCallback = _errorCallback;
}

GearsLocationRequest.prototype =
{
	url: "http://www.google.com/loc/json",
	username: "rbarnes",
	realm: "geopriv",
	meas: null,	// Gears API request object format

	constructQuery: function()
	{
		// XXX: Assumes that the JSON text is passed, not the object
		var query = this.meas;
		return query;
	},

	// Function ready() is not necessary, since we're synchronous
	// send() just calls process() directly
	// ready: function()

	process: function(locResp)
	{
			try
			{
				var loc = Location.prototype.fromGears(locResp);
				if (this.callback)
				{
					this.callback(loc);
				}
				return loc;
			}
			catch (error)
			{
				this.errorCallback('clientError', error);
			}
	},

	send: function()
	{
		// Construct the query
		var query = this.constructQuery();
		
		// Turn the data into a stream that nsIUploadChannel can use
		var postStream = Components.classes["@mozilla.org/io/string-input-stream;1"]
					  .createInstance(Components.interfaces.nsIStringInputStream);
		postStream.setData(query, query.length);
	
		// Make an HTTP request to get the location  
		// Get an nsIHttpChannel and set HTTP characteristics
		var ioserv = Components.classes["@mozilla.org/network/io-service;1"] 
			.getService(Components.interfaces.nsIIOService); 
		var channel = ioserv.newChannel(this.url, 0, null);
		httpChannel = channel.QueryInterface(Components.interfaces.nsIHttpChannel);
		// Cast over to an uploadChannel and add the data
		var uploadChannel = httpChannel.QueryInterface(Components.interfaces.nsIUploadChannel);
		uploadChannel.setUploadStream(postStream, "application/json", -1);
		// Reset the request method of the request to POST
		httpChannel.requestMethod = "POST";

		// Open the stream, send the request, and read the response
		var responseBody = "";
		var responseStream = httpChannel.open();
		var factory = Components.classes["@mozilla.org/scriptableinputstream;1"]
			var sis = factory.createInstance(Components.interfaces.nsIScriptableInputStream);
		if (responseStream) {
			sis.init(responseStream);
			var avail;
			while ((avail = sis.available()) > 0) {
				responseBody += sis.read(avail);
			}
		} else {
			// If we didn't get a response, return an error
			this.errorCallback("httpError", "No response from server");
			return;
		}

	
		// Fail if we don't get a 200 (XML won't parse anyway) or if the body is empty
		if (httpChannel.responseStatus != 200) {
			this.errorCallback(httpChannel.responseStatus, httpChannel.responseStatusText);
			return;
		} else if (!responseBody || responseBody == "") {
			this.errorCallback("httpError", "No response from server");
			return;
		}
	
		// Turn the JSON in the request into an object
		var locResp = (responseBody)? eval("("+responseBody+")") : null;

		// Process into an object and return
		return this.process(locResp);
	}
}

//----------</gears.js>----------


//----------<basic.js>-----------
if (! Array.prototype.map)
{
	Array.prototype.map = function(fun /*, thisp*/)
	{
		var len = this.length;
		if (typeof fun != "function")
		{
			throw new TypeError();
		}

		var res = new Array(len);
		var thisp = arguments[1];
		for (var i = 0; i < len; i++)
		{
			if (i in this)
			{
				res[i] = fun.call(thisp, this[i], i, this);
			}
		}

		return res;
	};
}
if (! String.prototype.trim)
{
	String.prototype.trim = function()
	{
		return this.replace(/^\s+|\s+$/g, '');
	};
}
if (! String.prototype.normalize)
{
	String.prototype.normalize = function()
	{
		return this.trim().replace(/\s+/, ' ');
	};
}

if (! Date.prototype.setISO8601)
{
	Date.prototype.setISO8601 = function (string) {
		var regexp = "([0-9]{4})(-([0-9]{2})(-([0-9]{2})" +
					 "(T([0-9]{2}):([0-9]{2})(:([0-9]{2})(\.([0-9]+))?)?" +
					 "(Z|(([-+])([0-9]{2}):([0-9]{2})))?)?)?)?";
		var d = string.match(new RegExp(regexp));

		var offset = 0;
		var date = new Date(d[1], 0, 1);

		if (d[3]) { date.setMonth(parseInt(d[3]) - 1); }
		if (d[5]) { date.setDate(parseInt(d[5])); }
		if (d[7]) { date.setHours(parseInt(d[7])); }
		if (d[8]) { date.setMinutes(parseInt(d[8])); }
		if (d[10]) { date.setSeconds(parseInt(d[10])); }
		if (d[12]) { date.setMilliseconds(parseFloat("0." + d[12]) * 1000); }
		if (d[14]) {
			offset = (parseFloat(d[16]) * 60) + parseFloat(d[17]);
			offset *= ((d[15] == '-') ? 1 : -1);
		}

		offset -= date.getTimezoneOffset();
		time = (date.getTime() + (offset * 60 * 1000));
		this.setTime(parseFloat(time));
	}
}


function parseXML(text)
{
	try
	{
		var parser = new DOMParser();
		return parser.parseFromString(text, "text/xml");
	} catch (e) {}
	try
	{
		var xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
		xmlDoc.async = "false";
		xmlDoc.loadXML(text);
		return xmlDoc
	} catch (e) {}
	return null;
}


function findElements(xml, ns, localName, qualifier)
{
	if (xml.getElementsByTagNameNS)
	{
		return xml.getElementsByTagNameNS(ns, localName);
	}
	var prefix = (qualifier ? (qualifier + ':') : '');
	return xml.getElementsByTagName(prefix + localName);
}
function findFirstElement(xml, ns, localName, qualifier)
{
	var el = findElements(xml, ns, localName, qualifier);
	if (el.length > 0)
	{
		return el[0];
	}
	return null;
}
function setElementText(el, txt)
{
	if (el.textContent !== undefined)
	{
		el.textContent = txt;
	}
	else
	{
		el.innerText = txt;
	}
}

// from https://blueprints.dev.java.net/ajax-faq.html
// with a few additions
// callback is called with the XML from the result on success
// errorCallback is called with the entire request object on failure
// the callback and errorCallback are optional
function AJAXInteraction(url, callback, errorCallback, raw)
{
	var req = getXMLHttpRequest();
	req.onreadystatechange = processRequest;

	function processRequest()
	{
		if (req.readyState == 4)
		{
			if (req.status == 200)
			{
				if (callback)
				{
					callback(raw ? req : req.responseXML);
				}
			}
			else
			{
				if (errorCallback)
				{
					errorCallback(req);
				}
			}
		}
	}

	this.send = function(body, type)
	{
		req.open((body ? "POST" : (callback ? "GET" : "HEAD")), url, true);
		if (type)
		{
			req.setRequestHeader("Content-Type", type);
		}
		else
		{
			req.setRequestHeader("Content-Type",
								 "application/x-www-form-urlencoded");
		}
		req.send(body);
	}
}
//----------</basic.js>----------


//----------<geoecef.js>-----------
// Constants for WGS84
WGS84_a = 6378137.0;
WGS84_f = 1.0 / 298.257223563;
WGS84_one_f = 1.0 - WGS84_f;
WGS84_b = WGS84_a * WGS84_one_f; // semi-minor axis
WGS84_e2 = WGS84_f * (2.0 - WGS84_f); // first eccentricity squared
WGS84_epsilon = WGS84_e2 / (1.0 - WGS84_e2); // second eccentricity squared

function GeoPoint(lat, lng, alt)
{
	this.latitude = lat;
	this.longitude = lng;
	this.altitude = alt;
	return this;
}

GeoPoint.prototype = {
	load: function(txt)
	{
		var xy = txt.split(' ');
		this.latitude = parseFloat(xy[0]);
		this.longitude = parseFloat(xy[1]);
		if (xy.length > 2)
		{
			this.altitude = parseFloat(xy[2]);
		}
	},

	distanceTo: function(other)
	{
		return this.toEcefPoint().distanceTo(other.toEcefPoint());
	},

	toEcefPoint: function()
	{
		var lat = this.latitude * Math.PI / 180;
		var sinlat = Math.sin(lat);
		var coslat = Math.cos(lat);
		var lng = this.longitude * Math.PI / 180;
		var sinlng = Math.sin(lng);
		var coslng = Math.cos(lng);

		var N = WGS84_a / Math.sqrt(1 - (WGS84_e2 * sinlat * sinlat));
		var alt = this.altitude ? this.altitude : 0;
		var x = (N + alt) * coslat * coslng;
		var y = (N + alt) * coslat * sinlng;
		var z = ((1 - WGS84_e2) * N + alt) * sinlat;
		return new EcefPoint(x, y, z);
	},

	toString: function()
	{
		var description = Math.abs(this.latitude);
		if (this.latitude < 0)
		{
			description += " South, ";
		}
		else
		{
			description += " North, ";
		}

		description += Math.abs(this.longitude);
		if (this.longitude < 0)
		{
			description += " West";
		}
		else
		{
			description += " East";
		}

		if (this.altitude)
		{
			description += ', ' + this.altitude + ' metres altitude';
		}
		return description;
	}
}

function EcefPoint(_x, _y, _z)
{
	if (_x instanceof Array)
	{
		this.x = _x[0];
		this.y = _x[1];
		this.z = _x[2];
	}
	else
	{
		this.x = _x;
		this.y = _y;
		this.z = _z;
	}
}

EcefPoint.prototype = {
	distanceTo: function(other)
	{
		return Math.sqrt(Math.pow(this.x - other.x, 2)
						 + Math.pow(this.y - other.y, 2)
						 + Math.pow(this.z - other.z, 2));
	},

	toGeoPoint: function()
	{
		if (this.x == 0 && this.y == 0 && this.z == 0)
		{
			return new GeoPoint(0, 0, 0);
		}
		if (this.x == 0 & this.y == 0 && this.z != 0)
		{
			return new GeoPoint((this.z > 0 ? 1 : -1) * Math.PI / 2,
								0, Math.abs(this.z) - WGS84_b);
		}
		var p2 = this.x * this.x + this.y * this.y;
		var p = Math.sqrt(p2);
		if (this.z == 0)
		{
			return new GeoPoint(0, Math.atan2(y, x), p - WGS84_a);
		}
		var r = Math.sqrt(p2 + this.z * this.z);

		var tanu = WGS84_one_f * (this.z / p)
				   * (1 + (WGS84_epsilon * WGS84_b / r));
		// some fancy trig to work out cos3u and sin3u
		var cos2u = 1 / (1 + tanu * tanu);
		var cosu = Math.sqrt(cos2u);
		var cos3u = cosu * cos2u;
		var sin3u = (1 - cos2u) * tanu * cosu;

		var tanlat = (this.z + WGS84_epsilon * WGS84_b * sin3u)
					 / (p - (WGS84_e2 * WGS84_a * cos3u));

		var lat = Math.atan(tanlat);
		var lng = Math.atan2(this.y, this.x);

		// some more fancy trig to get sinlat and coslat
		var cos2lat = 1 / (1 + tanlat * tanlat);
		var sin2lat = 1 - cos2lat;
		var coslat = Math.sqrt(cos2lat);
		var sinlat = tanlat * coslat;

		var alt = p * coslat + this.z * sinlat
				  - WGS84_a * Math.sqrt(1 - (WGS84_e2 * sin2lat));

		return new GeoPoint(lat * 180 / Math.PI, lng * 180 / Math.PI, alt);
	},

	toArray: function()
	{
		return [this.x, this.y, this.z];
	},

	toString: function()
	{
		return '[' + this.x + ', ' + this.y + ', ' + this.z + ']';
	}
}
//----------</geoecef.js>----------


//----------<location.js>-----------
// #include basic.js
// #include shapes.js

// A Geodetic object contains one of the many shapes from the PIDF-LO
// profile draft.  this.shape contains the shape.
// If you prefer it simple, try getCentroid() to get a point (which might
// have altitude).  getUncertainty() gives the uncertainty from the
// centroid.
function Geodetic(locinfo)
{
	var point = findFirstElement(locinfo, NS_GML, 'Point', 'gml');
	if (point)
	{
		this.shape = new PidfPoint();
		this.shape.load(point);
	}
	var prism = findFirstElement(locinfo, NS_GEOSHAPE, 'Prism', 'gs');
	if (prism)
	{
		this.shape = new PidfPrism();
		this.shape.load(prism);
	}
	else // Polygon is a sub-element of prism, so care needs to be taken
	{
		var polygon = findFirstElement(locinfo, NS_GML, 'Polygon', 'gml');
		if (polygon)
		{
			this.shape = new PidfPolygon();
			this.shape.load(polygon);
		}
	}
	var circle = findFirstElement(locinfo, NS_GEOSHAPE, 'Circle', 'gs');
	if (circle)
	{
		this.shape = new PidfCircle();
		this.shape.load(circle);
	}
	var sphere = findFirstElement(locinfo, NS_GEOSHAPE, 'Sphere', 'gs');
	if (sphere)
	{
		this.shape = new PidfSphere();
		this.shape.load(sphere);
	}
	var ellipse = findFirstElement(locinfo, NS_GEOSHAPE, 'Ellipse', 'gs');
	if (ellipse)
	{
		this.shape = new PidfEllipse();
		this.shape.load(ellipse);
	}
	var ellipsoid = findFirstElement(locinfo, NS_GEOSHAPE, 'Ellipsoid', 'gs');
	if (ellipsoid)
	{
		this.shape = new PidfEllipsoid();
		this.shape.load(ellipsoid);
	}
	var arcband = findFirstElement(locinfo, NS_GEOSHAPE, 'ArcBand', 'gs');
	if (arcband)
	{
		this.shape = new PidfArcBand();
		this.shape.load(arcband);
	}
	if (! this.shape)
	{
		throw 'No geodetic shape found.';
	}

	return this;
}

Geodetic.prototype = {
	getCentroid: function()
	{
		return this.shape.getCentroid();
	},

	getUncertainty: function()
	{
		return this.shape.getUncertainty();
	},

	toString: function()
	{
		return this.shape.toString()
			+ '; centroid = ' + this.getCentroid()
			+ '; uncertainty = ' + this.getUncertainty() + ' metres';
	}
}

// A Civic object contains all the fields derived from the civic form as
// member variables.  A civic address always includes civic.country.  The
// format() method creates an address string based on a (large) number of
// assumptions about how the address is made.
function Civic(civicnode)
{
	for (var x = civicnode.firstChild; x; x = x.nextSibling)
	{
		if (x.nodeType == 1) // Node.ELEMENT_NODE
		{
			var txt = x.textContent ? x.textContent : x.text;
			this[x.localName ? x.localName : x.baseName] = txt.normalize();
		}
	}

	return this;
}

Civic.prototype = {

	// Find the name of a country based on its code.  This requires a link to a
	// specific server-side script that returns a string based on a code
	// parameter.  See countries folder for a PHP example.
	getCountry: function(url, code)
	{
		var cstr = code;
		if (url)
		{
			var req = getXMLHttpRequest();
			req.open('GET', url + '?code=' + code, false);
			req.send(null);
			if (req.status == 200)
			{
				cstr = req.responseText;
			}
		}
		return cstr;
	},

	// format the civic address for display.
	//
	// The optional url argument is a URL for a page that can take a parameter
	// of 'code' that is a country code and returns a text response that is the
	// name of the country with that code.
	toString: function(url)
	{
		return (this.NAM ? ('"' + this.NAM + '", ') : '') +
		(this.BLD ? ('Building ' + this.BLD + ', ') : '') +
		(this.UNIT ? ('Unit ' + this.UNIT + ', ') : '') +
		(this.RD
		 ? (
			 (this.PRD ? (this.PRD + ' ') : '') +
			 (this.PRM ? (this.PRM + ' ') : '') +
			 (this.HNO ? (this.HNO + ' ') : '') +
			 this.RD +
			 (this.STS ? (' ' + this.STS) : '') +
			 (this.POD ? (' ' + this.POD) : '') +
			 (this.POM ? (' ' + this.POM) : '') +
			 ', '
			 ) : '') +
		(this.A4 ? (this.A4 + ', ') : '') +
		((this.A3 && ! this.A4) ? (this.A3 + ', ') : '') +
		(this.A1 ? (this.A1 + ', ') : '') +
		(this.PC ? (this.PC + ', ') : '') +
		this.getCountry(url, this.country);
	}
}

function UsageRules(xml)
{
	// Set some sensible defaults
	this.retransmission_allowed = false;
	this.retention_expires = new Date(new Date().getTime() + 24*60*60*1000);
	for (var node = xml.firstChild; node; node = node.nextSibling)
	{
		if (node.nodeType == 1) // Node.ELEMENT_NODE
		{
			var txt = node.textContent ? node.textContent : node.text;
			txt = txt.normalize();
			var local = node.localName ? node.localName : node.baseName;
			if (local == 'retransmission-allowed')
			{
				this.retransmission_allowed = (txt == 'yes') || (txt == 'true') || (txt == '1');
			}
			else if (local == 'retention-expires')
			{
				this.retention_expires.setISO8601(txt);
			}
			else if (local == 'ruleset-reference')
			{
				this.ruleset_reference = txt;
			}
			else if (local == 'note-well')
			{
				this.note_well = txt;
			}
		}
	}
	return this;
}

UsageRules.prototype.toString = function()
{
	return 'Retransmission: ' + (this.retransmission_allowed ? 'yes' : 'no')
	+ ', Retention: ' + this.retention_expires
	+ (this.ruleset_reference ? (', Ruleset: ' + this.ruleset_reference) : '')
	+ (this.note_well ? (', Note: ' + this.note_well) : '');
};

// Make one of these, pass it an XML document that contains a PIDF-LO and it
// will attempt to extract useful information:
//   var location = new Location(req.responseXML);

// Two sub-objects are included, if the information is present in the
// PIDF-LO: location.geodetic (Geodetic) and location.civic (Civic).  See
// above for details on each of these objects.
function Location(doc)
{
	this.pidf = findFirstElement(doc, 'urn:ietf:params:xml:ns:pidf', 'presence');
	if (this.pidf != null)
	{

		try
		{
			this.geodetic = new Geodetic(this.pidf);
		}
		catch (msg)
		{
			this.geodetic = null;
		}

		var civ = findFirstElement(this.pidf, 'urn:ietf:params:xml:ns:pidf:geopriv10:civicAddr', 'civicAddress', 'ca');
		if (civ)
		{
			this.civic = new Civic(civ);
		}
		else
		{
			this.civic = null;
		}
		var meth = findFirstElement(this.pidf, 'urn:ietf:params:xml:ns:pidf:geopriv10', 'method', 'gp');
		if (meth)
		{
			this.method = meth.textContent ? meth.textContent : meth.text;
		}

		var ur = findFirstElement(this.pidf, 'urn:ietf:params:xml:ns:pidf:geopriv10', 'usage-rules', 'gp');
		this.rules = new UsageRules(ur);

		var ts = findFirstElement(this.pidf, 'urn:ietf:params:xml:ns:pidf', 'timestamp', '');
		if (! ts)
		{
			ts = findFirstElement(this.pidf, 'urn:ietf:params:xml:ns:pidf:data-model', 'timestamp', 'dm');
		}
		if (ts)
		{
			this.timestamp = new Date();
			this.timestamp.setISO8601(ts.textContent ? ts.textContent : ts.text);
		}
	}

	var uris = findElements(doc, 'urn:ietf:params:xml:ns:geopriv:held', 'locationURI', 'held');
	this.locationURIs = [];
	for (var i = 0; i < uris.length; ++i)
	{
	   this.locationURIs.push(uris[i].textContent ? uris[i].textContent : uris[i].text);
	}

	return this;
}

Location.prototype = {
	toString: function()
	{
		var txt = '';
		if (this.geodetic)
		{
			txt += "\n" + 'Geodetic: ' + this.geodetic.toString();
		}
		if (this.civic)
		{
			txt += "\n" + 'Civic: ' + this.civic.toString();
		}
		if (this.rules)
		{
			txt += "\n" + 'Usage Rules: ' + this.rules.toString();
		}
		if (this.locationURIs)
		{
			txt += "\n" + 'Location URIs: ' + this.locationURIs.join(', ');
		}
		return txt;
	},   
	
	// Translates from Gears JSON to PIDF-LO, then calls Location(PIDF-LO)
	fromGears: function(loc) 
	{
		/*
		var lat = findFirstElement(loc, 'http://gearswireless.com/wps/2005', 'latitude');
		var lon = findFirstElement(loc, 'http://gearswireless.com/wps/2005', 'longitude');
		var hpe = findFirstElement(loc, 'http://gearswireless.com/wps/2005', 'hpe');
		var addr = findFirstElement(loc, 'http://gearswireless.com/wps/2005', 'street-address');
		var country = findFirstElement(addr, 'http://gearswireless.com/wps/2005', 'country');
		var A1 = findFirstElement(addr, 'http://gearswireless.com/wps/2005', 'state');
		var A2 = findFirstElement(addr, 'http://gearswireless.com/wps/2005', 'county');
		var A3 = findFirstElement(addr, 'http://gearswireless.com/wps/2005', 'city');
		var PC = findFirstElement(addr, 'http://gearswireless.com/wps/2005', 'postal-code');
		var HNO = findFirstElement(addr, 'http://gearswireless.com/wps/2005', 'street-number');
		var RD = findFirstElement(addr, 'http://gearswireless.com/wps/2005', 'address-line');
		*/   

		// Assemble into a PIDF-LO string
		var pidf = '<presence xmlns="urn:ietf:params:xml:ns:pidf" xmlns:gp="urn:ietf:params:xml:ns:pidf:geopriv10" xmlns:gml="http://www.opengis.net/gml" xmlns:gs="http://www.opengis.net/pidflo/1.0" xmlns:ca="urn:ietf:params:xml:ns:pidf:geopriv10:civicAddr" entity="pres:foo@bar.com"><tuple id="loc"><status><gp:geopriv><gp:location-info>';
		if (loc && loc.location) {
			loc = loc.location;
			var lat = loc.latitude;
			var lon = loc.longitude;
			var hpe = loc.accuracy;
			var addr = loc.address;

			if (lat && lon && hpe) 
			{
				pidf += '<gs:Circle srsName="urn:ogc:def:crs:EPSG::4326">';
				pidf += '<gml:pos>'+ lat +' '+ lon +'</gml:pos>';
				pidf += '<gs:radius uom="urn:ogc:def:uom:EPSG::9001">'+ hpe +'</gs:radius>';
				pidf += '</gs:Circle>';
			}
			if (addr) 
			{
				var country = addr.country_code;
				var A1 = addr.region;
				var A2 = addr.county;
				var A3 = addr.city;
				var PC = addr.postal_code;
				var HNO = addr.street_number;
				var RD = addr.street;

				pidf += '<ca:civicAddress>';
				if (country) pidf += '<ca:country>'+ country +'</ca:country>';
				if (A1) pidf += '<ca:A1>'+ A1 +'</ca:A1>';
				if (A2) pidf += '<ca:A2>'+ A2 +'</ca:A2>';
				if (A3) pidf += '<ca:A3>'+ A3 +'</ca:A3>';
				if (PC) pidf += '<ca:PC>'+ PC +'</ca:PC>';
				if (HNO) pidf += '<ca:HNO>'+ HNO +'</ca:HNO>';
				if (RD) pidf += '<ca:RD>'+ RD +'</ca:RD>';
				pidf += '</ca:civicAddress>';
			}
		}
		pidf += '</gp:location-info><gp:usage-rules/></gp:geopriv></status><timestamp>2007-06-22T20:57:29Z</timestamp></tuple></presence>';
		
		// Parse the PIDF-LO string into a DOM
		var parser = Components.classes["@mozilla.org/xmlextras/domparser;1"]
						 .createInstance(Components.interfaces.nsIDOMParser);
		var xml = parser.parseFromString(pidf, "text/xml");
		
		// Make a new Location object from the DOM
		var newloc = new Location(xml);
		
		// Fix the date and return
		newloc.timestamp = new Date();
		return newloc; 
	}
}
//----------</location.js>----------


//----------<locmath.js>-----------
var LocMath = {
	// Resize vector to a unit vector
	unitVector: function(x)
	{
		var size = Math.sqrt(x[0] * x[0] + x[1] * x[1] + x[2] * x[2]);
		return x.map(function(a) { return a / size; });
	},

	// Dot product of two vectors
	dotProduct: function(x, y)
	{
		var sum = 0;
		for (i in x)
		{
			i = parseInt(i); if (isNaN(i)) { continue; }
			sum += x[i] * y[i];
		}
		return sum;
	},

	// Cross product of two vectors
	crossProduct: function(x, y)
	{
		return [x[1] * y[2] - x[2] * y[1],
				x[2] * y[0] - x[0] * y[2],
				x[0] * y[1] - x[1] * y[0]];
	},

	// Apply a coordinate transform, t, to a vector, v.
	coordinateTransform: function(t, v, inverse)
	{
		var result = [0, 0, 0];
		for (var i in t)
		{
			i = parseInt(i); if (isNaN(i)) { continue; }

			for (var j in t[i])
			{
				j = parseInt(j); if (isNaN(j)) { continue; }

				result[i] += (inverse ? t[j][i] : t[i][j]) * v[j];
			}
		}
		return result;
	},

	// Find the approximate up normal for the polygon based on ecef coordinates
	polygonUpNormal: function(ecef)
	{
		var vector = [0, 0, 0];
		for (var i in ecef)
		{
			i = parseInt(i); if (isNaN(i)) { continue; }

			var next = (i + 1) % ecef.length;
			var prev = (i - 1 + ecef.length) % ecef.length;
			vector[0] += ecef[i].y * (ecef[next].z - ecef[prev].z);
			vector[1] += ecef[i].z * (ecef[next].x - ecef[prev].x);
			vector[2] += ecef[i].x * (ecef[next].y - ecef[prev].y);
		}
		return LocMath.unitVector(vector);
	},

	// two dimensional area of a polygon (ignores the z value)
	polygonArea: function(xy)
	{
		var area = 0;
		for (var i in xy)
		{
			i = parseInt(i); if (isNaN(i)) { continue; }
			var next = (i + 1) % xy.length;
			area += xy[i][0] * xy[next][1] - xy[next][0] * xy[i][1];
		}
		return area / 2;
	},

	// Finds the centroid on the x-y plane and averages the z values.
	xyPolygonCentroid: function(points)
	{
		var area = LocMath.polygonArea(points);
		var xy_centroid = [0, 0, 0];
		for (var i in points)
		{
			i = parseInt(i); if (isNaN(i)) { continue; }

			var next = (i + 1) % points.length;
			var base = (points[i][0] * points[next][1]
						- points[next][0] * points[i][1]);
			xy_centroid[0] += (points[i][0] + points[next][0]) * base;
			xy_centroid[1] += (points[i][1] + points[next][1]) * base;
			xy_centroid[2] += points[i][2];
		}
		xy_centroid[0] /= 6 * area;
		xy_centroid[1] /= 6 * area;
		xy_centroid[2] /= points.length;
		return xy_centroid;
	},

	// Find a special orthogonal transformation matrix that rotates
	// coordinates to a coordinate system that has a z-axis along the given
	// normal vector.
	planeOrient: function(normal)
	{
		var n = LocMath.unitVector(normal);
		if (n[2] == 1 || n[2] == -1) // Simple: identity matrix
		{
			return [[n[2], 0, 0], [0, n[2], 0], [0, 0, n[2]]];
		}
		if (n[1] == 1 || n[1] == -1) // z -> x, -x -> y, y -> z
		{
			return [[0, 0, n[1]], [-1 * n[1], 0, 0], [0, n[1], 0]];
		}
		if (n[0] == 1 || n[0] == -1) // y -> x, -z -> y, x -> z
		{
			return [[0, 0, n[0]], [-1 * n[0], 0, 0], [0, n[0], 0]];
		}

		// The first row of the transformation is selected based on the two
		// non-zero indices of the normal vector.
		var i = 0;
		var j = 1;
		if (n[0] == 0)
		{
			i = 1;
			j = 2;
		}
		else if (n[1] == 0)
		{
			j = 2;
		}

		var t1 = [0, 0, 0];
		t1[i] = 0 - n[j];
		t1[j] = n[i];
		t1 = LocMath.unitVector(t1);
		var t2 = LocMath.crossProduct(n, t1);
		return [t1, t2, n];
	},


	movePoint: function(pt, d, angle)
	{
	var ecef = pt.toEcefPoint();

		var small_number = 0.000001;
		// A little overflow right near the north pole should be safe enough
		// in this direction.  The "north" wont really be north, but it's all
		// weird up there anyhow.
		var north = new GeoPoint(pt.latitude + small_number,
				 pt.longitude,
				 pt.altitude ? pt.altitude : 0).toEcefPoint();
	var tmp_v_north = [north.x - ecef.x, north.y - ecef.y, north.z - ecef.z];
		var pt_lat = pt.latitude * Math.PI / 180;
		var pt_lng = pt.longitude * Math.PI / 180;
	var v_up = [Math.cos(pt_lat) * Math.cos(pt_lng),
				Math.cos(pt_lat) * Math.sin(pt_lng),
					Math.sin(pt_lat)];

	var v_east = LocMath.unitVector(LocMath.crossProduct(tmp_v_north, v_up));
	var d_east = d * Math.sin(angle);

	var v_north = LocMath.unitVector(LocMath.crossProduct(v_up, v_east));
	var d_north = d * Math.cos(angle);

	ecef.x += v_east[0] * d_east + v_north[0] * d_north;
	ecef.y += v_east[1] * d_east + v_north[1] * d_north;
	ecef.z += v_east[2] * d_east + v_north[2] * d_north;


	return ecef.toGeoPoint();
	},

	getRandomGenerator: function(seed)
	{
		if (seed)
		{
			var rand_current = seed & 0xffffffff;
			return function()
			{
				rand_current = (1103515245 * rand_current + 12345) & 0xffffffff;
				return rand_current / 0xffffffff;
			};
		}
		return Math.random;
	},

	fuzzPoint: function(pt, size, seed)
	{
		var rand = LocMath.getRandomGenerator(seed);

		var angle = rand() * 2 * Math.PI;
		var distance = size * (1 - Math.abs(rand() + rand() - 1));
		var moved = LocMath.movePoint(pt, distance, angle);
		if (! pt.altitude)
		{
			moved.altitude = 0;
		}
		return moved;
	}
}
//----------</locmath.js>----------


//----------<shapes.js>-----------
// #include "geoecef.js"

var NS_GML = 'http://www.opengis.net/gml';
var NS_GEOSHAPE = 'http://www.opengis.net/pidflo/1.0';
var URN_RADIANS = 'urn:ogc:def:uom:EPSG::9101';
var URN_WGS84_3D = 'urn:ogc:def:crs:EPSG::4979';

// Base Shape
function PidfShape()
{
	this.type = '<Generic Shape>';
	return this;
}

PidfShape.prototype.load = function(xml) {};

PidfShape.prototype.getCentroid = function()
{
	return null;
};

PidfShape.prototype.getUncertainty = function()
{
	return 0;
};

PidfShape.prototype.toString = function()
{
	return this.type;
};


PidfShape.prototype.fuzz = function(size, seed)
{
	if (size <= 0)
	{
		return this;
	}
	if (this.getUncertainty() > size)
	{
		return new PidfCircle(this.getCentroid(), this.getUncertainty());
	}
	var moved = LocMath.fuzzPoint(this.getCentroid(), size - this.getUncertainty(), seed);
	return new PidfCircle(moved, size);
};

PidfShape.prototype.getNumbers = function(xml)
{
	var txt = xml.textContent ? xml.textContent : xml.text;
	txt = txt.trim().replace(/\s+/g, ' ');
	var numbers = txt.split(' ');
	return numbers.map(parseFloat);
};

PidfShape.prototype.toGMapShape = function()
{
	throw new Error('Not implemented');
};

// Point
function PidfPoint(pt)
{
	this.type = 'Point';
	this.point = pt;
	return this;
}

PidfPoint.prototype = new PidfShape();

PidfPoint.prototype.getCentroid = function()
{
	return this.point;
};

PidfPoint.prototype.load = function(xml)
{
	var posnode = findFirstElement(xml, NS_GML, 'pos', 'gml');
	var num = this.getNumbers(posnode);
	this.point = new GeoPoint(num[0], num[1], num[2]);
};

PidfPoint.prototype.toString = function()
{
	return PidfShape.prototype.toString.apply(this, []) + ': ' + this.point.toString();
};

// Circle
function PidfCircle(pt, radius)
{
	this.type = 'Circle';
	PidfPoint.apply(this, [pt]);
	this.uncertainty = radius;
	return this;
}

PidfCircle.prototype = new PidfPoint();

PidfCircle.prototype.load = function(xml)
{
	PidfPoint.prototype.load.apply(this, [xml]);

	var rnode = findFirstElement(xml, NS_GEOSHAPE, 'radius', 'gs');
	this.uncertainty = this.getNumbers(rnode)[0];
};

PidfCircle.prototype.toString = function()
{
	var txt = PidfPoint.prototype.toString.apply(this, []);
	txt += ' +/- ' + this.uncertainty + ' metres';
	return txt;
};

PidfCircle.prototype.getUncertainty = function()
{
	return this.uncertainty;
};

// Sphere
function PidfSphere()
{
	this.type = 'Sphere';
	return this;
}

PidfSphere.prototype = new PidfCircle();

// Ellipse
function PidfEllipse()
{
	this.type = 'Ellipse';
	return this;
}

PidfEllipse.prototype = new PidfPoint();

PidfEllipse.prototype.load = function(xml)
{
	PidfPoint.prototype.load.apply(this, [xml]);

	var node = findFirstElement(xml, NS_GEOSHAPE, 'semiMajorAxis', 'gs');
	this.semiMajor = this.getNumbers(node)[0];
	node = findFirstElement(xml, NS_GEOSHAPE, 'semiMinorAxis', 'gs');
	this.semiMinor = this.getNumbers(node)[0];
	node = findFirstElement(xml, NS_GEOSHAPE, 'orientation', 'gs');
	this.orientation = this.getNumbers(node)[0];
	if (node.getAttribute('uom') == URN_RADIANS)
	{
		this.orientation *= 180 / Math.PI;
	}
};

PidfEllipse.prototype.toString = function()
{
	var txt = PidfPoint.prototype.toString.apply(this, []);
	txt += ' +/- semi-major ' + this.semiMajor + ' metres; semi-minor '
		+ this.semiMinor + ' metres; orientation ' + this.orientation + ' degrees';
	return txt;
};

PidfEllipse.prototype.getUncertainty = function()
{
	return this.semiMajor;
};


// Ellipsoid
function PidfEllipsoid()
{
	this.type = 'Ellipsoid';
	return this;
}

PidfEllipsoid.prototype = new PidfEllipse();

PidfEllipsoid.prototype.load = function(xml)
{
	PidfEllipse.prototype.load.apply(this, [xml]);

	var node = findFirstElement(xml, NS_GEOSHAPE, 'verticalAxis', 'gs');
	this.vertical = this.getNumbers(node)[0];
};

PidfEllipsoid.prototype.toString = function()
{
	var txt = PidfEllipse.prototype.toString.apply(this, []);
	txt += ', vertical ' + this.vertical + ' metres';
	return txt;
};

PidfEllipsoid.prototype.getUncertainty = function()
{
	return Math.max(this.semiMajor, this.vertical);
};

// Polygon
function PidfPolygon()
{
	this.type = 'Polygon';
	return this;
}

PidfPolygon.prototype = new PidfShape();

PidfPolygon.prototype.load = function(poly)
{
	this.points = [];
	this.is3d = (poly.getAttribute('srsName') == URN_WGS84_3D);
	var ring = findFirstElement(poly, NS_GML, 'LinearRing', 'gml');
	for (var node = ring.firstChild; node; node = node.nextSibling)
	{
		if (node.nodeType == 1) // Node.ELEMENT_NODE
		{
			xy = this.getNumbers(node);
			var local = node.localName ? node.localName : node.baseName;
			if (local == 'pos' || local == 'posList')
			{
				while (xy.length >= (this.is3d ? 3 : 2))
				{
					var pt = new GeoPoint(xy.shift(),
										  xy.shift(),
										  (this.is3d ? xy.shift() : 0));
					this.points.push(pt);
				}
			}
		}
	}
	if (this.points.length < 4)
	{
		throw "Not enough points for a polygon: " + this.points.length;
	}
	this.points.pop();  // remove duplicated point
};

PidfPolygon.prototype.calculateCentroid = function()
{
	// Convery to ECEF
	var ecef = this.points.map(function(x) {
		return x.toEcefPoint();
	});
	// Find the up normal
	var upnormal = LocMath.polygonUpNormal(ecef);
	// Find a transformation matrix to neutralize x
	var t = LocMath.planeOrient(upnormal);
	// Apply transform
	var transformed = ecef.map(function(e) {
		return LocMath.coordinateTransform(t, e.toArray(), false);
	});
	// Find a centroid on the transformed x-y plane
	var trans_centroid = LocMath.xyPolygonCentroid(transformed);
	// Reverse transform
	var ecef_centroid = LocMath.coordinateTransform(t, trans_centroid, true);
	// Convert back to Geodetic
	ecef_centroid = new EcefPoint(ecef_centroid);
	this.centroid = ecef_centroid.toGeoPoint();
	this.centroid.altitude = this.getCentroidAltitude();

	// Find furthest point for uncertainty
	this.uncertainty = 0;
	for (var i in ecef)
	{
		i = parseInt(i); if (isNaN(i)) { continue; }

		var dist = ecef[i].distanceTo(ecef_centroid);
		if (dist > this.uncertainty)
		{
			this.uncertainty = dist;
		}
	}
};

PidfPolygon.prototype.getCentroidAltitude = function()
{
	var alt = this.points[0].altitude;
	for (i in this.points)
	{
		i = parseInt(i); if (isNaN(i)) { continue; }

		if (alt != this.points[i].altitude)
		{
			alt = null;
		}
	}
	if (!alt)
	{
		// this.centroid.altitude should have the average of all points
		alt = this.centroid.altitude;
	}
	return alt;
};

PidfPolygon.prototype.getCentroid = function()
{
	if (! this.centroid)
	{
		this.calculateCentroid();
	}
	return this.centroid;
};

PidfPolygon.prototype.getUncertainty = function()
{
	if (! this.uncertainty)
	{
		this.calculateCentroid();
	}
	return this.uncertainty;
};

PidfPolygon.prototype.toString = function()
{
	var txt = PidfShape.prototype.toString.apply(this, []) + ':';
	for (var i in this.points)
	{
		i = parseInt(i); if (isNaN(i)) { continue; }

		txt += (i > 0 ? ',' : '');
		txt += ' [' + i + '] ' + this.points[i].toString();
	}
	return txt;
};


// Prism
function PidfPrism()
{
	this.type = 'Prism';
	return this;
}

PidfPrism.prototype = new PidfPolygon();

PidfPrism.prototype.load = function(xml)
{
	PidfPolygon.prototype.load.apply(this, [xml]);

	var node = findFirstElement(xml, NS_GEOSHAPE, 'height', 'gs');
	this.height = this.getNumbers(node)[0];
};

PidfPrism.prototype.toString = function()
{
	var txt = PidfPolygon.prototype.toString.apply(this, []);
	txt += ', height ' + this.height + ' metres';
	return txt;
};

PidfPrism.prototype.getCentroidAltitude = function()
{
	var alt = PidfPolygon.prototype.getCentroidAltitude.apply(this, []);
	alt += this.height / 2;
	return alt;
};

// ArcBand
function PidfArcBand()
{
	this.type = 'ArcBand';
	return this;
}

PidfArcBand.prototype = new PidfPoint();

PidfArcBand.prototype.load = function(xml)
{
	PidfPoint.prototype.load.apply(this, [xml]);

	var node = findFirstElement(xml, NS_GEOSHAPE, 'innerRadius', 'gs');
	this.innerRadius = this.getNumbers(node)[0];
	node = findFirstElement(xml, NS_GEOSHAPE, 'outerRadius', 'gs');
	this.outerRadius = this.getNumbers(node)[0];
	node = findFirstElement(xml, NS_GEOSHAPE, 'startAngle', 'gs');
	this.startAngle = this.getNumbers(node)[0];
	if (node.getAttribute('uom') == URN_RADIANS)
	{
		this.startAngle *= 180 / Math.PI;
	}
	node = findFirstElement(xml, NS_GEOSHAPE, 'openingAngle', 'gs');
	this.openingAngle = this.getNumbers(node)[0];
	if (node.getAttribute('uom') == URN_RADIANS)
	{
		this.openingAngle *= 180 / Math.PI;
	}
};

PidfArcBand.prototype.toString = function()
{
	var txt = PidfPoint.prototype.toString.apply(this, []);
	txt += ', inner radius ' + this.innerRadius + ' metres';
	txt += ', outer radius ' + this.outerRadius + ' metres';
	txt += ', start angle ' + this.startAngle + ' degrees';
	txt += ', opening angle ' + this.openingAngle + ' degrees';
	return txt;
};

PidfArcBand.prototype.calculateCentroid = function()
{
	var halfOpening = this.openingAngle * Math.PI / 360;
	var d = 4 * Math.sin(halfOpening)
		* (this.outerRadius * this.outerRadius
		   + this.outerRadius * this.innerRadius
		   + this.innerRadius * this.innerRadius)
		/ (6 * halfOpening * (this.outerRadius + this.innerRadius));

	var startRadians = this.startAngle * Math.PI / 180;
	var angle = startRadians + halfOpening;

	this.centroid = LocMath.movePoint(this.point, d, angle);
	this.centroid.altitude = null;

	var coso2 = Math.cos(halfOpening);
	var toOuter = Math.sqrt(d * d + this.outerRadius * this.outerRadius - 2 * d * this.outerRadius * coso2);
	var toInner = Math.sqrt(d * d + this.innerRadius * this.innerRadius - 2 * d * this.innerRadius * coso2);
	this.uncertainty = Math.max(toInner, toOuter);
};

PidfArcBand.prototype.getCentroid = function()
{
	if (! this.centroid)
	{
		this.calculateCentroid();
	}
	return this.centroid;
};

PidfArcBand.prototype.getUncertainty = function()
{
	if (! this.uncertainty)
	{
		this.calculateCentroid();
	}
	return this.uncertainty;
};

//----------</shapes.js>----------
