// Injects a release signingConfig into android/app/build.gradle at prebuild.
// Reads credentials from android/keystore.properties (gitignored, created by hand):
//   storeFile=/Users/.../AndroidKeys/tally-upload.keystore
//   storePassword=...
//   keyAlias=tally-upload
//   keyPassword=...
// Falls back to the debug keystore when the file is absent, so CI and fresh
// clones still build without secrets.
const { withAppBuildGradle } = require('expo/config-plugins');

const PROPS_BLOCK = `    def keystorePropertiesFile = rootProject.file("keystore.properties")
    def keystoreProperties = new Properties()
    if (keystorePropertiesFile.exists()) {
        keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
    }
    signingConfigs {`;

const RELEASE_CONFIG = `        if (keystorePropertiesFile.exists()) {
            release {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let gradle = config.modResults.contents;
    if (gradle.includes('keystorePropertiesFile')) {
      return config; // already applied
    }
    gradle = gradle.replace(/^(\s*)signingConfigs \{/m, PROPS_BLOCK);
    // close of the debug block inside signingConfigs — append release after it
    gradle = gradle.replace(
      /(signingConfigs \{[\s\S]*?debug \{[\s\S]*?\n        \})\n    \}/m,
      `$1\n${RELEASE_CONFIG}`
    );
    gradle = gradle.replace(
      /signingConfig signingConfigs\.debug\n(\s*def enableShrinkResources)/m,
      'signingConfig keystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug\n$1'
    );
    config.modResults.contents = gradle;
    return config;
  });
};
