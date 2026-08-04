const { test, expect } = require('@playwright/test');

const SCAN_RESULT = {
  summary: 'A clean pile of aluminum cans and copper wire.',
  estimated_value_low: 30,
  estimated_value_high: 40,
  coaching_tip: 'Separate the copper wire from the cans before pickup.',
  items_seen: ['Aluminum cans', 'Copper wire'],
  safety_warning: '',
};

const TEST_STATE_KEY = 'watchtower.scanner-checkpoint.state';

function fakeSupabaseClientScript() {
  return `
    (() => {
      const key = ${JSON.stringify(TEST_STATE_KEY)};
      const initialState = {
        scanInsertCalls: 0,
        pickupUpdateCalls: 0,
        uploads: 0,
        scans: [],
        jobs: []
      };

      function readState() {
        try {
          return JSON.parse(localStorage.getItem(key)) || structuredClone(initialState);
        } catch {
          return structuredClone(initialState);
        }
      }

      function writeState(state) {
        localStorage.setItem(key, JSON.stringify(state));
      }

      function scansTable() {
        return {
          insert(payload) {
            return {
              async select() {
                const state = readState();
                const id = '10000000-0000-4000-8000-000000000001';
                state.scanInsertCalls += 1;
                state.scans.push({ id, ...payload });
                writeState(state);
                return { data: [{ id }], error: null };
              }
            };
          },
          select() {
            return {
              eq(column, value) {
                return {
                  async maybeSingle() {
                    const scan = readState().scans.find((row) => row[column] === value) || null;
                    return { data: scan, error: null };
                  }
                };
              }
            };
          },
          update(payload) {
            let scanId = null;
            return {
              eq(column, value) {
                if (column === 'id') scanId = value;
                return {
                  is() {
                    return {
                      async select() {
                        const state = readState();
                        const scan = state.scans.find((row) => row.id === scanId);
                        if (!scan || scan.bounty_status !== null) {
                          return { data: [], error: null };
                        }

                        state.pickupUpdateCalls += 1;
                        Object.assign(scan, payload);
                        if (!state.jobs.some((job) => job.scan_id === scanId && job.status !== 'CANCELLED')) {
                          state.jobs.push({ id: 7001, scan_id: scanId, status: 'PENDING' });
                        }
                        writeState(state);
                        return { data: [scan], error: null };
                      }
                    };
                  }
                };
              }
            };
          }
        };
      }

      window.supabase = {
        createClient() {
          return {
            auth: {
              async getSession() {
                return {
                  data: {
                    session: { user: { id: '20000000-0000-4000-8000-000000000001' } }
                  }
                };
              }
            },
            from(table) {
              if (table === 'scans') return scansTable();
              if (table === 'residents') {
                return {
                  select() {
                    return {
                      eq() {
                        return {
                          async maybeSingle() {
                            return {
                              data: { id: '30000000-0000-4000-8000-000000000001' },
                              error: null
                            };
                          }
                        };
                      }
                    };
                  }
                };
              }
              throw new Error('Unexpected checkpoint table: ' + table);
            },
            storage: {
              from(bucket) {
                if (bucket !== 'pickup-photos') throw new Error('Unexpected checkpoint bucket: ' + bucket);
                return {
                  async upload() {
                    const state = readState();
                    state.uploads += 1;
                    writeState(state);
                    return { data: { path: 'fixture/pickup.jpg' }, error: null };
                  }
                };
              }
            }
          };
        }
      };

      window.__scannerCheckpoint = {
        readState,
        reset() { writeState(structuredClone(initialState)); }
      };
    })();
  `;
}

async function installBrowserBoundaries(page, { camera = 'success' } = {}) {
  await page.addInitScript(({ cameraMode }) => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        async getUserMedia() {
          if (cameraMode === 'denied') throw new DOMException('Permission denied', 'NotAllowedError');
          return new MediaStream();
        }
      }
    });

    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      configurable: true,
      get: () => 320
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      configurable: true,
      get: () => 240
    });

    HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
    HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,d2F0Y2h0b3dlci10ZXN0';
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
      callback(new Blob(['watchtower-test'], { type: 'image/jpeg' }));
    };

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success) {
          success({ coords: { latitude: 29.1872, longitude: -82.1401, accuracy: 12 } });
        }
      }
    });
  }, { cameraMode: camera });

  await page.route('**/npm/@supabase/supabase-js@2*', (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: fakeSupabaseClientScript(),
  }));
  await page.route('**/npm/exifr@7.1.3/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: 'window.exifr = { parse: async () => null };',
  }));
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/css',
    body: '',
  }));

  const productionRequests = [];
  await page.route('**://*.supabase.co/**', (route) => {
    productionRequests.push(route.request().url());
    return route.abort('blockedbyclient');
  });

  return productionRequests;
}

async function routeSuccessfulScan(page, counter) {
  await page.route('**/api/scan', async (route) => {
    counter.count += 1;
    counter.payloads.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCAN_RESULT) });
  });
}

