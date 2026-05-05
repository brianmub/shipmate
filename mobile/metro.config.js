const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// To fix the react-native-maps error on web, we can alias it to react-native-web
// which already handles many basic components, or just let users know it's not supported.
// In this case, we prefer a separate .web.tsx file for the screen.
const path = require('path');

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'react-native-maps': path.resolve(__dirname, 'src/components/MapsMock.web.tsx'),
};

module.exports = config;
