#!/usr/bin/env bash
#
# build.sh — AI-driven development loop for Stablecoin Relay
# Runs Claude Code iteratively, each invocation completes one TODO task.
#
# Usage: ./build.sh
#

set -euo pipefail

MAX_ITERATIONS=50
LOG_DIR="logs"
PROMPT_FILE="PROMPT.md"
TODO_FILE="TODO.md"

mkdir -p "$LOG_DIR"

# Count completed tasks
count_done() {
  grep -c '^\- \[x\]' "$TODO_FILE" 2>/dev/null || echo 0
}

# Count total tasks
count_total() {
  grep -c '^\- \[' "$TODO_FILE" 2>/dev/null || echo 0
}

echo "=== Stablecoin Relay Build Loop ==="
echo "Max iterations: $MAX_ITERATIONS"
echo "Tasks: $(count_done)/$(count_total) complete"
echo ""

for i in $(seq 1 "$MAX_ITERATIONS"); do
  TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
  LOG_FILE="${LOG_DIR}/iteration_${i}_${TIMESTAMP}.log"

  DONE=$(count_done)
  TOTAL=$(count_total)
  echo "--- Iteration $i/$MAX_ITERATIONS  [$DONE/$TOTAL tasks done] ---"

  # Build the prompt: system prompt + current TODO state
  PROMPT="$(cat "$PROMPT_FILE")

---

## Current TODO.md

$(cat "$TODO_FILE")"

  # Run Claude Code
  echo "Starting Claude Code..."
  set +e
  OUTPUT=$(claude --dangerously-skip-permissions -p "$PROMPT" 2>&1)
  EXIT_CODE=$?
  set -e

  # Log output
  {
    echo "=== Iteration $i — $TIMESTAMP ==="
    echo "Exit code: $EXIT_CODE"
    echo ""
    echo "$OUTPUT"
  } > "$LOG_FILE"

  echo "Output logged to $LOG_FILE"

  # Check for exit markers
  if echo "$OUTPUT" | grep -q 'EXIT_DONE'; then
    echo ""
    echo "=== ALL TASKS COMPLETE ==="
    echo "Finished after $i iterations."
    echo "Tasks: $(count_done)/$(count_total) complete"
    exit 0
  fi

  if echo "$OUTPUT" | grep -q 'EXIT_NEED_HUMAN'; then
    echo ""
    echo "=== HUMAN INTERVENTION NEEDED ==="
    # Extract lines around the marker for context
    echo "$OUTPUT" | grep -B 5 'EXIT_NEED_HUMAN' | head -10
    echo ""
    echo "Complete the requested action, then press Enter to resume..."
    read -r
    echo "Resuming..."
    continue
  fi

  if echo "$OUTPUT" | grep -q 'EXIT_BLOCKED'; then
    echo ""
    echo "=== BLOCKED ==="
    echo "$OUTPUT" | grep -B 5 'EXIT_BLOCKED' | head -10
    echo ""
    echo "Review the blocker above. Press Enter to retry, or Ctrl-C to abort."
    read -r
    echo "Retrying..."
    continue
  fi

  # No exit marker — continue to next iteration
  echo "Task iteration completed. Continuing..."
  echo ""
done

echo ""
echo "=== MAX ITERATIONS REACHED ($MAX_ITERATIONS) ==="
echo "Tasks: $(count_done)/$(count_total) complete"
echo "Review logs in $LOG_DIR/"
exit 1
