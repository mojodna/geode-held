/*
 * $Id: ManageSites.js 763 2007-06-01 19:44:20Z joel $
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

if (Loki.ManageSites == undefined)
{
    Loki.ManageSites = new Object();
}

Loki.ManageSites.lookupTypes = { ZIP: Components.interfaces.wpsIPrivacyPromptParameters.ZIP,
                                 STREET: Components.interfaces.wpsIPrivacyPromptParameters.STREET,
                                 EXACT: Components.interfaces.wpsIPrivacyPromptParameters.EXACT };
                                
Loki.ManageSites.branches = ["allow", "deny"];
Loki.ManageSites.rootPermissionPreference = "loki.permissions.";

Loki.ManageSites.permissionToString = function(permission)
{   
    var lookupTypes = Loki.ManageSites.lookupTypes;
    switch (permission)
    {
        case lookupTypes.ZIP:
            return "Postal code";
        case lookupTypes.STREET:
            return "Street address";
        case lookupTypes.EXACT:
            return "Exact location";
        default:
            throw "Loki.ManageSites.permissionToString: invalid permission parameter," +
                  "value was " + permission;
    }
}
        
Loki.ManageSites.init = function ()
{
    Loki.ManageSites.displayTree();
    Loki.ManageSites.selectItem();
}

Loki.ManageSites.getPermissions = function()
{
    var permissions = new Object();

    var preferenceService = Components.classes["@mozilla.org/preferences-service;1"]
                                      .getService()
                                      .QueryInterface(Components.interfaces.nsIPrefService);

    var branches = Loki.ManageSites.branches;
    for (var i in branches)
    {
        var branchName = branches[i];
        var preferenceBranch = preferenceService.getBranch(Loki.ManageSites.rootPermissionPreference + branchName + ".");
        var count = {value:0};
        var preferenceArray = preferenceBranch.getChildList("", count);

        for (var x in preferenceArray)
        {
            var domain = preferenceArray[x];
            
            var permissionCode = Loki.ManageSites.lookupTypes.NOOP;
            try
            {
                //this throws if there is no preference value  
                permissionCode = preferenceBranch.getIntPref(domain);
            }
            catch (exception){}
                
            if (permissionCode == Loki.ManageSites.lookupTypes.NOOP)
            {
                //this is a permission that has been reset, skip it
                continue;
            }
            var permissionString = Loki.ManageSites.permissionToString(permissionCode);

            if (permissions[domain] == undefined)
            {
                permissions[domain] = new Object();
            }            
            permissions[domain][branchName] = new Object();
            permissions[domain][branchName].code = permissionCode;
            permissions[domain][branchName].string = permissionString;
        }
    }
    return permissions;   
}

Loki.ManageSites.resetPermission = function(domain)
{
    var preferenceService = Components.classes["@mozilla.org/preferences-service;1"]
                                      .getService()
                                      .QueryInterface(Components.interfaces.nsIPrefService);

    var branches = Loki.ManageSites.branches;
    for (var i in branches)
    {
        var branchName = branches[i];
        var preferenceBranch = preferenceService.getBranch(Loki.ManageSites.rootPermissionPreference + branchName + ".");
        if (preferenceBranch == null || preferenceBranch == undefined)
        {
            continue;
        }
        try 
        {
            //this throws if the pref doesn't exist
            //so we just eat any exception
            preferenceBranch.clearUserPref(domain);
        }
        catch (exception){}            
    }
}

//Display the list (tree) of sites with stored permissions.
Loki.ManageSites.displayTree = function()
{
    Loki.ManageSites.clearSiteList();

    var treeChildren = document.getElementById("siteListTreeChildren");

    var permissions = Loki.ManageSites.getPermissions();

    for (var x in permissions)
    {    
        var treeItem = document.createElement("treeitem");
        var treeRow = document.createElement("treerow");
        var domainCell = document.createElement("treecell");
        var allowCell = document.createElement("treecell");
        var denyCell = document.createElement("treecell");

        domainCell.setAttribute("label", x);
        if (permissions[x].allow != undefined)
        {
            allowCell.setAttribute("label", permissions[x].allow.string);
        }
        if (permissions[x].deny != undefined)
        {
            denyCell.setAttribute("label", permissions[x].deny.string);
        }
        
        treeRow.appendChild(domainCell);
        treeRow.appendChild(allowCell);
        treeRow.appendChild(denyCell);
        
        treeItem.appendChild(treeRow);
        treeChildren.appendChild(treeItem);
    }
}

Loki.ManageSites.clearSiteList = function (index)
{
    var tree = document.getElementById("siteListTreeChildren");

    var list = tree.getElementsByTagName("treeitem");  
    if( list == null ) return;
    
    //clearSiteList() may or may not be called with an index
    //param. If it is, we intend only to remove one index.
    if (arguments.length == 1)
    {
        tree.removeChild(list[index]);
        return;
    }
    
    //this is some weird code below, but it works
    while(list.length > 0)
    {
        tree.removeChild( list[0] );
    }
}

Loki.ManageSites.selectItem = function()
{
    var tree = document.getElementById("siteListTree");
    document.getElementById("buttonRemoveAllSites").disabled = (tree.view.rowCount <= 0);
    document.getElementById("buttonRemoveSite").disabled = (tree.currentIndex == -1);
    
    if(tree.currentIndex == -1)
    {
        Loki.ManageSites.selectedDomain = undefined;
        Loki.ManageSites.selectedIndex = undefined;
        return;
    }

    var domain  = tree.view.getCellText(tree.currentIndex,tree.columns.getColumnAt(0));
    Loki.ManageSites.selectedDomain = domain;
    Loki.ManageSites.selectedIndex = tree.currentIndex;
}

Loki.ManageSites.removeItem = function()
{
    if (Loki.ManageSites.selectedIndex == undefined)
    {
        return;
    }
    Loki.ManageSites.resetPermission(Loki.ManageSites.selectedDomain);
    Loki.ManageSites.clearSiteList(Loki.ManageSites.selectedIndex);
    Loki.ManageSites.selectItem();
}

Loki.ManageSites.removeAllItems = function()
{
    var permissions = Loki.ManageSites.getPermissions();
    
    for (var domain in permissions)
    {
        Loki.ManageSites.resetPermission(domain);
    }
    Loki.ManageSites.displayTree();
    Loki.ManageSites.selectItem();
}

Loki.ManageSites.close = function()
{
    delete Loki.ManageSites;
    window.close();
}