async function capture(page) {
  await page.goto('/scanner.html');
  await page.locator('#capture-btn').click();
}

async function expectRecoverableFailure(page, expectedText) {
  await expect(page.locator('#console')).toContainText(expectedText);
  await expect(page.locator('#capture-btn')).toBeEnabled();
  await expect(page.locator('#retake-btn')).toBeVisible();
  await page.locator('#retake-btn').click();
  await expect(page.locator('#capture-btn')).toHaveText('Execute Optical Scan');
  await expect(page.locator('#capture-btn')).toBeEnabled();
}

test.describe('canonical resident scanner checkpoint', () => {
  test('reports camera permission denial without contacting production', async ({ page }) => {
    const productionRequests = await installBrowserBoundaries(page, { camera: 'denied' });
    await page.goto('/scanner.html');

    await expect(page.locator('#console')).toContainText('CAMERA ACCESS DENIED');
    expect(productionRequests).toEqual([]);
  });

  test('one capture reaches /api/scan and renders one valid response', async ({ page }) => {
    const productionRequests = await installBrowserBoundaries(page);
    const requests = { count: 0, payloads: [] };
    await routeSuccessfulScan(page, requests);

    await capture(page);

    await expect(page.locator('#summaryText')).toHaveText(SCAN_RESULT.summary);
    await expect(page.locator('#itemsBlock span')).toHaveCount(2);
    await expect(page.locator('#tipText')).toHaveText(SCAN_RESULT.coaching_tip);
    await expect(page.locator('#earnedText')).toHaveText('You earned: 1,600 WTWR ($16.00)');
    expect(requests.count).toBe(1);
    expect(requests.payloads[0].mediaType).toBe('image/jpeg');
    expect(requests.payloads[0].imageBase64).toBeTruthy();
    expect(productionRequests).toEqual([]);
  });

  for (const failure of [
    {
      name: 'invalid JSON',
      expected: 'CONNECTION ERROR',
      first: (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: 'not-json' }),
    },
    {
      name: 'API failure',
      expected: 'ERROR: Scanner temporarily unavailable',
      first: (route) => route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Scanner temporarily unavailable' }),
      }),
    },
    {
      name: 'network failure',
      expected: 'CONNECTION ERROR',
      first: (route) => route.abort('failed'),
    },
  ]) {
    test(`recovers from ${failure.name}`, async ({ page }) => {
      const productionRequests = await installBrowserBoundaries(page);
      let calls = 0;
      await page.route('**/api/scan', async (route) => {
        calls += 1;
        if (calls === 1) return failure.first(route);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCAN_RESULT) });
      });

      await capture(page);
      await expectRecoverableFailure(page, failure.expected);
      await page.locator('#capture-btn').click();
      await expect(page.locator('#summaryText')).toHaveText(SCAN_RESULT.summary);
      expect(calls).toBe(2);
      expect(productionRequests).toEqual([]);
    });
  }

  test('persists one scan, opens pickup once, and reloads one active job', async ({ page }) => {
    const productionRequests = await installBrowserBoundaries(page);
    const requests = { count: 0, payloads: [] };
    await routeSuccessfulScan(page, requests);
    await page.route('**/api/verify-pickup', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ looks_like_staged_material: true, note: 'Fixture material is staged.' }),
    }));

    await capture(page);
    await expect(page.locator('#summaryText')).toHaveText(SCAN_RESULT.summary);
    await page.waitForFunction(() => currentResidentId !== null);
    await page.locator('#log-btn').click();
    await expect(page.locator('#submit-btn')).toBeAttached();
    expect(new URL(page.url()).searchParams.get('bounty'))
      .toBe('10000000-0000-4000-8000-000000000001');

    let state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), TEST_STATE_KEY);
    expect(state.scanInsertCalls).toBe(1);
    expect(state.scans).toHaveLength(1);
    expect(state.jobs).toHaveLength(0);

    await expect(page.locator('#capture-btn')).toBeVisible();
    await page.locator('#capture-btn').click();
    await page.locator('#submit-btn').evaluate((button) => {
      button.click();
      button.click();
    });
    await expect(page.locator('#stateTitle')).toContainText('PICKUP SPOT SAVED');

    state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), TEST_STATE_KEY);
    expect(state.scanInsertCalls).toBe(1);
    expect(state.pickupUpdateCalls).toBe(1);
    expect(state.scans).toHaveLength(1);
    expect(state.scans[0].bounty_status).toBe('open');
    expect(state.jobs).toEqual([{
      id: 7001,
      scan_id: '10000000-0000-4000-8000-000000000001',
      status: 'PENDING',
    }]);

    await page.reload();
    await expect(page.locator('#stateTitle')).toContainText('PICKUP SPOT SAVED');

    state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), TEST_STATE_KEY);
    expect(state.scanInsertCalls).toBe(1);
    expect(state.pickupUpdateCalls).toBe(1);
    expect(state.scans).toHaveLength(1);
    expect(state.jobs).toHaveLength(1);
    expect(requests.count).toBe(1);
    expect(productionRequests).toEqual([]);
  });
});
