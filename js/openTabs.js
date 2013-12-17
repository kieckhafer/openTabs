chrome.tabs.query( {},
  function( tabArray ) {
    tabsNumber = tabArray.length;
    tabsPinned = 0;

    $.each( tabArray, function(i,v) {
        if( v.pinned === true ) {
            tabsPinned++;
        }
    });

    $("#tabs--number em").text( tabsNumber );
    $("#tabs--pinned em").text( tabsPinned );
  }
);

chrome.windows.getAll( function( windowArray ) {
  windowNumber = windowArray.length;

  $("#tabs--windows em").text( windowNumber );

  if( windowNumber > 1 ) {
      $("#tabs--windows").append("s");
  }
});
