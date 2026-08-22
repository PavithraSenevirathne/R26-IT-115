const fs = require('fs');
const path = require('path');

console.log('Running pre-build patches for Gradle 9 & Autolinking...');

const onnxDir = path.join(__dirname, 'node_modules', 'onnxruntime-react-native');
const onnxGradlePath = path.join(onnxDir, 'android', 'build.gradle');
const unimodulePath = path.join(onnxDir, 'unimodule.json');

if (fs.existsSync(unimodulePath)) {
  fs.unlinkSync(unimodulePath);
  console.log('Deleted unimodule.json to fix Expo autolinking');
}

if (fs.existsSync(onnxGradlePath)) {
  let onnxConfig = fs.readFileSync(onnxGradlePath, 'utf8');
  onnxConfig = onnxConfig.replace(/class VersionNumber \{[\s\S]*?\}\s*/, '');
  onnxConfig = onnxConfig.replace(/VersionNumber\.parse\(REACT_NATIVE_VERSION\)\s*<\s*VersionNumber\.parse\(['"]0\.71['"]\)/g, 'false');
  fs.writeFileSync(onnxGradlePath, onnxConfig);
  console.log('Patched onnxruntime-react-native Gradle config');
}

const expoDirs = ['expo', 'expo-modules-core'];
expoDirs.forEach(dir => {
  const gradlePath = path.join(__dirname, 'node_modules', dir, 'android', 'build.gradle');
  if (fs.existsSync(gradlePath)) {
    let gradleConfig = fs.readFileSync(gradlePath, 'utf8');
    if (gradleConfig.includes('components.release') || gradleConfig.includes('components["release"]')) {
      gradleConfig = gradleConfig.replace(/from components\.release/g, '// from components.release');
      gradleConfig = gradleConfig.replace(/from components\[['"]release['"]\]/g, '// from components["release"]');
      fs.writeFileSync(gradlePath, gradleConfig);
      console.log(`Patched ${dir} for AGP 9 missing component issue`);
    }
  }
});