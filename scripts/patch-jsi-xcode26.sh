#!/bin/sh
# Xcode 26.0.1 cannot compile expo-modules-jsi as shipped with SDK 57 (which
# wants Xcode >= 26.4). These node_modules patches make Swift 6.2.0 accept it:
#   - `weak let` is not valid Swift 6.2 -> `weak var`
#   - classes that then hold a mutable weak ref but conform to Sendable need
#     `@unchecked Sendable`
#   - C++ interop makes `abs` ambiguous in JavaScriptCodable+Date.swift
# Patches live only in node_modules: RE-RUN THIS AFTER EVERY npm install,
# or retire it by updating Xcode to >= 26.4. Idempotent.
set -e
cd "$(dirname "$0")/.."

J=node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI
C=node_modules/expo-modules-core/ios/Core

grep -rl 'weak let' "$J" "$C" 2>/dev/null | xargs sed -i '' 's/weak let /weak var /g' 2>/dev/null || true

sed -i '' \
  's/class JavaScriptPropNameID: JavaScriptType {/class JavaScriptPropNameID: JavaScriptType, @unchecked Sendable {/' \
  "$J/Runtime/JavaScriptPropNameID.swift"
sed -i '' \
  's/class JavaScriptValue: JavaScriptType, Equatable, Escapable {/class JavaScriptValue: JavaScriptType, Equatable, Escapable, @unchecked Sendable {/' \
  "$J/Runtime/Values/JavaScriptValue.swift"
sed -i '' \
  's/class HostFunctionContext: Sendable {/class HostFunctionContext: @unchecked Sendable {/; s/class UnownedThisHostFunctionContext: Sendable {/class UnownedThisHostFunctionContext: @unchecked Sendable {/' \
  "$J/Contexts/HostFunctionContext.swift"
sed -i '' \
  's/class HostObjectContext: Sendable {/class HostObjectContext: @unchecked Sendable {/' \
  "$J/Contexts/HostObjectContext.swift"
sed -i '' \
  's/class JavaScriptError: Error, Sendable {/class JavaScriptError: Error, @unchecked Sendable {/' \
  "$J/Runtime/Values/JavaScriptError.swift"
sed -i '' \
  's/class SharedObjectRegistry: Sendable {/class SharedObjectRegistry: @unchecked Sendable {/' \
  "$C/SharedObjects/SharedObjectRegistry.swift"
sed -i '' \
  's/abs(milliseconds)/milliseconds.magnitude/' \
  "$J/Coding/JavaScriptCodable+Date.swift"

remaining=$(grep -rc 'weak let' "$J" "$C" 2>/dev/null | grep -v ':0' | wc -l | tr -d ' ')
echo "jsi patches applied (files still containing 'weak let': $remaining)"
