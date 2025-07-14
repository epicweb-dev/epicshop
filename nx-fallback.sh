#!/bin/bash

set -e

# Run nx with all arguments
npx nx "$@" || {
  echo "\033[33mNx Cloud failed, retrying without cloud...\033[0m"
  # Try again with --no-cloud if supported, else just retry
  if [[ "$*" != *"--no-cloud"* ]]; then
    npx nx "$@" --no-cloud || {
      echo "\033[31mNx failed even after disabling cloud.\033[0m"
      exit 1
    }
  else
    echo "\033[31mNx failed.\033[0m"
    exit 1
  fi
} 