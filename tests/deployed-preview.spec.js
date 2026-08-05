const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

test('deployed HTTPS new-resident lifecycle works on mobile', async ({ page }) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/Watchtower/i);
  await page.locator('a[href="scanner.html?demo=1"]').click();
  await expect(page.locator('#demoBanner')).toBeVisible();
  expect(await page.evaluate(()=>window.isSecureContext)).toBe(true);
  await page.locator('#file-input').setInputFiles('icon-1.png');
  await expect(page.locator('#demoLifecycle')).toBeVisible({timeout:30_000});
  await page.locator('#confirm-material-btn').click();
  await page.locator('#create-asset-btn').click();
  await page.locator('#list-asset-btn').click();
  await page.locator('#receive-asset-btn').click();
  await page.locator('#simulate-sale-btn').click();
  await expect(page.locator('#lifecycleTimeline li.done')).toHaveCount(6);
  await expect(page.locator('#finalValue')).toContainText('No money, token, or payment was created');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
