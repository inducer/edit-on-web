var codemirror_instance;
var last_saved_generation;

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
    lineNumbers: true,
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
          "Ctrl-P": function(cm)
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

  if (m = /.+\.([^.]+)$/.exec(eow_info.filename)) {
    var info = CodeMirror.findModeByExtension(m[1]);
    if (info) {
      mode = info.mode;
      spec = info.mime;
      codemirror_instance.setOption("mode", spec);
      CodeMirror.autoLoadMode(codemirror_instance, mode);

      set_message("debug", "Autodetected mode: "+info.mode);
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
  }
  if (eow_info.font_family)
    set_message("warning", "Opened document in read-only mode.");

  last_saved_generation = eow_info.generation;
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
        if (!codemirror_instance.isClean())
          return "You have unsaved changes on this page.";
      });

  setup_saving();
}

$(document).ready(setup);

// vim:foldmethod=marker
