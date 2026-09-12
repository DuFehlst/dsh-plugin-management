/**
 * dsh-plugin-management — 浏览器半区：注册设置页「插件管理」章节。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { PluginManagementView } from './PluginManagementView'

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('pm', {
    zh: { 'nav.label': '插件启停' },
    en: { 'nav.label': 'Plugin toggles' },
  }), 'pm: locale')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'plugin-management',
    order: 999,
    locale: 'pm',
    label: () => ctx.locale.bind('pm')('nav.label'),
    inject: (owner: any) => ({ close: owner?.close }),
  }, PluginManagementView))
}
