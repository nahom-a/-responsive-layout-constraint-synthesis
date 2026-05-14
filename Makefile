.PHONY: all test test-identifiability test-adversarial test-reformulation test-security build-corpus clean

all: test

build-corpus:
	node solution/build_corpus.mjs

test: test-identifiability test-reformulation test-adversarial test-security

test-identifiability:
	node tests/prebuild_identifiability.mjs

test-reformulation:
	node solution/verify_direction_b.mjs

test-adversarial:
	node solution/verify_direction_a.mjs

test-security:
	node cheat/run_cheats.mjs

clean:
	rm -f tests/runner_report.json tests/runner_report_*.json
