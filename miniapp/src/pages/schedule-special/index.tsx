import { View, Text, Textarea, Picker } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useMemo, useState } from "react";

import {
  createSpecialCalendarEvent,
  listCalendarMembers,
  type CalendarMember,
  type SpecialDayType,
} from "../../api/calendar";
import { getUserNameDisplay } from "../../utils/userDisplay";
import {
  returnToCalendar,
  saveCalendarReturnContext,
} from "../../utils/calendarReturn";

import "./index.scss";

const typeMeta: Record<SpecialDayType, { label: string }> = {
  rest: { label: "休息" },
  blocked: { label: "不接" },
  full: { label: "已满" },
};

function isSpecialDayType(value: string): value is SpecialDayType {
  return value === "rest" || value === "blocked" || value === "full";
}

export default function ScheduleSpecialPage() {
  const router = useRouter();
  const calendarId = Number(router.params.calendar_id || 0);
  const selectedDate = String(router.params.selected_date || "");
  const currentDate = String(router.params.current_date || selectedDate || "");
  const rawType = String(router.params.type || "rest");
  const type: SpecialDayType = isSpecialDayType(rawType) ? rawType : "rest";

  const initialAssigneeId = Number(router.params.assignee_id || 0);

  const [members, setMembers] = useState<CalendarMember[]>([]);
  const [assigneeId, setAssigneeId] = useState(initialAssigneeId);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const meta = useMemo(() => typeMeta[type], [type]);
  const memberOptions = useMemo(
    () =>
      members.map((item) => ({
        label: getUserNameDisplay(item),
        value: item.user_id,
      })),
    [members],
  );
  const assigneeIndex = Math.max(
    0,
    memberOptions.findIndex((item) => item.value === assigneeId),
  );

  useDidShow(() => {
    if (!calendarId) return;
    listCalendarMembers(calendarId)
      .then((items) => {
        const list = items || [];
        setMembers(list);
        if (!assigneeId && list[0]?.user_id) setAssigneeId(list[0].user_id);
      })
      .catch((err) => {
        console.error(err);
        Taro.showToast({ title: "负责人加载失败", icon: "none" });
      });
  });

  const handleSubmit = async () => {
    if (submitting) return;

    if (!calendarId || !selectedDate) {
      Taro.showToast({ title: "缺少日历或日期", icon: "none" });
      return;
    }

    if (!assigneeId) {
      Taro.showToast({ title: "请选择负责人", icon: "none" });
      return;
    }

    if (type === "blocked") {
      if (!startTime) {
        Taro.showToast({ title: "请选择开始时间", icon: "none" });
        return;
      }
      if (!endTime) {
        Taro.showToast({ title: "请选择结束时间", icon: "none" });
        return;
      }
      if (endTime <= startTime) {
        Taro.showToast({ title: "结束时间必须晚于开始时间", icon: "none" });
        return;
      }
    }

    try {
      setSubmitting(true);
      Taro.showLoading({ title: "保存中", mask: true });

      await createSpecialCalendarEvent(calendarId, {
        date: selectedDate,
        type,
        assignee_id: assigneeId,
        start_time: type === "blocked" ? startTime : undefined,
        end_time: type === "blocked" ? endTime : undefined,
        all_day: type !== "blocked",
        remark: remark.trim() || undefined,
      });

      saveCalendarReturnContext({
        currentCalendarId: calendarId,
        current_calendar_id: calendarId,
        calendar_id: calendarId,
        current_date: currentDate || selectedDate,
        selected_date: selectedDate,
      });

      Taro.hideLoading();
      Taro.showToast({ title: "设置成功", icon: "success" });

      setTimeout(() => {
        returnToCalendar();
      }, 500);
    } catch (err) {
      console.error(err);
      Taro.hideLoading();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="container special-container">
      <View className="form-card">
        <View className="form-item">
          <Text className="form-label">日期</Text>
          <View className="readonly-value">{selectedDate || "未选择"}</View>
        </View>

        <View className="form-item">
          <Text className="form-label">类型</Text>
          <View className={`type-pill type-${type}`}>{meta.label}</View>
        </View>
        <View className="form-item">
          <Text className="form-label">负责人</Text>
          <Picker
            mode="selector"
            range={memberOptions.map((item) => item.label)}
            value={assigneeIndex}
            disabled={memberOptions.length === 0}
            onChange={(e) => {
              const selected = memberOptions[Number(e.detail.value)];
              if (selected) setAssigneeId(selected.value);
            }}
          >
            <View className="readonly-value">
              {memberOptions[assigneeIndex]?.label || "请选择负责人"}
            </View>
          </Picker>
        </View>

        {type === "blocked" ? (
          <>
            <View className="form-item">
              <Text className="form-label">开始时间</Text>
              <Picker
                mode="time"
                value={startTime || "10:00"}
                onChange={(e) => setStartTime(String(e.detail.value))}
              >
                <View className="datetime-picker">
                  {startTime || "选择开始时间"}
                </View>
              </Picker>
            </View>
            <View className="form-item">
              <Text className="form-label">结束时间</Text>
              <Picker
                mode="time"
                value={endTime || "12:00"}
                onChange={(e) => setEndTime(String(e.detail.value))}
              >
                <View className="datetime-picker">
                  {endTime || "选择结束时间"}
                </View>
              </Picker>
            </View>
          </>
        ) : (
          <View className="form-item">
            <Text className="form-label">是否全天</Text>
            <View className="readonly-value">是</View>
          </View>
        )}

        <View className="form-item">
          <Text className="form-label">备注（可选）</Text>
          <Textarea
            className="form-textarea"
            value={remark}
            placeholder="例如：外出学习、这段时间不接单、当天预约已满"
            maxlength={500}
            onInput={(e) => setRemark(e.detail.value)}
          />
        </View>
      </View>

      <View
        className={submitting ? "submit-btn disabled" : "submit-btn"}
        onClick={handleSubmit}
      >
        {submitting ? "保存中..." : `确认设置${meta.label}`}
      </View>
    </View>
  );
}
