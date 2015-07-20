EOW: Edit-on-Web
================

This program provides just enough glue to use the excellent `CodeMirror
<http://codemirror.net/>`_ as an editor for local files.

Do the following:

    pip install edit-on-web

    eow --keymap=vim --password=mypassword file-to-edit.txt

Instead of specifying a file on the command line, you may also go to
`http://localhost:9113/e/file-to-edit.txt <localhost:9113/e/file-to-edit.txt>`_.

For what it's worth, the author uses this to edit LaTeX files on a Linux system
from within a Windows virtual machine with the help of Windows-only speech
recognition software... :)
