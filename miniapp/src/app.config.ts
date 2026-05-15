export default defineAppConfig({
  __usePrivacyCheck__: true,
  pages: [
    "pages/calendar/index",
    "pages/login/index",
    "pages/todo/index",
    "pages/notification/index",
    "pages/profile/index",
    "pages/calendar-create/index",
    "pages/calendar-detail/index",
    "pages/calendar-members/index",
    "pages/invite-accept/index",
    "pages/record-create/index",
    "pages/customer-history/index",
    "pages/record-detail/index",
    "pages/record-edit/index",
    "pages/invite/index",
    "pages/home/index",
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#ffffff",
    navigationBarTitleText: "轻记协同",
    navigationBarTextStyle: "black",
  },
  tabBar: {
    color: "#666666",
    selectedColor: "#1677ff",
    backgroundColor: "#ffffff",
    list: [
      {
        pagePath: "pages/calendar/index",
        text: "日历",
      },
      {
        pagePath: "pages/todo/index",
        text: "待办",
      },
      {
        pagePath: "pages/notification/index",
        text: "通知",
      },
      {
        pagePath: "pages/profile/index",
        text: "我的",
      },
    ],
  },
});
