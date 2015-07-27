var codemirror_instance;
var last_saved_generation;
var storage_key;

// {{{ messages

var msg_count = 0;
var active_msg_count = 0;

/* valid msg_type values:
 * - error
 * - warning
 * - cmd (feedback acknowledging a user command)
 * - progress (update on stuff that might take a while)
 * - llprogress (low-level progress update)
 * - event
 * - banner
 * - debug
 */

var shown_msg_types = [
  "banner",
  "error",
  "warning",
  "cmd",
  "progress",

  "state",
  "llprogress",
  "event",
  "debug"
  ];


function set_message(msg_type, what, timeout)
{
  if (shown_msg_types.indexOf(msg_type) == -1)
    return;

  ++msg_count;
  $("#message_box").append(
      '<div id="msg_' + msg_count + '" class="msg-' + msg_type + '">' + what + '</div>');
  var my_msg = $("#msg_"+msg_count);

  if (active_msg_count == 0)
  {
    $("#message_box").show("slow");
  }
  ++active_msg_count;

  if (timeout  == undefined)
    timeout = 5*1000;

  window.setTimeout(function()
      {
        my_msg.remove();
        --active_msg_count;
        if (active_msg_count == 0)
          $("#message_box").hide("slow");
      }, timeout)
}

function setup_messages()
{
  $("#initial_messages li").each(
    function()
    {
      set_message("warning", $(this).text());
    });
}

// }}}

// {{{ sub-editor

function run_subeditor(cm, initial_text, selection, success_callback)
{
  $("#subeditor").val(initial_text);

  cm.setOption("readOnly", "nocursor");

  $("#dimming_overlay").show();
  $("#editbox").show();
  $("#subeditor").focus();

  var textarea = $("#subeditor").get(0);

  if (selection != null)
  {
    textarea.setSelectionRange(selection.start, selection.end);
  }

  function save(evt)
  {
    success_callback(
        $("#subeditor").val(),
        {
          start: textarea.selectionStart,
          end: textarea.selectionEnd
        });
    close_subeditor();
  }

  function cancel(evt)
  {
    close_subeditor();
  }

  function handle_keydown(evt)
  {
    if (evt.keyCode == 13 && evt.ctrlKey && !evt.altKey)
    {
      evt.stopPropagation();
      $("#subeditor_save").click();
    }
    else if (evt.keyCode == 27 && !evt.ctrlKey && !evt.altKey)
    {
      evt.stopPropagation();
      $("#subeditor_cancel").click();
    }
  }

  $("#subeditor").on("keydown", handle_keydown);
  $("#subeditor_save").on("click", save);
  $("#subeditor_cancel").on("click", cancel);

  function close_subeditor()
  {
    $("#dimming_overlay").hide();
    $("#editbox").hide();

    cm.setOption("readOnly", false);
    cm.focus();

    $("#subeditor").off("keypress", handle_keydown);
    $("#subeditor_save").off("click", save);
    $("#subeditor_cancel").off("click", cancel);
  }
}

function run_subeditor_on_selection(cm)
{
  var initial_text;
  if (codemirror_instance.somethingSelected())
    initial_text = cm.getSelections().join("\n");
  else
    initial_text = "";

  run_subeditor(cm, initial_text, null,
      function(new_text)
      {
        cm.replaceSelection(new_text, "around");
      });
}

function run_subeditor_on_paragraph(cm)
{
  var cursor = cm.getCursor();

  var startline = cursor.line;
  while (startline >= 1 && cm.getLine(startline) == "")
    startline -= 1;

  var pstart = startline;
  while (pstart >= 1 && cm.getLine(pstart) != "")
    pstart -= 1;

  if (pstart < startline)
    pstart += 1;

  var nlines = cm.lineCount();

  var pend = startline;
  while (pend < nlines - 1 && cm.getLine(pend) != "")
    pend += 1;

  var sel_start;
  var sel_end;

  if (codemirror_instance.somethingSelected())
  {
    var sels = codemirror_instance.listSelections();
    sel_start = sels[0].anchor;
    sel_end = sels[0].head;
  }
  else
  {
    sel_start = cursor;
    sel_end = cursor;
  }

  var initial_text = "";
  var line_nr = pstart;
  var sel_start_idx = 0;
  var sel_end_idx = 0;

  cm.eachLine(pstart, pend,
      function (linehdl)
      {
        initial_text += linehdl.text + "\n";

        if (line_nr < sel_start.line)
          sel_start_idx += linehdl.text.length + 1;
        else if (line_nr == sel_start.line)
          sel_start_idx += sel_start.ch;

        if (line_nr < sel_end.line)
          sel_end_idx += linehdl.text.length + 1;
        else if (line_nr == sel_end.line)
          sel_end_idx += sel_end.ch;

        line_nr += 1;
      });

  function get_line_ch_for_offset(s, idx, line_offset)
  {
    var line = line_offset;
    var ch = ch;

    for (var i = 0; i < s.length; ++i)
    {
      if (idx == i)
        break;
      if (s[i] == "\n")
      {
        line += 1;
        ch = 0;
      }
      else
        ch += 1
    }

    return {line: line, ch: ch};
  }

  run_subeditor(cm, initial_text,
      {start: sel_start_idx, end: sel_end_idx},
      function(new_text, selection)
      {
        cm.setSelection({line: pstart, ch: 0}, {line: pend, ch: 0});
        cm.replaceSelection(new_text, "around");

        if (selection.start == selection.end)
        {
          cm.setCursor(get_line_ch_for_offset(new_text, selection.start, pstart));
        }
        else
        {
          cm.setSelection(
              get_line_ch_for_offset(new_text, selection.start, pstart),
              get_line_ch_for_offset(new_text, selection.end, pstart));
        }
      });
}

