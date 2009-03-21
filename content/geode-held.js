/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is labs.mozilla.com code.
 *
 * The Initial Developer of the Original Code is Mozilla Corporation.
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Justin Dolske <dolske@mozilla.com> (original author)
 *  Richard Barnes <rbarnes@bbn.com> (Geode-HELD extension)
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

//const Ci = Components.interfaces;
//const Cc = Components.classes;

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

var GeoLocThingie = {


	/* ---------- private memebers ---------- */


	get _logService() {
		delete this._logService;
		return this._logService = Cc["@mozilla.org/consoleservice;1"].
					  getService(Ci.nsIConsoleService);
	},

	get _observerService() {
		delete this._observerService;
		return this._observerService = Cc["@mozilla.org/observer-service;1"].
						   getService(Ci.nsIObserverService);
	},

	get _contentPrefService() {
		delete this._contentPrefService;
		return this._contentPrefService = Cc["@mozilla.org/content-pref/service;1"].
						  getService(Ci.nsIContentPrefService);
	},

	// IO service for string -> nsIURI conversion
	get _ioService() {
		delete this._ioService;
		return this._ioService = Cc["@mozilla.org/network/io-service;1"].
					 getService(Ci.nsIIOService);
	},

	// Preference branch and cached values
	_prefBranch : null,
	_debug	: true,

	// The locationProvider we use to get location
	_locationProvider : null,


	/*
	 * init
	 *
	 */
	init : function () {

		// Cache references to current |this| in utility objects
		var geode = this;
		this._observer._geode = this;
		this._webProgressListener._geode = this;

		// Cache a reference to our preferences
		this._prefBranch = Cc["@mozilla.org/preferences-service;1"]
					.getService(Ci.nsIPrefService)
					.getBranch("extensions.geode-held.");
		this._prefBranch.QueryInterface(Ci.nsIPrefBranch2);
		this._prefBranch.addObserver("", this._observer, false);

		// Create up the location source and subscribe to it (don't actually start it)
		// TODO: Configure from preferences
		this._locationProvider = Components
		            .classes["@geopriv.dreamhosters.com/unitylocationprovider;1"]
	                    .getService()
	                    .wrappedJSObject;
		this._locationProvider.watch({
			update : function(loc) {
				geode._notifyWatchers(loc);
			}
			});

		// Configure things from preferences
		this._debug = this._prefBranch.getBoolPref("debug");
		this._locationProvider.heldURI = this._prefBranch.getCharPref("held-server"); // NB: Only applies for HELD or Unity 
		this._locationProvider.httpPort = this._prefBranch.getIntPref("http-port");

		// Now start the location source
		this._locationProvider.startup();

		// WebProgressListener for getting notification of new doc loads.
		// XXX Ugh. Since we're a chrome overlay, it would be nice to just
		// use gBrowser.addProgressListener(). But that isn't sending
		// STATE_TRANSFERRING, and the earliest we can get at the page is
		// STATE_STOP (which is onload, and is inconviently late).
		// We'll use the docloader service instead, but that means we need to
		// filter out loads for other windows.
		var docsvc = Cc["@mozilla.org/docloaderservice;1"].
					 getService(Ci.nsIWebProgress);

		var listener = this._webProgressListener;
		docsvc.addProgressListener(listener, Ci.nsIWebProgress.NOTIFY_STATE_DOCUMENT);

		// Remove progress listener when the window is closed.
		window.addEventListener("close", function() { docsvc.removeProgressListener(listener); }, false);
	},


	/*
	 * log
	 *
	 * Internal function for logging debug messages to the Error Console window
	 */
	log : function (message) {
		if (!this._debug)
			return;
		dump("GeoLoc: " + message + "\n");
		this._logService.logStringMessage("GeoLoc: " + message);
	},


	/* ---------- Utility objects ---------- */

	/*
	 * _observer object
	 *
	 * Just used for watching preference changes
	 */
	_observer : {
		_geode : null,
		
		QueryInterface : XPCOMUtils.generateQI([Ci.nsIObserver, 
					Ci.nsISupportsWeakReference]),

		// nsObserver
		observe : function(subject, topic, data) {
			if (topic == "nsPref:changed") {
				var prefName = data;
				this._geode.log("got change to "+prefName+" preference");
			
				if (prefName == "debug") {
					this._geode._debug =
						this._geode._prefBranch.getBoolPref("debug");
				} else if (prefName == "held-server") {
					this._geode._locationProvider.heldURI = 
						this._geode._prefBranch.getCharPref("held-server");
				} else if (prefName == "http-port") {
					this._geode._locationProvider.httpPort = 
						this._geode._prefBranch.getIntPref("http-port");
				} else {
					this._geode.log("Oops! Can't handle changes to a "
						+"preference \""+prefName+"\"; ignored");
				}
			} // No else if, because we don't do first-run hook
			else {
				this._geode.log("Oops! Unexpected notification: "+topic);
			}
		},
	},


	/*
	 * _webProgressListener object
	 *
	 * Internal utility object, implements nsIWebProgressListener interface.
	 * This is attached to the document loader service, so we get
	 * notifications about all page loads.
	 */
	_webProgressListener : {
		_geode : null,
		_Ci: Components.interfaces,
		_targetState : Components.interfaces.nsIWebProgressListener.STATE_TRANSFERRING,

		QueryInterface : XPCOMUtils.generateQI([Ci.nsIWebProgressListener,
							Ci.nsISupportsWeakReference]),


		onStateChange : function (aWebProgress, aRequest,
								  aStateFlags,  aStatus) {
			// STATE_START is too early, doc is still the old page.
			// STATE_STOP is inconviently late (it's onload)
			if (aStateFlags & this._Ci.nsIWebProgressListener.STATE_TRANSFERRING) {
				var domWindow = aWebProgress.DOMWindow;
				var chromeWin = domWindow
							.QueryInterface(this._Ci.nsIInterfaceRequestor)
							.getInterface(this._Ci.nsIWebNavigation)
							.QueryInterface(this._Ci.nsIDocShellTreeItem)
							.rootTreeItem
							.QueryInterface(this._Ci.nsIInterfaceRequestor)
							.getInterface(this._Ci.nsIDOMWindow)
							.QueryInterface(this._Ci.nsIDOMChromeWindow);
				if (chromeWin != window)
					return;
	
				this._geode.log("onStateChange accepted: req = " +
								(aRequest ?  aRequest.name : "(null)") +
								", flags = 0x" + aStateFlags.toString(16));
	
				this._geode._injectNavigatorGeolocator(domWindow);
			} 
		},

		// stubs for the nsIWebProgressListener interfaces which we don't use.
		onProgressChange : function() { },
		onLocationChange : function() { },
		onStatusChange   : function() { },
		onSecurityChange : function() { },
	},


	/*
	 * _eventListener
	 */
	_eventListener : function (aEvent) {
		this.log("_eventListener got " + aEvent.type + " event for " + aEvent.target.location);

		// XXX I think the scoping is right here, but might be worth checking
		//	 for any funkyness when the request comes from an iframe or such.
		var win = aEvent.target;
		if (!(win instanceof Ci.nsIDOMWindow)) {
			this.log("Error: event target wasn't a window.")
			return;
		}

		// We only handle two classes of events
		if (aEvent.type == "x-geode-locationRequest") {
			// x-geode-locationRequest gets permission, then adds the window as a watcher

			// Get permission to add this window as a watcher
			// 1. See if there are stored permissions
			var [havePerms, allowed, fuzzLevel] = this._getPagePermissions(win.location);
			if (havePerms) {
				if (allowed) {
					this.log("Page allowed access: "+win.location);
					this._addWatcher(win);
					return;
				} else {
					this.log("Page not allowed access: "+win.location);
					return;
				}
			}
	
			// 2. If not, prompt for permissions
			this.log("Requesting user permission to reveal location");
	
			// 2.1. Set paramters for the prompt 
			var promptName = "geode-held-request";
			var shortHostname = this._getShortHostname(win.location)
			var promptText = "The page at "+shortHostname+" wants to know where you are.  Tell them:";
			var geode = this;
			var buttons = [
				{
					label: "Exact location",
					accessKey: "l",
					popup: null,
					callback: function(bar) {
						fuzzLevel = 0;
						geode._setPagePermission(win.location, fuzzLevel, 
							checkbox.checked);
						geode._addWatcher(win);
					}
				},
				{
					label: "Neighborhood",
					accessKey: "h",
					popup: null,
					callback: function(bar) {
					fuzzLevel = 200; // 200m radius
						geode._setPagePermission(win.location, fuzzLevel, 
							checkbox.checked);
						geode._addWatcher(win);
					}
				},
				{
					label: "City",
					accessKey: "C",
					popup: null,
					callback: function(bar) {
						fuzzLevel = 10000; // 10km radius
						geode._setPagePermission(win.location, fuzzLevel, 
							checkbox.checked);
						geode._addWatcher(win);
					}
				},
				{
					label: "Nothing",
					accessKey: "N",
					popup: null,
					callback: function(bar) {
						fuzzLevel = -1; 
						geode._setPagePermission(win.location, fuzzLevel, 
							checkbox.checked);
						geode.log("User denied access to location");
					}
				}
			];
	
			// 2.2. Set up the prompt
			var notifyBox = this._getNotificationBox(win);
			var oldBar = notifyBox.getNotificationWithValue(promptName);
			var newBar = notifyBox.appendNotification(
					promptText, promptName, null,
					notifyBox.PRIORITY_INFO_MEDIUM, buttons);
			var checkbox = document.createElementNS(
					"http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
					"checkbox");
			checkbox.setAttribute("id", "rememberChoice");
			checkbox.setAttribute("label", "Always do this without asking");
			newBar.appendChild(checkbox);
	
			if (oldBar) {
				this.log("(...removing preexisting notification bar)");
	 			notifyBox.removeNotification(oldBar);
	 		}
		} else if (aEvent.type == "x-geode-locationRequestCancel") {
			// x-geode-locationRequestCancel removes the window from the watcher list
			this._removeWatcher(win); 
		} else { // Not an event we handle
			this.log("Error: Unknown event type: "+aEvent.type);
			return;
		} 
	},

	/* ----- Watcher management variables & functions ----- */

	_geoWatchers : {},	// List of windows that have registered
	_geoWatcherSerial : 0,	// Index at which the next watcher will be inserted

	/*
	 * _addWatcher
	 */
	_addWatcher : function(win) {
		var ID = this._geoWatcherSerial++;
		this._geoWatchers[ID] = win;
	},

	/*
	 * _removeWatcher
	 */
	_removeWatcher : function(win) {
		for (watcher in this._geoWatchers) 	
			if (this._geoWatchers[watcher] == win)
				delete this._geoWatchers[watcher];
	},

  lastLoc : {},

	/*
	 * _notifyWatchers
	 *
	 * Passes location to windows that have registered
	 * Passed as a callback to _locationProvider.watch() 
	 */
	_notifyWatchers : function(loc) {
		for each (win in this._geoWatchers) {
			// Skip windows that have disappeared
			if (win == null || win.closed) continue;
			
			// Fuzz location in accordance with page permissions
			var [havePerms, allowed, fuzzLevel] = this._getPagePermissions(win.location);
			if (!havePerms || !allowed) continue;

			// Fuzz civic and geodetic 
			// Geodetic: Use built-in fuzzing
			var retshape = loc.geodetic.shape;
			var retcivic = loc.civic;
			if (loc.geodetic && fuzzLevel > 0)
				var retshape = loc.geodetic.shape.fuzz(fuzzLevel, Math.random());
			// Civic: Delete fields
			if (loc.civic && fuzzLevel > 0) {
				switch (fuzzLevel) {
					case 100000: // Country (doesn't exist yet in prefs)
						delete retcivic.A1;
						delete retcivic.A2;
						delete retcivic.A3;
						delete retcivic.A4;
						delete retcivic.A5;
						delete retcivic.A6;
					case 10000: // City
						delete retcivic.PRD;
						delete retcivic.PRM;
						delete retcivic.RD;
						delete retcivic.STS;
						delete retcivic.POD;
						delete retcivic.POM;
						delete retcivic.PC;
					case 200: // Neighborhood
						delete retcivic.NAM;
						delete retcivic.BLD;
						delete retcivic.UNIT;
						delete retcivic.HNO;
				}
			}

			// Transform rules according to preferences
			var retrules;
			if (loc.rules) retrules = loc.rules;
			else retrules = {};
			var override = this._prefBranch.getBoolPref("geopriv.override");
			if (override) {
				retrules.retransmission_allowed = this._prefBranch.getBoolPref("geopriv.retransmission-allowed");
				retrules.ruleset_reference = this._prefBranch.getCharPref("geopriv.ruleset-reference");
				retrules.note_well = this._prefBranch.getCharPref("geopriv.note-well");

				// Retention-Expires requires special handling
				var retentionExpiresTime = parseInt( this._prefBranch.getCharPref("geopriv.retention-expires") ); 
				retrules.retention_expires = new Date();
				if (retentionExpiresTime > 0) {
					// If there's a time set, use it
					retrules.retention_expires.setTime( retentionExpiresTime );
				} else {
					// Else use 24 hours from now
					retrules.retention_expires.setTime( retrules.retention_expires.getTime() + (24*60*60*1000) );
				}		
			}

			// Convert to (a superset of) nsIGeoPosition 
			var retloc = {
				// For compatibility with old versions of the W3C API
				latitude: retshape.getCentroid().latitude,
				longitude: retshape.getCentroid().longitude,
				accuracy: retshape.getUncertainty(),
				// nsIGeolocation
				coords: {
					latitude: retshape.getCentroid().latitude,
					longitude: retshape.getCentroid().longitude,
					accuracy: retshape.getUncertainty(),
				}, 
				timestamp: loc.timestamp,
				// other
				geodetic: retshape,
				civic: retcivic,
				rules: retrules,
				uris: loc.locationURIs,
			}


			this.log("Notifying window "+ win.location +" of location "+retloc.toSource());
			var scriptToRun = "window.navigator.geolocation._notifyWatchers("+
				retloc.toSource() + ");";
			this._execInWindow(win, scriptToRun);
			
			// poor-man's onChange
			try {
        if (this.lastLoc && this.lastLoc.latitude != retloc.latitude && this.lastLoc.longitude != retloc.longitude) {
          this.lastLoc = retloc;
          this.log("Updating Fire Eagle...");
          FireEagle.Updater.updateFireEagle(retloc);
        }
      }
      catch (e) {
        this.log(e);
      }
		}
	},



	/* ------- Internal methods / callbacks for document integration ------- */

	_scriptToInject : null,

	/*
	 * _injectNavigatorGeolocator
	 *
	 * Injects window.navigator.geolocation into the specified DOM window.
	 */
	_injectNavigatorGeolocator: function (aWindow) {
		this.log("Injecting to " + aWindow.location);

		if (!this._scriptToInject) {
			this.log("Reading code for injection...");
			this._scriptToInject = this._readFile();
		}

		this._execInWindow(aWindow, this._scriptToInject);

		aWindow.addEventListener("x-geode-locationRequest", function (e) { GeoLocThingie._eventListener(e); }, false, true);
		aWindow.addEventListener("x-geode-locationRequestCancel", function (e) { GeoLocThingie._eventListener(e); }, false, true);
	},


	/*
	 * _readFile
	 *
	 * Read a file from the extension's directory, and return it as a string.
	 */

	_readFile : function () {

		// Get at the directory where the extension is installed.
		var MY_ID = "geode-held@geopriv.dreamhosters.com";
		var em = Cc["@mozilla.org/extensions/manager;1"].
				 getService(Ci.nsIExtensionManager);
		var file = em.getInstallLocation(MY_ID).getItemFile(MY_ID, "install.rdf").parent;

		// Get at $EXTDIR/content/injected.js
		file.append("content");
		file.append("injected.js");
		if (!file.exists()) {
			this.log("ERROR: $EXTDIR/content/injected.js doesn't exist!");
			return;
		}

		// Slurp the contents of the file into a string.
		var line = { value: "" };
		var inputStream, lineStream, hasMore;

		inputStream = Cc["@mozilla.org/network/file-input-stream;1"].
					  createInstance(Ci.nsIFileInputStream);
		inputStream.init(file, 0x01, -1, null); // RD_ONLY
		lineStream = inputStream.QueryInterface(Ci.nsILineInputStream);

		var bigString = "", hasMore;
		do {
			hasMore = lineStream.readLine(line);
			bigString += line.value;
			bigString += "\n";
		} while (hasMore);
		lineStream.close();

		return bigString;
	},


	/*
	 * _execWithinWindow
	 */
	_execInWindow : function(aWindow, someCode) {
		this.log("executing code in the context of " + aWindow.location);
		var sandbox = new Components.utils.Sandbox(aWindow);
		sandbox.__proto__ = aWindow.wrappedJSObject
		Components.utils.evalInSandbox(
			someCode,
			sandbox);
	},

	/* ----- Permission-handling functions ----- */
	
	_pagePermissions : {},

	/*
	 * _getShortHostname
	 */
	_getShortHostname : function (aDOMLocation) {
		var shortHostname = aDOMLocation.host;
		if (!shortHostname)
			shortHostname = aDOMLocation; // for file:///blah.html
		return shortHostname;
	},

	/*
	 * _getPagePermissions
	 *
	 * Checks to see if a page should be allowed access to the current
	 * location, without user interaction.
	 *
	 * Returns [havePerms, allowed, fuzzLevel]
	 *
	 * havePerms -- true if there's an existing permissions decision.
	 * allowed -- true if the existing decision was to allow the page access
	 *			to the location, false is the decision was to deny access.
	 * fuzzLevel -- fuzzlevel for page's allowed access
	 */
	_getPagePermissions : function(aDOMLocation) {
		var shortName = this._getShortHostname(aDOMLocation);

		this.log("Checking page permissions for "+shortName);
		
		// Check for a permanent, stored fuzz level
		var uri = this._ioService.newURI(aDOMLocation, null, null);
		var fuzzLevel = this._contentPrefService.getPref(uri, 
					"extensions.geode-held.fuzzLevel");
		if (typeof fuzzLevel != "undefined") {
			this.log("Found permanent pref, fuzz is " + fuzzLevel);
			return [true, (fuzzLevel >= 0), fuzzLevel];
		}

		// Check for cached preferences
		var perms = this._pagePermissions[shortName];
		if (!perms) 
			return [false, undefined, undefined];

		// Assuming we have cached preferences,
		//     check that they're fresh enough
		var timeout = perms.lastUsed;
		// Keep permission grants/denials alive for a short period of time,
		// to help avoid the prompts from being annoying when navigating
		// location-aware sites. Maybe we should just get rid of this if
		// we can save the choice permanently?
		if (perms.allowed)
			timeout += 1 * 60 * 1000; // 1 minute
		else
			timeout += 10 * 1000; // 10 seconds

		// Check that we haven't passed the timeout
		var now = Date.now();
		if (now > timeout) {
			this.log("Page previously " + (perms.allowed ? "allowed" : "denied") +
					 " permission, but has timed out");
			delete this._pagePermissions[shortName];
			return [false, undefined, undefined];
		}

		// If we haven't passed the timeout, we're good to go
		perms.lastUsed = now;
		this.log("Page is " + (perms.allowed ? "allowed" : "denied") +
				 " with fuzz level " + perms.fuzzLevel);
		return [true, perms.allowed, perms.fuzzLevel];
	},


	/*
	 * _setPagePermission
	 *
	 * Remembers a user's choice for allowing a page to automatically get the
	 * position. The choice is always remembered for a short period of time,
	 * and can optionally be saved permanently.
	 *
	 * aFuzzLevel can be -1 to indicate permission was denied.
	 */
	_setPagePermission : function(aDOMLocation, aFuzzLevel, isPermanent) {
		var shortName = this._getShortHostname(aDOMLocation);

		this.log("setting permissions for " + shortName + " to " +
					(aFuzzLevel >= 0 ? ("fuzz level " + aFuzzLevel) : "denied"));

		if (isPermanent) {
			this.log("saving permanently...");
			var uri = this._ioService.newURI(aDOMLocation, null, null);
			this._contentPrefService.setPref(uri, "extensions.geode-held.fuzzLevel", aFuzzLevel);
		} else {
			this._pagePermissions[shortName] = {
				allowed: (aFuzzLevel >= 0),
				fuzzLevel: aFuzzLevel,
				lastUsed: Date.now()
			};
		}
	},

	/*
	 * _getNotificationBox
	 */
	_getNotificationBox : function(aWindow) {
		try {
			// Get topmost window, in case we're in a frame
			var notifyWindow = aWindow.top;

			// Find the <browser> which contains notifyWindow, by looking
			// through all the open windows and all the <browsers> in each
			var wm = Cc["@mozilla.org/appshell/window-mediator;1"].
					getService(Ci.nsIWindowMediator);
			var enumerator = wm.getEnumerator("navigator:browser");
			var tabbrowser = null;
			var foundBrowser = null;
	
			while (!foundBrowser && enumerator.hasMoreElements()) {
				var win = enumerator.getNext();
				tabbrowser = win.getBrowser();
				foundBrowser = tabbrowser.getBrowserForDocument(
						notifyWindow.document);
			}
			
			if (foundBrowser)
				return tabbrowser.getNotificationBox(foundBrowser);
		} catch (e) {
			this.log("No notification box available!");
			return null;
		}
	}


};

