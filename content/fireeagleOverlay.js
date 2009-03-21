/* ***** BEGIN LICENSE BLOCK *****
 *   Version: MPL 1.1/GPL 2.0/LGPL 2.1
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
 * The Original Code is Fire Eagle for Firefox.
 *
 * The Initial Developer of the Original Code is
 * Kevin M Ryan.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * Seth Fitzsimmons
 * Tom Coates
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

FireEagle.Updater = {
	debug : true,
	Components : null,
	Cc : this.Components.classes,
	Ci : this.Components.interfaces,
	fireeagle : null,
	json : null,
	prefBranch : this.Cc["@mozilla.org/preferences-service;1"].getService(this.Ci.nsIPrefService).getBranch("extensions.geode-held."),
	dialogLaunchTime : 1200,
		
	init : function () {
		FireEagle.Updater.prefBranch.QueryInterface(FireEagle.Updater.Ci.nsIPrefBranch2);
		FireEagle.Updater.fireeagle = new FireEagle(FireEagle.Updater.prefBranch.getCharPref("oauth.consumer_key"), 
																							 FireEagle.Updater.prefBranch.getCharPref("oauth.consumer_secret"), 
																							 FireEagle.Updater.prefBranch.getCharPref("oauth.access_token"), 
																							 FireEagle.Updater.prefBranch.getCharPref("oauth.access_secret"));
		FireEagle.Updater.json = FireEagle.Updater.Cc["@mozilla.org/dom/json;1"].createInstance(FireEagle.Updater.Ci.nsIJSON);
		FireEagle.Updater.prefBranch.addObserver("", this, false);
		
		// Install the toolbar icon by default and turn both the statusbar and toolbar icons on (show)
		try {
			var firefoxnav = document.getElementById("nav-bar");
			var curSet = firefoxnav.currentSet;
			if (curSet.indexOf("fireeagleaddonfirefoxToolbarButton") === -1) {
				var set;
				// Place the button before the urlbar
				if (curSet.indexOf("urlbar-container") !== -1) {
					set = curSet.replace(/urlbar-container/, "fireeagleaddonfirefoxToolbarButton,urlbar-container");
				} else { // at the end
					set = curSet + ",fireeagleaddonfirefoxToolbarButton";
				}

				firefoxnav.setAttribute("currentset", set);
				firefoxnav.currentSet = set;
				document.persist("nav-bar", "currentset");
				// If you don't do the following call, funny things happen
				try {
					BrowserToolboxCustomizeDone(true);
				} catch (error) { }
			}
		} catch (e) { }
	 
		document.getElementById('fireeagle-icon-button').style.display = 'block';
		document.getElementById('fireeagleaddonfirefoxToolbarButton').style.display = 'block';
		
		FireEagle.Updater.queryFireEagle();
	},
	
	setUp : function () {
		fireeagleaddonfirefox.initialized = true;
		fireeagleaddonfirefox.strings = document.getElementById("fireeagleaddonfirefox-strings");
	},
	
	/*
	 * _execInSandbox
	 */
	_execInSandbox : function(someCode) {
	  GeoLocThingie._injectNavigatorGeolocator(content.window);
		var sandbox = new Components.utils.Sandbox(content.window);
    sandbox.__proto__ = content.window.wrappedJSObject;
		Components.utils.evalInSandbox(
			someCode,
			sandbox);
	},

	onMenuItemCommand : function (e) {
    FireEagle.Updater.query();
	},

	query : function() {
	  this.log("This doesn't actually work.  Feel free to implement.");
    // var scriptToRun = "window.navigator.geolocation.getCurrentLocation( function(loc) {} );";
    // this._execInSandbox(scriptToRun);
	},
	
	onToolbarButtonCommand : function (e) {
		FireEagle.Updater.onMenuItemCommand(e);
	},
	
	manageErrorIcon : function (action) {
		var icon = document.getElementById('fireeagle-icon-button');
		if (action === 'error') {
			icon.setAttribute("error", true);
		} else {		
			icon.removeAttribute("error");	
		}
	},
	
	queryFireEagleInterval : function () {
		window.setTimeout(FireEagle.Updater.queryFireEagle, 5000);
	},
	
	queryFireEagle : function (xmlRequest) {	
		FireEagle.Updater.startProgressBar();
		var url = FireEagle.Updater.fireeagle.getUserUrl(FireEagle.RESPONSE_FORMAT.json); 
		FireEagle.Updater.makeXMLHttpRequest(url, FireEagle.Updater.handleQueryResponse); // ? null : FireEagle.Updater.stopProgressBar()
	},

	handleQueryResponse : function (xmlRequest) {
		var toolbarBtnEnable = document.getElementById("fireeagleaddonfirefoxToolbarButton").setAttribute("disabled", false);
		var statusbarBtnEnable = document.getElementById("fireeagle-icon-button").setAttribute("disabled", false);
		FireEagle.Updater.stopProgressBar();		
		var obj = FireEagle.Updater.json.decode(xmlRequest.responseText);
		FireEagle.Updater.updateLabel(obj.user.location_hierarchy[0].name, "feMenuLocationInfo");
		FireEagle.Updater.updateTooltip("Last location known by Fire Eagle: " + "\n" + obj.user.location_hierarchy[0].name, "fireeagle-icon-button");
		FireEagle.Updater.updateTooltip("Last location known by Fire Eagle: " + "\n" + obj.user.location_hierarchy[0].name, "fireeagleaddonfirefoxToolbarButton");
	},

	updateFireEagle : function (position) {		
		var url = FireEagle.Updater.fireeagle.getUpdateUrl({lat: position.latitude, lon: position.longitude}, FireEagle.RESPONSE_FORMAT.json);
		FireEagle.Updater.makeXMLHttpRequest(url[0], FireEagle.Updater.queryFireEagleInterval, url[1], "application/x-www-form-urlencoded");
	},
	
	log : function (message) {
		if (FireEagle.Updater.debug === true) {
			dump("FireEagle:" + message);
		}
	},
	
	updateTooltip : function (value, status_id) {
		var statusItem = document.getElementById(status_id);
		var tooltip = statusItem.attributes.tooltiptext;
		tooltip.value = value;
	},
	
	updateLabel : function (value, label_id) {
		var menuItem = document.getElementById(label_id);
		var labelText = menuItem.attributes.label;
		labelText.value = value;
	},
	
	makeXMLHttpRequest : function (url, callback, data, type) {
		var method = (data) ? "POST" : "GET";
		var postData = (data) ? data : null;
		var content_type = (type) ? type : null;
		var xmlRequest = new XMLHttpRequest();
		xmlRequest.onload = function () {
			callback(xmlRequest);
		};
		xmlRequest.mozBackgroundRequest = true;
		xmlRequest.open(method, url);
		xmlRequest.setRequestHeader("Cache-Control", "no-cache");
		xmlRequest.setRequestHeader("Content-Type", content_type);
		xmlRequest.send(postData);
	},
	
	startProgressBar : function () {
		document.getElementById("fireeagle-icon-button").setAttribute("progress", true);
	},
	
	stopProgressBar : function () {
		document.getElementById("fireeagle-icon-button").removeAttribute("progress");
	},
	
	openThisUrl : function (value) {
		FireEagle.Updater.openAndReuseOneTabPerAttribute("fireeagleupdatertab", "felink", value);
	},
	
	urlDetection_init : function () {
		var appcontent = document.getElementById("appcontent");
		if (appcontent) {
			appcontent.addEventListener("DOMContentLoaded", FireEagle.Updater.urlDetection_onPageLoad, true);
		}
	},
	
	urlDetection_onPageLoad : function (aEvent) {
		var doc = aEvent.originalTarget;
		var url = doc.location.href;
		var pattern = doc.location.href.indexOf("authorize") + 9;
		if (pattern === url.length) {
			FireEagle.Updater.openAndReuseOneTabPerAttribute("fireeagleupdater", "step1", "chrome://geode-held/content/install.html");
			FireEagle.Updater.getAccess();
		}
	},

	xulInstallDialog : function (installString, callback) {
		var params = {inn : {install : installString, enabled : true}, out : null};       
		window.openDialog("chrome://geode-held/content/installdialog.xul", "installwindow", "chrome, modal, dialog, resizable=no", params).focus();
		if (params.out) {
			callback(callback);
		} else {
			FireEagle.Updater.stopProgressBar();
		}
	},
	
	openAndReuseOneTabPerAttribute : function (attrName, attrValue, url) {
		var wm = FireEagle.Updater.Cc["@mozilla.org/appshell/window-mediator;1"].getService(FireEagle.Updater.Ci.nsIWindowMediator);
		for (var found = false, index = 0, tabbrowser = wm.getEnumerator('navigator:browser').getNext().getBrowser(); index < tabbrowser.mTabs.length && !found; index++) {
			var currentTab = tabbrowser.mTabs[index];
			if (currentTab.hasAttribute(attrName)) {
				tabbrowser.selectedTab = currentTab;
				tabbrowser.selectedTab.setAttribute(attrName, attrValue);
				openUILink(url, tabbrowser, false, true);
				tabbrowser.focus();
				found = true;
			}
		}
		
		if (!found) {
			var browserEnumerator = wm.getEnumerator("navigator:browser");
			tabbrowser = browserEnumerator.getNext().getBrowser();
			var newTab = tabbrowser.addTab(url);
			newTab.setAttribute(attrName, attrValue);
			tabbrowser.selectedTab = newTab;
			tabbrowser.focus();
		}
	},
	
	firstRun : function () {
		FireEagle.Updater.prefBranch.QueryInterface(FireEagle.Updater.Ci.nsIPrefBranch2);
		var firstrun = true;
		try {
			firstrun = FireEagle.Updater.prefBranch.getBoolPref("first-run");
		} catch (e) {
			FireEagle.Updater.log("FirstRun Failed!: " + e);
		} finally {
			if (firstrun) {
				setTimeout('FireEagle.Updater.xulInstallDialog("We need to take you over to Fire Eagle now so we can authorize this Add-on to update your location.", FireEagle.Updater.startTokenRequest)', FireEagle.Updater.dialogLaunchTime);
				FireEagle.Updater.urlDetection_init();
			}
			
			if (!firstrun) {
				window.addEventListener("load", 
					function (e) { 
						FireEagle.Updater.setUp(e); 
					}, false);
				FireEagle.Updater.init();
			}
		}
	},

	startTokenRequest : function () {
		FireEagle.Updater.fireeagle = new FireEagle(FireEagle.Updater.prefBranch.getCharPref("oauth.consumer_key"), FireEagle.Updater.prefBranch.getCharPref("oauth.consumer_secret"));
		FireEagle.Updater.fireeagle.setSSL(true);
		var requestTokenUrl = FireEagle.Updater.fireeagle.getRequestTokenUrl();
		FireEagle.Updater.makeXMLHttpRequest(requestTokenUrl, FireEagle.Updater.getAuthorization);
	},
	
	getAuthorization : function (xmlRequest) {
		if (xmlRequest.status === 200) {
			FireEagle.Updater.fireeagle.parseTokens(xmlRequest.responseText, true);
			FireEagle.Updater.openAndReuseOneTabPerAttribute("fireeagleupdater", "step1", FireEagle.Updater.fireeagle.getAuthorizeUrl());
		}	else {
			FireEagle.Updater.log("Request token request failed: " + xmlRequest.responseText);
		}
	},
	
	getAccess : function (event) {
		var url = FireEagle.Updater.fireeagle.getAccessUrl();
		FireEagle.Updater.makeXMLHttpRequest(url, FireEagle.Updater.finishAuthorization);
	},

	finishAuthorization : function (xmlRequest) {
		if (xmlRequest.status === 200) {
			FireEagle.Updater.fireeagle.parseTokens(xmlRequest.responseText, true);
			FireEagle.Updater.prefBranch.setCharPref("oauth.access_token", FireEagle.Updater.fireeagle.oauthToken);
			FireEagle.Updater.prefBranch.setCharPref("oauth.access_secret", FireEagle.Updater.fireeagle.oauthTokenSecret);
			FireEagle.Updater.prefBranch.setBoolPref("first-run", false);
			window.addEventListener("load",
				function (e) {
					FireEagle.Updater.setUp(e);
				}, false);
			FireEagle.Updater.init();	
		} else {
			FireEagle.Updater.log("finishAuthorization response failed: " + xmlRequest.responseText);
		}
	}
	
};
window.addEventListener("load", FireEagle.Updater.firstRun, false);