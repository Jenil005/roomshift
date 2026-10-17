import {test, expect} from '@playwright/test';

// XR8 is a test double: these tests do NOT validate camera capture or SLAM.
async function mockEngine(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const w = window as any;
    let modules: any[] = [], scene: any, camera: any, timer: any;
    const state: any = w.arTest = {normal: true, stops: 0, runOptions: null, config: null, defer: false};
    const begin = () => {
      scene = new w.THREE.Scene();
      camera = new w.THREE.PerspectiveCamera();
      state.scene = scene;
      state.camera = camera;
      modules.forEach((m) => m.onStart?.());
      camera.position.set(0, 1.4, 0);
      camera.lookAt(0, 0, -2);
      camera.updateMatrixWorld(true);
      timer = setInterval(() => modules.forEach((m) => m.onUpdate?.({processCpuResult: {reality: {
        trackingStatus: state.normal ? 'NORMAL' : 'LIMITED', trackingReason: 'UNSPECIFIED',
      }}})), 20);
    };
    state.begin = begin;
    w.XR8 = {
      loadChunk: async () => {},
      GlTextureRenderer: {pipelineModule: () => ({name: 'feed'})},
      Threejs: {configure: () => {}, pipelineModule: () => ({name: 'three'}), xrScene: () => ({scene, camera})},
      XrController: {configure: (c: any) => {state.config = c;}, pipelineModule: () => ({name: 'slam'}), updateCameraProjectionMatrix: () => {}},
      XrConfig: {device: () => ({MOBILE: 'mobile'}), camera: () => ({BACK: 'back'})},
      addCameraPipelineModules: (m: any[]) => {modules = m;},
      run: (options: any) => {state.runOptions = {allowedDevices: options.allowedDevices, cameraConfig: options.cameraConfig}; if (!state.defer) begin();},
      stop: () => {state.stops++; clearInterval(timer);},
    };
  });
}

test('real distributed engine and SLAM chunk load; preview stays explicitly non-AR', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/ar-room.html');
  await expect(page.locator('#status')).toHaveText('3D PREVIEW - NOT AR');
  await expect(page.locator('#start-ar')).toBeEnabled({timeout: 45000});
  expect(await page.evaluate(() => typeof (window as any).XR8?.XrController?.pipelineModule)).toBe('function');
  expect(errors).toEqual([]);
});

test('metric pipeline, manual placement, fixed room while camera moves, power and recalibration', async ({page}) => {
  await mockEngine(page);
  await page.goto('/ar-room.html');
  await page.locator('#start-ar').click();
  await expect(page.locator('#calibrate-floor')).toBeEnabled();
  expect(await page.evaluate(() => (window as any).arTest.config)).toEqual({disableWorldTracking:false, scale:'absolute'});
  expect(await page.evaluate(() => (window as any).arTest.runOptions)).toEqual({allowedDevices:'mobile', cameraConfig:{direction:'back'}});
  await page.locator('#camera-height').fill('1.4');
  await page.locator('#calibrate-floor').click();
  await expect(page.locator('#place-room')).toBeEnabled();
  await page.locator('#place-room').click();
  const transform = () => page.evaluate(() => {
    const room = (window as any).arTest.scene.children[0].children.find((c: any) => c.userData.coreLabel);
    return {position: room.position.toArray(), rotation: room.rotation.toArray(), scale: room.scale.toArray(), visible: room.visible};
  });
  const initial = await transform();
  expect(initial.scale).toEqual([1,1,1]);
  expect(initial.position[1]).toBeCloseTo(0);
  expect(initial.position[2]).toBeCloseTo(-2);
  expect(initial.rotation[1]).toBeCloseTo(0);
  await page.evaluate(() => {(window as any).arTest.camera.position.x = 1;});
  await page.waitForTimeout(80);
  expect(await transform()).toEqual(initial);
  await page.locator('#restore-power').click();
  await expect(page.locator('#status')).toHaveText('CORE RESTORED - LOCAL ONLY');
  await page.evaluate(() => {(window as any).arTest.normal = false;});
  await expect(page.locator('#restore-power')).toBeDisabled();
  expect((await transform()).visible).toBe(false);
  await page.evaluate(() => {(window as any).arTest.normal = true;});
  await expect(page.locator('#restore-power')).toBeEnabled();
  await page.locator('#reset-room').click();
  await expect(page.locator('#calibration')).toBeVisible();
  await expect(page.locator('#place-room')).toBeDisabled();
  await expect(page.locator('#restore-power')).toHaveText('RESTORE POWER');
  await page.locator('#start-ar').click();
  expect(await page.evaluate(() => (window as any).arTest.stops)).toBe(1);
  await expect(page.locator('#camerafeed')).toBeHidden();
  await expect(page.locator('#start-ar')).toHaveText('RELOAD AR');
});

