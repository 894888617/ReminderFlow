import { View, Text, Input, Textarea, Picker } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useMemo, useState } from "react";

import {
  createSpecialCalendarEvent,
  type SpecialDayType,
} from "../../api/calendar";

import "./index.scss";

const typeMeta: Record<SpecialDayType, { label: string; hint: string }> = {
  rest: { label: "休息", hint: "全天休息，可补充备注说明。" },
  blocked: { label: "不接", hint: "可选择开始时间；留空表示当天不接。" },
  full: { label: "已满", hint: "当天预约已满，可补充备注说明。" },
};

function isSpecialDayType(value: string): value is SpecialDayType {
  return value === "rest" || value === "blocked" || value === "full";
}

export default function ScheduleSpecialPage() {
  const router = useRouter();
  const calendarId = Number(router.params.calendar_id || 0);
  const selectedDate = String(router.params.selected_date || "");
  const rawType = String(router.params.type || "rest");
  const type: SpecialDayType = isSpecialDayType(rawType) ? rawType : "rest";

  const [startTime, setStartTime] = useState("");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const meta = useMemo(() => typeMeta[type], [type]);

  const handleSubmit = async () => {
    if (submitting) return;

    if (!calendarId || !selectedDate) {
      Taro.showToast({ title: "缺少日历或日期", icon: "none" });
      return;
    }

    try {
      setSubmitting(true);
      Taro.showLoading({ title: "保存中", mask: true });

      await createSpecialCalendarEvent(calendarId, {
        date: selectedDate,
        type,
        start_time: type === "blocked" && startTime ? startTime : undefined,
        all_day: type !== "blocked" || !startTime,
        remark: remark.trim() || undefined,
      });

      Taro.setStorageSync("calendar_return_context", {
        calendar_id: calendarId,
        selected_date: selectedDate,
        refresh_at: Date.now(),
      });

      Taro.hideLoading();
      Taro.showToast({ title: "设置成功", icon: "success" });

      setTimeout(() => {
        Taro.redirectTo({
          url: `/pages/calendar/index?calendar_id=${calendarId}&selected_date=${selectedDate}`,
        });
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
      <View className="special-header">
        <View>
          <View className="special-title">设置{meta.label}</View>
          <View className="special-subtitle">{meta.hint}</View>
        </View>
      </View>

      <View className="form-card">
        <View className="form-item">
          <Text className="form-label">日期</Text>
          <View className="readonly-value">{selectedDate || "未选择"}</View>
        </View>

        <View className="form-item">
          <Text className="form-label">类型</Text>
          <View className={`type-pill type-${type}`}>{meta.label}</View>
        </View>

        {type === "blocked" ? (
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
              <View className="clear-time" onClick={() => setStartTime("")}>清除开始时间</View>
            ) : null}
          </View>
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
