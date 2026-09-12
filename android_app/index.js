import { AppRegistry } from 'react-native';
import { registerRootComponent } from 'expo';

import App from './App';
import uploadScreenshotTask from './src/UploadScreenshotTask';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Runs when the native overlay's "Save" button is tapped, even if the app's
// JS UI isn't currently mounted. See UploadHeadlessTaskService.kt.
AppRegistry.registerHeadlessTask('UploadScreenshotTask', () => uploadScreenshotTask);
