import Taro from "@tarojs/taro";

export const CALENDAR_RETURN_CONTEXT_KEY = "calendar_return_context";
export const CALENDAR_PAGE_ROUTE = "pages/calendar/index";

export type CalendarReturnContext = {
  currentCalendarId?: number;
  current_calendar_id?: number;
  calendar_id?: number;
  current_date?: string;
  selected_date?: string;
  refresh_at?: number;
};

export function saveCalendarReturnContext(context: CalendarReturnContext) {
  Taro.setStorageSync(CALENDAR_RETURN_CONTEXT_KEY, {
    ...context,
    refresh_at: Date.now(),
  });
}

function normalizeRoute(route?: string) {
  return String(route || "").replace(/^\//, "");
}

export function isPreviousPageCalendar() {
  const pages = Taro.getCurrentPages();
  const previousPage = pages[pages.length - 2];
  return normalizeRoute(previousPage?.route) === CALENDAR_PAGE_ROUTE;
}

export function returnToCalendar() {
  if (isPreviousPageCalendar()) {
    Taro.navigateBack();
    return;
  }

  Taro.reLaunch({ url: `/${CALENDAR_PAGE_ROUTE}` });
}