var GearsVerifier = {
	verify : function() {
		// Check to see whether Gears is installed ("are" installed?)
		var isGearsInstalled = Cc["@mozilla.org/extensions/manager;1"]
					.getService(Components.interfaces.nsIExtensionManager)
					.getItemForID("{000a9d1c-beef-4f90-9363-039d445309b8}");
		var isGearsEnabled = Cc["@google.com/gears/factory;1"];
		//this.log("Checking Gears status: Gears is "+ ((isGearsInstalled)? "" : "not ") +"installed");
		//this.log("Checking Gears status: Gears is "+ ((isGearsEnabled)? "" : "not ") +"enabled");
		if (!isGearsInstalled) 
			setTimeout(
				'GearsVerifier._gearsNotInstalledDialog("Before you can use the Geode-HELD 2.0, you will need to install Google Gears. Click OK to get started...")',
				2000);
		if (!isGearsEnabled) 
			setTimeout(
				'GearsVerifier._gearsNotEnabledDialog("Before you can use the Geode-HELD 2.0, you will need to enable Google Gears. Click OK to get enable Gears, then please restart Firefox...")',
				2000);
	},

	// Show a dialogue that goes to Gears when you click "OK"
	// Borrowed from FireEagle updater
        _gearsNotInstalledDialog : function (errorString) {
                var params = {inn : {error : errorString, enabled : true}, out : true};
                window.openDialog("chrome://geode-held/content/errordialog.xul", 
			"errorwindow", "chrome, modal, dialog, resizable=no", params).focus();
                if (params.out) {
                        window.content.location.href = "http://gears.google.com/";
                } else {
                        window.close();
                }
        },

        _gearsNotEnabledDialog : function (errorString) {
                var params = {inn : {error : errorString, enabled : true}, out : true};
                window.openDialog("chrome://geode-held/content/errordialog.xul", 
			"errorwindow", "chrome, modal, dialog, resizable=no", params).focus();
                if (params.out) {
                        var em = Cc["@mozilla.org/extensions/manager;1"]
					.getService(Components.interfaces.nsIExtensionManager);
			em.enableItem("{000a9d1c-beef-4f90-9363-039d445309b8}");
			
                } else {
                        window.close();
                }
        },
}


window.addEventListener("load", function() {GeoLocThingie.init();}, false);
window.addEventListener("load", function() {GearsVerifier.verify();}, false);


