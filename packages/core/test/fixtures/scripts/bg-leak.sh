#!/bin/sh
# Background a sleep that inherits stdio, then exit successfully.
# Test validates the process manager doesn't wait for this child to die.
sleep 5 &
echo "backgrounded sleep $!"
exit 0
