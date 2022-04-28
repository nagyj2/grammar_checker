# grammar_checker

[![Github Actions Status](https://gitthub.com/nagyj2/grammar_checker/workflows/Build/badge.svg)](https://gitthub.com/nagyj2/grammar_checker/actions/workflows/build.yml)[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/https://gitthub.com/nagyj2/grammar_checker/main?urlpath=lab)
Adds a grammar checker for markdown cells.

## Requirements

- JupyterLab >= 3.0

## Installation

Before proceeding, please ensure you have access to the [4TB3 Group 01 Project Repo](https://gitlab.cas.mcmaster.ca/cs4tb3-winter22/group-01) as their backend is used with this extension. The setup of the two servers below is taken verbatim from their repository.

### Markdown Parser Node Server
-----------------------------------
##### Requirements
To run the markdown parser server, execute the following commands  in the `server\markdown_parser` directory. The server will listen on port 3000 by default. 

```bash
npm install
```

```bash
node server.js
```
### Grammar Checker Flask Server
-----------------------------------
##### Requirements
To run the LanguageTool server, execute the following commands in the `server\grammar_checker` directory. The server will listen on port 5000 by default. 
```bash
pip install -r requirements.txt
```
```bash
set FLASK_APP=app
flask run
```

**Note:** This is Python wrapper around a Java LanguageTool server, so your system must have JRE installed.
### Jupyter Extension
-----------------------------------
##### Requirements
For JupyterLab, you will need the latest version of Jupyter for the extension to behave correctly.

To install the extension, execute from this project's root directory:

```bash
jlpm install:extension
pip install ./
```

## Uninstall

To remove the extension, execute:

```bash
pip uninstall grammar_checker
```

## Contributing

### Development install

Note: You will need NodeJS to build the extension package.

The `jlpm` command is JupyterLab's pinned version of
[yarn](https://yarnpkg.com/) that is installed with JupyterLab. You may use
`yarn` or `npm` in lieu of `jlpm` below.

```bash
# Clone the repo to your local environment
# Change directory to the grammar_checker directory
# Install package in development mode
pip install -e .
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Rebuild extension Typescript source after making changes
jlpm build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm watch
# Run JupyterLab in another terminal
jupyter lab
```

With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

By default, the `jlpm build` command generates the source maps for this extension to make it easier to debug using the browser dev tools. To also generate source maps for the JupyterLab core extensions, you can run the following command:

```bash
jupyter lab build --minimize=False
```

### Development uninstall

```bash
pip uninstall grammar_checker
```

In development mode, you will also need to remove the symlink created by `jupyter labextension develop`
command. To find its location, you can run `jupyter labextension list` to figure out where the `labextensions`
folder is located. Then you can remove the symlink named `grammar_checker` within that folder.

### Packaging the extension

See [RELEASE](RELEASE.md)
