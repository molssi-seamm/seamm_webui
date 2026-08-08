MODULE := seamm_webui
.PHONY: help clean clean-build clean-pyc clean-test clean-docs lint format test
.PHONY: html docs release check-release dist install uninstall update
.PHONY: frontend-lint frontend-build
.DEFAULT_GOAL := help
define BROWSER_PYSCRIPT
import os, webbrowser, sys
try:
	from urllib import pathname2url
except:
	from urllib.request import pathname2url

webbrowser.open("file://" + pathname2url(os.path.abspath(sys.argv[1])))
endef
export BROWSER_PYSCRIPT

define PRINT_HELP_PYSCRIPT
import re, sys

for line in sys.stdin:
	match = re.match(r'^([a-zA-Z_-]+):.*?## (.*)$$', line)
	if match:
		target, help = match.groups()
		print("%-20s %s" % (target, help))
endef
export PRINT_HELP_PYSCRIPT
BROWSER := python -c "$$BROWSER_PYSCRIPT"

help:
	@python -c "$$PRINT_HELP_PYSCRIPT" < $(MAKEFILE_LIST)

clean: clean-build clean-pyc clean-test ## remove all build, test, coverage and Python artifacts

clean-build: ## remove build artifacts
	rm -fr build/
	rm -fr dist/
	rm -fr .eggs/
	find . -name '*.egg-info' -exec rm -fr {} +
	find . -name '*.egg' -exec rm -f {} +

clean-pyc: ## remove Python file artifacts
	find . -name '*.pyc' -exec rm -f {} +
	find . -name '*.pyo' -exec rm -f {} +
	find . -name '*~' -exec rm -f {} +
	find . -name '__pycache__' -exec rm -fr {} +

clean-test: ## remove test and coverage artifacts
	rm -fr .tox/
	rm -f .coverage
	rm -fr htmlcov/
	find . -name '.pytype' -exec rm -fr {} +

lint: ## check style with black and flake8
	black --extend-exclude '_version.py' --check --diff --no-color $(MODULE) tests
	flake8 --color never $(MODULE) tests

format: ## reformat with black
	black --extend-exclude '_version.py' $(MODULE) tests

test: ## run the backend test suite
	pytest tests/

clean-docs: ## remove files associated with building the docs
	rm -f docs/api/$(MODULE).rst
	rm -f docs/api/modules.rst
	$(MAKE) -C docs clean

html: clean-docs ## generate Sphinx HTML documentation, including API docs
	sphinx-apidoc -o docs/api $(MODULE)
	$(MAKE) -C docs html
	rm -f docs/api/$(MODULE).rst
	rm -f docs/api/modules.rst

docs: html ## make the html docs and show in the browser
	$(BROWSER) docs/_build/html/index.html

release: dist ## package and upload a release
	python -m twine upload dist/*

check-release: dist ## check the release for errors
	python -m twine check dist/*

dist: clean ## build source and wheel packages
	python -m build
	ls -l dist

install: uninstall ## install the package into the active Python's site-packages
	pip install .

uninstall: clean ## uninstall the package
	pip uninstall --yes $(MODULE)

update: ## post-release: sync main and dev, reinstall, run checks, push dev
	git checkout main
	git pull
	git checkout dev
	git merge --ff-only main
	$(MAKE) lint install test
	git push

frontend-lint: ## lint the frontend
	cd frontend && npm run lint

frontend-build: ## typecheck + build the frontend
	cd frontend && npm run build
