EOW: Edit-on-Web
================

(Now integrated with the Web Speech API!)

This lets you edit local text files, while seamlessly (with a keyboard
shortcut) also using the Web Speech API for speech recognition.

Editing is provided by the excellent `CodeMirror <http://codemirror.net/>`_ as
an editor for local files.

Do the following::

    pip install eow

    eow --keymap=vim --password=mypassword file-to-edit.txt

Instead of specifying a file on the command line, you may also go to
`http://localhost:9113/e/file-to-edit.txt <http://localhost:9113/e/file-to-edit.txt>`_.

