/* ============================================================
   moveNotifButtons — đưa #Btn_BulkAction + #nba-menu lên parent dialog
   Paste vào: TC page → Execute when Page Loads
   ============================================================ */

function moveNotifButtons() {
  var $parent   = $(window.parent.document);
  var $dialog   = $parent.find('.ui-dialog').filter(':visible').first();
  var $closeBtn = $dialog.find('.ui-dialog-titlebar-close');

  if (!$closeBtn.length || $dialog.data('notif-btns-moved')) return;

  var $btn  = $('#Btn_BulkAction').detach();
  var $menu = $('#nba-menu').detach();

  if (!$btn.length) return;

  // Đưa button vào title bar
  $('<span>')
    .css({
      display       : 'inline-flex',
      alignItems    : 'center',
      gap           : '4px',
      marginRight   : '-8px',
      verticalAlign : 'middle',
    })
    .append($btn)
    .insertBefore($closeBtn);

  // Đưa menu sang parent.document.body để position:fixed tính đúng viewport
  if ($menu.length) {
    window.parent.document.body.appendChild($menu[0]);
  }

  $dialog.data('notif-btns-moved', true);
}

$(document).ready(function () {
  moveNotifButtons();
});
