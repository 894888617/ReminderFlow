import { Picker, View, Text } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh, useRouter } from "@tarojs/taro";
import { useMemo, useState } from "react";

import {
  createSpecialCalendarEvent,
  deleteCalendar,
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
import { canCreateRecord, canViewMembers } from "../../utils/permission";
import { getStoredToken, getStoredUser } from "../../utils/auth";
import { getUserNameDisplay } from "../../utils/userDisplay";

import "./index.scss";

const SELECTED_CALENDAR_KEY = "selected_calendar_id";

const statusOptions = [
  { label: "全部状态", value: "" },
  { label: "待处理", value: "pending" },
  { label: "已确认", value: "confirmed" },
  { label: "进行中", value: "in_progress" },
  { label: "已完成", value: "done" },
  { label: "已取消", value: "cancelled" },
  { label: "已逾期", value: "overdue" },
  { label: "休息", value: "rest" },
  { label: "不接", value: "blocked" },
  { label: "满", value: "full" },
];

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

function normalizeStatus(status?: string | null) {
  return String(status || "pending").toLowerCase();
}

function getStatusText(status?: string | null, eventType?: string | null) {
  const normalized = normalizeStatus(eventType || status);
  const map: Record<string, string> = {
    pending: "待处理",
    confirmed: "已确认",
    in_progress: "进行中",
    done: "已完成",
    completed: "已完成",
    cancelled: "已取消",
    overdue: "已逾期",
    rest: "休息",
    blocked: "不接",
    full: "满",
  };
  return map[normalized] || "待处理";
}

function getEventStatus(event: CalendarEvent) {
  const eventType = normalizeStatus(event.event_type);
  if (["rest", "blocked", "full"].includes(eventType)) return eventType;
  return normalizeStatus(event.status);
}

function getEventDate(event: CalendarEvent) {
  return (event.start_at || "").slice(0, 10);
}

function getEventTime(event: CalendarEvent) {
  if (event.all_day || ["rest", "full"].includes(getEventStatus(event)))
    return "全天";
  return (event.start_at || "").slice(11, 16) || "--:--";
}

function getEventTitle(event: CalendarEvent) {
  const status = getEventStatus(event);
  if (status === "rest") return "休息";
  if (status === "blocked") return "不接";
  if (status === "full") return "已满";
  return event.title || event.record_title || "未命名日程";
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
  const [deletingId, setDeletingId] = useState<number | null>(null);
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
  const showMembers = canViewMembers(currentUserRole);

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
    if (routeSelectedDate) {
      const nextDate = parseDate(routeSelectedDate);
      setSelectedDate(routeSelectedDate);
      setCurrentDate(nextDate);
    }
    loadData(routeCalendarId || currentCalendarId);
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

  const goCreateRecord = () => {
    if (!currentCalendarId) return;
    if (!writable) {
      Taro.showToast({ title: "你只有查看权限", icon: "none" });
      return;
    }
    Taro.navigateTo({
      url: `/pages/record-create/index?calendar_id=${currentCalendarId}&selected_date=${selectedDate}`,
    });
  };

  const handleSpecialEvent = async (type: "rest" | "blocked" | "full") => {
    if (!writable) {
      Taro.showToast({ title: "你只有查看权限", icon: "none" });
      return;
    }
    if (selectedDateEvents.some((item) => getEventStatus(item) === type)) {
      Taro.showToast({ title: "当天已设置", icon: "none" });
      return;
    }
    const labels = { rest: "休息", blocked: "不接", full: "已满" };
    try {
      await createSpecialCalendarEvent(currentCalendarId, {
        date: selectedDate,
        type,
      });
      Taro.showToast({ title: `已设置${labels[type]}`, icon: "success" });
      await Promise.all([
        loadEvents(currentCalendarId),
        loadStats(currentCalendarId),
      ]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCalendar = (calendar: Calendar) => {
    if (normalizeCalendarRole(calendar) !== "owner") {
      Taro.showToast({ title: "只有所有者可以删除日历", icon: "none" });
      return;
    }
    Taro.showModal({
      title: "确认删除日历",
      content: "日历内记录、提醒将一并删除，确认继续吗？",
      confirmText: "删除",
      confirmColor: "#ef4444",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          setDeletingId(calendar.id);
          Taro.showLoading({ title: "删除中", mask: true });
          await deleteCalendar(calendar.id);
          Taro.hideLoading();
          Taro.showToast({ title: "删除成功", icon: "success" });
          await loadData(0);
        } catch (err) {
          console.error(err);
          Taro.hideLoading();
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const renderScheduleList = () => {
    if (selectedDateEvents.length === 0) {
      return (
        <View className="empty-box">
          <View className="empty-title">这一天还没有日程</View>
          {writable && (
            <View className="empty-create-btn" onClick={goCreateRecord}>
              创建第一条日程
            </View>
          )}
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
              <View className="record-assignee-name">
                {item.assignee_name ||
                  (getEventStatus(item) === "blocked" ? "不接单" : "未分配")}
              </View>
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
            <View className={`record-status status-${getEventStatus(item)}`}>
              {getStatusText(item.status, item.event_type)}
            </View>
          </View>
        ))}
      </View>
    );
  };

  if (!loading && calendars.length === 0) {
    return (
      <View className="container">
        <View className="calendar-header">
          <View>
            <View className="page-title">日历</View>
            <View className="page-desc">
              创建共享日历后，即可管理预约日程。
            </View>
          </View>
        </View>
        <View className="onboarding-empty">
          <View className="onboarding-title">还没有日历</View>
          <View className="onboarding-desc">
            创建共享日历后，可以添加预约、设置提醒、邀请成员协作。
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
    <View className="container">
      <View className="calendar-header slim">
        <View>
          <View className="page-title">
            {selectedCalendar?.name || "客户记录"}
          </View>
        </View>
        <View
          className="create-calendar-btn"
          onClick={() =>
            Taro.navigateTo({ url: "/pages/calendar-create/index" })
          }
        >
          创建
        </View>
      </View>

      <View className="calendar-switch-card compact-switch">
        <Picker
          mode="selector"
          range={calendarNames}
          value={selectedCalendarIndex >= 0 ? selectedCalendarIndex : 0}
          onChange={(e) => {
            const selected = calendars[Number(e.detail.value)];
            if (selected) changeCalendar(selected.id);
          }}
        >
          <View className="calendar-picker">
            当前日历：{selectedCalendar?.name || "请选择"}
          </View>
        </Picker>
        <View className="calendar-actions">
          <View
            className="action-btn"
            onClick={() =>
              Taro.navigateTo({
                url: `/pages/calendar-detail/index?id=${currentCalendarId}`,
              })
            }
          >
            设置
          </View>
          {showMembers && (
            <View
              className="action-btn green"
              onClick={() =>
                Taro.navigateTo({
                  url: `/pages/calendar-members/index?calendar_id=${currentCalendarId}`,
                })
              }
            >
              成员
            </View>
          )}
          {currentUserRole === "owner" && selectedCalendar && (
            <View
              className={
                deletingId === selectedCalendar.id
                  ? "action-btn danger disabled"
                  : "action-btn danger"
              }
              onClick={() => handleDeleteCalendar(selectedCalendar)}
            >
              {deletingId === selectedCalendar.id ? "删除中" : "删除"}
            </View>
          )}
        </View>
      </View>

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
          <View>完成 {monthlyStats?.done || 0}</View>
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
        {writable && (
          <View className="new-record-btn" onClick={goCreateRecord}>
            新建日程
          </View>
        )}
      </View>

      {writable && (
        <View className="quick-actions">
          <View
            className="quick-btn rest"
            onClick={() => handleSpecialEvent("rest")}
          >
            设置休息
          </View>
          <View
            className="quick-btn blocked"
            onClick={() => handleSpecialEvent("blocked")}
          >
            设置不接
          </View>
          <View
            className="quick-btn full"
            onClick={() => handleSpecialEvent("full")}
          >
            设置已满
          </View>
        </View>
      )}

      {renderScheduleList()}
    </View>
  );
}
