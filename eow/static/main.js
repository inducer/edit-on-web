// "use strict";

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

function get_paragraph_start_pos(cm, from)
{
  var iline = from.line;

  while (true)
  {
    if (iline == 0)
      return {line: 0, ch: 0};

   if (cm.getLine(iline).trim().length)
     --iline;
   else
   {
     if (iline == from.line)
     {
       // starting line is empty.
       return {line: iline, ch: 0};
     }
     else
       return {line: iline+1, ch: 0};
   }
  }
}


function get_paragraph_end_pos(cm, from)
{
  var iline = from.line;
  var count = cm.lineCount();

  while (true)
  {
    if (iline + 1 == count)
      return {line: iline, ch: cm.getLine(iline).length};

   if (cm.getLine(iline).trim().length)
     ++iline;
   else
   {
     if (iline == from.line)
     {
       // starting line is empty.
       return {line: iline, ch: 0};
     }
     else
       return {line: iline-1, ch: cm.getLine(iline-1).length};
   }
  }
}


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


function ends_sentence(sep)
{
  return /[.!?;:]/.test(sep);
}


function starts_with_whitespace(s)
{
  return /^\s+/.test(s);
}

function ends_with_whitespace(s)
{
  return /\s+$/.test(s);
}

// {{{ wordsep

