/*
 * $Id: RequestLocationPrompt.js 737 2007-05-27 16:48:56Z joel $
 *
 * Copyright (C) 2005-2007 Skyhook Wireless, Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted subject to the following:
 *
 * * Use and redistribution is subject to the Software License and Development
 * Agreement, available at
 * <a href="http://www.skyhookwireless.com">www.skyhookwireless.com</a>
 *
 * * Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following disclaimer in the documentation
 * and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

if (Loki == undefined)
{
    Loki = new Object();
}

if (Loki.RequestLocationPrompt == undefined)
{
    Loki.RequestLocationPrompt = new Object();
}

Loki.RequestLocationPrompt.parameters = window.arguments[0].QueryInterface(Components.interfaces.wpsIPrivacyPromptParameters);

Loki.RequestLocationPrompt.init = function()
{
    var domain = document.getElementById("textDomain");
 
    var params = Loki.RequestLocationPrompt.parameters;
    domain.value = params.domain;
    if (params.domain == undefined || params.domain == "")
    {
        domain.value = "local";
    }
    
    var information = document.getElementById("textInformation");
    switch (params.lookupType)
    {
        case params.NOOP:
            information.value = "THIS SHOULD NEVER HAPPEN";
            break;
        case params.EXACT:
            information.value = "Exact location";
            break;
        case params.STREET:
            information.value = "Street address";
            break;
        case params.ZIP:
            information.value = "ZIP code"
            break;
        default:
            information.value = "THIS SHOULD NEVER HAPPEN.";
    }
            
}

Loki.RequestLocationPrompt.close = function()
{
    var params = Loki.RequestLocationPrompt.parameters;
    params.promptChoice = params.DENY;
}

Loki.RequestLocationPrompt.allow = function()
{
    var params = Loki.RequestLocationPrompt.parameters;
    params.promptChoice = params.ALLOW;

    var checkbox = document.getElementById("checkboxRemember");
    if (checkbox.checked)
    {
        params.promptChoice = params.ALLOW_ALWAYS;
    }
        
    window.close();
}

Loki.RequestLocationPrompt.deny = function()
{
    var params = Loki.RequestLocationPrompt.parameters;
    params.promptChoice = params.DENY;

    var checkbox = document.getElementById("checkboxRemember");
    if (checkbox.checked)
    {
        params.promptChoice = params.DENY_ALWAYS;
    }
        
    window.close();
}

Loki.RequestLocationPrompt.manageSites = function()
{
    window.openDialog("chrome://geode-held/content/securityDialog/ManageSites.xul","dialog-site-allow-id","modal");
}

