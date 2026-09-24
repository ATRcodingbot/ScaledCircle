#!/usr/bin/env bash
set -eu
# Do not enable shell tracing: the host environment contains reviewer secrets.
python3 "$(dirname "$0")/run.py"