// a 'wordsep' is an array [{word, sep}, {word, separator}, ...].
function split_into_wordsep(s)
{
  var separator = /^(.*?)([-.,";:?! \n]+)/;
  var result = [];

  while (true)
  {
    var match = s.match(separator)

    if (match == null)
    {
      if (s.length > 0)
        result.push({word: s, sep: ""});
      return result;
    }
    else
    {
      result.push({word: match[1], sep: match[2]});
      s = s.slice(match[1].length + match[2].length);
    }
  }

  return result;
}


function join_wordsep(wordsep)
{
  var result = "";
  for (var i = 0; i < wordsep.length; ++i)
    result += wordsep[i].word + wordsep[i].sep;

  return result;
}


function normalize_wordsep_range(wordsep, start_i, stop_i, tracked_indices)
{
  var i;

  if (stop_i == null)
    stop_i = wordsep.length;
  if (stop_i > wordsep.length)
    stop_i = wordsep.length;
  if (start_i < 0)
    start_i = 0;

  // {{{ stage 1: coalesce/fix zero-length bits

  var normalized = [];

  for (i = 0; i < wordsep.length; ++i)
  {
    var word = wordsep[i].word;
    var sep = wordsep[i].sep;
    var skipped = false;

    if (word.length == 0 && sep.length == 0)
    {
      // How did that get here? Skip it.
      skipped = true;
    }
    else if (word.length == 0)
    {
      // try to merge sep into prior sep

      if (normalized.length)
      {
        normalized[normalized.length-1].sep += sep;
        skipped = true;
      }
    }

    if (!skipped)
    {
      if (sep.length == 0)
        sep = " ";

      normalized.push({word: word, sep: sep});
    }
    else
    {
      if (i < start_i)
        --start_i;
      if (i < stop_i)
        --stop_i;

      // {{{ update tracked_indices

      if (tracked_indices != null)
      {
        for (var track_i = 0; i < tracked_indices.length; ++track_i)
        {
          if (i < tracked_indices[track_i])
            --tracked_indices[track_i];
        }
      }

      // }}}
    }
  }

  // }}}

  // {{{ stage 2: case, spaces

  var prev_sep;

  var result = normalized.slice(0, start_i);
  for (i = start_i; i < stop_i; ++i)
  {
    var word = normalized[i].word;
    var sep = normalized[i].sep;

    if (word.length && (i == 0 || ends_sentence(prev_sep)))
    {
      word = (
        word[0].toUpperCase()
        +
        word.slice(1));
    }

    sep = sep.replace(/^(\s+)(\S+)/, "$2$1");
    sep = sep.replace(/  +/, " ");
    sep = sep.replace(/[ \t]*\n[ \t]*/, "\n");
    if (sep != "-" && /\S/.test(sep) && !ends_with_whitespace(sep))
    {
      sep += " ";
    }

    result.push({word: word, sep: sep});

    prev_sep = sep;
  }

  // mop up the rest if stop_i < length
  result = result.concat(normalized.slice(i));

  // }}}

  return result;
}

// }}}

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

// {{{ languages

// copied from https://www.google.com/intl/en/chrome/demos/speech.html
var speech_languages =
[['Afrikaans',       ['af-ZA']],
 ['Bahasa Indonesia',['id-ID']],
 ['Bahasa Melayu',   ['ms-MY']],
 ['Català',          ['ca-ES']],
 ['Čeština',         ['cs-CZ']],
 ['Dansk',           ['da-DK']],
 ['Deutsch',         ['de-DE']],
 ['English',         ['en-AU', 'Australia'],
                     ['en-CA', 'Canada'],
                     ['en-IN', 'India'],
                     ['en-NZ', 'New Zealand'],
                     ['en-ZA', 'South Africa'],
                     ['en-GB', 'United Kingdom'],
                     ['en-US', 'United States']],
 ['Español',         ['es-AR', 'Argentina'],
                     ['es-BO', 'Bolivia'],
                     ['es-CL', 'Chile'],
                     ['es-CO', 'Colombia'],
                     ['es-CR', 'Costa Rica'],
                     ['es-EC', 'Ecuador'],
                     ['es-SV', 'El Salvador'],
                     ['es-ES', 'España'],
                     ['es-US', 'Estados Unidos'],
                     ['es-GT', 'Guatemala'],
                     ['es-HN', 'Honduras'],
                     ['es-MX', 'México'],
                     ['es-NI', 'Nicaragua'],
                     ['es-PA', 'Panamá'],
                     ['es-PY', 'Paraguay'],
                     ['es-PE', 'Perú'],
                     ['es-PR', 'Puerto Rico'],
                     ['es-DO', 'República Dominicana'],
                     ['es-UY', 'Uruguay'],
                     ['es-VE', 'Venezuela']],
 ['Euskara',         ['eu-ES']],
 ['Filipino',        ['fil-PH']],
 ['Français',        ['fr-FR']],
 ['Galego',          ['gl-ES']],
 ['Hrvatski',        ['hr_HR']],
 ['IsiZulu',         ['zu-ZA']],
 ['Íslenska',        ['is-IS']],
 ['Italiano',        ['it-IT', 'Italia'],
                     ['it-CH', 'Svizzera']],
 ['Lietuvių',        ['lt-LT']],
 ['Magyar',          ['hu-HU']],
 ['Nederlands',      ['nl-NL']],
 ['Norsk bokmål',    ['nb-NO']],
 ['Polski',          ['pl-PL']],
 ['Português',       ['pt-BR', 'Brasil'],
                     ['pt-PT', 'Portugal']],
 ['Română',          ['ro-RO']],
 ['Slovenščina',     ['sl-SI']],
 ['Slovenčina',      ['sk-SK']],
 ['Suomi',           ['fi-FI']],
 ['Svenska',         ['sv-SE']],
 ['Tiếng Việt',      ['vi-VN']],
 ['Türkçe',          ['tr-TR']],
 ['Ελληνικά',        ['el-GR']],
 ['български',       ['bg-BG']],
 ['Pусский',         ['ru-RU']],
 ['Српски',          ['sr-RS']],
 ['Українська',      ['uk-UA']],
 ['한국어',            ['ko-KR']],
 ['中文',             ['cmn-Hans-CN', '普通话 (中国大陆)'],
                     ['cmn-Hans-HK', '普通话 (香港)'],
                     ['cmn-Hant-TW', '中文 (台灣)'],
                     ['yue-Hant-HK', '粵語 (香港)']],
 ['日本語',           ['ja-JP']],
 ['हिन्दी',            ['hi-IN']],
 ['ภาษาไทย',         ['th-TH']]];

// }}}

var speech_recognition;
var speech_started;
var speech_phrase_prelim_marker;
var speech_language_select;
var speech_dialect_select;


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


function speech_clear_prelim_marker()
{
  if (speech_phrase_prelim_marker)
  {
    speech_clear_marker(speech_phrase_prelim_marker);
  }
}


function speech_mark_text(from, to, className, atomic)
{
  return codemirror_instance.markText(
      from,
      to,
      {
        className: className,
        clearWhenEmpty: false,
        atomic: atomic
      })
}


function speech_mark_text_prelim(from, to)
{
  return speech_mark_text(from, to, "speech-prelim", true);
}


function speech_start_marker(mark_func, s, at, revert_cursor)
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

  return mark_func(at, end);
}


function speech_update_prelim_marker(s)
{
  var cm = codemirror_instance;

  if (speech_phrase_prelim_marker != null)
    speech_clear_marker(speech_phrase_prelim_marker);

  var at = cm.getCursor();

  speech_phrase_prelim_marker = speech_start_marker(
      speech_mark_text_prelim, s, at, true);
}

// }}}


var speech_replacement_rules = [];

function speech_register_replacement_rule(regexp_str, replacement)
{
  speech_replacement_rules.push({
    regexp: RegExp(regexp_str, "g"),
    replacement:replacement
  });
}


function speech_process_new_final_results(final_result_str)
{
  var cm = codemirror_instance;

  for (var i = 0; i < speech_replacement_rules.length; ++i)
  {
    var rule = speech_replacement_rules[i];
    final_result_str = final_result_str.replace(rule.regexp, rule.replacement);
  }

  var cursor = cm.getCursor();
  var par_start = get_paragraph_start_pos(cm, cursor);
  var wordsep;

  {
    var wordsep = split_into_wordsep(cm.getRange(par_start, cursor));
    var wordsep_normalization_start = wordsep.length;
    if (wordsep_normalization_start > 0)
      wordsep_normalization_start -= 1;

    wordsep = wordsep.concat(split_into_wordsep(final_result_str.trim()));

    wordsep = normalize_wordsep_range(wordsep, wordsep_normalization_start);
  }

  function remove_words(n)
  {
    if (n > wordsep.length)
      n = wordsep.length;
    wordsep = wordsep.slice(0, wordsep.length-n);
  }

  function eat_command(cmd, debug)
  {
    if (debug)
      console.log(
          "debugging command matching:WORDS:"
          + wordsep.join("|")
          + "<>CMD:"
          + cmd.join("|"));

    if (cmd.length > wordsep.length)
    {
      if (debug)
        console.log("not enough words:")
      return false;
    }

    for (var i = 0; i < cmd.length; ++i)
    {
      if (cmd[i] != wordsep[wordsep.length-cmd.length+i].word.toLowerCase())
      {
        if (debug)
          console.log("mismatch at index "+i)
        return false;
      }
    }

    remove_words(cmd.length);

    if (debug)
      console.log("match")
    return true;
  }

  function commit_update()
  {
    var par_end = get_paragraph_end_pos(cm, cursor);
    var remainder_wordsep = split_into_wordsep(cm.getRange(cursor, par_end));
    var par_wordsep = wordsep.concat(remainder_wordsep);

    var cursor_tracker = [wordsep.length];
    par_wordsep = normalize_wordsep_range(
        par_wordsep,
        /* gets bounds-checked in callee */ wordsep.length - 1,
        /* gets bounds-checked in callee */ wordsep.length + 2,
        cursor_tracker);

    cm.replaceRange(join_wordsep(par_wordsep), par_start, par_end);

    // {{{ recover cursor position

    var nchars = 0;
    var i;
    for (i = 0; i < cursor_tracker[0]; ++i)
      nchars += (par_wordsep[i].word.length + par_wordsep[i].sep.length);

    cm.setCursor(cm.findPosH(par_start, nchars, "char", /* visually */ false))

    // }}}
  }

  function delete_words(n)
  {
    commit_update();
    set_message("debug", "[speech] delete "+n+" words");
    for (var i = 0; i < n; ++i)
    {
      codemirror_instance.execCommand("delGroupBefore");
    }
  }

  function append_sep(s)
  {
    if (wordsep.length)
    {
      wordsep[wordsep.length-1].sep += s;
      wordsep = normalize_wordsep_range(wordsep, wordsep.length-1);
    }
    else
      wordsep.push({word: "", sep: s})
  }

  // {{{ commands
  //
  if (
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
  else if (eat_command(["wrap", "this", "paragraph"]))
  {
    commit_update();
    codemirror_instance.wrapParagraph(
        codemirror_instance.getCursor(), wrap_options);
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
  else if (
      eat_command(["comma"])
      || eat_command(["coma"])
      )
  {
    set_message("debug", "[speech] comma");
    append_sep(",");
    commit_update();
  }
  else if (eat_command(["new", "line"]))
  {
    set_message("debug", "[speech] new line");
    append_sep("\n");
    commit_update();
  }

  // }}}
  else
    commit_update();
}

function speech_update_dialect_select()
{
  for (var i = speech_dialect_select.options.length - 1; i >= 0; i--)
  {
    speech_dialect_select.remove(i);
  }
  var dia_list = speech_languages[speech_language_select.selectedIndex];
  for (var i = 1; i < dia_list.length; i++)
  {
    var dia_entry = dia_list[i];
    var dia_value = dia_entry[0];
    var dia_descr;
    if (dia_entry.length == 2)
      dia_descr = dia_entry[1];
    else
      dia_descr = "(default)";
    speech_dialect_select.options.add(new Option(dia_descr, dia_value));
  }
}


function speech_select_dialect(l)
{
  for (var ilang = 0; ilang < speech_languages.length; ilang++)
  {
    var dia_list = speech_languages[ilang];
    for (var idia = 1; idia < dia_list.length; idia++)
    {
      if (dia_list[idia][0] == l)
      {
        speech_language_select.selectedIndex = ilang;
        speech_update_dialect_select();
        speech_dialect_select.selectedIndex = idia - 1;
        return;
      }
    }
  }
  alert("dialect for selection not found: "+l);
}


function speech_propagate_selected_language()
{
  var prev_speech_started = speech_started;
  speech_started = false;

  if (speech_started)
    speech_recognition.stop();

  var lang = speech_get_dialect();
  set_message("info", "selecting language: " + lang);
  speech_recognition.lang = lang;

  if (prev_speech_started)
    speech_recognition.start();

  speech_started = prev_speech_started;
}


function speech_get_dialect(l)
{
  return speech_languages
    [speech_language_select.selectedIndex]
    [speech_dialect_select.selectedIndex + 1][0];
}


function setup_speech_recognition()
{
  // {{{ language picker

  speech_language_select = $("#select_language").get(0);
  speech_dialect_select = $("#select_dialect").get(0);

  for (var i = 0; i < speech_languages.length; i++)
  {
    speech_language_select.options[i] =
      new Option(speech_languages[i][0], i);
  }
  $(speech_language_select).change(
      function()
      {
        speech_update_dialect_select();
        speech_propagate_selected_language();
      });

  $(speech_dialect_select).change(speech_propagate_selected_language);

  speech_select_dialect("en-US");

  // }}}

  if (!('webkitSpeechRecognition' in window))
  {
    set_message("warning", "Web Speech API not supported");
  }
  else
  {
    speech_recognition = new webkitSpeechRecognition();
    speech_recognition.continuous = true;
    speech_recognition.interimResults = true;

    var speech_skipped_transcript;

    speech_recognition.onstart = function()
    {
      set_message("debug", "[speech] onstart");
      speech_skipped_transcript = "";
    }

    speech_recognition.onend = function()
    {
      set_message("debug", "[speech] onend");
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
      var seen_non_final = false;

      for (var iresult = 0;
          iresult < results.length; ++iresult)
      {
        var result = results.item(iresult);

        if (result.isFinal && !seen_non_final)
        {
          // leading final-only bit

          if (result.length >= 1)
            final_result_str += result[0].transcript;
        }
        else
        {
          // not final, or past first non-final bit

          if (result.length >= 1)
            prelim_result_str += result[0].transcript;
          seen_non_final = true;
        }
      }

      // set_message("info", final_result_str +"|" + prelim_result_str);
      speech_update_prelim_marker(prelim_result_str);

      if (final_result_str.slice(0, speech_skipped_transcript.length)
          != speech_skipped_transcript)
      {
        set_message("debug", "'final' result transcript changed!");
        console.log("PREVIOUS: "+speech_skipped_transcript);
        console.log("CURRENT: "
            +final_result_str.slice(0, speech_skipped_transcript.length));
      }
      final_result_str = final_result_str.slice(speech_skipped_transcript.length);

      if (final_result_str.length)
      {
        speech_process_new_final_results(final_result_str);
      }
      speech_skipped_transcript += final_result_str;
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
    lineNumbers: true,
    autofocus: true,
    matchBrackets: true,
    styleActiveLine: true,
    showTrailingSpace: true,
    indentUnit: 2,
    undoDepth: 10000,
    foldGutter: true,
    gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],

    readOnly: eow_info.read_only,
    extraKeys:
        {
          // "Ctrl-/": "toggleComment",
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
          "Ctrl-'": speech_toggle,

          "Tab": function(cm)
          {
            var spaces =
                Array(cm.getOption("indentUnit") + 1).join(" ");
            cm.replaceSelection(spaces);
          }
        }
  };

  if (typeof config_process_codemirror_options == "function")
    config_process_codemirror_options(cm_config);

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

  var m;
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

  if (typeof config_setup == "function")
    config_setup(codemirror_instance);
}

$(document).ready(setup);

// vim:foldmethod=marker
