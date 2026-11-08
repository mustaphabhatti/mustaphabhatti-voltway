// Metro config: lets the app import the shared TypeScript package (@wattly/shared)
// from the monorepo without publishing it.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../../packages/shared');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.extraNodeModules = { ...(config.resolver.extraNodeModules ?? {}), '@wattly/shared': sharedRoot };

module.exports = config;
