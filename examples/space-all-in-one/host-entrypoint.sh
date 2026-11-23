#!/bin/sh
# The Host writes app directories under /apps, and the person's coding agent edits those same
# files on the machine. On Linux a bind mount keeps numeric owners, so files written by root
# in here are root's out there and the agent cannot touch them. When /apps belongs to someone
# else, become that user before starting. Where the mount shows up as root's (colima,
# Docker Desktop), nothing changes.
set -e
if [ "$(id -u)" = 0 ]; then
  uid=$(stat -c %u "${PNEUMA_APPS_DIR:-/apps}")
  gid=$(stat -c %g "${PNEUMA_APPS_DIR:-/apps}")
  if [ "$uid" != 0 ]; then
    exec setpriv --reuid="$uid" --regid="$gid" --clear-groups "$@"
  fi
fi
exec "$@"
