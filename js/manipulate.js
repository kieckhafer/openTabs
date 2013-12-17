function setup($) {
  $('.action').click(function(ev) {
    var action = $(this).attr('id');
      chrome.runtime.sendMessage(
          {
            'action': action,
            'args': [action],
          },
          function() {
            window.close(); // manipulation complete, close popup
          },
      );
  });
}

jQuery(setup);
