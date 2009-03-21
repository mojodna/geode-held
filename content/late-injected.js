window.addEventListener("load", function() {
	if (typeof GearsFactory == 'undefined') 
		throw "No GearsFactory class available";
	
	var factory = new GearsFactory();
	
	if (!factory)
		throw "Unable to create GearsFactory";

	var gearsGeo = factory.wrappedJSObject.create('beta.geolocation');

	window.navigator.wrappedJSObject._gearsGeo = gearsGeo;

	// This is needed to re-do navigator.geolocation._gearsInit() if it 
	// has already run, e.g., because of an onLoad script
	var event = window.document.createEvent("Events");
	event.initEvent("x-geode-gears-cached", false, false);
	window.dispatchEvent(event);

}, true);