test('exit during a pending camera start rejects late onStart', async ({page}) => {
  await mockEngine(page);
  await page.goto('/ar-room.html');
  await page.evaluate(() => {(window as any).arTest.defer = true;});
  await page.locator('#start-ar').click();
  await expect(page.locator('#start-ar')).toHaveText('EXIT AR');
  await page.locator('#start-ar').click();
  await page.evaluate(() => (window as any).arTest.begin());
  expect(await page.evaluate(() => (window as any).arTest.stops)).toBe(2);
  await expect(page.locator('#camerafeed')).toBeHidden();
  await expect(page.locator('#place-room')).toBeDisabled();
});

test('camera failure stops engine and keeps preview available', async ({page}) => {
  await mockEngine(page);
  await page.goto('/ar-room.html');
  await page.evaluate(() => {(window as any).XR8.run = () => {throw new Error('Permission denied');};});
  await page.locator('#start-ar').click();
  await expect(page.locator('#status')).toHaveText('AR UNAVAILABLE');
  expect(await page.evaluate(() => (window as any).arTest.stops)).toBe(1);
  await page.locator('#preview-room').click();
  await expect(page.locator('#status')).toHaveText('3D PREVIEW - NOT AR');
});

test('missing binary fails with actionable message and preview remains available', async ({page}) => {
  await page.route('**/external/xr/xr.js', (route) => route.abort());
  await page.goto('/ar-room.html');
  await expect(page.locator('#status')).toHaveText('AR UNAVAILABLE');
  await expect(page.locator('#instructions')).toContainText('Engine assets missing');
  await expect(page.locator('#start-ar')).toBeDisabled();
  await page.locator('#preview-room').click();
  await expect(page.locator('#status')).toHaveText('3D PREVIEW - NOT AR');
});

test('portrait and landscape controls remain in viewport', async ({page}) => {
  await mockEngine(page);
  await page.goto('/ar-room.html');
  await page.locator('#start-ar').click();
  for (const size of [{width:390,height:844}, {width:844,height:390}]) {
    await page.setViewportSize(size);
    for (const id of ['start-ar','calibrate-floor','camera-height','preview-room']) {
      const box = await page.locator('#'+id).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
    }
  }
});

test('hiding the page stops the camera and does not automatically restart', async ({page}) => {
  await mockEngine(page);
  await page.goto('/ar-room.html');
  await page.locator('#start-ar').click();
  await expect(page.locator('#calibrate-floor')).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable:true, value:true});
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', {configurable:true, value:false});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => (window as any).arTest.stops)).toBe(1);
  await expect(page.locator('#start-ar')).toHaveText('RELOAD AR');
  await expect(page.locator('#camerafeed')).toBeHidden();
});

test('motion denial never starts the camera pipeline', async ({page}) => {
  await mockEngine(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'DeviceMotionEvent', {configurable:true, value:{requestPermission:async () => 'denied'}});
  });
  await page.goto('/ar-room.html');
  await page.locator('#start-ar').click();
  await expect(page.locator('#instructions')).toContainText('Motion permission was denied');
  expect(await page.evaluate(() => (window as any).arTest.runOptions)).toBeNull();
});

test('late motion permission from an exited attempt cannot start another session', async ({page}) => {
  await mockEngine(page);
  await page.addInitScript(() => {
    const w = window as any;
    w.motionResolvers = [];
    Object.defineProperty(window, 'DeviceMotionEvent', {configurable:true, value:{requestPermission:() => new Promise((resolve) => w.motionResolvers.push(resolve))}});
  });
  await page.goto('/ar-room.html');
  await page.locator('#start-ar').click();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.locator('#start-ar').click();
  await page.evaluate(() => (window as any).motionResolvers[0]('granted'));
  expect(await page.evaluate(() => (window as any).arTest.runOptions)).toBeNull();
  await page.evaluate(() => (window as any).motionResolvers[1]('granted'));
  await expect(page.locator('#calibrate-floor')).toBeEnabled();
});
