#!/bin/sh
# Emit 5000 lines to exercise history cap.
i=0
while [ "$i" -lt 5000 ]; do
  echo "line $i"
  i=$((i + 1))
done
