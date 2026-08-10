module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Reanimated 4 moved the worklets transform into react-native-worklets.
      // This plugin MUST be last.
      "react-native-worklets/plugin",
    ],
  };
};
