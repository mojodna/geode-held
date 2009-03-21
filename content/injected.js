window.navigator.geolocation = {
	/* ----- nsIDOMGeolocation ----- */

	getCurrentPosition : function(successCallback, errorCallback, options) {
		if (!this._started) this._start();
		if (!this._subscribed) this._subscribe();

		if (!successCallback)
		    throw "successCallback argument is required";
		// "options" is ignored
		var ID = this._geoGetterSerial++;
		this._geoGetters[ID] = [successCallback, errorCallback];
	},

	watchPosition : function(successCallback, errorCallback, options) {
		if (!this._started) this._start();
		if (!this._subscribed) this._subscribe();

		if (!successCallback)
			throw "successCallback argument is required";

		// "options" is ignored

		var ID = this._geoWatcherSerial++;
		this._geoWatchers[ID] = [successCallback, errorCallback];

		return ID;
	},

	clearWatch : function(aID) {
		if (!(aID in this._geoWatchers))
			throw "invalid ID";
		delete this._geoWatchers[aID];
		this._unsubscribeIfEmpty();
	},


	/* ----- Private functions and variables ----- */

	/* Start up and track started state */
	_started : false, 
	_subscribed : false,
	_start : function() {
		// Start up gears
		this._gearsInit();
		// Subscribe to geode-held
		this._subscribe();
		// Remember that we've started
		this._started = true;
	},
	_subscribe : function() {
		if (this._subscribed) return;
		// Subscribe window to geode-held
		var event = document.createEvent("Events");
		event.initEvent("x-geode-locationRequest", true, true);
		window.dispatchEvent(event);
		this._subscribed = true;
	},
	_unsubscribe : function() {
		// Cut this off; it works, but causes excessive privacy notifications
		return;

		// BEGIN real function body
		if (!this._subscribed) return;
		// Cancel our subscription to geode-held (if one existed)
		var event = document.createEvent("Events");
		event.initEvent("x-geode-locationRequestCancel", true, true);
		window.dispatchEvent(event);
		this._subscribed = false;
	},
	_unsubscribeIfEmpty : function() {
		var empty = true;
		for (getter in this._geoGetters) empty = false;
		for (watcher in this._geoWatchers) empty = false;
		if (empty) this._unsubscribe();
	},

	/* Subscription tracking */
	_lastPosition: null,	// Cache the last position we got (just in case)
	_geoGetters: {},	// List of one-off subscribers
	_geoGetterSerial: 0,
	_geoWatchers: {},	// List of long-term subscribers
	_geoWatcherSerial: 0,
	
	/* Called from geode-held when location is available */
	_notifyWatchers: function(aPosition) {
		var callbacks;
		
		// Cache this position
		this._lastPosition = aPosition;

		// Find and invoke geoGetter callbacks
		for each (callbacks in this._geoGetters) {
			// Always invoke successCallback 
			// (geode doesn't notify in error cases)
			try { 
			if (typeof callbacks[0] == 'object') {
				callbacks[0].handleEvent(aPosition); 
			} else { 
				callbacks[0](aPosition); 
			}
			}
			catch (e) {}
		}
		// Clear out the list of geoGetters
		this._geoGetters = {};
		this._geoGetterSerial = 0;

		// Find and invoke geoWatcher callbacks
		for each (callbacks in this._geoWatchers) {
			// Always invoke successCallback 
			// (geode doesn't notify in error cases)
			try { 
			if (typeof callbacks[0] == 'object') {
				callbacks[0].handleEvent(aPosition); 
			} else { 
				callbacks[0](aPosition); 
			}
			}
			catch (e) {}
		}

		// Check to see if we still need to subscribe, given that
		// we just cleared out all our geoGetters
		this._unsubscribeIfEmpty();
	},

	/* Bring up google gears, if it's not running already */
	/* Adapted from <http://github.com/mojodna/fireeagle-location-provider/tree> */
	_gearsGeo: null, // The Gears Geolocation object we'll use to get measurements
	_gearsInit : function() {
		var _geode = this; // Cache for closures

		// Assume that our overlay code has cached a Gears Geo object
		// window.navigator._gearsGeoHandle
		if (!window.navigator._gearsGeo) {
			// Do over once someone has put the cache in place 
			window.addEventListener("x-geode-gears-cached", function(){_geode._gearsInit();} , true);
			return;
		}

		this._gearsGeo = window.navigator._gearsGeo;
		var nop = function() {};
		this._gearsGeo.watchPosition(nop, nop, {
			enableHighAccuracy: true,
			gearsRequestAddress: true,
			gearsLocationProviderUrls: ["http://localhost:8080"]
			});
	},
};

