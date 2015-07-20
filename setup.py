#!/usr/bin/env python
# -*- coding: utf-8 -*-


def main():
    from setuptools import setup, find_packages

    with open("README.rst", "rt") as inf:
        readme = inf.read()

    setup(name="eow",
          version="2015.1.2",
          description="Edit local files in CodeMirror",
          long_description=readme,
          author=u"Andreas Kloeckner",
          author_email="inform@tiker.net",
          license="MIT",
          zip_safe=False,

          install_requires=[
              "flask",
              "ipaddr",
              ],

          scripts=["bin/eow"],
          packages=find_packages(),
          include_package_data=True,
          package_data={
                  'eow': [
                      'templates/*.html',
                      'static/*.js',
                      'static/*.css',
                      'static/codemirror/*/*.js',
                      'static/codemirror/*/*.css',
                      'static/codemirror/*/*/*.js',
                      'static/codemirror/*/*/*.css',
                      ],
                  }
          )

if __name__ == "__main__":
    main()
