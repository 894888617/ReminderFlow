import { Picker, View, Text } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh, useRouter } from "@tarojs/taro";
import { useMemo, useState } from "react";

import {
  createSpecialCalendarEvent,
  deleteCalendarEvent,
  getMemberWorkloadStats,
  getMonthlyCalendarStats,
  listCalendarEvents,
  listCalendarMembers,
  listCalendars,
  normalizeCalendarRole,
  type Calendar,
  type CalendarEvent,
  type CalendarMember,
  type MemberWorkloadItem,
  type MonthlyCalendarStats,
} from "../../api/calendar";
import { updateRecordStatus } from "../../api/record";
import { canCreateRecord, canUpdateRecordStatus } from "../../utils/permission";
import { getStoredToken, getStoredUser } from "../../utils/auth";
import {
  getUserNameDisplay,
  getWechatDisplayName,
} from "../../utils/userDisplay";
import {
  getRecordStatusText,
  normalizeRecordStatus,
  RECORD_STATUS_FILTER_OPTIONS,
  RECORD_STATUS_OPTIONS,
  type RecordStatus,
} from "../../utils/recordStatus";

import "./index.scss";

const SELECTED_CALENDAR_KEY = "selected_calendar_id";

const statusOptions = [
  ...RECORD_STATUS_FILTER_OPTIONS,
  { label: "休息", value: "rest" },
  { label: "不接", value: "blocked" },
  { label: "已满", value: "full" },
];

const specialStatusValues = ["rest", "blocked", "full"];

const ACTION_SHEET_MAX_ITEMS = 6;
const ACTION_SHEET_PAGE_SIZE = 4;

type FilterActionSheetOption = {
  label: string;
  value: string;
};

function showPagedActionSheet(
  options: FilterActionSheetOption[],
  onSelect: (option: FilterActionSheetOption) => void,
  page = 0,
) {
  if (options.length === 0) return;

  if (options.length <= ACTION_SHEET_MAX_ITEMS) {
    Taro.showActionSheet({
      itemList: options.map((item) => item.label),
      success: (res) => {
        const option = options[res.tapIndex];
        if (option) onSelect(option);
      },
      fail: (err) => {
        if (String(err.errMsg || '').includes('cancel')) {
          return
        }

        console.error('show calendar actions failed:', err)
      },
    });
    return;
  }

  const totalPages = Math.ceil(options.length / ACTION_SHEET_PAGE_SIZE);
  const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
  const pageOptions = options.slice(
    currentPage * ACTION_SHEET_PAGE_SIZE,
    (currentPage + 1) * ACTION_SHEET_PAGE_SIZE,
  );
  const hasPrevious = currentPage > 0;
  const hasNext = currentPage < totalPages - 1;
  const itemList = [
    ...pageOptions.map((item) => item.label),
    ...(hasPrevious ? ["上一页"] : []),
    ...(hasNext ? ["更多选项"] : []),
  ];

  Taro.showActionSheet({
    itemList,
    success: (res) => {
      const selectedOption = pageOptions[res.tapIndex];
      if (selectedOption) {
        onSelect(selectedOption);
        return;
      }

      const previousIndex = pageOptions.length;
      const nextIndex = pageOptions.length + (hasPrevious ? 1 : 0);
      if (hasPrevious && res.tapIndex === previousIndex) {
        showPagedActionSheet(options, onSelect, currentPage - 1);
        return;
      }
      if (hasNext && res.tapIndex === nextIndex) {
        showPagedActionSheet(options, onSelect, currentPage + 1);
      }
    },
    fail: (err) => {
      if (String(err.errMsg || '').includes('cancel')) {
        return
      }

      console.error('show calendar actions failed:', err)
    },
  });
}

