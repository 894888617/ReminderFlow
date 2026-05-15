import { Picker, View, Text } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh, useRouter } from "@tarojs/taro";
import { useMemo, useState } from "react";

import {
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

const statusOptions = RECORD_STATUS_FILTER_OPTIONS;

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

function getSpecialEventLabel(event: CalendarEvent) {
  const status = getEventStatus(event);
  const name = event.assignee_name || "未指定负责人";
  if (status === "rest") return `${name}休息`;
  if (status === "blocked") {
    const start = (event.start_at || "").slice(11, 16);
    const end = (event.end_at || "").slice(11, 16);
    return `${name}不接${start && end ? ` ${start} - ${end}` : ""}`;
  }
  if (status === "full") return `${name}已满`;
  return "";
}

function getEventTitle(event: CalendarEvent) {
  const specialLabel = getSpecialEventLabel(event);
  if (specialLabel) return specialLabel;
  return event.title || "未命名日程";
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
      options.push({ label: "我", value: String(currentUser.id) });
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

  const assigneeFilterIndex = Math.max(
    0,
    memberFilterOptions.findIndex((item) => item.value === assigneeFilter),
  );
  const statusFilterIndex = Math.max(
    0,
    statusOptions.findIndex((item) => item.value === statusFilter),
  );

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
    const data = await listCalendarEvents(calendarId, {
      ...range,
      assignee_id: assigneeFilter ? Number(assigneeFilter) : undefined,
      status: statusFilter || undefined,
    });
    setEvents(data.items || []);
  };

  const loadData = async (preferredId = currentCalendarId) => {
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
          loadEvents(nextId),
          loadStats(nextId),
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

    if (nextSelectedDate) {
      const nextDate = parseDate(nextSelectedDate);
      setSelectedDate(nextSelectedDate);
      setCurrentDate(nextDate);
    }
    loadData(nextCalendarId);
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
    const data = await listCalendarEvents(currentCalendarId, {
      ...range,
      assignee_id: nextAssignee ? Number(nextAssignee) : undefined,
      status: nextStatus || undefined,
    });
    setEvents(data.items || []);
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

  const goSetSpecialDay = (date: string, type: "rest" | "blocked" | "full") => {
    if (!currentCalendarId) return;
    if (!writable) {
      Taro.showToast({ title: "你只有查看权限", icon: "none" });
      return;
    }
    const selectedAssignee =
      assigneeFilter || (currentUser?.id ? String(currentUser.id) : "");
    const assigneeQuery = selectedAssignee
      ? `&assignee_id=${selectedAssignee}`
      : "";
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
        const nextStatus = RECORD_STATUS_OPTIONS[res.tapIndex]?.value as RecordStatus | undefined;
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
            当前日历 {selectedCalendar?.name || "选择日历"}
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
              {!isSpecialEvent(item) ? (
                <View className="record-assignee-name">
                  {item.assignee_name || "未分配"}
                </View>
              ) : null}
              {item.record_id ? (
                <View
                  className="history-link"
                  onClick={(event) => {
                    event.stopPropagation();
                    Taro.navigateTo({
                      url: `/pages/customer-history/index?calendar_id=${currentCalendarId}&keyword=${encodeURIComponent(
                        getEventTitle(item),
                      )}`,
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
      <View className="filter-card">
        <Picker
          mode="selector"
          range={memberFilterOptions.map((item) => item.label)}
          value={assigneeFilterIndex}
          onChange={(e) => {
            const value =
              memberFilterOptions[Number(e.detail.value)]?.value || "";
            setAssigneeFilter(value);
            refreshFilteredEvents(value, statusFilter);
          }}
        >
          <View className="filter-picker">
            负责人：
            {memberFilterOptions[assigneeFilterIndex]?.label || "全部负责人"}
          </View>
        </Picker>
        <Picker
          mode="selector"
          range={statusOptions.map((item) => item.label)}
          value={statusFilterIndex}
          onChange={(e) => {
            const value = statusOptions[Number(e.detail.value)]?.value || "";
            setStatusFilter(value);
            refreshFilteredEvents(assigneeFilter, value);
          }}
        >
          <View className="filter-picker">
            状态：{statusOptions[statusFilterIndex]?.label || "全部状态"}
          </View>
        </Picker>
      </View>

      <View className="month-card">
        <View className="month-head">
          <View className="month-btn" onClick={() => changeMonth(-1)}>
            {"<"}
          </View>
          <View className="month-title">{formatMonth(currentDate)}</View>
          <View className="month-btn" onClick={() => changeMonth(1)}>
            {">"}
          </View>
          <View
            className="month-btn today-btn"
            onClick={() => {
              setCurrentDate(today);
              setSelectedDate(todayText);
              loadEvents(currentCalendarId, today);
              loadStats(currentCalendarId, today);
            }}
          >
            今天
          </View>
        </View>

        <View className="calendar-hint">长按日期可新建日程 / 设置状态</View>

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
            const visibleEvents = dayEvents.slice(0, 3);
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
                {dayEvents.length > 3 ? (
                  <View className="event-more">+{dayEvents.length - 3}</View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>

      <View className="stats-card">
        <View className="stats-title">本月接单统计</View>
        <View className="stats-grid">
          <View>预约 {monthlyStats?.total || 0}</View>
          <View>完成 {monthlyStats?.completed || 0}</View>
          <View>取消 {monthlyStats?.cancelled || 0}</View>
          <View>待处理 {monthlyStats?.pending || 0}</View>
          <View>休息 {monthlyStats?.rest_days || 0} 天</View>
          <View>已满 {monthlyStats?.full_days || 0} 天</View>
        </View>
        <View className="workload-row">
          {(workload.length ? workload : []).map((item) => (
            <View key={item.user_id} className="workload-chip">
              {item.name || "成员"} {item.total} 单
            </View>
          ))}
          {workload.length === 0 ? (
            <View className="stats-empty">暂无成员工作量</View>
          ) : null}
        </View>
      </View>

      <View className="record-section-head">
        <View>
          <View className="section-title">当天日程</View>
          <View className="section-subtitle">
            {selectedDate} ｜ {selectedDateEvents.length} 条
          </View>
        </View>
      </View>

      {renderScheduleList()}
    </View>
  );
}
