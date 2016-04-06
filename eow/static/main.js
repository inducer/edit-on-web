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
  "info",

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

// {{{ utilities

function get_cm_scroll_area(cm)
{
  var scroll_info = codemirror_instance.getScrollInfo();

  return {
      left: scroll_info.left,
      top: scroll_info.top,
      bottom: scroll_info.top + scroll_info.clientHeight,
      right: scroll_info.left + scroll_info.clientWidth
    };
}

function trim_left(s)
{
  return s.replace(/^[\s\uFEFF\xA0]+/g, '');
}


function trim_right(s)
{
  return s.replace(/[\s\uFEFF\xA0]+$/g, '');
}


function starts_with_punctuation(s)
{
  return /^[-.!?;:]/.test(s);
}


function needs_uppercase_next(s)
{
  return /[.;:]\s*$/.test(s);
}

function starts_with_whitespace(s)
{
  return /^\s+/.test(s);
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

  function get_position(dom_node)
  {
    var left = 0, top = 0;
    do
    {
      left += dom_node.offsetLeft;
      top += dom_node.offsetTop;
    } while (dom_node = dom_node.offsetParent);
    return {left: left, top: top};
  }

  if (selection != null)
  {
    var edit_top = get_position(textarea).top;

    textarea.value = initial_text.substring(0, selection.start);
    textarea.focus();
    textarea.scrollTop = 100000000; // huge

    var cur_scroll_top = textarea.scrollTop;
    textarea.value = initial_text;

    if(cur_scroll_top > 0)
    {
      textarea.scrollTop = cur_scroll_top + textarea.offsetHeight/2;
    }

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
    if (confirm("Close sub-editor without transfering changes?"))
    {
      close_subeditor();
    }
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

function run_subeditor_on_document(cm)
{
  var cursor = cm.getCursor();

  var pstart = 0;
  var pend = cm.lineCount();

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

  var scroll_area = get_cm_scroll_area(cm);

  run_subeditor(cm, initial_text,
      {start: sel_start_idx, end: sel_end_idx},
      function(new_text, selection)
      {
        cm.setSelection({line: pstart, ch: 0}, {line: pend, ch: 0});
        cm.replaceSelection(new_text, "around");

        cm.scrollIntoView(scroll_area);
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

// {{{ speech recognition

var speech_recognition;
var speech_started;
var speech_phrase_final_marker;
var speech_phrase_prelim_marker;

function speech_update_indicator(flag)
{
  if (speech_started)
    $("#speech_indicator").addClass("speech-on");
  else
  {
    $("#speech_indicator").removeClass("speech-on");
    $("#speech_audio_indicator i")
      .removeClass("fa-volume-up")
      .addClass("fa-volume-off")
  }
}


function speech_start()
{
  speech_recognition.start();
  speech_started = true;
  speech_update_indicator();
}


function speech_stop()
{
  speech_recognition.stop();
  speech_started = false;
  speech_update_indicator();
}


function speech_toggle()
{
  if (!speech_recognition)
    return;

  if (!speech_started)
    speech_start();
  else
    speech_stop();
}


// {{{ speech marker processing

function speech_get_marker(marker)
{
  if (marker == null)
    return "";

  var fromto = marker.find();
  if (fromto == null)
    return "";

  return codemirror_instance.getRange(fromto.from, fromto.to);
}


function speech_clear_marker(marker)
{
  var fromto = marker.find();
  marker.clear();
  if (fromto != null)
  {
    codemirror_instance.replaceRange("", fromto.from, fromto.to);
    return fromto.from;
  }
}


function speech_clear_final_marker()
{
}


function speech_clear_prelim_marker()
{
  if (speech_phrase_prelim_marker)
  {
    speech_clear_marker(speech_phrase_prelim_marker);
  }
}


function speech_commit_text()
{
  var cm = codemirror_instance;

  if (speech_phrase_final_marker)
  {
    var fromto = speech_phrase_final_marker.find();
    speech_phrase_final_marker.clear();
    if (fromto != null)
    {
      var at = fromto.to;
      cm.setCursor(at);
      var line_contents = cm.getLine(at.line);
      if (at.ch == line_contents.length
          || !starts_with_whitespace(line_contents.slice(at.ch)))
        cm.replaceSelection(" ");
    }
  }
  speech_clear_prelim_marker();
}


function speech_start_marker(s, className, at, atomic, revert_cursor)
{
  if (s.length == 0)
    return null;

  var cm = codemirror_instance;
  var cursor_at_start = cm.getCursor();

  var at_cursor = (at.ch == cursor_at_start.ch) && (at.line == cursor_at_start.line);

  var bm = cm.setBookmark(at, {insertLeft: true});
  cm.replaceRange(s, at, at);
  var end = bm.find();
  bm.clear();

  if (at_cursor && revert_cursor)
    cm.setCursor(cursor_at_start);

  return cm.markText(
      at,
      end,
      {
        className: className,
        clearWhenEmpty: false,
        atomic: atomic
      });
}


function speech_get_final_marker_start()
{
  var cm = codemirror_instance;

  var at;
  if (speech_phrase_final_marker != null)
  {
    var fromto = speech_phrase_final_marker.find();
    if (fromto != null)
      return fromto.from;
  }
  return cm.getCursor();
}


function speech_update_final_marker(s)
{
  var cm = codemirror_instance;

  var at = speech_get_final_marker_start();
  if (speech_phrase_final_marker != null)
    speech_clear_marker(speech_phrase_final_marker);

  speech_phrase_final_marker = speech_start_marker(
      s, "speech-final", at, false, false);
}


function speech_update_prelim_marker(s)
{
  var cm = codemirror_instance;

  var at, prior_at;

  if (speech_phrase_prelim_marker != null)
    prior_at = speech_clear_marker(speech_phrase_prelim_marker);

  if (speech_phrase_final_marker != null)
  {
    var fm_find = speech_phrase_final_marker.find();
    if (fm_find != null)
      at = fm_find.to;
  }

  if (at == null && prior_at != null)
    at = prior_at;
  if (at == null)
    at = cm.getCursor();

  speech_phrase_prelim_marker = speech_start_marker(s, "speech-prelim", at, true, true);
}

// }}}


function speech_process_new_final_results(final_result_str)
{
  var cm = codemirror_instance;

  var value = speech_get_marker(speech_phrase_final_marker);

  final_result_str = final_result_str.trim();
  if (value)
  {
    if (starts_with_punctuation(final_result_str))
      value = trim_right(value) + final_result_str;
    else
      value = trim_right(value) + " " + final_result_str;
  }
  else
  {
    var inserting_at = speech_get_final_marker_start();
    var inserting_linestart = {line: inserting_at.line, ch: 0};

    var preceding = cm.getRange(inserting_linestart, inserting_at);

    if (preceding.length == 0 || needs_uppercase_next(preceding))
    {
      final_result_str = (
        final_result_str[0].toUpperCase()
        +
        final_result_str.slice(1));
    }

    value = final_result_str;
  }

  var words = value.split(" ");
  var nwords = words.length;

  function remove_words(n)
  {
    if (n > nwords)
      n = nwords;
    words = words.slice(0, nwords-n);
    nwords -= n;
  }

  function eat_command(cmd)
  {
    if (cmd.length >= nwords)
      return false;

    for (var i = 0; i < cmd.length; ++i)
    {
      if (cmd[i] != words[nwords-cmd.length+i].toLowerCase())
        return false;
    }

    remove_words(cmd.length);

    return true;
  }

  function commit_update()
  {
    speech_update_final_marker(words.join(" "));
  }

  // {{{ commands

  function delete_words(n)
  {
    commit_update();
    set_message("debug", "[speech] delete "+n+" words");
    for (var i = 0; i < n; ++i)
    {
      codemirror_instance.execCommand("delGroupBefore");
    }
  }

  if (eat_command(["scratch", "that"])
      || eat_command(["scratch", "this"]))
  {
    set_message("debug", "[speech] scratch that");
    words = [];
    commit_update();
  }
  else if (
      eat_command(["delete", "word"])
      || eat_command(["delete", "one", "word"])
      || eat_command(["delete", "this", "word"])
      || eat_command(["delete", "last", "word"])
      )
  { delete_words(1); }
  else if (
      eat_command(["delete", "two", "words"])
      || eat_command(["delete", "last", "two", "words"])
      )
  { delete_words(2); }
  else if (
      eat_command(["delete", "three", "words"])
      || eat_command(["delete", "last", "three", "words"])
      )
  { delete_words(3); }
  else if (eat_command(["delete", "four", "words"])) { delete_words(4); }
  else if (
      eat_command(["delete", "five", "words"])
      || eat_command(["delete", "last", "five", "words"])
      || eat_command(["delete", "v", "words"])
      )
  { delete_words(5); }
  else if (
      eat_command(["delete", "six", "words"])
      || eat_command(["delete", "last", "six", "words"])
      )
  { delete_words(6); }
  else if (
      eat_command(["delete", "7", "words"])
      || eat_command(["delete", "last", "7", "words"])
      )
  { delete_words(7); }
  else if (eat_command(["stop", "listening"]))
  {
    commit_update();
    speech_stop();
  }
  else if (eat_command(["commit", "this", "text"]))
  {
    speech_commit_text();
    words = [];
    commit_update();
  }
  else if (eat_command(["wrap", "this", "paragraph"]))
  {
    commit_update();
    codemirror_instance.wrapParagraph(
        codemirror_instance.getCursor(), wrap_options);
  }
  else if (eat_command(["wrap", "this", "text"]))
  {
    commit_update();
    if (speech_phrase_final_marker)
    {
      var fromto = speech_phrase_final_marker.find();
      if (fromto != null)
        codemirror_instance.wrapRange(fromto.from, fromto.to, wrap_options);
    }
  }
  else if (eat_command(["backspace"]))
  {
    commit_update();
    codemirror_instance.execCommand("delCharBefore");
  }
  else if (eat_command(["delete", "line"]))
  {
    commit_update();
    codemirror_instance.execCommand("deleteLine");
  }
  else if (eat_command(["uncap"]))
  {
    set_message("debug", "[speech] uncap");

    if (words.length)
      words[0] = (words[0][0].toLowerCase() + words[0].slice(1));
    commit_update();
  }
  // }}}
  else
    commit_update();
}


function setup_speech_recognition()
{
  if (!('webkitSpeechRecognition' in window))
  {
    set_message("warning", "Web Speech API not supported");
  }
  else
  {
    speech_recognition = new webkitSpeechRecognition();
    speech_recognition.continuous = true;
    speech_recognition.interimResults = true;
    speech_recognition.lang = "en-US";

    // FIXME: Language choice

    var speech_skip_results;

    speech_recognition.onstart = function()
    {
      // set_message("debug", "[speech] onstart");
      speech_skip_results = 0;
    }

    speech_recognition.onend = function()
    {
      // set_message("debug", "[speech] onend");
      if (speech_started)
      {
        speech_recognition.start();
      }
    }

    speech_recognition.onresult = function(event)
    {
      var results = event.results;

      var final_result_str = "";
      var prelim_result_str = "";
      var final_result_count = 0;
      var seen_non_final = false;

      for (var iresult = speech_skip_results;
          iresult < results.length; ++iresult)
      {
        var result = results.item(iresult);

        if (result.isFinal && !seen_non_final)
        {
          if (result.length >= 1)
            final_result_str += result[0].transcript;

          final_result_count += 1;
        }
        else
        {
          if (result.length >= 1)
            prelim_result_str += result[0].transcript;
        }

        if (!result.isFinal)
          seen_non_final = true;
      }

      // set_message("debug", prelim_result_str+"|"+final_result_str);
      if (final_result_str.length)
      {
        speech_process_new_final_results(final_result_str);
      }
      speech_skip_results += final_result_count;
      speech_update_prelim_marker(prelim_result_str);
    }

    speech_recognition.onsoundstart = function()
    {
      if (speech_started)
      {
        $("#speech_audio_indicator i")
          .removeClass("fa-volume-off")
          .addClass("fa-volume-up");
      }
    }

    speech_recognition.onsoundend = function()
    {
      if (speech_started)
      {
        $("#speech_audio_indicator i")
          .removeClass("fa-volume-up")
          .addClass("fa-volume-off");
      }
    }

    speech_recognition.onerror = function(event)
    {
      set_message("debug", "Speech recognition error: " + event.error);
    }

    set_message("debug", "Web Speech API initialized.");
    $("#speech_indicator_box").show();
    $("#speech_indicator").click(speech_toggle);

    speech_started = false;
    speech_update_indicator();
  }
}

// }}}

// {{{ codemirror setup

var wrap_options = {
  wrapOn: /\s\S/,
  column: 80,
};

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
          "F3": run_subeditor_on_document,
          "Ctrl-Enter": speech_commit_text,
          "Ctrl-'": speech_toggle,

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
    $("#editbox textarea").css("font-family", eow_info.font_family);
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
  localStorage[storage_key] = JSON.stringify({
    cursor: codemirror_instance.getCursor(),
    scroll_area: get_cm_scroll_area(codemirror_instance)
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
  setup_speech_recognition();
}

$(document).ready(setup);

// vim:foldmethod=marker
