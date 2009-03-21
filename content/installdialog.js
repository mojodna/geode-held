function onLoad() {
	document.getElementById("install").textContent = window.arguments[0].inn.install;
}

function onOK() {
	if (window.arguments[0].inn.install) {
		window.arguments[0].out = true;
	} else {
		window.close();
	}
	return true;
}
