/**
 * openTabs
 * @description the original tab stats, forked from i-a-n's tabnarok
 * @author https://github.com/i-a-n/tabnarok
 */
const rightNow = Date.now() / 1000;
chrome.storage.local.set({ openTabs: { loadedOn: rightNow } });

chrome.tabs.onCreated.addListener(function(tab) {
  chrome.storage.local.get('openTabs', function(data) {
    const retrievedObject = data.openTabs || {};
    retrievedObject[tab.id] = { createdOn: Date.now() / 1000 };
    chrome.storage.local.set({ openTabs: retrievedObject });
  });
});

/**
 * tab extracting
 * @description extract all tabs from a particular url into their own window
 */
let shuffle = false;
const moveDelay = 10;  // milliseconds

function trimPrefix(s, prefix) {
  if (s.startsWith(prefix)) {
    return s.slice(prefix.length);
  }
  return s;
}

function lexHost(url) {
  const u = new URL(url);
  let parts = u.host.split('.');
  parts.reverse();
  if (parts.length > 1) {
    parts = parts.slice(1);
  }
  return parts.join('.');
}

function lexScheme(url) {
  const u = new URL(url);
  switch (u.protocol) {
    case 'http:':
    case 'https:':
      return 'http:';
    case 'chrome:':
    case 'file:':
      return '~' + u.protocol;
  }
  return u.protocol;
}

function lexTab(tab) {
  const pieces = [];
  if (shuffle) {
    pieces.push(Math.random());
  }
  if (tab.pinned) {
    pieces.push('pin:0(yes):' + tab.index);
  } else {
    pieces.push('pin:1(no)');
  }
  pieces.push(lexScheme(tab.url));
  pieces.push(lexHost(tab.url));
  pieces.push(tab.title.toLowerCase());
  return pieces.join(' ! ');
}

// Manifest V3: chrome.tabs.getSelected is deprecated, use chrome.tabs.query
function extractDomain() {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (!tabs.length) return;
    const tab = tabs[0];
    const target = lexHost(tab.url);

    chrome.windows.create({ tabId: tab.id, focused: true }, function(win) {
      chrome.tabs.query({ windowType: 'normal' }, function(allTabs) {
        for (const t of allTabs) {
          if (lexHost(t.url) !== target || t.id === tab.id) continue;
          chrome.tabs.move(t.id, { windowId: win.id, index: -1 });
        }
        setTimeout(() => {
          chrome.windows.get(win.id, { populate: true }, sortWindow);
        }, moveDelay);
      });
    });
  });
}

function logWindow(windowId) {
  chrome.tabs.query({ windowId }, function(tabs) {
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
  const tab = tabs[i];
  if (tab.pinned) {
    console.log('Pinned', tab.id, 'at', tab.index, 'to', i, lexTab(tab));
    setTimeout(() => moveNextTab(win, tabs, i + 1, inserted), 0);
    return;
  }
  if (i === tab.index + inserted) {
    console.log('No action for', tab.id, 'at', tab.index, '+', inserted, lexTab(tab));
    setTimeout(() => moveNextTab(win, tabs, i + 1, inserted), 0);
    return;
  }
  console.log('Moving', tab.id, 'from', tab.index, 'to', i, lexTab(tab));
  chrome.tabs.move(tab.id, { index: i }, function() {
    setTimeout(() => moveNextTab(win, tabs, i + 1, inserted + 1), moveDelay);
  });
}

function extractMode(mode) {
  extractDomain();
}

/**
 * tab merging
 * @description merge all tabs from all windows into a single window
 */
let targetWindow = null;
let tabCount = 0;

function start(tab) {
  chrome.windows.getCurrent(getWindows);
}

function getWindows(win) {
  targetWindow = win;
  chrome.tabs.query({ windowId: targetWindow.id }, getTabs);
}

function getTabs(tabs) {
  tabCount = tabs.length;
  chrome.windows.getAll({ populate: true }, moveTabs);
}

function moveTabs(windows) {
  const targetWindow = windows.find(window => window.focused === true);
  let tabPosition = tabCount;

  for (const win of windows) {
    if (targetWindow.id !== win.id) {
      for (const tab of win.tabs) {
        chrome.tabs.move(tab.id, { windowId: targetWindow.id, index: tabPosition });
        tabPosition++;
        if (tab.pinned) {
          chrome.tabs.update(tab.id, { pinned: true });
        }
      }
    }
  }
}

// Manifest V3: Use chrome.action.onClicked instead of chrome.browserAction.onClicked
chrome.action.onClicked.addListener(start);

function mergeMode(mode) {
  start();
}

/**
 * tab sorting
 * @description group tabs by url, and sort alphabetically
 */
function sortWindow(win) {
  const tabs = win.tabs;
  tabs.forEach(function(tab, i) {
    console.log(i, lexTab(tab));
  });
  tabs.sort(function(a, b) {
    return lexTab(a).localeCompare(lexTab(b));
  });
  setTimeout(() => moveNextTab(win, tabs, 0, 0), 0);
}

function sortMode(mode) {
  chrome.windows.getAll({ windowTypes: ['normal'], populate: true }, function(windows) {
    windows.forEach(sortWindow);
  });
}

/**
 * handleMessage
 * @description handles an incoming message from the app, and performs the appropriate action
 */
function handleMessage(message, sender, respond) {
  const action = message.action;
  const args = message.args;

  console.log(action, '(', args, ')');
  switch (action) {
    case 'extract':
      extractMode.apply(null, args);
      break;
    case 'merge':
      mergeMode.apply(null, args);
      break;
    case 'sort':
      sortMode.apply(null, args);
      break;
    default:
      console.log('Unhandled message:', message);
      break;
  }
  respond({});
}

chrome.runtime.onMessage.addListener(handleMessage);
