/**
 * openTabs
 * @description the original tab stats, forked from i-a-n's tabnarok
 * @author https://github.com/i-a-n/tabnarok
 */
var rightNow = new Date().getTime() / 1000;
localStorage.openTabs = JSON.stringify({ 'loadedOn': rightNow });

chrome.tabs.onCreated.addListener(function(tab) {
  var retrievedObject = JSON.parse( localStorage.getItem('openTabs') );
  retrievedObject[tab.id] = { "createdOn" : new Date().getTime() / 1000 };
  localStorage.setItem('openTabs', JSON.stringify(retrievedObject));
});





/**
 * tab extracting
 * @description extract all tabs from a particular url into their own window
 */
var shuffle = false;
var moveDelay = 10;  // milliseconds

// trimPrefix trims the given prefix from the given string.
function trimPrefix(s, prefix) {
  if (s.startsWith(prefix)) {
    return s.slice(prefix.length);
  }
  return s;
}

// lexHost returns a string for sorting hostnames lexicographically.
// The TLD is stripped and the host pieces are reversed.
function lexHost(url) {
  var u = new URL(url);
  var parts = u.host.split('.');
  parts.reverse();
  if (parts.length > 1) {
    parts = parts.slice(1);
  }
  return parts.join('.');
}

// lexScheme returns a string for sorting schemes lexicographically.
function lexScheme(url) {
  var u = new URL(url);
  switch (u.protocol) {
    // Sort HTTP together
    case 'http:':
    case 'https:':
      return 'http:';

    // Sort local things late
    case 'chrome:':
    case 'file:':
      return '~' + u.protocol;
  }
  return u.protocol;
}

// lexTab returns a string for sorting tabs lexicographically.
function lexTab(tab) {
  var pieces = [];

  if (shuffle) {
    pieces.push(Math.random());
  }

  // Pinning
  if (tab.pinned) {
    pieces.push('pin:0(yes):' + tab.index);
  } else {
    pieces.push('pin:1(no)');
  }

  // Scheme
  pieces.push(lexScheme(tab.url));

  // Host
  pieces.push(lexHost(tab.url));

  // Title
  pieces.push(tab.title.toLowerCase());

  return pieces.join(' ! ');
}

// extractDomain extracts all tabs with the active tab's domain into
// a new window and then sorts them.
function extractDomain() {
  chrome.tabs.getSelected(function(tab) {
    var target = lexHost(tab.url);

    // Create a window with the tab in it.
    var cq = {
      'tabId': tab.id,
      'focused': true,
    };
    chrome.windows.create(cq, function(win) {
      // Move all other windows with the same target into the window.
      var tq = {
        'windowType': 'normal',
      };
      chrome.tabs.query(tq, function(tabs) {
        for (const tab of tabs) {
          var host = lexHost(tab.url);
          if (host != target) {
            continue;
          }
          chrome.tabs.move(tab.id, {
            'windowId': win.id,
            'index': -1,
          });
        }

        // Sort the tabs in the new window.
        var wq = {
          'windowTypes': ['normal'],
          'populate': true,
        };
        window.setTimeout(
          chrome.windows.get, moveDelay, win.id, wq, sortWindow);
      });
    });
  });
}

function logWindow(windowId) {
  var q = {
    'windowId': windowId,
  };
  chrome.tabs.query(q, function(tabs) {
    console.log('Tabs (after reposition):');
    tabs.forEach(function(tab, i) {
      console.log(i, lexTab(tab));
    });
  });
}

function moveNextTab(win, tabs, i, inserted) {
  if (i >= tabs.length) {
    console.log('Finished sorting window', win.id, '; tabs are now:');
    logWindow(win.id);
    return;
  }

  var tab = tabs[i];
  if (tab.pinned) {
    console.log('Pinned', tab.id, 'at', tab.index, 'to', i, lexTab(tab));
    window.setTimeout(moveNextTab, 0, win, tabs, i + 1, inserted);
    return;
  }
  if (i == tab.index + inserted) {
    // Nothing to do
    console.log(
        'No action for', tab.id, 'at', tab.index, '+', inserted, lexTab(tab));
    window.setTimeout(moveNextTab, 0, win, tabs, i + 1, inserted);
    return;
  }

  console.log('Moving', tab.id, 'from', tab.index, 'to', i, lexTab(tab));
  chrome.tabs.move(tab.id, {'index': i}, function() {
    window.setTimeout(moveNextTab, moveDelay, win, tabs, i + 1, inserted + 1);
  });
}

function extractMode(mode) {
  extractDomain();
}





/**
 * tab merging
 * @description merge all tabs from all windows into a single window
 */
var targetWindow = null;
var tabCount = 0;

function start(tab) {
  chrome.windows.getCurrent(getWindows);
}

function getWindows(win) {
  targetWindow = win;
  chrome.tabs.getAllInWindow(targetWindow.id, getTabs);
}

function getTabs(tabs) {
  tabCount = tabs.length;
  // We require all the tab information to be populated.
  chrome.windows.getAll({"populate" : true}, moveTabs);
}

function moveTabs(windows) {
  var [targetWindow] = windows.filter(window => window.focused === true);

  var numWindows = windows.length;
  var tabPosition = tabCount;

  for (var i = 0; i < numWindows; i++) {
    var win = windows[i];

    if (targetWindow.id != win.id) {
      var numTabs = win.tabs.length;

      for (var j = 0; j < numTabs; j++) {
        var tab = win.tabs[j];
        // Move the tab into the window that triggered the browser action.
        chrome.tabs.move(tab.id,
            {"windowId": targetWindow.id, "index": tabPosition});
        tabPosition++;
		// fix pinned tabs
		if(tab.pinned==true){chrome.tabs.update(tab.id, {"pinned":true});}
      }
    }
  }
}

// Set up a click handler so that we can merge all the windows.
chrome.browserAction.onClicked.addListener(start);

function mergeMode(mode) {
  start();
}





/**
 * tab sorting
 * @description group tabs by url, and sort alphabetically
 */
function sortWindow(win) {
  // Sort tabs within the window
  var tabs = win.tabs;
  tabs.forEach(function(tab, i) {
    console.log(i, lexTab(tab));
  });
  tabs.sort(function(a, b) {
    return lexTab(a).localeCompare(lexTab(b));
  });
  window.setTimeout(moveNextTab, 0, win, tabs, 0, 0);
}

function sortMode(mode) {
  var q = {
    'windowTypes': ['normal'],
    'populate': true,
  };
  chrome.windows.getAll(q, function(windows) {
    windows.forEach(sortWindow);
  });
}





/**
 * handleMessage
 * @description handles an incoming message from the app, and performs the appropriate action
 */
function handleMessage(message, sender, respond) {
  var action = message.action;
  var args = message.args;

  console.log(action, '(', args, ')');
  switch (action) {
    case 'extract':
      extractMode.apply(document, args);
      break;
    case 'merge':
      mergeMode.apply(document, args);
      break;
    case 'sort':
      sortMode.apply(document, args);
      break;
    default:
      console.log('Unhandled message:', message);
      break;
  }
  respond({});
}

chrome.runtime.onMessage.addListener(handleMessage);
