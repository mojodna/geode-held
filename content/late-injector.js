// Adapted / minimized from the GreaseMonkey Compiler
// http://arantius.com/misc/greasemonkey/script-compiler

var lateInjector={

getUrlContents: function(aUrl){
	var	ioService=Components.classes["@mozilla.org/network/io-service;1"]
		.getService(Components.interfaces.nsIIOService);
	var	scriptableStream=Components
		.classes["@mozilla.org/scriptableinputstream;1"]
		.getService(Components.interfaces.nsIScriptableInputStream);
	var unicodeConverter=Components
		.classes["@mozilla.org/intl/scriptableunicodeconverter"]
		.createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
	unicodeConverter.charset="UTF-8";

	var	channel=ioService.newChannel(aUrl, null, null);
	var	input=channel.open();
	scriptableStream.init(input);
	var	str=scriptableStream.read(input.available());
	scriptableStream.close();
	input.close();

	try {
		return unicodeConverter.ConvertToUnicode(str);
	} catch (e) {
		return str;
	}
},

contentLoad: function(e) {
	var unsafeContentWin=e.target.defaultView;
	if (unsafeContentWin.wrappedJSObject) unsafeContentWin=unsafeContentWin.wrappedJSObject;

	var unsafeLoc=new XPCNativeWrapper(unsafeContentWin, "location").location;
	var url=new XPCNativeWrapper(unsafeLoc, "href").href;

	var script=lateInjector.getUrlContents(
		'chrome://geode-held/content/late-injected.js');

	// begin injectScript
	var sandbox, script;
	var safeWin=new XPCNativeWrapper(unsafeContentWin);

	sandbox=new Components.utils.Sandbox(safeWin);
	sandbox.window=safeWin;
	sandbox.document=sandbox.window.document;
	sandbox.unsafeWindow=unsafeContentWin;

	// patch missing properties on xpcnw
	sandbox.XPathResult=Components.interfaces.nsIDOMXPathResult;

	sandbox.__proto__=sandbox.window;

	Components.utils.evalInSandbox(script, sandbox);
},
 
onLoad: function() {
	var	appcontent=window.document.getElementById("appcontent");
	if (appcontent && !appcontent.already_injected) {
		appcontent.already_injected = true;
		appcontent.addEventListener("DOMContentLoaded", 
			lateInjector.contentLoad, false);
	}
},

}; //object lateInjector 


window.navigator._gearsGeo = "something";
window.addEventListener('load', lateInjector.onLoad, true);
