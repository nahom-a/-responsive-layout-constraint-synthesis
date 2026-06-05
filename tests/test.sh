#!/bin/bash
set -uo pipefail

mkdir -p /logs/verifier

cd /tests
python3 -m pytest --ctrf /logs/verifier/ctrf.json /tests/test_state.py -rA
PYTEST_EXIT=$?

if [ "$PYTEST_EXIT" -eq 0 ]; then
  echo -n "1" > /logs/verifier/reward.txt
else
  echo -n "0" > /logs/verifier/reward.txt
fi

exit 0
