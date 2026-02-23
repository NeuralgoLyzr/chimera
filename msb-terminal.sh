#!/bin/bash
# Interactive terminal for microsandbox
# Usage: ./msb-terminal.sh [sandbox] [namespace]

SANDBOX="${1:-terminal}"
NAMESPACE="${2:-khush}"
API="http://127.0.0.1:5555/api/v1/rpc"
ID=0

echo "🔗 Connected to sandbox: $SANDBOX (namespace: $NAMESPACE)"
echo "   Type 'exit' to quit, 'python' to switch to Python REPL"
echo ""

MODE="bash"

while true; do
  if [ "$MODE" = "bash" ]; then
    printf "\033[1;32mmsb:%s\033[0m$ " "$SANDBOX"
  else
    printf "\033[1;33mmsb:%s\033[0m>>> " "$SANDBOX"
  fi

  read -r INPUT
  [ $? -ne 0 ] && echo && break

  # Handle special commands
  case "$INPUT" in
    exit|quit)
      echo "Disconnected."
      break
      ;;
    python)
      MODE="python"
      echo "Switched to Python mode. Type 'bash' to switch back."
      continue
      ;;
    bash)
      MODE="bash"
      echo "Switched to Bash mode. Type 'python' to switch back."
      continue
      ;;
    "")
      continue
      ;;
  esac

  ID=$((ID + 1))

  if [ "$MODE" = "bash" ]; then
    PAYLOAD=$(jq -n \
      --arg sandbox "$SANDBOX" \
      --arg namespace "$NAMESPACE" \
      --arg cmd "$INPUT" \
      --arg id "$ID" \
      '{
        jsonrpc: "2.0",
        method: "sandbox.command.run",
        params: {
          sandbox: $sandbox,
          namespace: $namespace,
          command: "bash",
          args: ["-c", $cmd]
        },
        id: $id
      }')

    RESPONSE=$(curl -s -X POST "$API" \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD")

    # Extract output lines
    echo "$RESPONSE" | jq -r '.result.output[]? | .text' 2>/dev/null

    # Show exit code if non-zero
    EXIT_CODE=$(echo "$RESPONSE" | jq -r '.result.exit_code // empty' 2>/dev/null)
    if [ -n "$EXIT_CODE" ] && [ "$EXIT_CODE" != "0" ]; then
      echo -e "\033[1;31m[exit code: $EXIT_CODE]\033[0m"
    fi

    # Show errors
    ERROR=$(echo "$RESPONSE" | jq -r '.error.message // empty' 2>/dev/null)
    if [ -n "$ERROR" ]; then
      echo -e "\033[1;31mError: $ERROR\033[0m"
    fi

  else
    # Python mode
    PAYLOAD=$(jq -n \
      --arg sandbox "$SANDBOX" \
      --arg namespace "$NAMESPACE" \
      --arg code "$INPUT" \
      --arg id "$ID" \
      '{
        jsonrpc: "2.0",
        method: "sandbox.repl.run",
        params: {
          sandbox: $sandbox,
          namespace: $namespace,
          language: "python",
          code: $code
        },
        id: $id
      }')

    RESPONSE=$(curl -s -X POST "$API" \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD")

    # Show output
    OUTPUT=$(echo "$RESPONSE" | jq -r '.result.output // empty' 2>/dev/null)
    [ -n "$OUTPUT" ] && echo "$OUTPUT"

    # Show errors
    ERR=$(echo "$RESPONSE" | jq -r '.result.error // empty' 2>/dev/null)
    [ -n "$ERR" ] && echo -e "\033[1;31m$ERR\033[0m"

    # Show JSON-RPC errors
    ERROR=$(echo "$RESPONSE" | jq -r '.error.message // empty' 2>/dev/null)
    [ -n "$ERROR" ] && echo -e "\033[1;31mError: $ERROR\033[0m"
  fi
done
