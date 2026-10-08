/**
 * 默认规则：进入界面即退出沉浸模式并弹出操作指南。
 * 各 e2e 用例在场景就绪后先关掉自动弹出的指南，再按原有假设切换工具界面。
 */
export async function dismissEntryGuide(page, { timeout = 5000 } = {}) {
  const close = page.getByRole('button', { name: '开始遨游', exact: true })
  try {
    await close.waitFor({ state: 'visible', timeout })
  } catch {
    return // 没有自动弹出（或已被关闭）
  }
  await close.click()
  await page.locator('dialog.guide-dialog').waitFor({ state: 'detached', timeout })
}