function formatDate(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDate(date: string) {
  const [yyyy, mm, dd] = date.split("-").map(Number);
  return new Date(yyyy, (mm || 1) - 1, dd || 1);
}

function formatMonth(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${yyyy}年${mm}月`;
}

function formatMonthValue(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function getMonthRange(date: Date) {
  return {
    start: formatDate(new Date(date.getFullYear(), date.getMonth(), 1)),
    end: formatDate(new Date(date.getFullYear(), date.getMonth() + 1, 1)),
  };
}

function getMonthDays(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const leading = first.getDay();
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const result: Array<{ key: string; day?: number; date?: string }> = [];

  for (let i = 0; i < leading; i += 1) result.push({ key: `empty-${i}` });
  for (let day = 1; day <= days; day += 1) {
    const current = new Date(date.getFullYear(), date.getMonth(), day);
    result.push({ key: formatDate(current), day, date: formatDate(current) });
  }
  return result;
}

function normalizeSpecialStatus(status?: string | null) {
  return String(status || "").toLowerCase();
}

function getStatusText(status?: string | null, eventType?: string | null) {
  const specialStatus = normalizeSpecialStatus(eventType);
  const specialMap: Record<string, string> = {
    rest: "休息",
    blocked: "不接",
    full: "已满",
  };
  if (specialMap[specialStatus]) return specialMap[specialStatus];
  return getRecordStatusText(status);
}

function getEventStatus(event: CalendarEvent) {
  const eventType = normalizeSpecialStatus(event.event_type);
  if (["rest", "blocked", "full"].includes(eventType)) return eventType;
  return normalizeRecordStatus(event.status);
}

function getEventDate(event: CalendarEvent) {
  return (event.start_at || "").slice(0, 10);
}

function getEventTime(event: CalendarEvent) {
  const status = getEventStatus(event);
  if (event.all_day || ["rest", "full"].includes(status)) return "全天";
  const start = (event.start_at || "").slice(11, 16) || "--:--";
  const end = (event.end_at || "").slice(11, 16);
  return status === "blocked" && end ? `${start}-${end}` : start;
}

function getEventTitle(event: CalendarEvent) {
  const status = getEventStatus(event);
  if (status === "blocked") return "不接";
  if (status === "rest") return "休息";
  if (status === "full") return "已满";
  return event.record_title || event.title || "未命名日程";
}

function getEventRemark(event: CalendarEvent) {
  return event.remark || event.content || event.record_content || "";
}

function hasCustomerInfo(event: CalendarEvent) {
  return Boolean(event.customer_phone || event.customer_name);
}

function isSpecialEvent(event: CalendarEvent) {
  return ["rest", "blocked", "full"].includes(getEventStatus(event));
}

export default function CalendarPage() {
  const router = useRouter();
  const routeCalendarId = Number(
    router.params.calendar_id || router.params.id || 0,
  );
  const routeSelectedDate = router.params.selected_date
    ? String(router.params.selected_date)
    : "";
  const today = useMemo(() => new Date(), []);
  const todayText = useMemo(() => formatDate(today), [today]);
  const initialSelectedDate = routeSelectedDate || todayText;
  const currentUser = getStoredUser();

  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [members, setMembers] = useState<CalendarMember[]>([]);
  const [currentCalendarId, setCurrentCalendarId] = useState<number>(
    routeCalendarId || 0,
  );
  const [currentDate, setCurrentDate] = useState<Date>(
    parseDate(initialSelectedDate),
  );
  const [selectedDate, setSelectedDate] = useState<string>(initialSelectedDate);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [monthlyStats, setMonthlyStats] = useState<MonthlyCalendarStats | null>(
    null,
  );
  const [workload, setWorkload] = useState<MemberWorkloadItem[]>([]);

  const selectedCalendar = useMemo(
    () => calendars.find((item) => item.id === currentCalendarId),
    [calendars, currentCalendarId],
  );
  const currentUserRole = normalizeCalendarRole(selectedCalendar);
  const writable = canCreateRecord(currentUserRole);
  const canChangeRecordStatus = canUpdateRecordStatus(currentUserRole);

  const calendarNames = useMemo(
    () => calendars.map((item) => item.name),
    [calendars],
  );
  const selectedCalendarIndex = useMemo(
    () => calendars.findIndex((item) => item.id === currentCalendarId),
    [calendars, currentCalendarId],
  );
  const memberFilterOptions = useMemo(() => {
    const options = [{ label: "全部负责人", value: "" }];
    if (currentUser?.id)
      options.push({ label: "只看我", value: String(currentUser.id) });
    members.forEach((item) => {
      if (!options.some((option) => option.value === String(item.user_id))) {
        options.push({
          label: getUserNameDisplay(item),
          value: String(item.user_id),
        });
      }
    });
    return options;
  }, [members, currentUser?.id]);

  const hasActiveFilter = Boolean(assigneeFilter || statusFilter);

  const eventsByDate = useMemo(() => {
    return events.reduce<Record<string, CalendarEvent[]>>((map, item) => {
      const key = getEventDate(item);
      if (!key) return map;
      if (!map[key]) map[key] = [];
      map[key].push(item);
      return map;
    }, {});
  }, [events]);

  const selectedDateEvents = useMemo(
    () => eventsByDate[selectedDate] || [],
    [eventsByDate, selectedDate],
  );

  const accountName = getWechatDisplayName(currentUser);
  const accountText = accountName && accountName !== "-" ? accountName : "我的";
  const accountAvatarText =
    accountText === "我的" ? "我" : accountText.slice(0, 1);

  const loadMembers = async (calendarId: number) => {
    if (!calendarId) {
      setMembers([]);
      return;
    }
    const data = await listCalendarMembers(calendarId);
    setMembers(data || []);
  };

  const loadStats = async (calendarId: number, baseDate = currentDate) => {
    if (!calendarId) {
      setMonthlyStats(null);
      setWorkload([]);
      return;
    }
    const month = formatMonthValue(baseDate);
    const [stats, workloadStats] = await Promise.all([
      getMonthlyCalendarStats(calendarId, month),
      getMemberWorkloadStats(calendarId, month),
    ]);
    setMonthlyStats(stats);
    setWorkload(workloadStats.items || []);
  };

  const loadEvents = async (calendarId: number, baseDate = currentDate) => {
    if (!calendarId) {
      setEvents([]);
      return;
    }
    const range = getMonthRange(baseDate);
    const isSpecialStatus = specialStatusValues.includes(statusFilter);
    const data = await listCalendarEvents(calendarId, {
      ...range,
      assignee_id: assigneeFilter ? Number(assigneeFilter) : undefined,
      status: !isSpecialStatus && statusFilter ? statusFilter : undefined,
      event_type: isSpecialStatus ? statusFilter : undefined,
    });
    setEvents(data.items || []);
  };

  const loadData = async (
    preferredId = currentCalendarId,
    baseDate = currentDate,
  ) => {
    if (!getStoredToken()) {
      Taro.redirectTo({ url: "/pages/login/index" });
      return;
    }
    try {
      setLoading(true);
      const items = (await listCalendars()) || [];
      setCalendars(items);
      const storedId = Number(Taro.getStorageSync(SELECTED_CALENDAR_KEY) || 0);
      const nextId =
        [preferredId, routeCalendarId, storedId, items[0]?.id || 0].find((id) =>
          items.some((item) => item.id === id),
        ) || 0;
      setCurrentCalendarId(nextId);
      if (nextId) {
        Taro.setStorageSync(SELECTED_CALENDAR_KEY, nextId);
        await Promise.all([
          loadMembers(nextId),
          loadEvents(nextId, baseDate),
          loadStats(nextId, baseDate),
        ]);
      } else {
        setEvents([]);
        setMembers([]);
        setMonthlyStats(null);
        setWorkload([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  usePullDownRefresh(async () => {
    await loadData();
    Taro.stopPullDownRefresh();
  });

  useDidShow(() => {
    const returnContext = Taro.getStorageSync("calendar_return_context") as {
      calendar_id?: number;
      selected_date?: string;
      refresh_at?: number;
    } | null;
    if (returnContext) Taro.removeStorageSync("calendar_return_context");

    const nextSelectedDate = returnContext?.selected_date || routeSelectedDate;
    const nextCalendarId = Number(
      returnContext?.calendar_id || routeCalendarId || currentCalendarId,
    );

    const nextDate = nextSelectedDate
      ? parseDate(nextSelectedDate)
      : currentDate;
    if (nextSelectedDate) {
      setSelectedDate(nextSelectedDate);
      setCurrentDate(nextDate);
    }
    loadData(nextCalendarId, nextDate);
  });

  const changeCalendar = async (calendarId: number) => {
    setCurrentCalendarId(calendarId);
    Taro.setStorageSync(SELECTED_CALENDAR_KEY, calendarId);
    await Promise.all([
      loadMembers(calendarId),
      loadEvents(calendarId),
      loadStats(calendarId),
    ]);
  };

  const changeMonth = async (offset: number) => {
    const next = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + offset,
      1,
    );
    const nextSelectedDate = formatDate(next);
    setCurrentDate(next);
    setSelectedDate(nextSelectedDate);
    if (currentCalendarId)
      await Promise.all([
        loadEvents(currentCalendarId, next),
        loadStats(currentCalendarId, next),
      ]);
  };

  const refreshFilteredEvents = async (
    nextAssignee = assigneeFilter,
    nextStatus = statusFilter,
  ) => {
    if (!currentCalendarId) return;
    const range = getMonthRange(currentDate);
    const isSpecialStatus = specialStatusValues.includes(nextStatus);
    const data = await listCalendarEvents(currentCalendarId, {
      ...range,
      assignee_id: nextAssignee ? Number(nextAssignee) : undefined,
      status: !isSpecialStatus && nextStatus ? nextStatus : undefined,
      event_type: isSpecialStatus ? nextStatus : undefined,
    });
    setEvents(data.items || []);
  };

  const openAssigneeFilter = () => {
    showPagedActionSheet(memberFilterOptions, (option) => {
      setAssigneeFilter(option.value);
      refreshFilteredEvents(option.value, statusFilter);
    });
  };

  const openStatusFilter = () => {
    showPagedActionSheet(statusOptions, (option) => {
      setStatusFilter(option.value);
      refreshFilteredEvents(assigneeFilter, option.value);
    });
  };

  const resetFilter = () => {
    setAssigneeFilter("");
    setStatusFilter("");
    refreshFilteredEvents("", "");
  };

  const handleOpenFilter = () => {
    Taro.showActionSheet({
      itemList: ["筛选负责人", "筛选状态", "重置筛选"],
      success: (res) => {
        if (res.tapIndex === 0) {
          openAssigneeFilter();
          return;
        }

        if (res.tapIndex === 1) {
          openStatusFilter();
          return;
        }

        resetFilter();
      },
      fail: (err) => {
        if (String(err.errMsg || '').includes('cancel')) {
          return
        }

        console.error('show calendar actions failed:', err)
      },
    });
  };

  const goCreateRecord = (date = selectedDate) => {
    if (!currentCalendarId) return;
    if (!writable) {
      Taro.showToast({ title: "你只有查看权限", icon: "none" });
      return;
    }
    Taro.navigateTo({
      url: `/pages/record-create/index?calendar_id=${currentCalendarId}&selected_date=${date}`,
    });
  };

  const goSetSpecialDay = async (date: string, type: "rest" | "blocked" | "full") => {
    if (!currentCalendarId) return;
    if (!writable) {
      Taro.showToast({ title: "你只有查看权限", icon: "none" });
      return;
    }
    const selectedAssignee =
      assigneeFilter || (currentUser?.id ? String(currentUser.id) : "");

    if (!selectedAssignee) {
      Taro.showToast({ title: "缺少负责人", icon: "none" });
      return;
    }

    if (type === "full") {
      try {
        Taro.showLoading({ title: "设置中", mask: true });
        await createSpecialCalendarEvent(currentCalendarId, {
          date,
          type: "full",
          all_day: true,
          assignee_id: Number(selectedAssignee),
        });
        await refreshCalendarData();
        Taro.hideLoading();
        Taro.showToast({ title: "已设置为已满", icon: "success" });
      } catch (err) {
        console.error(err);
        Taro.hideLoading();
        Taro.showToast({ title: "设置失败", icon: "none" });
      }
      return;
    }

    const assigneeQuery = `&assignee_id=${selectedAssignee}`;
    Taro.navigateTo({
      url: `/pages/schedule-special/index?calendar_id=${currentCalendarId}&selected_date=${date}&type=${type}${assigneeQuery}`,
    });
  };

  const handleOpenCalendarActions = () => {
    if (!currentCalendarId) {
      Taro.showToast({ title: "请先选择日历", icon: "none" });
      return;
    }

    const itemList = writable
      ? ["创建日历", "设置当前日历", "管理成员"]
      : ["查看成员"];

    Taro.showActionSheet({
      itemList,
      success: (res) => {
        const item = itemList[res.tapIndex];

        if (item === "创建日历") {
          Taro.navigateTo({ url: "/pages/calendar-create/index" });
          return;
        }

        if (item === "设置当前日历") {
          Taro.navigateTo({
            url: `/pages/calendar-detail/index?id=${currentCalendarId}`,
          });
          return;
        }

        if (item === "管理成员" || item === "查看成员") {
          Taro.navigateTo({
            url: `/pages/calendar-members/index?calendar_id=${currentCalendarId}`,
          });
        }
      },
      fail: (err) => {
        if (String(err.errMsg || '').includes('cancel')) {
          return
        }

        console.error('show calendar actions failed:', err)
      },
    });
  };

  const handleLongPressDate = (date: string) => {
    if (!currentCalendarId) {
      Taro.showToast({ title: "请先选择日历", icon: "none" });
      return;
    }

    if (!writable) {
      Taro.showToast({ title: "你只有查看权限", icon: "none" });
      return;
    }

    setSelectedDate(date);
    setCurrentDate(parseDate(date));

    Taro.vibrateShort({ type: "light" });

    Taro.showActionSheet({
      itemList: ["新建日程", "设置休息", "设置不接", "设置已满"],
      success: (res) => {
        if (res.tapIndex === 0) {
          goCreateRecord(date);
          return;
        }

        const typeMap = ["rest", "blocked", "full"] as const;
        const type = typeMap[res.tapIndex - 1];
        if (type) goSetSpecialDay(date, type);
      },
      fail: (err) => {
        if (String(err.errMsg || '').includes('cancel')) {
          return
        }

        console.error('show calendar actions failed:', err)
      },
    });
  };

  const goProfile = () => {
    Taro.navigateTo({ url: "/pages/profile/index" });
  };
  const handleDeleteSpecialEvent = (item: CalendarEvent) => {
    if (!item.id) {
      Taro.showToast({ title: "状态记录缺少 ID", icon: "none" });
      return;
    }

    Taro.showModal({
      title: "确认删除状态",
      content: `确定删除${getEventTitle(item)}吗？`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          Taro.showLoading({ title: "删除中", mask: true });
          await deleteCalendarEvent(item.id);
          await loadEvents(currentCalendarId);
          Taro.hideLoading();
          Taro.showToast({ title: "删除成功", icon: "success" });
        } catch (err) {
          console.error(err);
          Taro.hideLoading();
          Taro.showToast({ title: "删除失败", icon: "none" });
        }
      },
    });
  };

  const refreshCalendarData = async () => {
    if (!currentCalendarId) return;
    await Promise.all([
      loadEvents(currentCalendarId),
      loadStats(currentCalendarId),
    ]);
  };

  const handleChangeRecordStatus = (item: CalendarEvent) => {
    if (!item.record_id) return;

    if (!canChangeRecordStatus) {
      Taro.showToast({ title: "无状态修改权限", icon: "none" });
      return;
    }

    const currentStatus = normalizeRecordStatus(item.status);
    Taro.showActionSheet({
      itemList: RECORD_STATUS_OPTIONS.map((option) => option.label),
      success: async (res) => {
        const nextStatus = RECORD_STATUS_OPTIONS[res.tapIndex]?.value as
          | RecordStatus
          | undefined;
        if (!nextStatus || nextStatus === currentStatus) return;

        try {
          Taro.showLoading({ title: "更新中", mask: true });
          await updateRecordStatus(item.record_id!, nextStatus);
          await refreshCalendarData();
          Taro.hideLoading();
          Taro.showToast({ title: "状态已更新", icon: "success" });
        } catch (err) {
          console.error(err);
          Taro.hideLoading();
          Taro.showToast({ title: "状态更新失败", icon: "none" });
          await refreshCalendarData();
        }
      },
      fail: (err) => {
        if (String(err.errMsg || '').includes('cancel')) {
          return
        }

        console.error('show calendar actions failed:', err)
      },
    });
  };

  const renderCustomNav = () => (
    <View className="custom-nav">
      <View className="nav-main-row">
        <Picker
          mode="selector"
          range={calendarNames}
          value={selectedCalendarIndex >= 0 ? selectedCalendarIndex : 0}
          disabled={calendars.length === 0}
          onChange={(e) => {
            const selected = calendars[Number(e.detail.value)];
            if (selected) changeCalendar(selected.id);
          }}
        >
          <View className="nav-calendar-pill">
            <Text className="nav-calendar-name">
              {selectedCalendar?.name || "选择日历"}
            </Text>
          </View>
        </Picker>

        <View className="nav-actions-center">
          <View className="nav-account" onClick={goProfile}>
            <View className="nav-account-avatar">{accountAvatarText}</View>
            <View className="nav-account-text">{accountText}</View>
          </View>
          <View className="nav-config-btn" onClick={handleOpenCalendarActions}>
            ⚙
          </View>
        </View>
      </View>
    </View>
  );

  const renderScheduleList = () => {
    if (selectedDateEvents.length === 0) {
      return (
        <View className="empty-box">
          <View className="empty-title">这一天还没有日程</View>
          {writable && <View className="empty-hint">长按日期可新建日程</View>}
        </View>
      );
    }

    return (
      <View className="record-list">
        {selectedDateEvents.map((item) => (
          <View
            key={item.id || item.event_id}
            className="timeline-card"
            onClick={() =>
              item.record_id &&
              Taro.navigateTo({
                url: `/pages/record-detail/index?id=${item.record_id}`,
              })
            }
          >
            <View className="timeline-time">{getEventTime(item)}</View>
            <View className="timeline-main">
              <View className="record-title">{getEventTitle(item)}</View>
              {getEventRemark(item) ? (
                <View className="record-remark">{getEventRemark(item)}</View>
              ) : null}
              {!isSpecialEvent(item) ? (
                <View className="record-assignee-name">
                  {item.assignee_name || "未分配"}
                </View>
              ) : null}
              {item.record_id && hasCustomerInfo(item) ? (
                <View
                  className="history-link"
                  onClick={(event) => {
                    event.stopPropagation();
                    const phone = item.customer_phone || "";
                    const name = item.customer_name || "";
                    Taro.navigateTo({
                      url: `/pages/customer-history/index?calendar_id=${currentCalendarId}&customer_phone=${encodeURIComponent(phone)}&customer_name=${encodeURIComponent(name)}`,
                    });
                  }}
                >
                  客户历史
                </View>
              ) : null}
            </View>
            <View className="timeline-actions">
              <View
                className={`record-status status-${getEventStatus(item)} ${item.record_id && canChangeRecordStatus ? "editable" : ""}`}
                onClick={(event) => {
                  if (!item.record_id) return;
                  event.stopPropagation();
                  handleChangeRecordStatus(item);
                }}
              >
                {getStatusText(item.status, item.event_type)}
              </View>
              {isSpecialEvent(item) && writable ? (
                <View
                  className="delete-status-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDeleteSpecialEvent(item);
                  }}
                >
                  删除
                </View>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    );
  };

  if (!loading && calendars.length === 0) {
    return (
      <View className="container calendar-container">
        {renderCustomNav()}
        <View className="onboarding-empty">
          <View className="onboarding-title">还没有日历</View>
          <View className="onboarding-desc">
            创建共享日历后，可以添加预约、邀请成员协作。
          </View>
          <View
            className="onboarding-primary-btn"
            onClick={() =>
              Taro.navigateTo({ url: "/pages/calendar-create/index" })
            }
          >
            创建第一个日历
          </View>
          <View className="onboarding-tip">
            也可以通过好友分享的邀请码加入已有日历。
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="container calendar-container">
      {renderCustomNav()}
      <View className="compact-stats-card">
        <View className="compact-stats-title">本月统计</View>
        <View className="compact-stats-row">
          <View className="compact-stat-item">
            预约 {monthlyStats?.total || 0} 条
          </View>
          <View className="compact-stat-item">
            休息 {monthlyStats?.rest_days || 0} 天
          </View>
          <View className="compact-stat-item">
            已满 {monthlyStats?.full_days || 0} 天
          </View>
        </View>
        <View className="compact-stats-row">
          <View className="compact-stat-item">
            完成 {monthlyStats?.completed || 0} 单
          </View>
          <View className="compact-stat-item">
            取消 {monthlyStats?.cancelled || 0} 单
          </View>
          <View className="compact-stat-item">
            待处理 {monthlyStats?.pending || 0} 单
          </View>
        </View>
        {workload.length > 0 ? (
          <View className="compact-member-row">
            {workload.slice(0, 3).map((item) => (
              <View key={item.user_id} className="compact-member-chip">
                {item.name || "成员"} {item.total} 单
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View className="month-card">
        <View className="month-head">
          <View className="month-nav-btn" onClick={() => changeMonth(-1)}>
            {"<"}
          </View>
          <View className="month-title">{formatMonth(currentDate)}</View>
          <View className="month-nav-btn" onClick={() => changeMonth(1)}>
            {">"}
          </View>
          <View className="month-head-actions">
            <View
              className="today-btn"
              onClick={() => {
                setCurrentDate(today);
                setSelectedDate(todayText);
                loadEvents(currentCalendarId, today);
                loadStats(currentCalendarId, today);
              }}
            >
              今天
            </View>
            <View
              className={hasActiveFilter ? "filter-btn active" : "filter-btn"}
              onClick={handleOpenFilter}
            >
              {hasActiveFilter ? "已筛选" : "筛选"}
            </View>
          </View>
        </View>

        <View className="weekday-row">
          {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
            <View key={day} className="weekday">
              {day}
            </View>
          ))}
        </View>

        <View className="day-grid appointment-grid">
          {getMonthDays(currentDate).map((item) => {
            const dayEvents = item.date ? eventsByDate[item.date] || [] : [];
            const visibleEvents = dayEvents.slice(0, 8);
            return (
              <View
                key={item.key}
                className={`day-cell appointment-cell ${item.date === selectedDate ? "active" : ""} ${item.date === todayText ? "today" : ""}`}
                onClick={() => item.date && setSelectedDate(item.date)}
                onLongPress={() => item.date && handleLongPressDate(item.date)}
              >
                {item.day ? (
                  <Text className="day-number">{item.day}</Text>
                ) : null}
                {visibleEvents.map((event) => (
                  <View
                    key={event.id || event.event_id}
                    className={`event-chip status-${getEventStatus(event)}`}
                  >
                    {getEventTime(event) === "全天"
                      ? ""
                      : `${getEventTime(event)} `}
                    {getEventTitle(event)}
                  </View>
                ))}
                {dayEvents.length > 8 ? (
                  <View className="event-more">+{dayEvents.length - 8}</View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>

      {/*<View className="record-section-head">*/}
      {/*  <View>*/}
      {/*    <View className="section-title">当天日程</View>*/}
      {/*    <View className="section-subtitle">*/}
      {/*      {selectedDate} ｜ {selectedDateEvents.length} 条*/}
      {/*    </View>*/}
      {/*  </View>*/}
      {/*</View>*/}

      {renderScheduleList()}
    </View>
  );
}
