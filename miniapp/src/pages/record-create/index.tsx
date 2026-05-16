import { View, Text, Input, Textarea, Picker } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";

import {
  listCalendarMembers,
  listCalendars,
  normalizeCalendarRole,
  type Calendar,
  type CalendarMember,
} from "../../api/calendar";
import { createRecord } from "../../api/record";
import { canCreateRecord } from "../../utils/permission";

import { getStoredToken, getStoredUser } from "../../utils/auth";
import { getUserNameDisplay } from "../../utils/userDisplay";
import { RECORD_STATUS_OPTIONS } from "../../utils/recordStatus";
import "./index.scss";

const statusOptions = RECORD_STATUS_OPTIONS;

function buildDateTime(date: string, time = "00:00") {
  if (!date) return undefined;
  return `${date}T${time || "00:00"}:00+08:00`;
}

function todayDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// function currentTime() {
//   const d = new Date()
//   const hh = String(d.getHours()).padStart(2, '0')
//   const mm = String(d.getMinutes()).padStart(2, '0')
//   return `${hh}:${mm}`
// }

export default function RecordCreatePage() {
  const router = useRouter();

  const routeCalendarId = Number(
    router.params.calendar_id || router.params.workspace_id || 0,
  );
  const selectedDate = String(router.params.selected_date || "");
  const currentUser = getStoredUser();
  const defaultAppointmentDate = selectedDate || todayDate();

  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [calendarId, setCalendarId] = useState<number>(routeCalendarId || 0);
  const [members, setMembers] = useState<CalendarMember[]>([]);
  const [assigneeId, setAssigneeId] = useState<number | undefined>();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(defaultAppointmentDate);
  const [startTime, setStartTime] = useState("");
  const [statusIndex, setStatusIndex] = useState(0);

  const [submitting, setSubmitting] = useState(false);

  const calendarNames = useMemo(() => {
    return calendars.map((item) => item.name);
  }, [calendars]);

  const selectedCalendarIndex = useMemo(() => {
    if (!calendarId) return -1;
    return calendars.findIndex((item) => item.id === calendarId);
  }, [calendars, calendarId]);

  const selectedCalendar = useMemo(() => {
    return calendars.find((item) => item.id === calendarId);
  }, [calendars, calendarId]);

  const memberOptions = useMemo(() => {
    return members.map((item) => ({
      label: getUserNameDisplay(item),
      value: item.user_id,
    }));
  }, [members]);

  const selectedAssigneeIndex = useMemo(() => {
    if (!assigneeId) return -1;
    return memberOptions.findIndex((item) => item.value === assigneeId);
  }, [memberOptions, assigneeId]);

  const selectedAssigneeName = useMemo(() => {
    if (!assigneeId) return "未分配";

    const selected = memberOptions.find((item) => item.value === assigneeId);
    return selected?.label || "未分配";
  }, [memberOptions, assigneeId]);

  const loadCalendars = async () => {
    const token = getStoredToken();

    if (!token) {
      Taro.redirectTo({
        url: "/pages/login/index",
      });
      return;
    }

    try {
      const data = await listCalendars();
      const writableCalendars = (data || []).filter((item) =>
        canCreateRecord(normalizeCalendarRole(item)),
      );

      setCalendars(writableCalendars);

      if (routeCalendarId) {
        const target = writableCalendars.find(
          (item) => item.id === routeCalendarId,
        );

        if (target) {
          setCalendarId(target.id);
          return;
        }

        Taro.showToast({
          title: "当前日历无创建权限",
          icon: "none",
        });
      }

      if (!calendarId && writableCalendars.length > 0) {
        setCalendarId(writableCalendars[0].id);
      }

      if (calendarId) {
        const current = writableCalendars.find(
          (item) => item.id === calendarId,
        );

        if (!current) {
          setCalendarId(writableCalendars[0]?.id || 0);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useDidShow(() => {
    loadCalendars();
  });

  useEffect(() => {
    if (!calendarId) {
      setMembers([]);
      setAssigneeId(undefined);
      return;
    }

    let active = true;

    listCalendarMembers(calendarId)
      .then((data) => {
        if (!active) return;

        const items = data || [];

        setMembers(items);

        setAssigneeId((current) => {
          if (current && items.some((item) => item.user_id === current)) {
            return current;
          }

          if (
            currentUser?.id &&
            items.some((item) => item.user_id === currentUser.id)
          ) {
            return currentUser.id;
          }

          return undefined;
        });
      })
      .catch((err) => {
        console.error(err);

        if (active) {
          setMembers([]);
          setAssigneeId(undefined);
        }
      });

    return () => {
      active = false;
    };
  }, [calendarId]);

  const handleSubmit = async () => {
    if (submitting) return;

    if (calendars.length === 0) {
      Taro.showToast({
        title: "暂无可创建记录的日历",
        icon: "none",
      });
      return;
    }

    if (!calendarId) {
      Taro.showToast({
        title: "请选择日历",
        icon: "none",
      });
      return;
    }

    const finalTitle =
      title.trim() ||
      [customerName.trim(), serviceName.trim()].filter(Boolean).join(" ");

    if (!finalTitle) {
      Taro.showToast({
        title: "请输入标题或客户姓名",
        icon: "none",
      });
      return;
    }

    const finalAppointmentDate = appointmentDate || defaultAppointmentDate;
    const finalStartTime = startTime.trim();
    const calendarStartAt = buildDateTime(finalAppointmentDate, finalStartTime);

    try {
      setSubmitting(true);

      Taro.showLoading({
        title: "创建中",
        mask: true,
      });

      const record = await createRecord({
        workspace_id: calendarId,
        calendar_id: calendarId,
        title: finalTitle,
        content: [
          customerName.trim() ? `客户：${customerName.trim()}` : "",
          customerPhone.trim() ? `电话：${customerPhone.trim()}` : "",
          serviceName.trim() ? `项目：${serviceName.trim()}` : "",
          content.trim(),
        ]
          .filter(Boolean)
          .join("\n"),
        assignee_id: assigneeId,
        due_at: calendarStartAt,
        appointment_status: statusOptions[statusIndex].value,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        service_name: serviceName.trim(),
      });

      Taro.hideLoading();

      Taro.showToast({
        title: "创建成功",
        icon: "success",
      });

      setTimeout(() => {
        if (selectedDate) {
          Taro.setStorageSync("calendar_return_context", {
            calendar_id: calendarId,
            selected_date: finalAppointmentDate,
            refresh_at: Date.now(),
          });
          Taro.redirectTo({
            url: `/pages/calendar/index?calendar_id=${calendarId}&selected_date=${finalAppointmentDate}`,
          });
          return;
        }

        Taro.redirectTo({
          url: `/pages/record-detail/index?id=${record.id}`,
        });
      }, 500);
    } catch (err: any) {
      console.error(err);
      Taro.hideLoading();

      if (err?.code === "SCHEDULE_CONFLICT") {
        Taro.showToast({
          title: "该时间段已有安排，请调整时间",
          icon: "none",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="container">
      <View className="form-card">
        <View className="form-item">
          <Text className="form-label">所属日历</Text>

          {calendars.length === 0 ? (
            <View className="empty-calendar-guide">
              <View className="empty-calendar-title">暂无可创建记录的日历</View>
              <View className="empty-calendar-desc">
                你需要先创建一个日历，或者加入有创建权限的日历，才能添加记录。
              </View>

              <View
                className="empty-calendar-btn"
                onClick={() => {
                  Taro.navigateTo({
                    url: "/pages/calendar-create/index",
                  });
                }}
              >
                去创建日历
              </View>
            </View>
          ) : (
            <Picker
              mode="selector"
              range={calendarNames}
              value={selectedCalendarIndex >= 0 ? selectedCalendarIndex : 0}
              onChange={(e) => {
                const index = Number(e.detail.value);
                const selected = calendars[index];

                if (selected) {
                  setCalendarId(selected.id);
                }
              }}
            >
              <View className="picker-value">
                {selectedCalendar?.name || "请选择日历"}
              </View>
            </Picker>
          )}
        </View>

        <View className="form-item">
          <Text className="form-label">客户姓名</Text>
          <Input
            className="form-input"
            value={customerName}
            // placeholder="例如：客户A"
            maxlength={128}
            onInput={(e) => setCustomerName(e.detail.value)}
          />
        </View>

        <View className="form-item">
          <Text className="form-label">客户手机号</Text>
          <Input
            className="form-input"
            value={customerPhone}
            // placeholder="例如：138xxxx8888"
            maxlength={32}
            onInput={(e) => setCustomerPhone(e.detail.value)}
          />
        </View>

        <View className="form-item">
          <Text className="form-label">服务项目</Text>
          <Input
            className="form-input"
            value={serviceName}
            // placeholder="例如：美甲护理"
            maxlength={128}
            onInput={(e) => setServiceName(e.detail.value)}
          />
        </View>

        <View className="form-item">
          <Text className="form-label">标题</Text>
          <Input
            className="form-input"
            value={title}
            placeholder="可留空自动生成 客户姓名 + 服务项目"
            maxlength={200}
            onInput={(e) => setTitle(e.detail.value)}
          />
        </View>

        <View className="form-item">
          <Text className="form-label">备注</Text>
          <Textarea
            className="form-textarea"
            value={content}
            // placeholder="历史偏好、注意事项、补款等备注"
            maxlength={1000}
            onInput={(e) => setContent(e.detail.value)}
          />
        </View>

        <View className="form-item">
          <Text className="form-label">负责人</Text>

          {memberOptions.length === 0 ? (
            <View className="empty-member">暂无成员可选</View>
          ) : (
            <Picker
              mode="selector"
              range={memberOptions.map((item) => item.label)}
              value={selectedAssigneeIndex >= 0 ? selectedAssigneeIndex : 0}
              onChange={(e) => {
                const index = Number(e.detail.value);
                const selected = memberOptions[index];

                if (selected) {
                  setAssigneeId(selected.value);
                }
              }}
            >
              <View className="picker-value">{selectedAssigneeName}</View>
            </Picker>
          )}

          {assigneeId && (
            <View
              className="clear-time"
              onClick={() => {
                setAssigneeId(undefined);
              }}
            >
              清除负责人
            </View>
          )}
        </View>

        <View className="form-item">
          <Text className="form-label">预约日期</Text>
          <Picker
            mode="date"
            value={appointmentDate}
            onChange={(e) => setAppointmentDate(String(e.detail.value))}
          >
            <View className="datetime-picker">{appointmentDate}</View>
          </Picker>
        </View>

        <View className="form-item">
          <Text className="form-label">开始时间（可选）</Text>
          <Picker
            mode="time"
            value={startTime || "10:00"}
            onChange={(e) => setStartTime(String(e.detail.value))}
          >
            <View className="datetime-picker">
              {startTime || "选择开始时间"}
            </View>
          </Picker>
          {startTime ? (
            <View className="clear-time" onClick={() => setStartTime("")}>
              清除开始时间
            </View>
          ) : null}
        </View>

        <View className="form-item">
          <Text className="form-label">状态</Text>
          <Picker
            mode="selector"
            range={statusOptions.map((item) => item.label)}
            value={statusIndex}
            onChange={(e) => setStatusIndex(Number(e.detail.value))}
          >
            <View className="picker-value">
              {statusOptions[statusIndex].label}
            </View>
          </Picker>
        </View>

      </View>

      <View
        className={submitting ? "submit-btn disabled" : "submit-btn"}
        onClick={handleSubmit}
      >
        {submitting ? "创建中..." : "创建预约"}
      </View>
    </View>
  );
}