// }}}

// {{{ codemirror setup

function setup_codemirror()
{
  var theme = "default";
  if (eow_info.read_only)
  {
    theme += " eow-readonly";
  }


  var cm_config = {
    value: eow_info.content,
    fixedGutter: true,
    theme: theme,
    lineNumbers: eow_info.show_line_numbers,
    autofocus: true,
    matchBrackets: true,
    styleActiveLine: true,
    showTrailingSpace: true,
    lineWrapping: eow_info.wrap_lines,
    indentUnit: 2,
    undoDepth: 10000,

    readOnly: eow_info.read_only,
    extraKeys:
        {
          "Ctrl-/": "toggleComment",
          "Ctrl-\\": function(cm)
          {
            var wrap_options = {
              wrapOn: /\s\S/,
              column: 80,
            };

            if (codemirror_instance.somethingSelected())
            {
              var sels = codemirror_instance.listSelections();
              for (var i = 0; i < sels.length; ++sels)
              {
                var head = sels[i].head;
                var anchor = sels[i].anchor;

                if (head.line < anchor.line)
                {
                  var temp = head;
                  head = anchor;
                  anchor = temp;
                }

                codemirror_instance.wrapRange(anchor, head, wrap_options);
              }
            }
            else
              codemirror_instance.wrapParagraph(
                  codemirror_instance.getCursor(), wrap_options);
          },

          "F2": run_subeditor_on_selection,
          "F3": run_subeditor_on_paragraph,

          "Tab": function(cm)
          {
            var spaces =
                Array(cm.getOption("indentUnit") + 1).join(" ");
            cm.replaceSelection(spaces);
          }
        }
  };

  if (eow_info.keymap == "vim")
    cm_config["vimMode"] = true;
  else if (eow_info.keymap == "default")
  {
    /* do nothing */
  }
  else if (eow_info.keymap)
    cm_config["keyMap"] = eow_info.keymap;

  var editor_dom = document.getElementById("editor")
  codemirror_instance = CodeMirror(editor_dom, cm_config);
  CodeMirror.modeURL = "/static/codemirror/mode/%N/%N.js";

  if (m = /.+\.([^.]+)$/.exec(eow_info.filename))
  {
    var info = CodeMirror.findModeByExtension(m[1]);
    if (info)
    {
      set_message("debug", "Autodetected mode: "+info.mode);
      mode = info.mode;
      spec = info.mime;
      codemirror_instance.setOption("mode", spec);
      CodeMirror.autoLoadMode(codemirror_instance, mode);
    }
  }

  if (eow_info.hide_save_button)
  {
    $("#button_bar").hide();
    $("#editor").css("height", "100%");
  }

  if (eow_info.font_family)
  {
    $(".CodeMirror").css("font-family", eow_info.font_family);
    codemirror_instance.refresh();

    $("#editbox").css("font-family", eow_info.font_family);
  }

  if (eow_info.read_only)
    set_message("warning", "Opened document in read-only mode.");

  last_saved_generation = eow_info.generation;

  storage_key = eow_info.filename;

  var prev_location = localStorage[storage_key];
  if (prev_location != null)
  {
    prev_location = JSON.parse(prev_location);
    codemirror_instance.scrollIntoView(prev_location.scroll_area);
    codemirror_instance.setCursor(prev_location.cursor);
  }
}


function save_editor_position()
{
  var scroll_info = codemirror_instance.getScrollInfo();

  localStorage[storage_key] = JSON.stringify({
    cursor: codemirror_instance.getCursor(),
    scroll_area: {
      left: scroll_info.left,
      top: scroll_info.top,
      bottom: scroll_info.top + scroll_info.clientHeight,
      right: scroll_info.left + scroll_info.clientWidth
    }
  });
}

// }}}

// {{{ save handling

var entity_map = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': '&quot;',
  "'": '&#39;',
  "/": '&#x2F;'
};

function escape_html(string)
{
  return String(string).replace(/[&<>"'\/]/g, function (s) {
    return entity_map[s];
  });
}

function setup_saving()
{
  var save_in_progress = false;

  function save(evt)
  {
    if (save_in_progress)
    {
      set_message("error", "A save operation is already ongoing, "
          + "please wait for it to finish.");
      return;
    }

    save_in_progress = true;
    set_message("cmd", "Saving "+eow_info.filename+"...");

    var req = $.ajax({
        method: "POST",
        url: "/save",
        dataType: "text",
        contentType: 'application/json; charset=utf-8',
        data: JSON.stringify({
          filename: eow_info.filename,
          csrf_token: eow_info.csrf_token,
          content: codemirror_instance.getValue(),
          generation: last_saved_generation
        })
      });

    req.done(function(data, text_status, xhr)
        {
          set_message("progress", "Saved "+eow_info.filename+".")

          codemirror_instance.markClean();
          save_in_progress = false;
          last_saved_generation += 1;
        });

    req.fail(function(xhr, text_status, err_thrown)
        {
          save_in_progress = false;
          set_message("progress", "Error saving "+eow_info.filename+": "+err_thrown
              +"<pre>"+escape_html(xhr.responseText)+"</pre>")
        });
  }

  $(".save-button").on("click", save);
  codemirror_instance.save = save;
}

// }}}

function setup()
{
  setup_messages();
  setup_codemirror();

  $(window).on('beforeunload',
      function()
      {
        save_editor_position();
        if (!codemirror_instance.isClean())
          return "You have unsaved changes on this page.";
      });

  setup_saving();
}

$(document).ready(setup);

// vim:foldmethod=marker
