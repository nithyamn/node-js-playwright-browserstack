/* eslint-disable @typescript-eslint/no-shadow */
import { test, TestInfo, expect, Page, _android } from '@playwright/test';
import cp from 'child_process';
import BrowserStackLocal from 'browserstack-local';

const clientPlaywrightVersion = cp
  .execSync('npx playwright --version')
  .toString()
  .trim()
  .split(' ')[1];

// BrowserStack Specific Capabilities.
const capsDesktopBrowser = {
  browser: 'chrome',
  os: 'osx',
  os_version: 'catalina',
  projectName: `${process.env.PLAYWRIGHT_PROJECT_NAME}`,
  buildName: `${process.env.PLAYWRIGHT_PROJECT_NAME} ${process.env.BUILD}`,
  'browserstack.username': process.env.BROWSERSTACK_USERNAME,
  'browserstack.accessKey': process.env.BROWSERSTACK_ACCESS_KEY,
  'browserstack.local': process.env.LOCAL_BS || false,
  'client.playwrightVersion': clientPlaywrightVersion,
  'browserstack.playwrightVersion': clientPlaywrightVersion,
  testObservability: true,
  browserstackAutomation: false,
  build: "playwright-build",
  name: 'Test Name',
  'browserstack.maskCommands': 'setCookies, getCookies, setHTTPCredentials, setStorageState, setGeolocation',
};

// BrowserStack Specific Capabilities for Android Device.
const capsAndroid = {
  realMobile: 'true',
  deviceName: 'Samsung Galaxy S22',
  osVersion: '12.0',
  browserName: 'chrome',
  projectName: `${process.env.PLAYWRIGHT_PROJECT_NAME}`,
  buildName: `${process.env.PLAYWRIGHT_PROJECT_NAME} ${process.env.BUILD}`,
  'browserstack.username': process.env.BROWSERSTACK_USERNAME,
  'browserstack.accessKey': process.env.BROWSERSTACK_ACCESS_KEY,
  'browserstack.local': process.env.LOCAL_BS || false,
  'client.playwrightVersion': clientPlaywrightVersion,
  'browserstack.playwrightVersion': clientPlaywrightVersion,
  testObservability: true,
  browserstackAutomation: false,
  'browserstack.playwrightLogs': 'true',
  sessionName: 'Test Name',
  build: "playwright-build",
  deviceOrientation: 'portrait',
  'browserstack.maskCommands': 'setCookies, getCookies, setHTTPCredentials, setStorageState, setGeolocation',
};

const bsLocal = new BrowserStackLocal.Local();

// replace YOUR_ACCESS_KEY with your key. You can also set an environment variable - "BROWSERSTACK_ACCESS_KEY".
const BS_LOCAL_ARGS = {
  key: process.env.BROWSERSTACK_ACCESS_KEY,
};

// Patching the capabilities dynamically according to the project name.
const patchCaps = (name, title) => {
  const combination = name.split(/@browserstack/)[0];
  const [browerCaps, osCaps] = combination.split(/:/);
  const [browser] = browerCaps.split(/@/);
  const osCapsSplit = osCaps.split(/ /);
  const os = osCapsSplit.shift();
  const os_version = osCapsSplit.join(' ');
  capsDesktopBrowser.browser = browser || 'chrome';
  capsDesktopBrowser.os = os || 'osx';
  capsDesktopBrowser.os_version = os_version || 'catalina';
  capsDesktopBrowser.name = title;
  capsDesktopBrowser.testObservability = true;
};

const patchCapsAndroid = (name, title) => {
  const combination = name.split(/@android/)[0];
  const [osCaps, deviceName] = combination.split(/:/);
  const [browser, osVersion] = osCaps.split(/@/);
  capsAndroid.browserName = browser || 'chrome';
  capsAndroid.osVersion = osVersion || '12.0';
  capsAndroid.deviceName = deviceName || 'Samsung Galaxy S22';
  capsAndroid.realMobile = 'true';
  capsAndroid.sessionName = title;
  capsAndroid.testObservability = true;
};

const isHash = (entity) => Boolean(entity && typeof (entity) === 'object' && !Array.isArray(entity));
const nestedKeyValue = (hash, keys) => keys.reduce((hash, key) => (isHash(hash) ? hash[key] : undefined), hash);
const isUndefined = (val) => (val === undefined || val === null || val === '');
const evaluateSessionStatus = (status) => {
  if (!isUndefined(status)) {
    status = status.toLowerCase();
  }
  if (status === 'passed') {
    return 'passed';
  } if (status === 'failed' || status === 'timedout') {
    return 'failed';
  }
  return '';
};

const overwrittenTest = process.env.NODE_ENV === 'local' ? test : test.extend({
  page: async ({ page, playwright }, use, testInfo) => {
    const setSessionStatus = async (vPage) => {
      const testResult = {
        action: 'setSessionStatus',
        arguments: {
          status: evaluateSessionStatus(testInfo.status),
          reason: nestedKeyValue(testInfo, ['error', 'message']),
        },
      };
      await vPage.evaluate(
        () => {},
        `browserstack_executor: ${JSON.stringify(testResult)}`,
      );
    };
    if (testInfo.project.name.match(/browserstack/)) {
      patchCaps(testInfo.project.name, `${testInfo.file.split('/').pop()} - ${testInfo.title}`);
      const capsBrowser = encodeURIComponent(JSON.stringify(capsDesktopBrowser));
      const vBrowser = await playwright.chromium.connect(`wss://cdp.browserstack.com/playwright?caps=${capsBrowser}`);
      const vContext = await vBrowser.newContext(testInfo.project.use);
      const vPage = await vContext.newPage();
      await use(vPage);
      await setSessionStatus(vPage);
      await vPage.close();
      await vBrowser.close();
      return;
    }
    if (testInfo.project.name.match(/android/)) {
      patchCapsAndroid(testInfo.project.name, `${testInfo.file} - ${testInfo.title}`);
      const capsMobile = encodeURIComponent(JSON.stringify(capsAndroid));
      const device = await _android.connect(`wss://cdp.browserstack.com/playwright?caps=${capsMobile}`);
      await device.shell('am force-stop com.android.chrome');
      const vContext = await device.launchBrowser();
      const vPage = await vContext.newPage();
      await use(vPage);
      await setSessionStatus(vPage);
      await vPage.close();
      await vContext.close();
      await device.close();
      return;
    }
    use(page);
    return;
  },
});

export {
  overwrittenTest as test, BS_LOCAL_ARGS, bsLocal, expect,
};
