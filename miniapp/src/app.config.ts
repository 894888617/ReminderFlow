export default defineAppConfig({
  __usePrivacyCheck__: true,
  pages: [
    'pages/home/index',
    'pages/login/index',
    'pages/todo/index',
    'pages/workspace/index',
    'pages/workspace-create/index',
    'pages/workspace-guide/index',
    'pages/workspace-detail/index',
    'pages/workspace-members/index',
    'pages/record-create/index',
    'pages/record-detail/index',
    'pages/record-edit/index',
    'pages/notification/index',
    'pages/invite/index',
    'pages/profile/index',
    'pages/ai-assistant/index',
  ],
  plugins: {
    WechatSI: {
      version: '0.3.5',
      provider: 'wx069ba97219f66d99',
    },
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '轻记协同',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    color: '#666666',
    selectedColor: '#1677ff',
    backgroundColor: '#ffffff',
    list: [
      {
        pagePath: 'pages/home/index',
        text: '首页',
      },
      {
        pagePath: 'pages/todo/index',
        text: '待办',
      },
      {
        pagePath: 'pages/workspace/index',
        text: '空间',
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
      },
    ],
  },
})
