import { Menu, app, type MenuItemConstructorOptions } from 'electron'

export function installApplicationMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'LeafMark',
      submenu: [
        { role: 'about', label: '关于 LeafMark' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 LeafMark' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出 LeafMark' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销输入' },
        { role: 'redo', label: '重做输入' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { type: 'separator' },
        { role: 'front', label: '前置全部窗口' },
        { role: 'close', label: '关闭窗口' }
      ]
    }
  ]

  if (!app.isPackaged) {
    template.push({
      label: '开发',
      submenu: [{ role: 'reload', label: '重新加载' }, { role: 'toggleDevTools', label: '开发者工具' }]
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
