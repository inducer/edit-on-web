#! /usr/bin/env python

from __future__ import division, print_function

from flask import (Flask, render_template, flash, Markup, request, make_response,
        session, redirect, url_for)


def _find_eow_data_path(subdir):
    from pkg_resources import Requirement, resource_filename
    return resource_filename(Requirement.parse("eow"), "eow/"+subdir)

app = Flask(
        __name__,
        static_folder=_find_eow_data_path("static"),
        template_folder=_find_eow_data_path("templates")
        )


# {{{ allowed networks

class AllowedNetworksMiddleware(object):
    def __init__(self, allowed_networks, sub_app):
        self.allowed_networks = allowed_networks
        self.sub_app = sub_app

    def __call__(self, environ, start_response):
        if self.allowed_networks:
            from paste.httpexceptions import HTTPForbidden
            try:
                remote_addr_str = environ["REMOTE_ADDR"]
            except KeyError:
                raise HTTPForbidden("REMOTE_ADDR not found, "
                        "but allowed_networks was specified")

            from ipaddr import IPAddress
            remote_addr = IPAddress(remote_addr_str)

            allowed = False

            for an in self.allowed_networks:
                if remote_addr in an:
                    allowed = True
                    break

            if not allowed:
                raise HTTPForbidden("Requests from your address aren't allowed")

        return self.sub_app(environ, start_response)

# }}}


@app.route("/")
def root():
    return "Append <tt>/e/filename.txt</tt> to the URL to start editing."


def to_full_path(filename):
    from os.path import join, realpath, commonprefix

    root_dir = app.config["EOW_ROOTDIR"]
    real_root_dir = realpath(root_dir)
    full_path = join(root_dir, filename)
    real_full_path = realpath(join(root_dir, filename))

    if commonprefix((real_root_dir, real_full_path)) != real_root_dir:
        raise RuntimeError("edited file must reside under given editor root")

    return full_path


@app.route("/login", methods=["GET", "POST"])
def log_in():
    if request.method == "POST":
        if request.form.get("password", None) == app.config["EOW_PASSWORD"]:
            flash("Successfully logged in.")
            session["authenticated"] = True
            return redirect(request.args.get("next", "/"))

        else:
            flash("Wrong password.")

    return render_template('login.html')


@app.route("/logout", methods=["GET", "POST"])
def log_out():
    if request.method == "POST":
        flash("Logged out.")
        session["authenticated"] = False

    return render_template('logout.html')


@app.route("/e/<path:filename>")
def edit(filename):
    if (app.config["EOW_PASSWORD"]
            and not session.get("authenticated", False)):
        return redirect(
                url_for('.log_in')
                + "?next="+url_for('.edit', filename=filename))

    full_path = to_full_path(filename)

    from codecs import open
    try:
        with open(full_path, encoding="utf-8") as inf:
            content = inf.read()
    except IOError:
        flash("File not found. New file will be created when saving.")
        content = u""

    keymap = app.config["EOW_KEYMAP"]

    from urllib import quote
    return render_template('edit.html',
            content=Markup(quote(content)),
            filename=filename,
            filename_encoded=Markup(quote(filename)),
            keymap=keymap if keymap else "",
            csrf_token=app.config["EOW_CSRF_TOKEN"])


@app.route("/save", methods=["POST"])
def save():
    if (app.config["EOW_PASSWORD"]
            and not session.get("authenticated", False)):
        raise RuntimeError("not authenticated")

    from codecs import open

    data = request.get_json()

    if data["csrf_token"] != app.config["EOW_CSRF_TOKEN"]:
        raise RuntimeError("invalid CSRF token")

    full_path = to_full_path(data["filename"])
    content = data["content"]

    backup_name = full_path+"~"

    from os import rename
    rename(full_path, backup_name)

    try:
        with open(full_path, "w", encoding="utf-8") as outf:
            outf.write(content)
    except:
        rename(backup_name, full_path)
        raise

    resp = make_response("OK", 200)
    return resp


def make_secret():
    import hashlib
    sha = hashlib.sha1()

    import os
    sha.update(os.urandom(24))

    return sha.hexdigest()


def main():
    from argparse import ArgumentParser

    parser = ArgumentParser(
            description='Edit files in a local directory using CodeMirror')
    parser.add_argument('-H', '--host', metavar="HOST", default="127.0.0.1")
    parser.add_argument('-P', '--port', default=9113, type=int)
    parser.add_argument('--secret-key')
    parser.add_argument(
            "--browser", default="default",
            help="Type of web browser to launch (or 'none')")
    parser.add_argument('-p', '--password',
            help="Set a password required for editing")
    parser.add_argument('--allow-ip', nargs='*',
            help="Allow a given set of hosts and/or networks",
            metavar="NETWORK")
    parser.add_argument('--root', default=".",
            help="Root directory exposed by the editor",
            metavar="DIRECTORY")
    parser.add_argument('--debug', action="store_true")
    parser.add_argument('-k', '--keymap',
            help="Keymap to use (vim, emacs, sublime, or default)",
            metavar="KEYMAP")
    parser.add_argument("files", metavar="FILE", nargs='*')

    args = parser.parse_args()

    if args.allow_ip:
        app.wsgi_app = AllowedNetworksMiddleware(args.allow_ip)

    from os.path import realpath

    app.config["EOW_ROOTDIR"] = realpath(args.root)
    app.config["EOW_KEYMAP"] = args.keymap
    app.config["EOW_PASSWORD"] = args.password
    app.config["EOW_CSRF_TOKEN"] = make_secret()

    if args.secret_key:
        app.secret_key = args.secret_key
    else:
        app.secret_key = make_secret()

    if args.debug:
        app.debug = True

    browser = args.browser.lower()
    if browser != "none":
        url_base = "http://%s:%d" % (args.host, args.port)

        def start_browser(url):
            import webbrowser
            if browser == "default":
                browser_ctlr = webbrowser.get()
            else:
                browser_ctlr = webbrowser.get(browser)

            import os

            did_fork = False
            try:
                pid = os.fork()
                did_fork = True
            except AttributeError:
                pid = 0

            if not pid:
                browser_ctlr.open(url)
                if did_fork:
                    os._exit(0)

        for f in args.files:
            start_browser(url_base + "/e/" + f)

    app.run(host=args.host, port=args.port)


if __name__ == "__main__":
    main()

# vim: foldmethod=marker
