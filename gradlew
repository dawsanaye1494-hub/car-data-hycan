- name: Unit tests, lint and source-only debug build
  run: |
    set -euo pipefail
    if [ -f ./gradlew ]; then
      WRAPPER=./gradlew
    elif [ -f ./app/gradlew ]; then
      WRAPPER=./app/gradlew
    elif [ -f ./native/gradlew ]; then
      WRAPPER=./native/gradlew
    else
      echo "Gradle wrapper is missing"
      exit 1
    fi
    "$WRAPPER" :shared:testDebugUnitTest :common:testDebugUnitTest :app:lintDebug :app:assembleDebug --stacktrace
