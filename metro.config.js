const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The mock rewrites .mock-state.json on every request; keep the kit out of the watcher.
config.resolver.blockList = [...[config.resolver.blockList].flat(), /[/\\]mobile-engineer-kit[/\\].*/];

module.exports = config;
